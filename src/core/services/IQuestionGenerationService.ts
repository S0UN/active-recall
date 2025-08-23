/**
 * IQuestionGenerationService - LLM-powered educational question generation
 * 
 * This service generates targeted review questions from educational concepts
 * for use in the spaced repetition system. It integrates seamlessly with
 * the existing DISTILL → EMBED → ROUTE pipeline by generating questions
 * from distilled concepts that can be scheduled and reviewed.
 * 
 * Core Features:
 * - Multiple question types (multiple choice, short answer, true/false, flashcard)
 * - Difficulty-aware question generation based on spaced repetition data
 * - Context-preserving question generation for coherent learning
 * - Production-grade error handling with fallback mechanisms
 * - Integration with spaced repetition scheduling system
 * - Swappable implementations for different AI providers
 * - Comprehensive caching to reduce API costs
 * 
 * Architecture:
 * - Interface follows dependency inversion principle
 * - Supports hot-swapping between OpenAI and other LLM providers
 * - Provides detailed error classification for proper handling
 * - Integrates with ReviewSchedule for adaptive difficulty
 * - Supports batch question generation for efficiency
 */

import { 
  DistilledContent,
  QuestionType,
  QuestionDifficulty,
  GeneratedQuestion,
  QuestionGenerationRequest,
  QuestionGenerationResult,
  QuestionResponse,
  QuestionReviewSession
} from '../contracts/schemas';

/**
 * Extended configuration for question generation requests
 * Builds on the schema-validated QuestionGenerationRequest
 */
export interface QuestionGenerationServiceRequest extends Omit<QuestionGenerationRequest, 'conceptId' | 'conceptTitle' | 'conceptSummary'> {
  /** Source concept to generate questions from */
  concept: DistilledContent;
}

/**
 * Core interface for question generation services
 * 
 * Implementations must provide reliable question generation capabilities
 * that integrate with the spaced repetition system for optimal learning.
 */
export interface IQuestionGenerationService {
  /**
   * Generate questions from a distilled concept
   * 
   * Creates targeted questions based on the concept content and current
   * spaced repetition performance data to provide optimal learning challenge.
   * 
   * @param request - Question generation configuration
   * @returns Promise resolving to generated questions with metadata
   * @throws QuestionGenerationError for validation failures or processing errors
   * @throws QuestionGenerationTimeoutError for request timeouts
   * @throws QuestionGenerationQuotaError for API quota/rate limit issues
   */
  generateQuestions(request: QuestionGenerationServiceRequest): Promise<QuestionGenerationResult>;

  /**
   * Generate questions for multiple concepts efficiently
   * 
   * Optimized batch processing for generating questions across multiple
   * concepts in a single API call to reduce latency and costs.
   * 
   * @param requests - Array of question generation requests
   * @returns Promise resolving to array of generation results
   */
  generateQuestionsForConcepts(requests: QuestionGenerationServiceRequest[]): Promise<QuestionGenerationResult[]>;

  /**
   * Validate question quality and educational value
   * 
   * Checks generated questions for educational appropriateness,
   * clarity, and alignment with learning objectives.
   * 
   * @param question - Question to validate
   * @returns Validation result with quality score and feedback
   */
  validateQuestion(question: GeneratedQuestion): Promise<{
    isValid: boolean;
    qualityScore: number;
    feedback: string[];
    suggestions?: string[];
  }>;

  /**
   * Get question difficulty recommendation based on spaced repetition data
   * 
   * Analyzes current performance to recommend optimal question difficulty
   * for the next review session.
   * 
   * @param performanceData - Current spaced repetition performance
   * @returns Recommended difficulty level and rationale
   */
  getRecommendedDifficulty(performanceData: {
    easeFactor: number;
    repetitions: number;
    successRate: number;
    avgResponseTime?: number;
  }): QuestionDifficulty;

  /**
   * Get the identifier of the question generation provider
   * 
   * @returns Provider identifier for logging and debugging
   */
  getProvider(): string;

  /**
   * Get current request usage statistics
   * 
   * @returns Current request count for quota management
   */
  getRequestCount?(): number;

  /**
   * Reset daily usage counters
   * 
   * Should be called at the start of each day for quota management
   */
  resetDailyCounter?(): void;
}

/**
 * Configuration for question generation services
 */
export interface QuestionGenerationConfig {
  /** AI provider selection */
  provider: 'openai' | 'anthropic' | 'google' | 'local';
  
  /** Authentication */
  apiKey?: string;
  
  /** Model configuration */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  
  /** Question generation preferences */
  defaultQuestionTypes?: QuestionType[];
  defaultDifficulty?: QuestionDifficulty;
  questionsPerConcept?: number;
  
  /** Quality control */
  qualityThreshold?: number;
  enableValidation?: boolean;
  regenerateOnLowQuality?: boolean;
  
  /** Performance settings */
  cacheEnabled?: boolean;
  requestTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  
  /** Rate limiting */
  dailyRequestLimit?: number;
  burstLimit?: number;
  
  /** Integration settings */
  spacedRepetitionIntegration?: boolean;
  adaptiveDifficulty?: boolean;
  contextPreservation?: boolean;
  
  /** Advanced features */
  batchProcessing?: boolean;
  questionPooling?: boolean;
  duplicateDetection?: boolean;
  
  /** Monitoring */
  debugMode?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  metricsEnabled?: boolean;
}

/**
 * Error classes for question generation operations
 */
export class QuestionGenerationError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'QuestionGenerationError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QuestionGenerationError);
    }
  }

  static withContext(message: string, context: Record<string, unknown>, cause?: Error): QuestionGenerationError {
    return new QuestionGenerationError(message, cause, context);
  }
}

export class QuestionGenerationTimeoutError extends QuestionGenerationError {
  constructor(timeout: number) {
    super(`Question generation timed out after ${timeout}ms`);
    this.name = 'QuestionGenerationTimeoutError';
  }
}

export class QuestionGenerationQuotaError extends QuestionGenerationError {
  constructor(
    message: string,
    public readonly quotaType: 'daily' | 'burst' | 'api' = 'api',
    public readonly remainingQuota?: number
  ) {
    super(message);
    this.name = 'QuestionGenerationQuotaError';
  }
}

export class QuestionGenerationValidationError extends QuestionGenerationError {
  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(`Validation failed: ${message}. Errors: ${validationErrors.join(', ')}`);
    this.name = 'QuestionGenerationValidationError';
  }
}

export class QuestionGenerationProviderError extends QuestionGenerationError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly providerErrorCode?: string
  ) {
    super(`${provider} error: ${message}`);
    this.name = 'QuestionGenerationProviderError';
  }
}