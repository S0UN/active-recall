/**
 * Tests for OpenAIDistillationService
 * 
 * Following TDD principles, these tests verify the behavior of both
 * single-concept and multi-concept distillation functionality.
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import OpenAI from 'openai';
import { OpenAIDistillationService } from './OpenAIDistillationService';
import { ConceptCandidate, DistilledContent, MultiConceptDistillation, ExtractedConcept } from '../../contracts/schemas';
import { DistillationConfig, DistillationError, DistillationQuotaError } from '../IDistillationService';
import { IContentCache } from '../IContentCache';

// Mock OpenAI
vi.mock('openai');

// Create mock implementations
const createMockCache = (): IContentCache => ({
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  size: vi.fn()
});

const createMockCandidate = (text: string = 'Neural networks are computational models inspired by biological neural networks.'): ConceptCandidate => {
  const normalized = {
    candidateId: 'candidate_123',
    batchId: 'batch_456',
    index: 0,
    rawText: text,
    normalizedText: text.toLowerCase(),
    contentHash: 'hash_789',
    source: {
      window: 'Test Window',
      topic: 'AI',
      batchId: 'batch_456',
      entryCount: 1
    },
    createdAt: new Date()
  };
  
  return {
    normalize: () => normalized,
    ...normalized
  } as unknown as ConceptCandidate;
};

describe('OpenAIDistillationService', () => {
  let service: OpenAIDistillationService;
  let mockCache: IContentCache;
  let mockOpenAIClient: any;
  let mockCreate: Mock;

  const config: DistillationConfig = {
    provider: 'openai',
    apiKey: 'test-key',
    model: 'gpt-3.5-turbo',
    maxTokens: 200,
    temperature: 0.1,
    cacheEnabled: true,
    multiConceptEnabled: true,
    maxConceptsPerDistillation: 5
  };

  beforeEach(() => {
    mockCache = createMockCache();
    mockCreate = vi.fn();
    mockOpenAIClient = {
      chat: {
        completions: {
          create: mockCreate
        }
      }
    };
    
    (OpenAI as unknown as Mock).mockImplementation(() => mockOpenAIClient);
    service = new OpenAIDistillationService(config, mockCache);
  });

  describe('Single concept distillation', () => {
    it('should extract title and summary from a single concept', async () => {
      const candidate = createMockCandidate();
      const expectedResponse = {
        title: 'Neural Networks',
        summary: 'Neural networks are computational models inspired by biological neural networks used for machine learning applications.'
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(expectedResponse)
          }
        }]
      });

      const result = await service.distill(candidate);

      expect(result.title).toBe(expectedResponse.title);
      expect(result.summary).toBe(expectedResponse.summary);
      expect(result.contentHash).toBe('hash_789');
      expect(result.cached).toBe(false);
    });

    it('should return cached result when available', async () => {
      const candidate = createMockCandidate();
      const cachedResult: DistilledContent = {
        title: 'Cached Title',
        summary: 'This is a cached summary that meets the minimum length requirement for validation.',
        contentHash: 'hash_789',
        cached: false,
        distilledAt: new Date()
      };

      (mockCache.get as Mock).mockResolvedValueOnce(cachedResult);

      const result = await service.distill(candidate);

      expect(result.title).toBe(cachedResult.title);
      expect(result.cached).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should throw error for non-study content', async () => {
      const candidate = createMockCandidate('Shopping cart checkout process');
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'NOT_STUDY_CONTENT',
              summary: 'NOT_STUDY_CONTENT'
            })
          }
        }]
      });

      await expect(service.distill(candidate)).rejects.toThrow('Content is not study-related');
    });

    it('should handle API quota errors', async () => {
      const candidate = createMockCandidate();
      
      // Set request count to limit
      for (let i = 0; i < 1000; i++) {
        service.getRequestCount();
        (service as any).requestCount++;
      }

      await expect(service.distill(candidate)).rejects.toThrow(DistillationQuotaError);
    });

    it('should use fallback extraction on JSON parse error', async () => {
      const candidate = createMockCandidate();
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      });

      const result = await service.distill(candidate);

      expect(result.title).toBeTruthy();
      expect(result.summary).toBeTruthy();
      expect(result.summary.length).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Multi-concept distillation', () => {
    it('should extract multiple concepts from text', async () => {
      const text = `
        Neural networks are computational models inspired by biological neural networks.
        They consist of interconnected nodes that process information.
        
        Deep learning is a subset of machine learning using multi-layer neural networks.
        It has revolutionized computer vision and natural language processing.
        
        Backpropagation is an algorithm for training neural networks.
        It calculates gradients efficiently using the chain rule of calculus.
      `;
      
      const candidate = createMockCandidate(text);
      const expectedResponse = {
        concepts: [
          {
            title: 'Neural Networks',
            summary: 'Neural networks are computational models inspired by biological neural networks consisting of interconnected nodes.',
            relevanceScore: 0.9
          },
          {
            title: 'Deep Learning',
            summary: 'Deep learning is a subset of machine learning using multi-layer neural networks for complex pattern recognition.',
            relevanceScore: 0.85
          },
          {
            title: 'Backpropagation Algorithm',
            summary: 'Backpropagation is an algorithm for training neural networks using gradient calculation and the chain rule.',
            relevanceScore: 0.8
          }
        ]
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(expectedResponse)
          }
        }]
      });

      const result = await service.distillMultiple!(candidate);

      expect(result.concepts).toHaveLength(3);
      expect(result.concepts[0].title).toBe('Neural Networks');
      expect(result.concepts[1].title).toBe('Deep Learning');
      expect(result.concepts[2].title).toBe('Backpropagation Algorithm');
      expect(result.totalConcepts).toBe(3);
      expect(result.sourceContentHash).toBe('hash_789');
    });

    it('should handle single concept in multi-concept mode', async () => {
      const candidate = createMockCandidate('Simple single concept text');
      const expectedResponse = {
        concepts: [
          {
            title: 'Single Concept',
            summary: 'This is a single concept that was extracted from the text with sufficient detail.',
            relevanceScore: 0.9
          }
        ]
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(expectedResponse)
          }
        }]
      });

      const result = await service.distillMultiple!(candidate);

      expect(result.concepts).toHaveLength(1);
      expect(result.totalConcepts).toBe(1);
    });

    it('should filter out non-study content in multi-concept mode', async () => {
      const candidate = createMockCandidate('Mixed content with shopping and learning');
      const expectedResponse = {
        concepts: [
          {
            title: 'NOT_STUDY_CONTENT',
            summary: 'NOT_STUDY_CONTENT'
          },
          {
            title: 'Valid Learning Concept',
            summary: 'This is a valid educational concept that should be included in the results.',
            relevanceScore: 0.8
          }
        ]
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(expectedResponse)
          }
        }]
      });

      const result = await service.distillMultiple!(candidate);

      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0].title).toBe('Valid Learning Concept');
    });

    it('should throw error when no valid concepts found', async () => {
      const candidate = createMockCandidate('Shopping cart and checkout process');
      const expectedResponse = {
        concepts: []
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(expectedResponse)
          }
        }]
      });

      await expect(service.distillMultiple!(candidate)).rejects.toThrow('No study-related concepts found');
    });

    it('should return cached multi-concept result when available', async () => {
      const candidate = createMockCandidate();
      const cachedResult: MultiConceptDistillation = {
        concepts: [
          {
            title: 'Cached Concept',
            summary: 'This is a cached concept summary that meets minimum length requirements.',
            relevanceScore: 0.9
          }
        ],
        sourceContentHash: 'hash_789',
        totalConcepts: 1,
        cached: false,
        distilledAt: new Date()
      };

      (mockCache.get as Mock).mockResolvedValueOnce(cachedResult);

      const result = await service.distillMultiple!(candidate);

      expect(result.concepts[0].title).toBe('Cached Concept');
      expect(result.cached).toBe(true);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should limit concepts to maxConceptsPerDistillation', async () => {
      const candidate = createMockCandidate('Long text with many concepts');
      const manyConceptsResponse = {
        concepts: Array(10).fill(null).map((_, i) => ({
          title: `Concept ${i + 1}`,
          summary: `This is concept number ${i + 1} with sufficient detail to meet the minimum length requirement.`,
          relevanceScore: 0.9 - i * 0.05
        }))
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(manyConceptsResponse)
          }
        }]
      });

      const result = await service.distillMultiple!(candidate);

      // Should be limited to first 5 concepts (maxConceptsPerDistillation)
      expect(result.concepts.length).toBeLessThanOrEqual(5);
    });

    it('should use fallback for multi-concept on JSON parse error', async () => {
      const text = `First paragraph about neural networks.
      
      Second paragraph about deep learning frameworks.
      
      Third paragraph about training algorithms.`;
      
      const candidate = createMockCandidate(text);
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      });

      const result = await service.distillMultiple!(candidate);

      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.concepts.length).toBeLessThanOrEqual(3);
      expect(result.concepts[0].title).toBeTruthy();
      expect(result.concepts[0].summary).toBeTruthy();
    });

    it('should handle API errors gracefully in multi-concept mode', async () => {
      const candidate = createMockCandidate();
      
      mockCreate.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.distillMultiple!(candidate)).rejects.toThrow(DistillationError);
    });

    it('should sanitize titles and summaries in multi-concept results', async () => {
      const candidate = createMockCandidate();
      const responseWithLongContent = {
        concepts: [
          {
            title: 'A'.repeat(150), // Too long
            summary: 'Short', // Too short
            relevanceScore: 0.9
          },
          {
            title: '', // Empty
            summary: 'B'.repeat(600), // Too long
            relevanceScore: 0.8
          }
        ]
      };

      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify(responseWithLongContent)
          }
        }]
      });

      const result = await service.distillMultiple!(candidate);

      // Check title sanitization
      expect(result.concepts[0].title.length).toBeLessThanOrEqual(100);
      expect(result.concepts[0].title.endsWith('...')).toBe(true);
      
      // Check summary sanitization
      expect(result.concepts[0].summary.length).toBeGreaterThanOrEqual(50);
      expect(result.concepts[1].summary.length).toBeLessThanOrEqual(500);
      expect(result.concepts[1].summary.endsWith('...')).toBe(true);
      
      // Check empty title handling
      expect(result.concepts[1].title).toBe('Concept');
    });
  });

  describe('Provider information', () => {
    it('should return openai as provider', () => {
      expect(service.getProvider()).toBe('openai');
    });
  });

  describe('Request counting', () => {
    it('should track request count', async () => {
      const candidate = createMockCandidate();
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Test',
              summary: 'Test summary that meets the minimum length requirement for validation.'
            })
          }
        }]
      });

      expect(service.getRequestCount()).toBe(0);
      
      await service.distill(candidate);
      expect(service.getRequestCount()).toBe(1);
      
      await service.distill(candidate);
      expect(service.getRequestCount()).toBe(2);
    });

    it('should reset daily counter', async () => {
      const candidate = createMockCandidate();
      
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Test',
              summary: 'Test summary that meets the minimum length requirement for validation.'
            })
          }
        }]
      });

      await service.distill(candidate);
      expect(service.getRequestCount()).toBe(1);
      
      service.resetDailyCounter();
      expect(service.getRequestCount()).toBe(0);
    });
  });
});