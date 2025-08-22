/**
 * QdrantVectorIndexManager Multi-Folder Tests
 * 
 * Tests for new multi-folder functionality.
 * Uses TDD approach - tests written before implementation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QdrantVectorIndexManager } from './QdrantVectorIndexManager';
import { VectorEmbeddings } from '../../contracts/schemas';
import { MultiFolderPlacement } from '../IVectorIndexManager';

// Mock Qdrant client
const mockUpsert = vi.fn();
const mockSearch = vi.fn();
const mockScroll = vi.fn();

vi.mock('@qdrant/js-client-rest', () => {
  return {
    QdrantClient: vi.fn().mockImplementation(() => ({
      upsert: mockUpsert,
      search: mockSearch,
      scroll: mockScroll
    }))
  };
});

describe('QdrantVectorIndexManager - Multi-Folder Support', () => {
  let manager: QdrantVectorIndexManager;
  let mockEmbeddings: VectorEmbeddings;
  let mockPlacements: MultiFolderPlacement;

  beforeEach(() => {
    vi.clearAllMocks();

    manager = new QdrantVectorIndexManager({
      provider: 'qdrant',
      host: 'localhost', 
      port: 6333,
      dimensions: 1536
    });

    mockEmbeddings = {
      vector: new Array(1536).fill(0).map(() => Math.random()),
      contentHash: 'test-hash',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      cached: false,
      embeddedAt: new Date()
    };

    mockPlacements = {
      primary: 'algorithms-sorting',
      references: ['data-structures-heaps', 'interview-prep'],
      confidences: {
        'algorithms-sorting': 0.92,
        'data-structures-heaps': 0.78,
        'interview-prep': 0.71
      }
    };

    // Default mock responses
    mockUpsert.mockResolvedValue({ status: 'ok' });
    mockSearch.mockResolvedValue([]);
    mockScroll.mockResolvedValue({ points: [] });
  });

  describe('Multi-folder upsert', () => {
    it('should store primary and reference folders in payload', async () => {
      await manager.upsert({
        conceptId: 'heap-sort-concept',
        embeddings: mockEmbeddings,
        placements: mockPlacements
      });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith('concepts', {
        wait: true,
        points: [{
          id: 'heap-sort-concept',
          vector: mockEmbeddings.vector,
          payload: expect.objectContaining({
            concept_id: 'heap-sort-concept',
            // Backward compatibility
            folder_id: 'algorithms-sorting',
            // New multi-folder fields
            primary_folder: 'algorithms-sorting',
            reference_folders: ['data-structures-heaps', 'interview-prep'],
            placement_confidences: {
              'algorithms-sorting': 0.92,
              'data-structures-heaps': 0.78, 
              'interview-prep': 0.71
            }
          })
        }]
      });
    });

    it('should maintain backward compatibility when no placements provided', async () => {
      await manager.upsert({
        conceptId: 'old-concept',
        embeddings: mockEmbeddings,
        folderId: 'single-folder'
      });

      expect(mockUpsert).toHaveBeenCalledWith('concepts', {
        wait: true,
        points: [{
          id: 'old-concept', 
          vector: mockEmbeddings.vector,
          payload: expect.objectContaining({
            concept_id: 'old-concept',
            folder_id: 'single-folder',
            primary_folder: null,
            reference_folders: []
          })
        }]
      });
    });

    it('should handle placements with only primary folder', async () => {
      const primaryOnlyPlacements = {
        primary: 'math-calculus',
        references: [],
        confidences: { 'math-calculus': 0.95 }
      };

      await manager.upsert({
        conceptId: 'derivative-concept',
        embeddings: mockEmbeddings,
        placements: primaryOnlyPlacements
      });

      expect(mockUpsert).toHaveBeenCalledWith('concepts', 
        expect.objectContaining({
          points: [expect.objectContaining({
            payload: expect.objectContaining({
              primary_folder: 'math-calculus',
              reference_folders: [],
              placement_confidences: { 'math-calculus': 0.95 }
            })
          })]
        })
      );
    });
  });

  describe('searchByFolder', () => {
    it('should find concepts where folder is primary', async () => {
      const mockResults = [
        {
          id: 'concept-1',
          score: 1.0,
          payload: { 
            primary_folder: 'algorithms-sorting',
            reference_folders: ['interview-prep'],
            concept_id: 'concept-1'
          }
        }
      ];
      mockSearch.mockResolvedValue(mockResults);

      const results = await manager.searchByFolder('algorithms-sorting', false);

      expect(mockSearch).toHaveBeenCalledWith('concepts', {
        filter: {
          must: [
            { key: 'primary_folder', match: { value: 'algorithms-sorting' } }
          ]
        },
        limit: 1000,
        with_payload: true
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        conceptId: 'concept-1',
        similarity: 1.0,
        folderId: 'algorithms-sorting',
        isPrimary: true,
        metadata: expect.any(Object)
      });
    });

    it('should find concepts including references when includeReferences=true', async () => {
      const mockResults = [
        {
          id: 'concept-1',
          score: 1.0,
          payload: { 
            primary_folder: 'algorithms-sorting',
            reference_folders: ['data-structures-heaps'],
            concept_id: 'concept-1'
          }
        },
        {
          id: 'concept-2', 
          score: 1.0,
          payload: {
            primary_folder: 'data-structures-trees',
            reference_folders: ['data-structures-heaps', 'algorithms'],
            concept_id: 'concept-2'
          }
        }
      ];
      mockSearch.mockResolvedValue(mockResults);

      const results = await manager.searchByFolder('data-structures-heaps', true);

      expect(mockSearch).toHaveBeenCalledWith('concepts', {
        filter: {
          should: [
            { key: 'primary_folder', match: { value: 'data-structures-heaps' } },
            { key: 'reference_folders', match: { any: ['data-structures-heaps'] } },
            // Backward compatibility with legacy folder_id
            { key: 'folder_id', match: { value: 'data-structures-heaps' } }
          ]
        },
        limit: 1000,
        with_payload: true
      });

      expect(results).toHaveLength(2);
      expect(results[0].isPrimary).toBe(false); // concept-1 has this as reference
      expect(results[1].isPrimary).toBe(false); // concept-2 has this as reference
    });
  });

  describe('getAllFolderIds', () => {
    it('should return unique folder IDs from both primary and reference folders', async () => {
      const mockScrollResponse = {
        points: [
          {
            id: 'concept-1',
            payload: {
              primary_folder: 'algorithms-sorting',
              reference_folders: ['data-structures-heaps', 'interview-prep']
            }
          },
          {
            id: 'concept-2',
            payload: {
              primary_folder: 'math-calculus', 
              reference_folders: ['math-analysis']
            }
          },
          {
            id: 'concept-3',
            payload: {
              primary_folder: 'data-structures-heaps',
              reference_folders: []
            }
          }
        ]
      };
      mockScroll.mockResolvedValue(mockScrollResponse);

      const folderIds = await manager.getAllFolderIds();

      expect(mockScroll).toHaveBeenCalledWith('concepts', {
        filter: undefined,
        limit: 10000,
        with_payload: true
      });

      // Should contain all unique folder IDs
      expect(folderIds).toEqual(expect.arrayContaining([
        'algorithms-sorting',
        'data-structures-heaps', 
        'interview-prep',
        'math-calculus',
        'math-analysis'
      ]));
      expect(folderIds).toHaveLength(5); // No duplicates
    });

    it('should handle concepts with only primary folders', async () => {
      const mockScrollResponse = {
        points: [
          {
            id: 'concept-1',
            payload: {
              folder_id: 'old-style-folder', // Legacy format
              primary_folder: null,
              reference_folders: []
            }
          }
        ]
      };
      mockScroll.mockResolvedValue(mockScrollResponse);

      const folderIds = await manager.getAllFolderIds();

      expect(folderIds).toContain('old-style-folder');
    });
  });

  describe('Backward compatibility', () => {
    it('should work with existing code that only uses folderId', async () => {
      // This should not break existing calls
      await manager.upsert({
        conceptId: 'legacy-concept',
        embeddings: mockEmbeddings,
        folderId: 'legacy-folder'
      });

      expect(mockUpsert).toHaveBeenCalledWith('concepts',
        expect.objectContaining({
          points: [expect.objectContaining({
            payload: expect.objectContaining({
              folder_id: 'legacy-folder',
              concept_id: 'legacy-concept'
            })
          })]
        })
      );
    });

    it('should handle mixed legacy and new concepts in search results', async () => {
      const mockResults = [
        {
          id: 'legacy-concept',
          score: 1.0,
          payload: {
            folder_id: 'legacy-folder',
            concept_id: 'legacy-concept'
            // No primary_folder or reference_folders
          }
        },
        {
          id: 'new-concept',
          score: 1.0, 
          payload: {
            primary_folder: 'legacy-folder',
            reference_folders: ['other-folder'],
            concept_id: 'new-concept'
          }
        }
      ];
      mockSearch.mockResolvedValue(mockResults);

      const results = await manager.searchByFolder('legacy-folder', true);

      expect(results).toHaveLength(2);
      // Both should be found when searching for legacy-folder
    });
  });
});