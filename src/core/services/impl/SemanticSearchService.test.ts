/**
 * Test Suite for SemanticSearchService
 * 
 * Following TDD approach with comprehensive test coverage for
 * RAG-based semantic search functionality.
 * 
 * @module SemanticSearchService.test
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { SemanticSearchService } from './SemanticSearchService';
import {
  ISearchService,
  SearchQuery,
  SearchResponse,
  SearchResult,
  SearchServiceConfig,
} from '../ISearchService';
import { IVectorIndexManager } from '../IVectorIndexManager';
import { IEmbeddingService } from '../IEmbeddingService';
import { IConceptArtifactRepository, IFolderRepository } from '../../contracts/repositories';
import { ConceptArtifact, FolderManifest } from '../../contracts/schemas';

// =============================================================================
// TEST FIXTURES AND MOCKS
// =============================================================================

/**
 * Create mock vector index manager
 */
function createMockVectorIndex(): IVectorIndexManager {
  return {
    upsert: vi.fn(),
    searchByTitle: vi.fn(),
    searchByContext: vi.fn(),
    getFolderMembers: vi.fn(),
    searchByFolder: vi.fn(),
    getAllFolderIds: vi.fn(),
    setFolderCentroid: vi.fn(),
    setFolderExemplars: vi.fn(),
    getFolderVectorData: vi.fn(),
    delete: vi.fn(),
    getDimensions: vi.fn(() => 1536),
    isReady: vi.fn(() => Promise.resolve(true)),
  };
}

/**
 * Create mock embedding service
 */
function createMockEmbeddingService(): IEmbeddingService {
  return {
    embed: vi.fn(),
    embedBatch: vi.fn(),
    getModel: vi.fn(() => 'text-embedding-3-small'),
    getDimensions: vi.fn(() => 1536),
  };
}

/**
 * Create mock concept repository
 */
function createMockConceptRepository(): IConceptArtifactRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findByPath: vi.fn(),
    exists: vi.fn(),
    findByCandidateId: vi.fn(),
    findByContentHash: vi.fn(),
    updatePath: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    countByPath: vi.fn(),
  };
}

/**
 * Create mock folder repository
 */
function createMockFolderRepository(): IFolderRepository {
  return {
    create: vi.fn(),
    findByPath: vi.fn(),
    updateManifest: vi.fn(),
    listChildren: vi.fn(),
    listAll: vi.fn(),
    exists: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
    count: vi.fn(),
    getStatistics: vi.fn(),
  };
}

/**
 * Create test concept artifact
 */
function createTestArtifact(overrides: Partial<ConceptArtifact> = {}): ConceptArtifact {
  return {
    artifactId: 'test-artifact-1',
    candidateId: 'test-candidate-1',
    title: 'Neural Networks Fundamentals',
    summary: 'Neural networks are computational models inspired by biological neural networks.',
    content: {
      distilled: {
        title: 'Neural Networks Fundamentals',
        summary: 'Neural networks are computational models inspired by biological neural networks.',
        contentHash: 'hash-123',
        cached: false,
        distilledAt: new Date(),
      },
      original: {
        candidateId: 'test-candidate-1',
        batchId: 'test-batch-1',
        index: 0,
        rawText: 'Original text about neural networks',
        normalizedText: 'normalized text about neural networks',
        contentHash: 'hash-123',
        source: {
          window: 'Test Window',
          topic: 'AI',
          batchId: 'test-batch-1',
          entryCount: 1,
        },
        createdAt: new Date(),
      },
    },
    routing: {
      primaryPath: '/ai/deep-learning/fundamentals',
      placements: [{
        path: '/ai/deep-learning/fundamentals',
        confidence: 0.95,
        type: 'primary',
      }],
      method: 'vector-similarity',
      alternatives: [],
    },
    provenance: {
      source: {
        window: 'Test Window',
        topic: 'AI',
        batchId: 'test-batch-1',
        entryCount: 1,
      },
      sessionId: 'test-session',
      capturedAt: new Date(),
    },
    modelInfo: {
      classifier: 'bart-large-mnli',
      embedding: 'text-embedding-3-small',
      version: '1.0.0',
    },
    audit: {
      createdAt: new Date(),
      createdBy: 'test-user',
      lastModified: new Date(),
      modifiedBy: 'test-user',
      version: 1,
    },
    embeddings: {
      vector: Array(1536).fill(0).map(() => Math.random()),
      contentHash: 'hash-123',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      cached: false,
      embeddedAt: new Date(),
    },
    version: '1.0.0',
    ...overrides,
  };
}

/**
 * Create test folder manifest
 */
function createTestFolder(path: string, name: string): FolderManifest {
  return {
    folderId: `folder-${path.replace(/\//g, '-')}`,
    path,
    name,
    description: `Folder for ${name}`,
    depth: path.split('/').length - 1,
    provisional: false,
    stats: {
      artifactCount: 10,
      lastUpdated: new Date(),
      size: 1000,
      avgConfidence: 0.85,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create test search configuration
 */
function createTestConfig(): SearchServiceConfig {
  return {
    embeddingModel: 'text-embedding-3-small',
    defaultLimit: 10,
    defaultThreshold: 0.7,
    enableQueryExpansion: true,
    enableSpellCorrection: true,
    cacheConfig: {
      enabled: true,
      ttl: 300,
      maxSize: 100,
    },
  };
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;
  let mockVectorIndex: IVectorIndexManager;
  let mockEmbeddingService: IEmbeddingService;
  let mockConceptRepo: IConceptArtifactRepository;
  let mockFolderRepo: IFolderRepository;
  let config: SearchServiceConfig;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mocks
    mockVectorIndex = createMockVectorIndex();
    mockEmbeddingService = createMockEmbeddingService();
    mockConceptRepo = createMockConceptRepository();
    mockFolderRepo = createMockFolderRepository();
    config = createTestConfig();
    
    // Create service
    service = new SemanticSearchService(
      mockVectorIndex,
      mockEmbeddingService,
      mockConceptRepo,
      mockFolderRepo,
      config
    );
  });

  // =========================================================================
  // BASIC SEARCH FUNCTIONALITY
  // =========================================================================

  describe('Basic Search', () => {
    it('should perform semantic search with query embedding', async () => {
      // Arrange
      const query: SearchQuery = {
        query: 'neural network backpropagation',
        limit: 5,
        threshold: 0.75,
      };
      
      const queryEmbedding = Array(1536).fill(0).map(() => Math.random());
      const artifact = createTestArtifact();
      const folder = createTestFolder('/ai/deep-learning/fundamentals', 'fundamentals');
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: queryEmbedding,
        cached: false,
      });
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue([
        {
          conceptId: artifact.artifactId,
          similarity: 0.92,
          folderId: folder.folderId,
          isPrimary: true,
        },
      ]);
      
      (mockConceptRepo.findById as Mock).mockResolvedValue(artifact);
      (mockFolderRepo.findByPath as Mock).mockResolvedValue(folder);
      
      // Act
      const response = await service.search(query);
      
      // Assert
      expect(response.results).toHaveLength(1);
      expect(response.results[0].score).toBe(0.92);
      expect(response.results[0].artifact.artifactId).toBe(artifact.artifactId);
      expect(response.results[0].folderContext.folder.path).toBe(folder.path);
      expect(mockEmbeddingService.embed).toHaveBeenCalledWith(query.query);
    });

    it('should filter results by similarity threshold', async () => {
      // Arrange
      const query: SearchQuery = {
        query: 'machine learning',
        threshold: 0.8,
      };
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: Array(1536).fill(0),
        cached: false,
      });
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue([
        { conceptId: 'high-match', similarity: 0.9, isPrimary: true },
        { conceptId: 'low-match', similarity: 0.7, isPrimary: true },
      ]);
      
      // Only the high match should be retrieved
      const highMatchArtifact = createTestArtifact({ artifactId: 'high-match' });
      (mockConceptRepo.findById as Mock).mockImplementation((id: string) => {
        return id === 'high-match' ? Promise.resolve(highMatchArtifact) : Promise.resolve(null);
      });
      
      (mockFolderRepo.findByPath as Mock).mockResolvedValue(
        createTestFolder('/test', 'test')
      );
      
      // Act
      const response = await service.search(query);
      
      // Assert
      expect(response.results).toHaveLength(1);
      expect(response.results[0].artifact.artifactId).toBe('high-match');
      expect(response.results[0].score).toBe(0.9);
    });

    it('should limit number of results', async () => {
      // Arrange
      const query: SearchQuery = {
        query: 'deep learning',
        limit: 2,
      };
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: Array(1536).fill(0),
        cached: false,
      });
      
      // Return more matches than the limit
      const matches = Array.from({ length: 5 }, (_, i) => ({
        conceptId: `concept-${i}`,
        similarity: 0.9 - i * 0.05,
        isPrimary: true,
      }));
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue(matches);
      
      (mockConceptRepo.findById as Mock).mockImplementation((id: string) => {
        return Promise.resolve(createTestArtifact({ artifactId: id }));
      });
      
      (mockFolderRepo.findByPath as Mock).mockResolvedValue(
        createTestFolder('/test', 'test')
      );
      
      // Act
      const response = await service.search(query);
      
      // Assert
      expect(response.results).toHaveLength(2);
      expect(response.totalMatches).toBe(5);
      expect(response.results[0].artifact.artifactId).toBe('concept-0');
      expect(response.results[1].artifact.artifactId).toBe('concept-1');
    });
  });

  // =========================================================================
  // SEARCH EXPLANATIONS
  // =========================================================================

  describe('Search Explanations', () => {
    it('should provide detailed match explanations', async () => {
      // Arrange
      const query: SearchQuery = {
        query: 'gradient descent optimization',
      };
      
      const artifact = createTestArtifact({
        title: 'Gradient Descent Algorithm',
        summary: 'Gradient descent is an optimization algorithm used to minimize loss functions.',
      });
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: Array(1536).fill(0),
        cached: false,
      });
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue([
        {
          conceptId: artifact.artifactId,
          similarity: 0.88,
          isPrimary: true,
        },
      ]);
      
      (mockConceptRepo.findById as Mock).mockResolvedValue(artifact);
      (mockFolderRepo.findByPath as Mock).mockResolvedValue(
        createTestFolder('/ml/optimization', 'optimization')
      );
      
      // Act
      const response = await service.search(query);
      
      // Assert
      const explanation = response.results[0].explanation;
      expect(explanation.matchType).toBe('semantic');
      expect(explanation.semanticScore).toBe(0.88);
      expect(explanation.highlights).toBeInstanceOf(Array);
      expect(explanation.highlights.length).toBeGreaterThan(0);
      
      // Check for keyword highlights
      const titleHighlight = explanation.highlights.find(h => h.field === 'title');
      expect(titleHighlight).toBeDefined();
      expect(titleHighlight?.fragment).toContain('Gradient Descent');
    });

    it('should identify exact matches', async () => {
      // Arrange
      const query: SearchQuery = {
        query: 'Neural Networks Fundamentals',
      };
      
      const artifact = createTestArtifact({
        title: 'Neural Networks Fundamentals', // Exact match
      });
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: Array(1536).fill(0),
        cached: false,
      });
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue([
        {
          conceptId: artifact.artifactId,
          similarity: 0.99,
          isPrimary: true,
        },
      ]);
      
      (mockConceptRepo.findById as Mock).mockResolvedValue(artifact);
      (mockFolderRepo.findByPath as Mock).mockResolvedValue(
        createTestFolder('/ai/fundamentals', 'fundamentals')
      );
      
      // Act
      const response = await service.search(query);
      
      // Assert
      expect(response.results[0].explanation.matchType).toBe('exact');
    });
  });

  // =========================================================================
  // FOLDER CONTEXT
  // =========================================================================

  describe('Folder Context', () => {
    it('should provide folder breadcrumb', async () => {
      // Arrange
      const query: SearchQuery = {
        query: 'convolutional networks',
      };
      
      const artifact = createTestArtifact({
        routing: {
          primaryPath: '/ai/deep-learning/cnn/architectures',
          placements: [{
            path: '/ai/deep-learning/cnn/architectures',
            confidence: 0.95,
            type: 'primary',
          }],
          method: 'vector-similarity',
          alternatives: [],
        },
      });
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: Array(1536).fill(0),
        cached: false,
      });
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue([
        {
          conceptId: artifact.artifactId,
          similarity: 0.85,
          isPrimary: true,
        },
      ]);
      
      (mockConceptRepo.findById as Mock).mockResolvedValue(artifact);
      (mockFolderRepo.findByPath as Mock).mockResolvedValue(
        createTestFolder('/ai/deep-learning/cnn/architectures', 'architectures')
      );
      
      // Act
      const response = await service.search(query);
      
      // Assert
      const context = response.results[0].folderContext;
      expect(context.breadcrumb).toEqual(['ai', 'deep-learning', 'cnn', 'architectures']);
      expect(context.folder.path).toBe('/ai/deep-learning/cnn/architectures');
    });

    it('should filter by specific folders', async () => {
      // Arrange
      const query: SearchQuery = {
        query: 'algorithms',
        folderFilter: ['/ai/deep-learning', '/ml/optimization'],
      };
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: Array(1536).fill(0),
        cached: false,
      });
      
      const allMatches = [
        { conceptId: 'dl-concept', similarity: 0.9, folderId: 'folder-ai-deep-learning' },
        { conceptId: 'ml-concept', similarity: 0.85, folderId: 'folder-ml-optimization' },
        { conceptId: 'other-concept', similarity: 0.88, folderId: 'folder-other' },
      ];
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue(allMatches);
      
      // Mock artifacts and folders
      (mockConceptRepo.findById as Mock).mockImplementation((id: string) => {
        const pathMap: Record<string, string> = {
          'dl-concept': '/ai/deep-learning/algorithms',
          'ml-concept': '/ml/optimization/gradient',
          'other-concept': '/other/algorithms',
        };
        return Promise.resolve(createTestArtifact({
          artifactId: id,
          routing: {
            primaryPath: pathMap[id] || '/unknown',
            placements: [],
            method: 'vector-similarity',
            alternatives: [],
          },
        }));
      });
      
      (mockFolderRepo.findByPath as Mock).mockImplementation((path: any) => {
        return Promise.resolve(createTestFolder(path.toString(), 'test'));
      });
      
      // Act
      const response = await service.search(query);
      
      // Assert
      expect(response.results).toHaveLength(2);
      const resultPaths = response.results.map(r => r.artifact.routing.primaryPath);
      expect(resultPaths).toContain('/ai/deep-learning/algorithms');
      expect(resultPaths).toContain('/ml/optimization/gradient');
      expect(resultPaths).not.toContain('/other/algorithms');
    });
  });

  // =========================================================================
  // RELATED CONCEPTS
  // =========================================================================

  describe('Related Concepts', () => {
    it('should find similar concepts', async () => {
      // Arrange
      const conceptId = 'test-concept-1';
      const baseArtifact = createTestArtifact({ artifactId: conceptId });
      
      (mockConceptRepo.findById as Mock).mockResolvedValue(baseArtifact);
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue([
        { conceptId: 'similar-1', similarity: 0.95, isPrimary: true },
        { conceptId: 'similar-2', similarity: 0.90, isPrimary: true },
      ]);
      
      (mockConceptRepo.findById as Mock).mockImplementation((id: string) => {
        const titles: Record<string, string> = {
          'similar-1': 'Backpropagation Algorithm',
          'similar-2': 'Feedforward Networks',
        };
        return Promise.resolve(createTestArtifact({
          artifactId: id,
          title: titles[id] || 'Unknown',
        }));
      });
      
      // Act
      const similar = await service.findSimilar(conceptId, 2);
      
      // Assert
      expect(similar).toHaveLength(2);
      expect(similar[0].conceptId).toBe('similar-1');
      expect(similar[0].relationshipType).toBe('similar');
      expect(similar[0].strength).toBe(0.95);
      expect(similar[0].title).toBe('Backpropagation Algorithm');
    });

    it('should include related concepts in search results when requested', async () => {
      // Arrange
      const query: SearchQuery = {
        query: 'neural networks',
        includeRelated: true,
        limit: 1,
      };
      
      const mainArtifact = createTestArtifact();
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: Array(1536).fill(0),
        cached: false,
      });
      
      (mockVectorIndex.searchByContext as Mock)
        .mockResolvedValueOnce([
          { conceptId: mainArtifact.artifactId, similarity: 0.9, isPrimary: true },
        ])
        .mockResolvedValueOnce([
          { conceptId: 'related-1', similarity: 0.85, isPrimary: true },
          { conceptId: 'related-2', similarity: 0.80, isPrimary: true },
        ]);
      
      (mockConceptRepo.findById as Mock).mockImplementation((id: string) => {
        const artifacts: Record<string, any> = {
          [mainArtifact.artifactId]: mainArtifact,
          'related-1': createTestArtifact({ artifactId: 'related-1', title: 'CNN Architecture' }),
          'related-2': createTestArtifact({ artifactId: 'related-2', title: 'RNN Fundamentals' }),
        };
        return Promise.resolve(artifacts[id]);
      });
      
      (mockFolderRepo.findByPath as Mock).mockResolvedValue(
        createTestFolder('/ai/deep-learning', 'deep-learning')
      );
      
      // Act
      const response = await service.search(query);
      
      // Assert
      expect(response.results).toHaveLength(1);
      expect(response.results[0].relatedConcepts).toBeDefined();
      expect(response.results[0].relatedConcepts).toHaveLength(2);
      expect(response.results[0].relatedConcepts![0].title).toBe('CNN Architecture');
    });
  });

  // =========================================================================
  // QUERY SUGGESTIONS
  // =========================================================================

  describe('Query Suggestions', () => {
    it('should provide query suggestions', async () => {
      // Arrange
      const partial = 'neur';
      
      // Mock getting all concepts for suggestion generation
      (mockConceptRepo.findById as Mock).mockResolvedValue(null);
      
      // Act
      const suggestions = await service.suggest(partial, 5);
      
      // Assert
      expect(suggestions).toBeInstanceOf(Array);
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  // =========================================================================
  // STATISTICS
  // =========================================================================

  describe('Statistics', () => {
    it('should provide search statistics', async () => {
      // Arrange
      (mockConceptRepo.count as Mock).mockResolvedValue(150);
      (mockFolderRepo.count as Mock).mockResolvedValue(25);
      (mockVectorIndex.isReady as Mock).mockResolvedValue(true);
      
      // Act
      const stats = await service.getStatistics();
      
      // Assert
      expect(stats.totalConcepts).toBe(150);
      expect(stats.totalFolders).toBe(25);
      expect(stats.avgConceptsPerFolder).toBe(6); // 150/25
      expect(stats.indexHealth).toBe('healthy');
    });
  });

  // =========================================================================
  // ERROR HANDLING
  // =========================================================================

  describe('Error Handling', () => {
    it('should handle embedding service errors', async () => {
      // Arrange
      const query: SearchQuery = { query: 'test query' };
      
      (mockEmbeddingService.embed as Mock).mockRejectedValue(
        new Error('Embedding service unavailable')
      );
      
      // Act & Assert
      await expect(service.search(query)).rejects.toThrow('Failed to process query');
    });

    it('should handle index not ready', async () => {
      // Arrange
      const query: SearchQuery = { query: 'test query' };
      
      (mockVectorIndex.isReady as Mock).mockResolvedValue(false);
      
      // Act & Assert
      await expect(service.search(query)).rejects.toThrow('Search index is not ready');
    });

    it('should handle missing artifacts gracefully', async () => {
      // Arrange
      const query: SearchQuery = { query: 'test' };
      
      (mockEmbeddingService.embed as Mock).mockResolvedValue({
        vector: Array(1536).fill(0),
        cached: false,
      });
      
      (mockVectorIndex.searchByContext as Mock).mockResolvedValue([
        { conceptId: 'missing-artifact', similarity: 0.9, isPrimary: true },
      ]);
      
      (mockConceptRepo.findById as Mock).mockResolvedValue(null);
      
      // Act
      const response = await service.search(query);
      
      // Assert
      expect(response.results).toHaveLength(0);
      expect(response.totalMatches).toBe(0);
    });
  });
});