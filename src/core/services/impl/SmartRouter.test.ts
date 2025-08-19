/**
 * SmartRouter Tests
 * 
 * Tests the complete routing pipeline orchestration including
 * distillation, embedding, deduplication, and routing decisions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartRouter } from './SmartRouter';
import { IDistillationService } from '../IDistillationService';
import { IEmbeddingService } from '../IEmbeddingService';
import { IVectorIndexManager } from '../IVectorIndexManager';
import { DistilledContent, VectorEmbeddings, BatchSchema } from '../../contracts/schemas';
import { ConceptCandidate } from '../../domain/ConceptCandidate';

const mockDistill = vi.fn();
const mockEmbed = vi.fn();
const mockSearchByTitle = vi.fn();
const mockSearchByContext = vi.fn();

const createMockDistillService = (): IDistillationService => ({
  distill: mockDistill,
  getProvider: () => 'mock'
});

const createMockEmbeddingService = (): IEmbeddingService => ({
  embed: mockEmbed,
  getProvider: () => 'mock',
  getDimensions: () => 1536
});

const createMockVectorIndex = (): IVectorIndexManager => ({
  upsert: vi.fn(),
  searchByTitle: mockSearchByTitle,
  searchByContext: mockSearchByContext,
  getFolderMembers: vi.fn(),
  setFolderCentroid: vi.fn(),
  setFolderExemplars: vi.fn(),
  getFolderVectorData: vi.fn(),
  delete: vi.fn(),
  getDimensions: () => 1536,
  isReady: vi.fn().mockResolvedValue(true)
});

describe('SmartRouter', () => {
  let router: SmartRouter;
  let mockCandidate: ConceptCandidate;
  let mockDistilled: DistilledContent;
  let mockEmbeddings: VectorEmbeddings;
  let mockBatch: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockBatch = BatchSchema.parse({
      batchId: '550e8400-e29b-41d4-a716-446655440000',
      window: 'Test Window',
      topic: 'Machine Learning',
      entries: [{
        text: 'Neural networks are computational models.',
        timestamp: new Date()
      }],
      createdAt: new Date()
    });

    mockCandidate = new ConceptCandidate(
      mockBatch,
      'Neural networks are computational models inspired by biological neural networks.',
      0
    );

    mockDistilled = {
      title: 'Neural Networks Fundamentals',
      summary: 'Computational models inspired by biological neural networks for machine learning.',
      contentHash: 'hash123',
      cached: false,
      distilledAt: new Date()
    };

    mockEmbeddings = {
      vector: new Array(1536).fill(0).map(() => Math.random()),
      contentHash: 'hash123',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      cached: false,
      embeddedAt: new Date()
    };

    mockDistill.mockResolvedValue(mockDistilled);
    mockEmbed.mockResolvedValue(mockEmbeddings);
    mockSearchByTitle.mockResolvedValue([]);
    mockSearchByContext.mockResolvedValue([]);

    router = new SmartRouter(
      createMockDistillService(),
      createMockEmbeddingService(),
      createMockVectorIndex()
    );
  });

  describe('basic routing', () => {
    it('should route concept through complete pipeline', async () => {
      mockSearchByContext.mockResolvedValue([
        {
          conceptId: 'concept-1',
          similarity: 0.85,
          folderId: 'ml-folder'
        },
        {
          conceptId: 'concept-2',
          similarity: 0.83,
          folderId: 'ml-folder'
        }
      ]);

      const decision = await router.route(mockCandidate);

      expect(mockDistill).toHaveBeenCalledWith(mockCandidate.normalize());
      expect(mockEmbed).toHaveBeenCalledWith(mockDistilled);
      expect(mockSearchByTitle).toHaveBeenCalled();
      expect(mockSearchByContext).toHaveBeenCalled();

      expect(decision.action).toBe('route');
      expect(decision.folderId).toBe('ml-folder');
      expect(decision.confidence).toBeGreaterThan(0.82);
    });

    it('should detect duplicates', async () => {
      mockSearchByTitle.mockResolvedValue([
        {
          conceptId: 'existing-concept',
          similarity: 0.95,
          folderId: 'ml-folder'
        }
      ]);

      const decision = await router.route(mockCandidate);

      expect(decision.action).toBe('duplicate');
      expect(decision.duplicateId).toBe('existing-concept');
      expect(decision.confidence).toBe(0.95);
      expect(decision.explanation.primarySignal).toContain('Duplicate');
    });

    it('should route to unsorted when no good match', async () => {
      mockSearchByContext.mockResolvedValue([
        {
          conceptId: 'concept-1',
          similarity: 0.3,
          folderId: 'some-folder'
        }
      ]);

      const decision = await router.route(mockCandidate);

      expect(decision.action).toBe('unsorted');
      expect(decision.confidence).toBeLessThan(0.5);
      expect(decision.explanation.primarySignal).toContain('No suitable folder');
    });

    it('should route to folder when threshold is met', async () => {
      mockSearchByContext.mockResolvedValue([
        {
          conceptId: 'concept-1',
          similarity: 0.75,
          folderId: 'folder-1'
        },
        {
          conceptId: 'concept-2',
          similarity: 0.72,
          folderId: 'folder-2'
        }
      ]);

      const decision = await router.route(mockCandidate);

      expect(decision.action).toBe('route');
      expect(decision.folderId).toBe('folder-1'); // Primary folder
      expect(decision.explanation.primarySignal).toContain('Multi-folder placement');
    });
  });

  describe('folder scoring', () => {
    it('should calculate hybrid scores correctly', async () => {
      mockSearchByContext.mockResolvedValue([
        {
          conceptId: 'c1',
          similarity: 0.75,
          folderId: 'folder-a'
        },
        {
          conceptId: 'c2',
          similarity: 0.73,
          folderId: 'folder-a'
        },
        {
          conceptId: 'c3',
          similarity: 0.71,
          folderId: 'folder-a'
        },
        {
          conceptId: 'c4',
          similarity: 0.68,
          folderId: 'folder-b'
        }
      ]);

      const decision = await router.route(mockCandidate);

      expect(decision.action).toBe('route');
      expect(decision.folderId).toBe('folder-a');
      expect(decision.explanation.folderMatches).toBeDefined();
      expect(decision.explanation.folderMatches![0].conceptCount).toBe(3);
    });

    it('should prefer folders with more similar concepts', async () => {
      mockSearchByContext.mockResolvedValue([
        {
          conceptId: 'c1',
          similarity: 0.75,
          folderId: 'popular-folder'
        },
        {
          conceptId: 'c2',
          similarity: 0.74,
          folderId: 'popular-folder'
        },
        {
          conceptId: 'c3',
          similarity: 0.73,
          folderId: 'popular-folder'
        },
        {
          conceptId: 'c4',
          similarity: 0.8,
          folderId: 'lonely-folder'
        }
      ]);

      const decision = await router.route(mockCandidate);

      expect(decision.folderId).toBe('popular-folder');
    });
  });

  describe('batch routing', () => {
    it('should process batch of concepts', async () => {
      const candidates = [
        mockCandidate,
        new ConceptCandidate(mockBatch, 'Deep learning is a subset of machine learning.', 1),
        new ConceptCandidate(mockBatch, 'Convolutional neural networks for image recognition.', 2)
      ];

      const result = await router.routeBatch(candidates);

      expect(result.decisions).toHaveLength(3);
      expect(mockDistill).toHaveBeenCalledTimes(3);
      expect(mockEmbed).toHaveBeenCalledTimes(3);
    });

    it('should detect clusters in batch', async () => {
      const candidates = Array(5).fill(0).map((_, i) => 
        new ConceptCandidate(mockBatch, `Neural network concept ${i}`, i)
      );

      mockEmbed.mockImplementation(() => ({
        ...mockEmbeddings,
        vector: new Array(1536).fill(0.5)
      }));

      const result = await router.routeBatch(candidates);

      expect(result.clusters.length).toBeGreaterThan(0);
      expect(result.clusters[0].concepts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('expansion detection', () => {
    it('should detect folder creation opportunity', async () => {
      mockSearchByContext.mockResolvedValue([
        { conceptId: 'u1', similarity: 0.8, folderId: 'unsorted' },
        { conceptId: 'u2', similarity: 0.78, folderId: 'unsorted' },
        { conceptId: 'u3', similarity: 0.76, folderId: 'unsorted' },
        { conceptId: 'u4', similarity: 0.74, folderId: 'unsorted' },
        { conceptId: 'u5', similarity: 0.72, folderId: null }
      ]);

      const suggestion = await router.checkExpansionOpportunity(mockCandidate);

      expect(suggestion).not.toBeNull();
      expect(suggestion!.concepts.length).toBeGreaterThanOrEqual(5);
      expect(suggestion!.confidence).toBeGreaterThan(0);
    });

    it('should not suggest folder for too few concepts', async () => {
      mockSearchByContext.mockResolvedValue([
        { conceptId: 'u1', similarity: 0.8, folderId: 'unsorted' },
        { conceptId: 'u2', similarity: 0.78, folderId: 'unsorted' }
      ]);

      const suggestion = await router.checkExpansionOpportunity(mockCandidate);

      expect(suggestion).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle distillation failure', async () => {
      mockDistill.mockRejectedValue(new Error('Distillation failed'));

      await expect(router.route(mockCandidate)).rejects.toThrow(/Pipeline failed at distill/);
    });

    it('should handle embedding failure', async () => {
      mockEmbed.mockRejectedValue(new Error('Embedding failed'));

      await expect(router.route(mockCandidate)).rejects.toThrow(/Pipeline failed at embed/);
    });

    it('should handle vector search failure gracefully', async () => {
      mockSearchByContext.mockRejectedValue(new Error('Search failed'));

      await expect(router.route(mockCandidate)).rejects.toThrow(/Pipeline failed at route/);
    });
  });

  describe('statistics tracking', () => {
    it('should track routing statistics', async () => {
      mockSearchByTitle.mockResolvedValueOnce([
        { conceptId: 'dup', similarity: 0.95 }
      ]);

      await router.route(mockCandidate);

      mockSearchByTitle.mockResolvedValueOnce([]);
      mockSearchByContext.mockResolvedValueOnce([
        { conceptId: 'c1', similarity: 0.85, folderId: 'folder' }
      ]);

      await router.route(mockCandidate);

      const stats = await router.getRoutingStats();

      expect(stats.totalRouted).toBe(2);
      expect(stats.duplicatesFound).toBe(1);
      expect(stats.averageConfidence).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('should respect custom thresholds', async () => {
      const customRouter = new SmartRouter(
        createMockDistillService(),
        createMockEmbeddingService(),
        createMockVectorIndex(),
        {
          highConfidenceThreshold: 0.9,
          lowConfidenceThreshold: 0.5
        }
      );

      mockSearchByContext.mockResolvedValue([
        { conceptId: 'c1', similarity: 0.6, folderId: 'folder' }
      ]);

      const decision = await customRouter.route(mockCandidate);

      expect(decision.action).toBe('unsorted'); // Below folderPlacementThreshold
    });

    it('should disable folder creation when configured', async () => {
      const customRouter = new SmartRouter(
        createMockDistillService(),
        createMockEmbeddingService(),
        createMockVectorIndex(),
        {
          enableFolderCreation: false
        }
      );

      mockSearchByContext.mockResolvedValue([
        { conceptId: 'u1', similarity: 0.8, folderId: 'unsorted' },
        { conceptId: 'u2', similarity: 0.78, folderId: 'unsorted' },
        { conceptId: 'u3', similarity: 0.76, folderId: 'unsorted' },
        { conceptId: 'u4', similarity: 0.74, folderId: 'unsorted' },
        { conceptId: 'u5', similarity: 0.72, folderId: 'unsorted' }
      ]);

      const suggestion = await customRouter.checkExpansionOpportunity(mockCandidate);

      expect(suggestion).toBeNull();
    });
  });
});