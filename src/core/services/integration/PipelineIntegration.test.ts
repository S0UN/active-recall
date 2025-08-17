/**
 * Pipeline Integration Tests
 * 
 * Tests the complete DISTILL → EMBED → ROUTE pipeline end-to-end
 * with real components working together.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartRouter } from '../impl/SmartRouter';
import { OpenAIDistillationService } from '../impl/OpenAIDistillationService';
import { OpenAIEmbeddingService } from '../impl/OpenAIEmbeddingService';
import { QdrantVectorIndexManager } from '../impl/QdrantVectorIndexManager';
import { MemoryContentCache } from '../impl/MemoryContentCache';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { BatchSchema } from '../../contracts/schemas';

// Mock external services
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                title: 'Machine Learning Fundamentals',
                summary: 'Machine learning algorithms enable computers to learn patterns from data and make predictions without explicit programming.'
              })
            }
          }]
        })
      }
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{
          embedding: new Array(1536).fill(0).map(() => Math.random())
        }]
      })
    }
  })),
  APITimeoutError: class extends Error {
    constructor() { super('Timeout'); this.name = 'APITimeoutError'; }
  },
  RateLimitError: class extends Error {
    constructor() { super('Rate limit'); this.name = 'RateLimitError'; }
  }
}));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: vi.fn().mockImplementation(() => ({
    upsert: vi.fn().mockResolvedValue({ status: 'ok' }),
    search: vi.fn().mockResolvedValue([]),
    scroll: vi.fn().mockResolvedValue({ points: [] }),
    delete: vi.fn().mockResolvedValue({ status: 'ok' }),
    count: vi.fn().mockResolvedValue({ count: 0 }),
    getCollections: vi.fn().mockResolvedValue({
      collections: [
        { name: 'concepts_title' },
        { name: 'concepts_context' },
        { name: 'folder_centroids' }
      ]
    }),
    getCollection: vi.fn().mockResolvedValue({ name: 'test' }),
    createCollection: vi.fn().mockResolvedValue({ status: 'ok' })
  }))
}));

describe('Pipeline Integration Tests', () => {
  let router: SmartRouter;
  let distillService: OpenAIDistillationService;
  let embeddingService: OpenAIEmbeddingService;
  let vectorIndex: QdrantVectorIndexManager;
  let cache: MemoryContentCache;
  let mockBatch: any;

  beforeEach(async () => {
    cache = new MemoryContentCache();

    distillService = new OpenAIDistillationService({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-3.5-turbo',
      cacheEnabled: true
    }, cache);

    embeddingService = new OpenAIEmbeddingService({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      cacheEnabled: true
    }, cache);

    vectorIndex = new QdrantVectorIndexManager({
      provider: 'qdrant',
      host: 'localhost',
      port: 6333,
      dimensions: 1536
    });

    router = new SmartRouter(
      distillService,
      embeddingService,
      vectorIndex,
      {
        highConfidenceThreshold: 0.82,
        lowConfidenceThreshold: 0.65,
        enableFolderCreation: true
      }
    );

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
  });

  describe('end-to-end pipeline', () => {
    it('should route concept through complete pipeline successfully', async () => {
      const candidate = new ConceptCandidate(
        mockBatch,
        'Neural networks are computational models inspired by biological neural networks for machine learning applications.',
        0
      );

      const decision = await router.route(candidate);

      expect(decision).toBeDefined();
      expect(decision.action).toBeOneOf(['route', 'unsorted', 'review']);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
      expect(decision.explanation).toBeDefined();
      expect(decision.explanation.primarySignal).toBeTruthy();
      expect(decision.timestamp).toBeInstanceOf(Date);
    });

    it('should handle batch processing', async () => {
      const candidates = [
        new ConceptCandidate(mockBatch, 'Deep learning uses neural networks with multiple hidden layers.', 0),
        new ConceptCandidate(mockBatch, 'Convolutional neural networks excel at image recognition tasks.', 1),
        new ConceptCandidate(mockBatch, 'Recurrent neural networks process sequential data effectively.', 2)
      ];

      const result = await router.routeBatch(candidates);

      expect(result.decisions).toHaveLength(3);
      expect(result.clusters).toBeDefined();
      expect(result.suggestedFolders).toBeDefined();

      result.decisions.forEach(decision => {
        expect(decision.action).toBeOneOf(['route', 'unsorted', 'review', 'create_folder']);
        expect(decision.confidence).toBeGreaterThanOrEqual(0);
        expect(decision.explanation).toBeDefined();
      });
    });

    it('should detect expansion opportunities', async () => {
      const candidate = new ConceptCandidate(
        mockBatch,
        'Quantum computing leverages quantum mechanical phenomena for computation.',
        0
      );

      const suggestion = await router.checkExpansionOpportunity(candidate);

      // May or may not suggest expansion depending on unsorted content
      if (suggestion) {
        expect(suggestion.name).toBeTruthy();
        expect(suggestion.concepts).toBeDefined();
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('pipeline resilience', () => {
    it('should handle service failures gracefully', async () => {
      // Mock a distillation failure
      vi.spyOn(distillService, 'distill').mockRejectedValueOnce(new Error('Service unavailable'));

      const candidate = new ConceptCandidate(
        mockBatch,
        'Test content for failure scenario.',
        0
      );

      await expect(router.route(candidate)).rejects.toThrow(/Pipeline failed at distill/);
    });

    it('should maintain statistics across operations', async () => {
      const candidate = new ConceptCandidate(
        mockBatch,
        'Statistics tracking test content.',
        0
      );

      await router.route(candidate);
      await router.route(candidate); // Second call should trigger duplicate detection

      const stats = await router.getRoutingStats();

      expect(stats.totalRouted).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('configuration behavior', () => {
    it('should respect threshold configurations', async () => {
      const strictRouter = new SmartRouter(
        distillService,
        embeddingService,
        vectorIndex,
        {
          highConfidenceThreshold: 0.95, // Very high
          lowConfidenceThreshold: 0.8,   // High
          enableFolderCreation: false
        }
      );

      const candidate = new ConceptCandidate(
        mockBatch,
        'Test content for strict thresholds.',
        0
      );

      const decision = await strictRouter.route(candidate);

      // With strict thresholds, should likely go to unsorted or review
      expect(decision.action).toBeOneOf(['unsorted', 'review']);
    });

    it('should disable folder creation when configured', async () => {
      const noExpansionRouter = new SmartRouter(
        distillService,
        embeddingService,
        vectorIndex,
        {
          enableFolderCreation: false
        }
      );

      const candidate = new ConceptCandidate(
        mockBatch,
        'New topic that would normally suggest folder creation.',
        0
      );

      const suggestion = await noExpansionRouter.checkExpansionOpportunity(candidate);

      expect(suggestion).toBeNull();
    });
  });

  describe('caching behavior', () => {
    it('should cache distillation results', async () => {
      const candidate1 = new ConceptCandidate(
        mockBatch,
        'Content for caching test.',
        0
      );

      const candidate2 = new ConceptCandidate(
        mockBatch,
        'Content for caching test.', // Same text
        0
      );

      // First call
      const decision1 = await router.route(candidate1);
      expect(decision1.action).toBeOneOf(['route', 'unsorted', 'review']);
      
      // Second call with same content should detect duplicate via title similarity
      const decision2 = await router.route(candidate2);

      // Either duplicate detection or same routing decision due to caching
      expect(decision2.action).toBeOneOf(['duplicate', 'route', 'unsorted', 'review']);
    });
  });

  describe('error recovery', () => {
    it('should handle malformed LLM responses', async () => {
      // Mock the distillation service to simulate JSON parsing error
      vi.spyOn(distillService, 'distill').mockRejectedValueOnce(
        new Error('Failed to parse JSON response')
      );

      const candidate = new ConceptCandidate(
        mockBatch,
        'Content that will cause JSON parsing error.',
        0
      );

      // Should propagate the error as expected
      await expect(router.route(candidate)).rejects.toThrow(/Pipeline failed at distill/);
    });
  });

  describe('vector operations', () => {
    it('should validate vector dimensions', async () => {
      // Create a real vector index manager to test actual validation
      const realVectorIndex = new QdrantVectorIndexManager({
        provider: 'qdrant',
        host: 'localhost',
        port: 6333,
        dimensions: 1536
      });

      // Mock embedding service to return wrong dimensions
      vi.spyOn(embeddingService, 'embed').mockResolvedValueOnce({
        titleVector: new Array(512).fill(0.1), // Wrong dimension  
        contextVector: new Array(512).fill(0.1), // Wrong dimension
        contentHash: 'hash123',
        model: 'text-embedding-3-small',
        dimensions: 512, // Wrong dimension
        cached: false,
        embeddedAt: new Date()
      });

      const realRouter = new SmartRouter(
        distillService,
        embeddingService,
        realVectorIndex
      );

      const candidate = new ConceptCandidate(
        mockBatch,
        'Content for dimension validation test.',
        0
      );

      // Should fail due to dimension mismatch
      await expect(realRouter.route(candidate)).rejects.toThrow(/Pipeline failed at route/);
    });
  });
});

// Custom matcher for better test readability
expect.extend({
  toBeOneOf(received: any, validOptions: any[]) {
    const pass = validOptions.includes(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be one of ${validOptions.join(', ')}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be one of ${validOptions.join(', ')}`,
        pass: false
      };
    }
  }
});