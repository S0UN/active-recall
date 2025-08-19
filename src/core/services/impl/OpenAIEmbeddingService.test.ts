/**
 * OpenAIEmbeddingService Tests
 * 
 * Tests the OpenAI-powered embedding generation service.
 * This service creates title and context vectors for routing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIEmbeddingService } from './OpenAIEmbeddingService';
import { MemoryContentCache } from './MemoryContentCache';
import { DistilledContent } from '../../contracts/schemas';

// Mock OpenAI
const mockEmbeddingsCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      embeddings: {
        create: mockEmbeddingsCreate
      }
    })),
    APITimeoutError: class extends Error {
      constructor() {
        super('Timeout');
        this.name = 'APITimeoutError';
      }
    },
    RateLimitError: class extends Error {
      constructor() {
        super('Rate limit');
        this.name = 'RateLimitError';
      }
    }
  };
});

describe('OpenAIEmbeddingService', () => {
  let service: OpenAIEmbeddingService;
  let cache: MemoryContentCache;

  beforeEach(() => {
    cache = new MemoryContentCache();
    
    // Mock OpenAI response
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{
        embedding: new Array(1536).fill(0).map(() => Math.random())
      }]
    });

    service = new OpenAIEmbeddingService({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      cacheEnabled: true
    }, cache);
  });

  describe('basic functionality', () => {
    it('should implement IEmbeddingService interface', () => {
      expect(service.getProvider()).toBe('openai');
      expect(service.getDimensions()).toBe(1536);
    });

    it('should generate title and context embeddings', async () => {
      const distilled: DistilledContent = {
        title: 'Machine Learning Fundamentals',
        summary: 'Machine learning is a subset of artificial intelligence that focuses on algorithms.',
        contentHash: 'hash123',
        cached: false,
        distilledAt: new Date()
      };

      const result = await service.embed(distilled);

      expect(result.vector).toHaveLength(1536);
      expect(result.contentHash).toBe('hash123');
      expect(result.model).toBe('text-embedding-3-small');
      expect(result.dimensions).toBe(1536);
      expect(result.cached).toBe(false);
      expect(result.embeddedAt).toBeInstanceOf(Date);

      // Should make one API call (single vector)
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
    });

    it('should not cache embeddings (caching not implemented)', async () => {
      const distilled: DistilledContent = {
        title: 'Test Content',
        summary: 'This content will not be cached since embedding caching is not implemented.',
        contentHash: 'test123',
        cached: false,
        distilledAt: new Date()
      };

      // First call
      const result1 = await service.embed(distilled);
      expect(result1.cached).toBe(false);

      // Reset mock to verify no caching
      mockEmbeddingsCreate.mockClear();

      // Second call should make new API calls (no caching)
      const result2 = await service.embed(distilled);
      expect(result2.cached).toBe(false);

      // Should make new API calls since caching is not implemented
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1); // Single vector system
    });
  });

  describe('error handling', () => {
    it('should throw error when API key is missing', () => {
      expect(() => {
        new OpenAIEmbeddingService({
          provider: 'openai',
          // apiKey missing
        }, cache);
      }).toThrow('OpenAI API key is required');
    });

    it('should handle API timeout errors', async () => {
      // Create a mock timeout error
      const timeoutError = new Error('Timeout');
      timeoutError.name = 'APITimeoutError';
      mockEmbeddingsCreate.mockRejectedValue(timeoutError);

      const distilled: DistilledContent = {
        title: 'Test Content',
        summary: 'Test summary for timeout scenario.',
        contentHash: 'timeout123',
        cached: false,
        distilledAt: new Date()
      };

      await expect(service.embed(distilled)).rejects.toThrow(/timed out/);
    });

    it('should track request count and enforce daily limits', async () => {
      // Set a low limit for testing
      const restrictedService = new OpenAIEmbeddingService({
        provider: 'openai',
        apiKey: 'test-key',
        cacheEnabled: false // Disable cache to force API calls
      }, cache);

      // Override daily limit for testing
      (restrictedService as any).dailyRequestLimit = 1;

      const distilled: DistilledContent = {
        title: 'Test',
        summary: 'Test summary that will exceed limits.',
        contentHash: 'limit123',
        cached: false,
        distilledAt: new Date()
      };

      // First call should work (uses 1 request: single vector)
      await restrictedService.embed(distilled);
      expect(restrictedService.getRequestCount()).toBe(1);

      // Second call should fail due to limit (already at 1/1)
      await expect(restrictedService.embed({
        ...distilled,
        contentHash: 'limit456'
      })).rejects.toThrow(/Daily embedding limit reached/);
    });
  });

  describe('schema compliance', () => {
    it('should always return valid VectorEmbeddings', async () => {
      const distilled: DistilledContent = {
        title: 'Schema Test',
        summary: 'Testing schema compliance for vector embeddings generation.',
        contentHash: 'schema123',
        cached: false,
        distilledAt: new Date()
      };

      const result = await service.embed(distilled);

      // Check all required fields
      expect(Array.isArray(result.vector)).toBe(true);
      expect(result.vector.length).toBe(1536);
      expect(result.vector.every(n => typeof n === 'number')).toBe(true);

      expect(typeof result.contentHash).toBe('string');
      expect(result.contentHash.length).toBeGreaterThan(0);

      expect(typeof result.model).toBe('string');
      expect(typeof result.dimensions).toBe('number');
      expect(result.dimensions).toBeGreaterThan(0);

      expect(typeof result.cached).toBe('boolean');
      expect(result.embeddedAt).toBeInstanceOf(Date);
    });
  });
});