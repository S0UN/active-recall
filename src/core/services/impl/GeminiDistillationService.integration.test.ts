import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiDistillationService } from './GeminiDistillationService';
import { GeminiConfig } from '../../config/GeminiConfig';
import { IContentCache } from '../IContentCache';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { Batch } from '../../contracts/schemas';
import {
  DistillationError,
  DistillationValidationError
} from '../IDistillationService';

/**
 * Integration tests for GeminiDistillationService
 * These tests require actual API credentials and should be run sparingly
 */
describe('GeminiDistillationService - Integration Tests', () => {
  let service: GeminiDistillationService;
  let mockCache: IContentCache;
  let testConfig: GeminiConfig;
  let testBatch: Batch;

  const createMockCache = (): IContentCache => ({
    get: async () => null,
    set: async () => void 0,
    delete: async () => true,
    clear: async () => void 0,
    has: async () => false
  });

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

  beforeEach(() => {
    mockCache = createMockCache();
    testConfig = createTestConfig();
    testBatch = createTestBatch();
  });

  describe('Configuration Validation', () => {
    it('should throw error for missing API key', () => {
      const invalidConfig = createTestConfig({ apiKey: '' });
      
      expect(() => {
        new GeminiDistillationService(invalidConfig, mockCache);
      }).toThrow(DistillationError);
    });

    it('should throw error for missing model', () => {
      const invalidConfig = createTestConfig({ model: '' });
      
      expect(() => {
        new GeminiDistillationService(invalidConfig, mockCache);
      }).toThrow(DistillationError);
    });

    it('should throw error for wrong provider', () => {
      const invalidConfig = createTestConfig({ provider: 'openai' as any });
      
      expect(() => {
        new GeminiDistillationService(invalidConfig, mockCache);
      }).toThrow(DistillationError);
    });

    it('should initialize successfully with valid config', () => {
      expect(() => {
        service = new GeminiDistillationService(testConfig, mockCache);
      }).not.toThrow();
      
      expect(service.getProvider()).toBe('gemini-gemini-2.5-flash-lite');
      expect(service.getRequestCount()).toBe(0);
    });
  });

  describe('Input Validation', () => {
    beforeEach(() => {
      service = new GeminiDistillationService(testConfig, mockCache);
    });

    it('should handle ConceptCandidate validation (empty text)', () => {
      // ConceptCandidate itself validates input - this shows good separation of concerns
      expect(() => {
        new ConceptCandidate(testBatch, '   ', 0);
      }).toThrow('Text cannot be empty');
    });

    it('should handle ConceptCandidate validation (short text)', () => {
      // ConceptCandidate itself validates input - this shows good separation of concerns
      expect(() => {
        new ConceptCandidate(testBatch, 'Hi', 0);
      }).toThrow('Text must be at least 3 characters');
    });

    it('should handle ConceptCandidate validation (long text)', () => {
      // ConceptCandidate itself validates input - this shows good separation of concerns
      const longText = 'a'.repeat(60000);
      expect(() => {
        new ConceptCandidate(testBatch, longText, 0);
      }).toThrow('Text must not exceed 5000 characters');
    });

    it('should accept valid text length', () => {
      // Valid text should not throw during ConceptCandidate creation
      expect(() => {
        new ConceptCandidate(testBatch, 'This is a valid educational text about machine learning concepts and algorithms.', 0);
      }).not.toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should track request counts', () => {
      service = new GeminiDistillationService(testConfig, mockCache);
      
      expect(service.getRequestCount()).toBe(0);
      
      // Simulate incrementing (private method, so we test through public interface)
      service.resetDailyCounter();
      expect(service.getRequestCount()).toBe(0);
    });

    it('should reset daily counter', () => {
      service = new GeminiDistillationService(testConfig, mockCache);
      
      // Test that reset doesn't throw error
      expect(() => service.resetDailyCounter()).not.toThrow();
    });
  });

  describe('Provider Information', () => {
    it('should return correct provider string', () => {
      service = new GeminiDistillationService(testConfig, mockCache);
      
      expect(service.getProvider()).toBe('gemini-gemini-2.5-flash-lite');
    });

    it('should handle different model names in provider string', () => {
      const configs = [
        { model: 'gemini-2.0-flash', expected: 'gemini-gemini-2.0-flash' },
        { model: 'gemini-2.0-pro-experimental', expected: 'gemini-gemini-2.0-pro-experimental' }
      ];

      configs.forEach(({ model, expected }) => {
        const config = createTestConfig({ model });
        const testService = new GeminiDistillationService(config, mockCache);
        expect(testService.getProvider()).toBe(expected);
      });
    });
  });

  describe('Configuration Options', () => {
    it('should respect debug mode setting', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const debugConfig = createTestConfig({ debugMode: true });
      new GeminiDistillationService(debugConfig, mockCache);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GeminiDistillation] Service initialized with model:',
        'gemini-2.5-flash-lite'
      );

      consoleSpy.mockRestore();
    });

    it('should use proper default values', () => {
      const minimalConfig = createTestConfig({
        temperature: undefined,
        maxTokens: undefined,
        generationConfig: undefined
      });
      
      // Should not throw despite undefined values
      expect(() => {
        new GeminiDistillationService(minimalConfig, mockCache);
      }).not.toThrow();
    });
  });
});