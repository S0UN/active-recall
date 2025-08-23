/**
 * Tests for OpenAI Question Generation Service
 * 
 * These tests verify that the question generation service works correctly
 * with proper error handling, caching, and educational quality standards.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIQuestionGenerationService } from './OpenAIQuestionGenerationService';
import { 
  QuestionGenerationServiceRequest,
  QuestionGenerationConfig,
  QuestionGenerationError,
  QuestionGenerationValidationError,
  QuestionGenerationTimeoutError,
  QuestionGenerationQuotaError
} from '../IQuestionGenerationService';
import { IContentCache } from '../IContentCache';
import { DistilledContent } from '../../contracts/schemas';

// Mock the OpenAI client
const mockOpenAIInstance = {
  chat: {
    completions: {
      create: vi.fn()
    }
  }
};

vi.mock('openai', () => ({
  default: vi.fn(() => mockOpenAIInstance)
}));

// Mock cache implementation
class MockContentCache implements IContentCache {
  private cache = new Map<string, any>();

  async get(key: string): Promise<any | null> {
    return this.cache.get(key) || null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    this.cache.set(key, value);
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async getStats() {
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: this.cache.size
    };
  }
}

describe('OpenAIQuestionGenerationService', () => {
  let service: OpenAIQuestionGenerationService;
  let mockCache: MockContentCache;
  let config: QuestionGenerationConfig;
  let mockOpenAI: any;

  beforeEach(() => {
    mockCache = new MockContentCache();
    config = {
      provider: 'openai',
      apiKey: 'test-api-key',
      model: 'gpt-3.5-turbo',
      maxTokens: 800,
      temperature: 0.3,
      defaultQuestionTypes: ['flashcard', 'multiple_choice'],
      defaultDifficulty: 'intermediate',
      questionsPerConcept: 5,
      qualityThreshold: 0.7,
      enableValidation: true,
      regenerateOnLowQuality: false,
      cacheEnabled: true,
      requestTimeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      dailyRequestLimit: 1000,
      burstLimit: 10,
      spacedRepetitionIntegration: true,
      adaptiveDifficulty: true,
      contextPreservation: true,
      batchProcessing: false,
      questionPooling: false,
      duplicateDetection: true,
      debugMode: false,
      logLevel: 'info',
      metricsEnabled: true,
    };

    // Reset mocks
    mockOpenAI = mockOpenAIInstance;
    vi.clearAllMocks();

    service = new OpenAIQuestionGenerationService(config, mockCache);
  });

  describe('initialization', () => {
    it('should require an API key', () => {
      const invalidConfig = { ...config, apiKey: undefined };
      expect(() => new OpenAIQuestionGenerationService(invalidConfig as any, mockCache))
        .toThrow('OpenAI API key is required');
    });

    it('should initialize with valid configuration', () => {
      expect(service.getProvider()).toBe('openai');
      expect(service.getRequestCount()).toBe(0);
    });
  });

  describe('input validation', () => {
    const validConcept: DistilledContent = {
      title: 'Binary Search Algorithm',
      summary: 'A search algorithm that finds the position of a target value within a sorted array by repeatedly dividing the search interval in half.',
      contentHash: 'abc123',
      cached: false,
      distilledAt: new Date()
    };

    it('should validate required concept data', async () => {
      const invalidRequest = {
        concept: null as any,
        count: 5
      };

      await expect(service.generateQuestions(invalidRequest))
        .rejects.toThrow(QuestionGenerationValidationError);
    });

    it('should validate concept title', async () => {
      const invalidRequest: QuestionGenerationServiceRequest = {
        concept: {
          ...validConcept,
          title: 'hi' // Too short
        },
        count: 5
      };

      await expect(service.generateQuestions(invalidRequest))
        .rejects.toThrow(QuestionGenerationValidationError);
    });

    it('should validate concept summary length', async () => {
      const invalidRequest: QuestionGenerationServiceRequest = {
        concept: {
          ...validConcept,
          summary: 'Too short' // Less than 20 characters
        },
        count: 5
      };

      await expect(service.generateQuestions(invalidRequest))
        .rejects.toThrow(QuestionGenerationValidationError);
    });

    it('should validate question count range', async () => {
      const invalidRequest: QuestionGenerationServiceRequest = {
        concept: validConcept,
        count: 25 // Too many
      };

      await expect(service.generateQuestions(invalidRequest))
        .rejects.toThrow(QuestionGenerationValidationError);
    });

    it('should reject suspicious content', async () => {
      const maliciousRequest: QuestionGenerationServiceRequest = {
        concept: {
          ...validConcept,
          summary: 'This contains <script>alert("xss")</script> malicious content'
        },
        count: 5
      };

      await expect(service.generateQuestions(maliciousRequest))
        .rejects.toThrow(QuestionGenerationValidationError);
    });
  });

  describe('question generation', () => {
    const validRequest: QuestionGenerationServiceRequest = {
      concept: {
        title: 'Binary Search Algorithm',
        summary: 'A search algorithm that finds the position of a target value within a sorted array by repeatedly dividing the search interval in half.',
        contentHash: 'abc123',
        cached: false,
        distilledAt: new Date()
      },
      count: 3,
      questionTypes: ['flashcard', 'multiple_choice'],
      targetDifficulty: 'intermediate'
    };

    it('should generate questions successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [
                {
                  type: 'flashcard',
                  difficulty: 'intermediate',
                  question: 'What is the time complexity of binary search?',
                  correctAnswer: 'O(log n)',
                  explanation: 'Binary search divides the search space in half with each iteration.',
                  conceptArea: 'Binary Search Algorithm',
                  confidence: 0.9
                },
                {
                  type: 'multiple_choice',
                  difficulty: 'intermediate',
                  question: 'Which requirement must be met for binary search to work?',
                  correctAnswer: 'The array must be sorted',
                  distractors: ['The array must be large', 'The array must contain numbers only', 'The array must have even length'],
                  explanation: 'Binary search relies on the sorted property to eliminate half the search space.',
                  conceptArea: 'Binary Search Algorithm',
                  confidence: 0.85
                }
              ],
              metadata: {
                totalGenerated: 2,
                averageConfidence: 0.875
              }
            })
          }
        }],
        usage: {
          total_tokens: 150
        }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await service.generateQuestions(validRequest);

      expect(result.questions).toHaveLength(2);
      expect(result.generatedCount).toBe(2);
      expect(result.requestedCount).toBe(3);
      expect(result.metadata.cached).toBe(false);
      expect(result.metadata.tokensUsed).toBe(150);
      
      // Verify question structure
      const flashcard = result.questions.find(q => q.type === 'flashcard');
      expect(flashcard).toBeDefined();
      expect(flashcard?.question).toContain('time complexity');
      expect(flashcard?.correctAnswer).toBe('O(log n)');
      expect(flashcard?.id).toBeDefined();
      expect(flashcard?.sourceContentHash).toBe('abc123');

      const multipleChoice = result.questions.find(q => q.type === 'multiple_choice');
      expect(multipleChoice).toBeDefined();
      expect(multipleChoice?.distractors).toHaveLength(3);
    });

    it('should use cached results when available', async () => {
      // Pre-populate cache
      const cachedResult = {
        questions: [{
          id: 'cached-q1',
          type: 'flashcard',
          difficulty: 'intermediate',
          question: 'Cached question',
          correctAnswer: 'Cached answer',
          conceptArea: 'Test',
          sourceContentHash: 'abc123'
        }],
        requestedCount: 3,
        generatedCount: 1,
        metadata: {
          processingTimeMs: 100,
          tokensUsed: 50,
          model: 'gpt-3.5-turbo',
          promptVersion: 'v1.0',
          cached: false
        }
      };

      // Mock cache to return the cached result
      vi.spyOn(mockCache, 'get').mockResolvedValue(cachedResult);

      const result = await service.generateQuestions(validRequest);

      expect(result.metadata.cached).toBe(true);
      expect(result.questions[0].question).toBe('Cached question');
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should handle spaced repetition performance context', async () => {
      const requestWithContext: QuestionGenerationServiceRequest = {
        ...validRequest,
        performanceContext: {
          easeFactor: 1.5, // Low ease factor
          repetitions: 8,
          lastResponseQuality: 0, // Forgot
          averageResponseTime: 45000
        }
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [{
                type: 'flashcard',
                difficulty: 'review', // Should adapt difficulty
                question: 'Review question for struggling student',
                correctAnswer: 'Answer',
                explanation: 'Explanation',
                conceptArea: 'Binary Search Algorithm',
                confidence: 0.8
              }],
              metadata: { totalGenerated: 1, averageConfidence: 0.8 }
            })
          }
        }],
        usage: { total_tokens: 100 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await service.generateQuestions(requestWithContext);
      
      expect(result.questions[0].difficulty).toBe('review');
      
      // Verify that the prompt included performance context
      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(callArgs.messages[1].content).toContain('struggling');
    });
  });

  describe('error handling', () => {
    const validRequest: QuestionGenerationServiceRequest = {
      concept: {
        title: 'Test Concept',
        summary: 'A test concept for error handling verification purposes.',
        contentHash: 'test123',
        cached: false,
        distilledAt: new Date()
      }
    };

    it('should handle API quota errors', async () => {
      const quotaError = new Error('Rate limit exceeded');
      (quotaError as any).status = 429;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(quotaError);

      await expect(service.generateQuestions(validRequest))
        .rejects.toThrow(QuestionGenerationQuotaError);
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Invalid API key');
      (authError as any).status = 401;
      
      mockOpenAI.chat.completions.create.mockRejectedValue(authError);

      await expect(service.generateQuestions(validRequest))
        .rejects.toThrow('Invalid OpenAI API key');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'ECONNABORTED';
      
      mockOpenAI.chat.completions.create.mockRejectedValue(timeoutError);

      await expect(service.generateQuestions(validRequest))
        .rejects.toThrow(QuestionGenerationTimeoutError);
    });

    it('should handle invalid JSON responses', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: 'Invalid JSON content'
          }
        }],
        usage: { total_tokens: 10 }
      });

      await expect(service.generateQuestions(validRequest))
        .rejects.toThrow(QuestionGenerationError);
    });

    it('should handle empty responses', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: ''
          }
        }],
        usage: { total_tokens: 0 }
      });

      await expect(service.generateQuestions(validRequest))
        .rejects.toThrow('Empty response from OpenAI');
    });

    it('should respect daily limits', async () => {
      // Test that service throws quota error when daily limit is reached
      const limitedConfig = { ...config, dailyRequestLimit: 1, cacheEnabled: false };
      const limitedService = new OpenAIQuestionGenerationService(limitedConfig, mockCache);

      // Mock successful response for first request
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [{
                type: 'flashcard',
                difficulty: 'intermediate',
                question: 'Test question',
                correctAnswer: 'Test answer',
                explanation: 'Test explanation',
                conceptArea: 'Test',
                confidence: 0.8
              }],
              metadata: { totalGenerated: 1, averageConfidence: 0.8 }
            })
          }
        }],
        usage: { total_tokens: 50 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      // First request should succeed
      await limitedService.generateQuestions(validRequest);

      // Second request should fail with quota error
      await expect(limitedService.generateQuestions(validRequest))
        .rejects.toThrow(QuestionGenerationQuotaError);
    });
  });

  describe('question validation', () => {
    it('should validate question quality', async () => {
      const goodQuestion = {
        id: 'test-q1',
        type: 'flashcard' as const,
        difficulty: 'intermediate' as const,
        question: 'What is the primary advantage of using binary search over linear search?',
        correctAnswer: 'Binary search has O(log n) time complexity compared to O(n) for linear search',
        explanation: 'Binary search eliminates half the search space with each comparison, making it much more efficient for large sorted arrays.',
        conceptArea: 'Binary Search Algorithm',
        sourceContentHash: 'abc123',
        confidence: 0.9
      };

      const validation = await service.validateQuestion(goodQuestion);
      
      expect(validation.isValid).toBe(true);
      expect(validation.qualityScore).toBeGreaterThan(0.7);
      expect(validation.feedback).toHaveLength(0);
    });

    it('should detect poor quality questions', async () => {
      const poorQuestion = {
        id: 'test-q2',
        type: 'flashcard' as const,
        difficulty: 'intermediate' as const,
        question: 'What?', // Too short
        correctAnswer: 'Yes',
        explanation: 'Because', // Too brief
        conceptArea: 'Test',
        sourceContentHash: 'abc123'
      };

      const validation = await service.validateQuestion(poorQuestion);
      
      expect(validation.isValid).toBe(false);
      expect(validation.qualityScore).toBeLessThan(0.7);
      expect(validation.feedback.length).toBeGreaterThan(0);
    });

    it('should detect inappropriate content', async () => {
      const inappropriateQuestion = {
        id: 'test-q3',
        type: 'flashcard' as const,
        difficulty: 'intermediate' as const,
        question: 'What should you buy from our store today?', // Commercial content
        correctAnswer: 'Nothing educational',
        explanation: 'This is not educational content',
        conceptArea: 'Test',
        sourceContentHash: 'abc123'
      };

      const validation = await service.validateQuestion(inappropriateQuestion);
      
      expect(validation.isValid).toBe(false);
      expect(validation.feedback.some(f => f.includes('inappropriate'))).toBe(true);
    });
  });

  describe('difficulty recommendation', () => {
    it('should recommend beginner for new concepts', () => {
      const difficulty = service.getRecommendedDifficulty({
        easeFactor: 2.5,
        repetitions: 1, // Low repetitions
        successRate: 0.8
      });

      expect(difficulty).toBe('beginner');
    });

    it('should recommend advanced for high performers', () => {
      const difficulty = service.getRecommendedDifficulty({
        easeFactor: 2.8, // High ease factor
        repetitions: 10, // Many repetitions
        successRate: 0.95 // High success rate
      });

      expect(difficulty).toBe('advanced');
    });

    it('should recommend review for struggling students', () => {
      const difficulty = service.getRecommendedDifficulty({
        easeFactor: 1.4, // Low ease factor
        repetitions: 5,
        successRate: 0.4 // Low success rate
      });

      expect(difficulty).toBe('review');
    });

    it('should recommend intermediate for balanced performance', () => {
      const difficulty = service.getRecommendedDifficulty({
        easeFactor: 2.2,
        repetitions: 5,
        successRate: 0.75
      });

      expect(difficulty).toBe('intermediate');
    });
  });

  describe('batch processing', () => {
    it('should process multiple requests when batch processing is disabled', async () => {
      const requests = [
        {
          concept: {
            title: 'Concept 1',
            summary: 'First concept for batch processing testing purposes.',
            contentHash: 'hash1',
            cached: false,
            distilledAt: new Date()
          }
        },
        {
          concept: {
            title: 'Concept 2',
            summary: 'Second concept for batch processing testing purposes.',
            contentHash: 'hash2',
            cached: false,
            distilledAt: new Date()
          }
        }
      ];

      // Mock successful responses for both requests
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [{
                type: 'flashcard',
                difficulty: 'intermediate',
                question: 'Test question',
                correctAnswer: 'Test answer',
                explanation: 'Test explanation',
                conceptArea: 'Test',
                confidence: 0.8
              }],
              metadata: { totalGenerated: 1, averageConfidence: 0.8 }
            })
          }
        }],
        usage: { total_tokens: 50 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const results = await service.generateQuestionsForConcepts(requests);

      expect(results).toHaveLength(2);
      expect(results[0].questions).toHaveLength(1);
      expect(results[1].questions).toHaveLength(1);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('usage tracking', () => {
    it('should track request count', async () => {
      expect(service.getRequestCount()).toBe(0);

      const validRequest: QuestionGenerationServiceRequest = {
        concept: {
          title: 'Test Concept',
          summary: 'A test concept for usage tracking verification purposes.',
          contentHash: 'test123',
          cached: false,
          distilledAt: new Date()
        }
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              questions: [{
                type: 'flashcard',
                difficulty: 'intermediate',
                question: 'Test question',
                correctAnswer: 'Test answer',
                explanation: 'Test explanation',
                conceptArea: 'Test',
                confidence: 0.8
              }],
              metadata: { totalGenerated: 1, averageConfidence: 0.8 }
            })
          }
        }],
        usage: { total_tokens: 50 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      await service.generateQuestions(validRequest);

      expect(service.getRequestCount()).toBe(1);
    });

    it('should reset usage counter', () => {
      service.resetDailyCounter();
      expect(service.getRequestCount()).toBe(0);
    });
  });
});