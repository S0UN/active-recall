import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiDistillationService } from './GeminiDistillationService';
import { GeminiConfig } from '../../config/GeminiConfig';
import { IContentCache } from '../IContentCache';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { Batch } from '../../contracts/schemas';
import {
  DistillationError,
  DistillationTimeoutError,
  DistillationQuotaError,
  DistillationValidationError,
  DistillationContentError,
  DistillationProviderError
} from '../IDistillationService';

// Mock Google Generative AI
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn()
    })
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT'
  },
  HarmBlockThreshold: {
    BLOCK_NONE: 'BLOCK_NONE',
    BLOCK_LOW_AND_ABOVE: 'BLOCK_LOW_AND_ABOVE',
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
    BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH'
  }
}));

describe('GeminiDistillationService', () => {
  let service: GeminiDistillationService;
  let mockCache: IContentCache;
  let mockGenerateContent: ReturnType<typeof vi.fn>;
  let testConfig: GeminiConfig;
  let testBatch: Batch;
  let testCandidate: ConceptCandidate;

  const createTestConfig = (overrides?: Partial<GeminiConfig>): GeminiConfig => ({
    provider: 'gemini',
    apiKey: 'test-api-key',
    model: 'gemini-2.5-flash-lite',
    maxTokens: 200,
    temperature: 0.1,
    cacheEnabled: true,
    requestTimeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
    multiConceptEnabled: true,
    maxConceptsPerDistillation: 5,
    specificityEnforcement: true,
    dailyRequestLimit: 1000,
    burstLimit: 10,
    quotaWarningThreshold: 0.8,
    promptVersion: 'v2.0-gemini',
    chainOfThoughtEnabled: true,
    fewShotExamplesEnabled: true,
    ocrAwarenessEnabled: true,
    educationalContentFilter: true,
    commercialContentFilter: true,
    minContentLength: 10,
    maxContentLength: 50000,
    fallbackEnabled: true,
    fallbackStrategy: 'simple',
    debugMode: false,
    logLevel: 'info',
    metricsEnabled: false,
    safetySettings: {
      harmBlockThreshold: 'BLOCK_MEDIUM'
    },
    generationConfig: {
      candidateCount: 1,
      topK: 40,
      topP: 0.95
    },
    ...overrides
  });

  const createTestBatch = (): Batch => ({
    batchId: '550e8400-e29b-41d4-a716-446655440000',
    window: 'Chrome - Test Content',
    topic: 'Machine Learning',
    entries: [
      {
        text: 'Neural networks are computational models',
        timestamp: new Date()
      }
    ],
    createdAt: new Date()
  });

  const createTestCandidate = (
    text: string = 'Neural networks are computational models inspired by biological neural networks. They consist of interconnected nodes that process information.'
  ): ConceptCandidate => {
    const batch = createTestBatch();
    return new ConceptCandidate(batch, text, 0);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(void 0),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(void 0),
      has: vi.fn().mockResolvedValue(false)
    };

    testConfig = createTestConfig();
    testBatch = createTestBatch();
    testCandidate = createTestCandidate();

    // Mock the generateContent method
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    mockGenerateContent = vi.fn().mockResolvedValue({
      response: Promise.resolve({
        text: () => JSON.stringify({
          title: 'Neural Network Architecture',
          summary: 'Computational models inspired by biological neural networks that process information through interconnected nodes'
        })
      })
    });

    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: mockGenerateContent
      })
    }));

    service = new GeminiDistillationService(testConfig, mockCache);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with correct provider', () => {
      expect(service.getProvider()).toBe('gemini-gemini-2.5-flash-lite');
    });

    it('should configure model with safety settings', () => {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');
    });

    it('should initialize request counter', () => {
      expect(service.getRequestCount()).toBe(0);
    });
  });

  describe('Single Concept Distillation', () => {
    it('should extract single concept successfully', async () => {
      const result = await service.distill(testCandidate);

      expect(result).toEqual({
        title: 'Neural Network Architecture',
        summary: 'Computational models inspired by biological neural networks that process information through interconnected nodes'
      });
      expect(service.getRequestCount()).toBe(1);
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        title: 'Cached Concept',
        summary: 'This is from cache'
      };
      mockCache.get = vi.fn().mockResolvedValue(cachedResult);

      const result = await service.distill(testCandidate);

      expect(result).toEqual(cachedResult);
      expect(mockGenerateContent).not.toHaveBeenCalled();
      expect(service.getRequestCount()).toBe(0);
    });

    it('should cache successful results', async () => {
      await service.distill(testCandidate);

      expect(mockCache.set).toHaveBeenCalledWith(
        testCandidate.contentHash,
        expect.any(Object),
        30 * 24 * 60 * 60
      );
    });

    it('should handle non-educational content', async () => {
      mockGenerateContent.mockResolvedValue({
        response: Promise.resolve({
          text: () => JSON.stringify({
            title: 'NOT_STUDY_CONTENT',
            summary: 'NOT_STUDY_CONTENT'
          })
        })
      });

      await expect(service.distill(testCandidate))
        .rejects.toThrow(DistillationContentError);
    });

    it('should validate input text length', async () => {
      const shortCandidate = createTestCandidate('Hi');

      await expect(service.distill(shortCandidate))
        .rejects.toThrow(DistillationValidationError);
    });

    it('should reject malicious content', async () => {
      const maliciousCandidate = createTestCandidate('SELECT * FROM users; DROP TABLE users;');

      await expect(service.distill(maliciousCandidate))
        .rejects.toThrow(DistillationValidationError);
    });
  });

  describe('Multi-Concept Distillation', () => {
    beforeEach(() => {
      mockGenerateContent.mockResolvedValue({
        response: Promise.resolve({
          text: () => JSON.stringify([
            {
              title: 'Neural Network Layers',
              summary: 'Structured arrangement of interconnected nodes in neural networks',
              relevanceScore: 0.9
            },
            {
              title: 'Activation Functions',
              summary: 'Mathematical functions that determine neuron output in neural networks',
              relevanceScore: 0.8
            }
          ])
        })
      });
    });

    it('should extract multiple concepts successfully', async () => {
      const result = await service.distillMultiple(testCandidate);

      expect(result.concepts).toHaveLength(2);
      expect(result.concepts[0].title).toBe('Neural Network Layers');
      expect(result.concepts[1].title).toBe('Activation Functions');
      expect(result.totalConcepts).toBe(2);
      expect(result.sourceContentHash).toBe(testCandidate.contentHash);
      expect(service.getRequestCount()).toBe(1);
    });

    it('should return cached multi-concept result when available', async () => {
      const cachedResult = {
        concepts: [{ title: 'Cached Concept', summary: 'From cache', relevanceScore: 0.8 }],
        sourceContentHash: testCandidate.contentHash,
        totalConcepts: 1,
        processingTime: Date.now(),
        cached: true,
        distilledAt: new Date(),
        modelInfo: { model: 'cached', promptVersion: 'v1.0' }
      };
      mockCache.get = vi.fn().mockResolvedValue(cachedResult);

      const result = await service.distillMultiple(testCandidate);

      expect(result).toEqual(cachedResult);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should cache multi-concept results with correct key', async () => {
      await service.distillMultiple(testCandidate);

      expect(mockCache.set).toHaveBeenCalledWith(
        `multi_${testCandidate.contentHash}`,
        expect.any(Object),
        30 * 24 * 60 * 60
      );
    });

    it('should handle empty concept array', async () => {
      mockGenerateContent.mockResolvedValue({
        response: Promise.resolve({
          text: () => '[]'
        })
      });

      await expect(service.distillMultiple(testCandidate))
        .rejects.toThrow(DistillationContentError);
    });

    it('should throw error when multi-concept is disabled', async () => {
      const configWithoutMulti = createTestConfig({ multiConceptEnabled: false });
      const serviceWithoutMulti = new GeminiDistillationService(configWithoutMulti, mockCache);

      await expect(serviceWithoutMulti.distillMultiple(testCandidate))
        .rejects.toThrow('Multi-concept extraction is not enabled');
    });
  });

  describe('Error Handling', () => {
    it('should handle API timeout', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Request timeout'));

      await expect(service.distill(testCandidate))
        .rejects.toThrow(DistillationProviderError);
    });

    it('should handle quota exceeded error', async () => {
      const quotaError = { status: 429, message: 'quota exceeded' };
      mockGenerateContent.mockRejectedValue(quotaError);

      await expect(service.distill(testCandidate))
        .rejects.toThrow(DistillationQuotaError);
    });

    it('should handle authentication failure', async () => {
      const authError = { status: 401, message: 'unauthorized' };
      mockGenerateContent.mockRejectedValue(authError);

      await expect(service.distill(testCandidate))
        .rejects.toThrow(DistillationProviderError);
    });

    it('should handle malformed JSON response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: Promise.resolve({
          text: () => 'This is not JSON'
        })
      });

      await expect(service.distill(testCandidate))
        .rejects.toThrow(DistillationValidationError);
    });

    it('should handle empty response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: Promise.resolve({
          text: () => ''
        })
      });

      await expect(service.distill(testCandidate))
        .rejects.toThrow(DistillationProviderError);
    });
  });

  describe('Rate Limiting', () => {
    it('should track daily request count', async () => {
      await service.distill(testCandidate);
      await service.distill(testCandidate);

      expect(service.getRequestCount()).toBe(2);
    });

    it('should enforce daily limit', async () => {
      const limitedConfig = createTestConfig({ dailyRequestLimit: 1 });
      const limitedService = new GeminiDistillationService(limitedConfig, mockCache);

      // First request should succeed
      await limitedService.distill(testCandidate);

      // Second request should fail
      await expect(limitedService.distill(testCandidate))
        .rejects.toThrow(DistillationQuotaError);
    });

    it('should reset daily counter', () => {
      service.resetDailyCounter();
      expect(service.getRequestCount()).toBe(0);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty text', async () => {
      const emptyCandidate = createTestCandidate('');

      await expect(service.distill(emptyCandidate))
        .rejects.toThrow(DistillationValidationError);
    });

    it('should reject text that is too long', async () => {
      const longText = 'a'.repeat(60000);
      const longCandidate = createTestCandidate(longText);

      await expect(service.distill(longCandidate))
        .rejects.toThrow(DistillationValidationError);
    });

    it('should reject text with SQL injection patterns', async () => {
      const sqlCandidate = createTestCandidate('Learn about DROP TABLE users;');

      await expect(service.distill(sqlCandidate))
        .rejects.toThrow(DistillationValidationError);
    });

    it('should reject text with script tags', async () => {
      const scriptCandidate = createTestCandidate('Study <script>alert("hack")</script> programming');

      await expect(service.distill(scriptCandidate))
        .rejects.toThrow(DistillationValidationError);
    });
  });

  describe('Prompt Building', () => {
    it('should build appropriate single concept prompt', async () => {
      await service.distill(testCandidate);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Extract the single most specific educational concept')
      );
    });

    it('should build multi-concept prompt with chain of thought', async () => {
      await service.distillMultiple(testCandidate);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('REASONING APPROACH')
      );
    });

    it('should include few-shot examples when enabled', async () => {
      await service.distillMultiple(testCandidate);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('EXAMPLES:')
      );
    });

    it('should include OCR awareness when enabled', async () => {
      await service.distillMultiple(testCandidate);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('OCR artifacts')
      );
    });
  });

  describe('Configuration Handling', () => {
    it('should use debug mode for logging', () => {
      const debugConfig = createTestConfig({ debugMode: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      new GeminiDistillationService(debugConfig, mockCache);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Service initialized with model')
      );

      consoleSpy.mockRestore();
    });

    it('should respect caching configuration', async () => {
      const noCacheConfig = createTestConfig({ cacheEnabled: false });
      const noCacheService = new GeminiDistillationService(noCacheConfig, mockCache);

      await noCacheService.distill(testCandidate);

      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('Schema Validation', () => {
    it('should validate single concept schema', async () => {
      mockGenerateContent.mockResolvedValue({
        response: Promise.resolve({
          text: () => JSON.stringify({
            title: '',  // Invalid: empty title
            summary: 'Valid summary'
          })
        })
      });

      await expect(service.distill(testCandidate))
        .rejects.toThrow(DistillationValidationError);
    });

    it('should validate multi-concept schema', async () => {
      mockGenerateContent.mockResolvedValue({
        response: Promise.resolve({
          text: () => JSON.stringify([{
            title: 'Valid Title',
            summary: 'Too short'  // Invalid: too short
          }])
        })
      });

      await expect(service.distillMultiple(testCandidate))
        .rejects.toThrow();
    });
  });
});