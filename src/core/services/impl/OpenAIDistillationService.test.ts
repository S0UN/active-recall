/**
 * Tests for OpenAIDistillationService
 * 
 * Following TDD principles, these tests verify the behavior of both
 * single-concept and multi-concept distillation functionality.
 * 
 * Test Architecture:
 * - Helper functions for creating test data and mocks
 * - Abstracted common test scenarios
 * - Clear test structure with descriptive names
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import OpenAI from 'openai';
import { OpenAIDistillationService } from './OpenAIDistillationService';
import { ConceptCandidate, DistilledContent, MultiConceptDistillation, ExtractedConcept } from '../../contracts/schemas';
import { DistillationConfig, DistillationError, DistillationQuotaError } from '../IDistillationService';
import { IContentCache } from '../IContentCache';

// Mock OpenAI
vi.mock('openai');

// =============================================================================
// TEST HELPERS AND FACTORIES
// =============================================================================

/**
 * Creates a mock content cache for testing
 */
const createMockCache = (): IContentCache => ({
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  size: vi.fn()
});

/**
 * Creates a test ConceptCandidate with sensible defaults
 */
const createTestCandidate = (
  text: string = 'Neural networks are computational models inspired by biological neural networks.',
  overrides: Partial<ConceptCandidate> = {}
): ConceptCandidate => {
  const defaultCandidate = {
    candidateId: 'test-candidate-123',
    batchId: 'test-batch-456',
    index: 0,
    rawText: text,
    normalizedText: text.toLowerCase(),
    contentHash: 'test-hash-789',
    source: {
      window: 'Test Window',
      topic: 'AI Learning',
      batchId: 'test-batch-456',
      entryCount: 1
    },
    createdAt: new Date()
  };
  
  return {
    normalize: () => ({ ...defaultCandidate, ...overrides }),
    ...defaultCandidate,
    ...overrides
  } as unknown as ConceptCandidate;
};

/**
 * Standard test configuration for the service
 */
const createTestConfig = (overrides: Partial<DistillationConfig> = {}): DistillationConfig => ({
  provider: 'openai',
  apiKey: 'test-api-key',
  model: 'gpt-3.5-turbo',
  maxTokens: 200,
  temperature: 0.1,
  cacheEnabled: true,
  multiConceptEnabled: true,
  maxConceptsPerDistillation: 5,
  ...overrides
});

// =============================================================================
// MOCK RESPONSE FACTORIES
// =============================================================================

/**
 * Creates a successful OpenAI API response for single concept
 */
const createSingleConceptResponse = (title: string, summary: string) => ({
  choices: [{
    message: {
      content: JSON.stringify({ title, summary })
    }
  }]
});

/**
 * Creates a successful OpenAI API response for multiple concepts
 */
const createMultiConceptResponse = (concepts: Array<{ title: string; summary: string; relevanceScore?: number }>) => ({
  choices: [{
    message: {
      content: JSON.stringify({ concepts })
    }
  }]
});

/**
 * Creates an OpenAI API error with specific status code and details
 */
const createOpenAIError = (status: number, code?: string, message = 'API Error') => {
  const error = new Error(message) as any;
  error.status = status;
  if (code) error.code = code;
  return error;
};

/**
 * Creates a non-study content response from OpenAI
 */
const createNonStudyResponse = () => ({
  choices: [{
    message: {
      content: JSON.stringify({
        title: 'NOT_STUDY_CONTENT',
        summary: 'NOT_STUDY_CONTENT'
      })
    }
  }]
});

// =============================================================================
// TEST ASSERTION HELPERS
// =============================================================================

/**
 * Validates that a DistilledContent object has the expected structure
 */
const expectValidDistilledContent = (result: DistilledContent, expectedTitle?: string) => {
  expect(result.title).toBeTruthy();
  expect(result.title.length).toBeGreaterThan(0);
  expect(result.title.length).toBeLessThanOrEqual(100);
  
  expect(result.summary).toBeTruthy();
  expect(result.summary.length).toBeGreaterThanOrEqual(50);
  expect(result.summary.length).toBeLessThanOrEqual(500);
  
  expect(result.contentHash).toBeTruthy();
  expect(typeof result.cached).toBe('boolean');
  
  if (expectedTitle) {
    expect(result.title).toBe(expectedTitle);
  }
};

/**
 * Validates that a MultiConceptDistillation object has the expected structure
 */
const expectValidMultiConceptDistillation = (
  result: MultiConceptDistillation, 
  expectedConceptCount?: number
) => {
  expect(result.concepts).toBeDefined();
  expect(Array.isArray(result.concepts)).toBe(true);
  expect(result.concepts.length).toBeGreaterThan(0);
  expect(result.concepts.length).toBeLessThanOrEqual(5);
  
  expect(result.totalConcepts).toBe(result.concepts.length);
  expect(result.sourceContentHash).toBeTruthy();
  expect(typeof result.cached).toBe('boolean');
  
  if (expectedConceptCount) {
    expect(result.concepts.length).toBe(expectedConceptCount);
  }
  
  // Validate each concept
  result.concepts.forEach((concept, index) => {
    expect(concept.title).toBeTruthy();
    expect(concept.title.length).toBeLessThanOrEqual(100);
    expect(concept.summary).toBeTruthy();
    expect(concept.summary.length).toBeGreaterThanOrEqual(50);
    expect(concept.summary.length).toBeLessThanOrEqual(500);
  });
};

// =============================================================================
// COMMON TEST SCENARIOS
// =============================================================================

/**
 * Tests that the service handles a successful API response correctly
 */
const testSuccessfulDistillation = async (
  service: OpenAIDistillationService,
  mockCreate: Mock,
  candidate: ConceptCandidate,
  expectedTitle: string,
  expectedSummary: string
) => {
  mockCreate.mockResolvedValueOnce(createSingleConceptResponse(expectedTitle, expectedSummary));
  
  const result = await service.distill(candidate);
  
  expectValidDistilledContent(result, expectedTitle);
  expect(result.summary).toBe(expectedSummary);
  expect(result.contentHash).toBe(candidate.contentHash);
};

/**
 * Tests that the service handles API errors correctly
 */
const testApiErrorHandling = async (
  service: OpenAIDistillationService,
  mockCreate: Mock,
  candidate: ConceptCandidate,
  error: any,
  expectedErrorMessage: string
) => {
  mockCreate.mockRejectedValueOnce(error);
  await expect(service.distill(candidate)).rejects.toThrow(expectedErrorMessage);
};

/**
 * Tests validation error scenarios
 */
const testValidationError = async (
  service: OpenAIDistillationService,
  candidate: ConceptCandidate,
  expectedErrorMessage: string
) => {
  await expect(service.distill(candidate)).rejects.toThrow(expectedErrorMessage);
};

// =============================================================================
// MAIN TEST SUITE
// =============================================================================

describe('OpenAIDistillationService', () => {
  let service: OpenAIDistillationService;
  let mockCache: IContentCache;
  let mockOpenAIClient: any;
  let mockCreate: Mock;

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
    service = new OpenAIDistillationService(createTestConfig(), mockCache);
  });

  // =============================================================================
  // SINGLE CONCEPT DISTILLATION TESTS
  // =============================================================================

  describe('Single concept distillation', () => {
    it('should successfully extract title and summary from educational text', async () => {
      const candidate = createTestCandidate();
      const expectedTitle = 'Neural Networks';
      const expectedSummary = 'Neural networks are computational models inspired by biological neural networks used for machine learning applications.';

      await testSuccessfulDistillation(service, mockCreate, candidate, expectedTitle, expectedSummary);
    });

    it('should return cached result when available', async () => {
      const candidate = createTestCandidate();
      const cachedResult: DistilledContent = {
        title: 'Cached Title',
        summary: 'This is a cached summary that meets the minimum length requirement for validation.',
        contentHash: 'test-hash-789',
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
      const candidate = createTestCandidate('Shopping cart checkout process');
      
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
      const candidate = createTestCandidate();
      
      // Set request count to limit
      for (let i = 0; i < 1000; i++) {
        service.getRequestCount();
        (service as any).requestCount++;
      }

      await expect(service.distill(candidate)).rejects.toThrow(DistillationQuotaError);
    });

    it('should use fallback extraction on JSON parse error', async () => {
      const candidate = createTestCandidate();
      
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
      
      const candidate = createTestCandidate(text);
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
      expect(result.sourceContentHash).toBe('test-hash-789');
    });

    it('should handle single concept in multi-concept mode', async () => {
      const candidate = createTestCandidate('Simple single concept text');
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
      const candidate = createTestCandidate('Mixed content with shopping and learning');
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
      const candidate = createTestCandidate('Shopping cart and checkout process');
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
      const candidate = createTestCandidate();
      const cachedResult: MultiConceptDistillation = {
        concepts: [
          {
            title: 'Cached Concept',
            summary: 'This is a cached concept summary that meets minimum length requirements.',
            relevanceScore: 0.9
          }
        ],
        sourceContentHash: 'test-hash-789',
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
      const candidate = createTestCandidate('Long text with many concepts');
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
      
      const candidate = createTestCandidate(text);
      
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
      const candidate = createTestCandidate();
      
      mockCreate.mockRejectedValueOnce(new Error('API Error'));

      await expect(service.distillMultiple!(candidate)).rejects.toThrow(DistillationError);
    });

    it('should sanitize titles and summaries in multi-concept results', async () => {
      const candidate = createTestCandidate();
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
      const candidate = createTestCandidate();
      
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
      const candidate = createTestCandidate();
      
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

  describe('Input validation and edge cases', () => {
    it('should throw error for null candidate', async () => {
      await expect(service.distill(null as any)).rejects.toThrow('ConceptCandidate is required');
    });

    it('should throw error for candidate without normalizedText', async () => {
      const invalidCandidate = {
        ...createTestCandidate(),
        normalizedText: undefined
      } as any;
      
      await expect(service.distill(invalidCandidate)).rejects.toThrow('ConceptCandidate must have valid normalizedText');
    });

    it('should throw error for empty text', async () => {
      const candidate = createTestCandidate('   ');
      await expect(service.distill(candidate)).rejects.toThrow('ConceptCandidate normalizedText cannot be empty');
    });

    it('should throw error for text too short', async () => {
      const candidate = createTestCandidate('short');
      await expect(service.distill(candidate)).rejects.toThrow('ConceptCandidate normalizedText is too short');
    });

    it('should throw error for text too long', async () => {
      const longText = 'a'.repeat(50001);
      const candidate = createTestCandidate(longText);
      await expect(service.distill(candidate)).rejects.toThrow('ConceptCandidate normalizedText is too long');
    });

    it('should throw error for malicious SQL content', async () => {
      const candidate = createTestCandidate('DROP TABLE users; SELECT * FROM passwords;');
      await expect(service.distill(candidate)).rejects.toThrow('ConceptCandidate contains potentially malicious content');
    });

    it('should throw error for script tags', async () => {
      const candidate = createTestCandidate('<script>alert("hack")</script>Some learning content here');
      await expect(service.distill(candidate)).rejects.toThrow('ConceptCandidate contains potentially malicious content');
    });

    it('should throw error for javascript protocol', async () => {
      const candidate = createTestCandidate('javascript:alert("hack") Learning content here');
      await expect(service.distill(candidate)).rejects.toThrow('ConceptCandidate contains potentially malicious content');
    });

    it('should throw error for invalid contentHash', async () => {
      const candidate = createTestCandidate();
      candidate.contentHash = null as any;
      await expect(service.distill(candidate)).rejects.toThrow('ConceptCandidate must have valid contentHash');
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle OpenAI authentication error (401)', async () => {
      const candidate = createTestCandidate();
      const authError = new Error('Unauthorized');
      (authError as any).status = 401;
      
      mockCreate.mockRejectedValueOnce(authError);

      await expect(service.distill(candidate)).rejects.toThrow('OpenAI API authentication failed');
    });

    it('should handle OpenAI forbidden error (403)', async () => {
      const candidate = createTestCandidate();
      const forbiddenError = new Error('Forbidden');
      (forbiddenError as any).status = 403;
      
      mockCreate.mockRejectedValueOnce(forbiddenError);

      await expect(service.distill(candidate)).rejects.toThrow('OpenAI API access forbidden');
    });

    it('should handle OpenAI server error (500)', async () => {
      const candidate = createTestCandidate();
      const serverError = new Error('Internal Server Error');
      (serverError as any).status = 500;
      
      mockCreate.mockRejectedValueOnce(serverError);

      await expect(service.distill(candidate)).rejects.toThrow('OpenAI API server error');
    });

    it('should handle quota exceeded error with helpful message', async () => {
      const candidate = createTestCandidate();
      const quotaError = new Error('Quota exceeded');
      (quotaError as any).status = 429;
      (quotaError as any).code = 'insufficient_quota';
      
      mockCreate.mockRejectedValueOnce(quotaError);

      await expect(service.distill(candidate)).rejects.toThrow(
        'OpenAI API quota exceeded. Please check your billing settings'
      );
    });

    it('should handle empty response from OpenAI', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: null
          }
        }]
      });

      await expect(service.distill(candidate)).rejects.toThrow('Empty response from OpenAI');
    });

    it('should handle malformed JSON response', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: '{"invalid": json content}'
          }
        }]
      });

      // Should use fallback extraction
      const result = await service.distill(candidate);
      expect(result.title).toBeTruthy();
      expect(result.summary).toBeTruthy();
    });

    it('should handle Zod validation errors gracefully', async () => {
      const candidate = createTestCandidate();
      
      // Create a response that will pass JSON parsing but fail Zod validation
      const invalidDistilled = {
        title: 'A'.repeat(150), // Too long title (> 100 chars)
        summary: 'Valid summary that meets the minimum length requirement for validation tests.',
        contentHash: candidate.contentHash,
        cached: false,
        distilledAt: new Date()
      };

      // Mock the service's distill method to directly create invalid content that bypasses sanitization
      const serviceSpy = vi.spyOn(service as any, 'sanitizeTitle').mockReturnValueOnce('A'.repeat(150));
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'A'.repeat(150),
              summary: 'Valid summary that meets minimum length requirements'
            })
          }
        }]
      });

      await expect(service.distill(candidate)).rejects.toThrow('Schema validation failed');
      
      serviceSpy.mockRestore();
    });
  });

  describe('Sanitization edge cases', () => {
    it('should sanitize dangerous characters in titles', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              title: '<script>alert("hack")</script>Neural Networks',
              summary: 'Neural networks are computational models that meet the minimum length requirement.'
            })
          }
        }]
      });

      const result = await service.distill(candidate);
      expect(result.title).not.toContain('<script>');
      expect(result.title).toBe('scriptalert(hack)/scriptNeural Networks');
    });

    it('should handle multi-concept with invalid individual concepts', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              concepts: [
                {
                  title: null, // Invalid title
                  summary: null, // Invalid summary
                  relevanceScore: 0.9
                },
                {
                  title: 'Valid Concept',
                  summary: 'This is a valid concept with sufficient detail to meet requirements.',
                  relevanceScore: 0.8
                }
              ]
            })
          }
        }]
      });

      const result = await service.distillMultiple!(candidate);
      expect(result.concepts).toHaveLength(2);
      expect(result.concepts[0].title).toBe('Concept'); // Fallback title
      expect(result.concepts[0].summary).toContain('educational content'); // Fallback summary
    });
  });

  describe('Performance and limits', () => {
    it('should respect token limits for multi-concept requests', async () => {
      const candidate = createTestCandidate();
      
      mockCreate.mockImplementationOnce((params: any) => {
        // Verify token calculation
        expect(params.max_tokens).toBe(200 * 5); // maxTokens * maxConcepts
        
        return Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                concepts: [
                  {
                    title: 'Test Concept',
                    summary: 'This is a test concept with sufficient detail to meet minimum requirements.',
                    relevanceScore: 0.9
                  }
                ]
              })
            }
          }]
        });
      });

      await service.distillMultiple!(candidate);
    });

    it('should handle very large fallback text gracefully', async () => {
      const longText = 'Neural networks. '.repeat(1000) + 'This is educational content about neural networks and machine learning algorithms.';
      const candidate = createTestCandidate(longText);
      
      // Force fallback by making OpenAI fail
      mockCreate.mockRejectedValueOnce(new SyntaxError('JSON parse error'));

      const result = await service.distillMultiple!(candidate);
      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.concepts[0].title).toBeTruthy();
      expect(result.concepts[0].summary.length).toBeLessThanOrEqual(500);
    });
  });
});