/**
 * Multi-Folder Vector Storage Tests
 * 
 * Tests the ability to store and retrieve concepts across multiple folders
 * with a clear primary/reference distinction. Clean, readable test cases
 * that tell a story about academic concept organization.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QdrantVectorIndexManager } from './QdrantVectorIndexManager';

// Mock Qdrant client at module level
const mockUpsert = vi.fn();
const mockSearch = vi.fn();
const mockScroll = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    upsert: mockUpsert,
    search: mockSearch,
    scroll: mockScroll
  }))
}));

// ==============================================================================
// Test Domain: Academic Concept Storage Scenarios
// ==============================================================================

class TestConceptBuilder {
  static createHeapSortConcept() {
    return {
      conceptId: 'heap-sort-algorithm',
      embeddings: this.createEmbeddings('heap-sort'),
      placements: {
        primary: 'algorithms-sorting',
        references: ['data-structures-heaps', 'interview-prep'],
        confidences: {
          'algorithms-sorting': 0.92,  // Best fit - it's primarily a sorting algorithm
          'data-structures-heaps': 0.78, // Also relevant - uses heap data structure  
          'interview-prep': 0.71        // Common interview question
        }
      }
    };
  }

  static createBinarySearchConcept() {
    return {
      conceptId: 'binary-search',
      embeddings: this.createEmbeddings('binary-search'),
      folderId: 'algorithms-searching' // Legacy single-folder format
    };
  }

  static createCalculusConcept() {
    return {
      conceptId: 'derivative-rules',
      embeddings: this.createEmbeddings('derivatives'),
      placements: {
        primary: 'mathematics-calculus',
        references: [], // No references - purely mathematical
        confidences: { 'mathematics-calculus': 0.95 }
      }
    };
  }

  private static createEmbeddings(seed: string) {
    return {
      vector: Array.from({ length: 1536 }, (_, i) => 
        Math.sin((seed.charCodeAt(0) + i) * 0.1)
      ),
      contentHash: `hash-${seed}`,
      model: 'text-embedding-3-small',
      dimensions: 1536,
      embeddedAt: new Date()
    };
  }
}

class QdrantMockBuilder {
  expectSuccessfulStorage() {
    mockUpsert.mockResolvedValue({ status: 'ok' });
    return this;
  }

  expectFolderSearchResults(concepts: any[]) {
    mockScroll.mockResolvedValue({
      points: concepts.map(concept => ({
        id: `uuid-${concept.conceptId}`,
        payload: {
          original_id: concept.conceptId,
          primary_folder: concept.primaryFolder,
          reference_folders: concept.referenceFolders || [],
          ...concept.payload
        }
      }))
    });
    return this;
  }

  expectEmptyResults() {
    mockScroll.mockResolvedValue({ points: [] });
    return this;
  }

  getMocks() {
    return {
      upsert: mockUpsert,
      search: mockSearch,
      scroll: mockScroll
    };
  }

  reset() {
    vi.clearAllMocks();
  }
}

// ==============================================================================
// Test Scenarios: Academic Concept Organization Stories  
// ==============================================================================

describe('Multi-Folder Academic Concept Storage', () => {
  let vectorManager: QdrantVectorIndexManager;
  let mockBuilder: QdrantMockBuilder;
  let mocks: ReturnType<QdrantMockBuilder['getMocks']>;

  beforeEach(() => {
    mockBuilder = new QdrantMockBuilder();
    mocks = mockBuilder.getMocks();
    mockBuilder.reset();

    vectorManager = new QdrantVectorIndexManager({
      provider: 'qdrant',
      host: 'localhost',
      port: 6333,
      dimensions: 1536
    });
  });

  describe('Academic Concept with Multiple Relevance Areas', () => {
    it('stores heap sort in primary folder with subject cross-references', async () => {
      // Given: A concept that spans multiple academic domains
      const heapSortConcept = TestConceptBuilder.createHeapSortConcept();
      mockBuilder.expectSuccessfulStorage();

      // When: We store the concept with multi-folder placement
      await vectorManager.upsert(heapSortConcept);

      // Then: It should be stored with primary location and cross-references
      expect(mocks.upsert).toHaveBeenCalledWith('concepts', {
        wait: true,
        points: [{
          id: expect.stringMatching(/[0-9a-f-]+/), // UUID format
          vector: expect.any(Array),
          payload: expect.objectContaining({
            // Identity preservation
            original_id: 'heap-sort-algorithm',
            concept_id: 'heap-sort-algorithm',
            
            // Multi-folder structure
            primary_folder: 'algorithms-sorting',
            reference_folders: ['data-structures-heaps', 'interview-prep'],
            placement_confidences: {
              'algorithms-sorting': 0.92,
              'data-structures-heaps': 0.78,
              'interview-prep': 0.71
            },
            
            // Backward compatibility
            folder_id: 'algorithms-sorting'
          })
        }]
      });
    });
  });

  describe('Subject Area Concept Discovery', () => {
    it('finds concepts where subject is primary focus', async () => {
      // Given: Concepts stored in the algorithms-sorting domain
      mockBuilder.expectFolderSearchResults([
        {
          conceptId: 'heap-sort-algorithm',
          primaryFolder: 'algorithms-sorting',
          referenceFolders: ['data-structures-heaps']
        },
        {
          conceptId: 'quick-sort-algorithm', 
          primaryFolder: 'algorithms-sorting',
          referenceFolders: []
        }
      ]);

      // When: We search for primary concepts in algorithms-sorting
      const primaryConcepts = await vectorManager.searchByFolder('algorithms-sorting', false);

      // Then: We find concepts where this is their home domain
      expect(primaryConcepts).toHaveLength(2);
      expect(primaryConcepts[0]).toEqual({
        conceptId: 'heap-sort-algorithm',
        similarity: 1.0,
        folderId: 'algorithms-sorting', 
        isPrimary: true,
        metadata: expect.any(Object)
      });
    });

    it('finds concepts that reference subject area from other domains', async () => {
      // Given: Concepts that reference data structures from various domains
      mockBuilder.expectFolderSearchResults([
        {
          conceptId: 'heap-sort-algorithm',
          primaryFolder: 'algorithms-sorting',
          referenceFolders: ['data-structures-heaps'], // References this folder
        },
        {
          conceptId: 'priority-queue-impl',
          primaryFolder: 'data-structures-queues', 
          referenceFolders: ['data-structures-heaps'], // Also references this folder
        }
      ]);

      // When: We search data-structures-heaps including references
      const allRelatedConcepts = await vectorManager.searchByFolder('data-structures-heaps', true);

      // Then: We find concepts from multiple domains that use heaps
      expect(allRelatedConcepts).toHaveLength(2);
      expect(allRelatedConcepts.every(concept => !concept.isPrimary)).toBe(true);
      expect(allRelatedConcepts.map(c => c.conceptId)).toContain('heap-sort-algorithm');
      expect(allRelatedConcepts.map(c => c.conceptId)).toContain('priority-queue-impl');
    });
  });

  describe('Academic Knowledge Discovery', () => {
    it('discovers all subject areas that contain concepts', async () => {
      // Given: Concepts distributed across academic domains
      mockBuilder.expectFolderSearchResults([
        {
          conceptId: 'concept-1',
          payload: {
            primary_folder: 'mathematics-calculus',
            reference_folders: ['physics-mechanics', 'engineering-optimization']
          }
        },
        {
          conceptId: 'concept-2', 
          payload: {
            primary_folder: 'computer-science-algorithms',
            reference_folders: ['mathematics-discrete']
          }
        },
        {
          conceptId: 'legacy-concept',
          payload: {
            folder_id: 'chemistry-organic', // Legacy format
            primary_folder: null,
            reference_folders: []
          }
        }
      ]);

      // When: We discover all academic domains
      const allSubjectAreas = await vectorManager.getAllFolderIds();

      // Then: We find all domains where knowledge exists
      const expectedDomains = [
        'mathematics-calculus',
        'physics-mechanics', 
        'engineering-optimization',
        'computer-science-algorithms',
        'mathematics-discrete',
        'chemistry-organic'
      ];
      
      expect(allSubjectAreas.sort()).toEqual(expectedDomains.sort());
    });
  });

  describe('Legacy Academic Content Integration', () => {
    it('handles traditional single-subject concepts alongside cross-domain concepts', async () => {
      // Given: A traditional concept that belongs to only one domain
      const binarySearchConcept = TestConceptBuilder.createBinarySearchConcept();
      mockBuilder.expectSuccessfulStorage();

      // When: We store it using legacy single-folder approach
      await vectorManager.upsert(binarySearchConcept);

      // Then: It should be stored with backward compatibility structure
      expect(mocks.upsert).toHaveBeenCalledWith('concepts', {
        wait: true,
        points: [{
          id: expect.stringMatching(/[0-9a-f-]+/),
          vector: expect.any(Array),
          payload: expect.objectContaining({
            concept_id: 'binary-search',
            folder_id: 'algorithms-searching',
            
            // New structure initialized as empty for consistency
            primary_folder: null,
            reference_folders: []
          })
        }]
      });
    });
  });

  describe('Pure Subject Domain Concepts', () => {
    it('stores concepts with only primary domain and no cross-references', async () => {
      // Given: A concept that is purely within one academic domain
      const calculusConcept = TestConceptBuilder.createCalculusConcept();
      mockBuilder.expectSuccessfulStorage();

      // When: We store the pure-domain concept
      await vectorManager.upsert(calculusConcept);

      // Then: It should have a primary domain but no cross-references
      expect(mocks.upsert).toHaveBeenCalledWith('concepts', {
        wait: true,
        points: [{
          id: expect.any(String),
          vector: expect.any(Array),
          payload: expect.objectContaining({
            primary_folder: 'mathematics-calculus',
            reference_folders: [], // No cross-domain references
            placement_confidences: { 'mathematics-calculus': 0.95 }
          })
        }]
      });
    });
  });

  describe('Subject Area Content Management', () => {
    it('handles empty subject areas gracefully', async () => {
      // Given: A subject area with no concepts
      mockBuilder.expectEmptyResults();

      // When: We search for concepts in an empty domain
      const emptyConcepts = await vectorManager.searchByFolder('theoretical-physics', true);

      // Then: We get an empty result without errors
      expect(emptyConcepts).toHaveLength(0);
    });

    it('discovers no subject areas when no concepts exist', async () => {
      // Given: A completely empty knowledge base
      mockBuilder.expectEmptyResults();

      // When: We try to discover academic domains
      const noSubjects = await vectorManager.getAllFolderIds();

      // Then: We find no subject areas
      expect(noSubjects).toHaveLength(0);
    });
  });
});

// ==============================================================================
// Domain-Driven Test Utilities
// ==============================================================================

/**
 * Academic Subject Areas for Testing
 * Represents realistic university-level knowledge organization
 */
export const AcademicSubjects = {
  // STEM Fields
  MATHEMATICS: {
    CALCULUS: 'mathematics-calculus',
    DISCRETE: 'mathematics-discrete', 
    ANALYSIS: 'mathematics-analysis'
  },
  
  COMPUTER_SCIENCE: {
    ALGORITHMS: 'computer-science-algorithms',
    DATA_STRUCTURES: 'computer-science-data-structures',
    MACHINE_LEARNING: 'computer-science-machine-learning'
  },
  
  PHYSICS: {
    MECHANICS: 'physics-mechanics',
    THERMODYNAMICS: 'physics-thermodynamics',
    QUANTUM: 'physics-quantum'
  },
  
  // Interdisciplinary Areas
  INTERVIEW_PREP: 'interview-preparation',
  RESEARCH_METHODS: 'research-methodology'
} as const;

/**
 * Common Academic Concept Patterns
 * Real-world examples of how concepts span multiple domains
 */
export const ConceptPatterns = {
  // Algorithms that use specific data structures
  ALGORITHM_WITH_DATA_STRUCTURE: {
    example: 'heap-sort',
    primary: AcademicSubjects.COMPUTER_SCIENCE.ALGORITHMS,
    references: [AcademicSubjects.COMPUTER_SCIENCE.DATA_STRUCTURES]
  },
  
  // Mathematical concepts applied in other fields
  MATHEMATICAL_APPLICATION: {
    example: 'fourier-transform',
    primary: AcademicSubjects.MATHEMATICS.ANALYSIS,
    references: [AcademicSubjects.PHYSICS.QUANTUM, 'signal-processing']
  },
  
  // Pure domain concepts
  PURE_MATHEMATICAL: {
    example: 'derivative-rules',
    primary: AcademicSubjects.MATHEMATICS.CALCULUS,
    references: []
  }
} as const;