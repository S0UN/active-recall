/**
 * QdrantVectorIndexManager Tests
 * 
 * Tests the Qdrant-based vector storage implementation.
 * Uses mocked Qdrant client to avoid external dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QdrantVectorIndexManager } from './QdrantVectorIndexManager';
import { VectorEmbeddings } from '../../contracts/schemas';

// Mock Qdrant client
const mockUpsert = vi.fn();
const mockSearch = vi.fn();
const mockScroll = vi.fn();
const mockDelete = vi.fn();
const mockCount = vi.fn();
const mockGetCollections = vi.fn();
const mockGetCollection = vi.fn();
const mockCreateCollection = vi.fn();

vi.mock('@qdrant/js-client-rest', () => {
  return {
    QdrantClient: vi.fn().mockImplementation(() => ({
      upsert: mockUpsert,
      search: mockSearch,
      scroll: mockScroll,
      delete: mockDelete,
      count: mockCount,
      getCollections: mockGetCollections,
      getCollection: mockGetCollection,
      createCollection: mockCreateCollection
    }))
  };
});

describe('QdrantVectorIndexManager', () => {
  let manager: QdrantVectorIndexManager;
  let mockEmbeddings: VectorEmbeddings;

  beforeEach(() => {
    // Reset all mocks
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

    // Default mock responses
    mockUpsert.mockResolvedValue({ status: 'ok' });
    mockSearch.mockResolvedValue([]);
    mockScroll.mockResolvedValue({ points: [] });
    mockDelete.mockResolvedValue({ status: 'ok' });
    mockCount.mockResolvedValue({ count: 0 });
    mockGetCollections.mockResolvedValue({ 
      collections: [
        { name: 'concepts' },
        { name: 'folder_centroids' }
      ]
    });
  });

  describe('basic functionality', () => {
    it('should implement IVectorIndexManager interface', () => {
      expect(manager.getDimensions()).toBe(1536);
    });

    it('should upsert concept vector to single collection', async () => {
      await manager.upsert({
        conceptId: 'concept-123',
        embeddings: mockEmbeddings,
        folderId: 'folder-456'
      });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      
      // Check concepts collection upsert
      expect(mockUpsert).toHaveBeenCalledWith('concepts', {
        wait: true,
        points: [{
          id: 'concept-123',
          vector: mockEmbeddings.vector,
          payload: expect.objectContaining({
            concept_id: 'concept-123',
            folder_id: 'folder-456',
            content_hash: 'test-hash'
          })
        }]
      });
    });

    it('should upsert without folder assignment', async () => {
      await manager.upsert({
        conceptId: 'concept-123',
        embeddings: mockEmbeddings
      });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
      expect(mockUpsert).toHaveBeenCalledWith('concepts', 
        expect.objectContaining({
          points: [expect.objectContaining({
            payload: expect.objectContaining({
              folder_id: null
            })
          })]
        })
      );
    });
  });

  describe('search operations', () => {
    it('should search by title vector', async () => {
      const mockResults = [
        {
          id: 'concept-1',
          score: 0.95,
          payload: { folder_id: 'folder-1', concept_id: 'concept-1' }
        },
        {
          id: 'concept-2', 
          score: 0.87,
          payload: { folder_id: 'folder-2', concept_id: 'concept-2' }
        }
      ];
      mockSearch.mockResolvedValue(mockResults);

      const results = await manager.searchByTitle({
        vector: mockEmbeddings.vector,
        threshold: 0.8,
        limit: 10
      });

      expect(mockSearch).toHaveBeenCalledWith('concepts', {
        vector: mockEmbeddings.vector,
        limit: 10,
        score_threshold: 0.8,
        with_payload: true
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        conceptId: 'concept-1',
        similarity: 0.95,
        folderId: 'folder-1',
        metadata: { folder_id: 'folder-1', concept_id: 'concept-1' }
      });
    });

    it('should search by context vector', async () => {
      const mockResults = [
        {
          id: 'concept-3',
          score: 0.91,
          payload: { folder_id: 'folder-3' }
        }
      ];
      mockSearch.mockResolvedValue(mockResults);

      const results = await manager.searchByContext({
        vector: mockEmbeddings.vector,
        threshold: 0.85
      });

      expect(mockSearch).toHaveBeenCalledWith('concepts', {
        vector: mockEmbeddings.vector,
        limit: 50, // default
        score_threshold: 0.85,
        with_payload: true
      });

      expect(results).toHaveLength(1);
      expect(results[0].conceptId).toBe('concept-3');
      expect(results[0].similarity).toBe(0.91);
    });
  });

  describe('folder management', () => {
    it('should get folder members', async () => {
      const mockPoints = [
        { id: 'concept-1', vector: [0.1, 0.2, 0.3] },
        { id: 'concept-2', vector: [0.4, 0.5, 0.6] }
      ];
      mockScroll.mockResolvedValue({ points: mockPoints });

      const members = await manager.getFolderMembers('folder-123');

      expect(mockScroll).toHaveBeenCalledWith('concepts', {
        filter: {
          must: [{
            key: 'folder_id',
            match: { value: 'folder-123' }
          }]
        },
        limit: 1000,
        with_payload: false,
        with_vector: true
      });

      expect(members).toHaveLength(2);
      expect(members[0]).toEqual({
        conceptId: 'concept-1',
        vector: [0.1, 0.2, 0.3]
      });
    });

    it('should set folder centroid', async () => {
      const centroid = new Array(1536).fill(0.5);
      
      await manager.setFolderCentroid('folder-123', centroid);

      expect(mockUpsert).toHaveBeenCalledWith('folder_centroids', {
        wait: true,
        points: [{
          id: 'folder-123_centroid',
          vector: centroid,
          payload: expect.objectContaining({
            folder_id: 'folder-123',
            type: 'centroid'
          })
        }]
      });
    });

    it('should set folder exemplars', async () => {
      const exemplars = [
        new Array(1536).fill(0.1),
        new Array(1536).fill(0.9)
      ];

      // Mock empty scroll result for deletion
      mockScroll.mockResolvedValue({ points: [] });

      await manager.setFolderExemplars('folder-123', exemplars);

      // Should upsert exemplars
      expect(mockUpsert).toHaveBeenCalledWith('folder_centroids', {
        wait: true,
        points: [
          {
            id: 'folder-123_exemplar_0',
            vector: exemplars[0],
            payload: expect.objectContaining({
              folder_id: 'folder-123',
              type: 'exemplar',
              exemplar_index: 0
            })
          },
          {
            id: 'folder-123_exemplar_1', 
            vector: exemplars[1],
            payload: expect.objectContaining({
              exemplar_index: 1
            })
          }
        ]
      });
    });

    it('should get folder vector data', async () => {
      const centroid = new Array(1536).fill(0.5);
      const exemplar = new Array(1536).fill(0.3);
      
      mockScroll.mockResolvedValue({
        points: [
          {
            id: 'folder-123_centroid',
            vector: centroid,
            payload: { 
              folder_id: 'folder-123', 
              type: 'centroid',
              updated_at: '2024-01-01T10:00:00Z'
            }
          },
          {
            id: 'folder-123_exemplar_0',
            vector: exemplar,
            payload: {
              folder_id: 'folder-123',
              type: 'exemplar', 
              exemplar_index: 0,
              updated_at: '2024-01-01T10:00:00Z'
            }
          }
        ]
      });

      mockCount.mockResolvedValue({ count: 15 });

      const folderData = await manager.getFolderVectorData('folder-123');

      expect(folderData).not.toBeNull();
      expect(folderData!.folderId).toBe('folder-123');
      expect(folderData!.centroid).toEqual(centroid);
      expect(folderData!.exemplars).toHaveLength(1);
      expect(folderData!.exemplars[0]).toEqual(exemplar);
      expect(folderData!.memberCount).toBe(15);
    });

    it('should return null for non-existent folder', async () => {
      mockScroll.mockResolvedValue({ points: [] });

      const folderData = await manager.getFolderVectorData('non-existent');

      expect(folderData).toBeNull();
    });
  });

  describe('deletion', () => {
    it('should delete concept from single collection', async () => {
      await manager.delete('concept-123');

      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockDelete).toHaveBeenCalledWith('concepts', {
        wait: true,
        points: ['concept-123']
      });
    });
  });

  describe('validation and error handling', () => {
    it('should validate vector dimensions on upsert', async () => {
      const invalidEmbeddings = {
        ...mockEmbeddings,
        vector: [1, 2, 3] // Wrong dimension
      };

      await expect(manager.upsert({
        conceptId: 'concept-123',
        embeddings: invalidEmbeddings
      })).rejects.toThrow(/Vector dimension mismatch/);
    });

    it('should validate vector dimensions on search', async () => {
      const invalidVector = [1, 2, 3]; // Wrong dimension

      await expect(manager.searchByTitle({
        vector: invalidVector,
        threshold: 0.8
      })).rejects.toThrow(/Vector dimension mismatch/);
    });

    it('should handle Qdrant errors gracefully', async () => {
      mockUpsert.mockRejectedValue(new Error('Qdrant connection failed'));

      await expect(manager.upsert({
        conceptId: 'concept-123',
        embeddings: mockEmbeddings
      })).rejects.toThrow(/Failed to upsert concept/);
    });
  });

  describe('readiness check', () => {
    it('should return true when all collections exist', async () => {
      const isReady = await manager.isReady();
      expect(isReady).toBe(true);
    });

    it('should return false when collections are missing', async () => {
      mockGetCollections.mockResolvedValue({ 
        collections: [{ name: 'concepts_title' }] // Missing other collections
      });

      const isReady = await manager.isReady();
      expect(isReady).toBe(false);
    });

    it('should return false on connection error', async () => {
      mockGetCollections.mockRejectedValue(new Error('Connection failed'));

      const isReady = await manager.isReady();
      expect(isReady).toBe(false);
    });
  });

  describe('initialization', () => {
    it('should create missing collections', async () => {
      // Mock that collections don't exist initially
      mockGetCollection.mockRejectedValue(new Error('Collection not found'));

      await manager.initialize();

      expect(mockCreateCollection).toHaveBeenCalledTimes(2);
      expect(mockCreateCollection).toHaveBeenCalledWith('concepts', {
        vectors: {
          size: 1536,
          distance: 'Cosine'
        },
        optimizers_config: {
          default_segment_number: 2
        },
        replication_factor: 1
      });
    });

    it('should skip creating existing collections', async () => {
      // Mock that collections already exist
      mockGetCollection.mockResolvedValue({ name: 'concepts' });

      await manager.initialize();

      expect(mockCreateCollection).not.toHaveBeenCalled();
    });
  });

  describe('collection prefix', () => {
    it('should apply collection prefix when configured', () => {
      const prefixedManager = new QdrantVectorIndexManager({
        provider: 'qdrant',
        collectionPrefix: 'test',
        dimensions: 1536
      });

      // Access private collections property for testing
      const collections = (prefixedManager as any).collections;
      expect(collections.concepts).toBe('test_concepts');
      expect(collections.centroids).toBe('test_folder_centroids');
    });
  });
});