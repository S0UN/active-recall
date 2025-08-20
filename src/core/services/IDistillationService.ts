/**
 * IDistillationService - Production-grade educational content enrichment
 * 
 * This service implements the DISTILL step of our pipeline:
 * ConceptCandidate → DISTILL (title + summary) → EMBED → ROUTE
 * 
 * Core Features:
 * - Single and multi-concept extraction from educational content
 * - Advanced Chain-of-Thought prompting with few-shot examples
 * - OCR-aware text processing for real-world content
 * - Extreme specificity enforcement for individual flashcard concepts
 * - Production-grade error handling with fallback mechanisms
 * - Intelligent caching to reduce API costs and improve performance
 * - Comprehensive input validation and sanitization
 * - Swappable implementations for different AI providers
 * 
 * Architecture:
 * - Interface follows dependency inversion principle
 * - Supports hot-swapping between OpenAI and local LLM providers
 * - Provides detailed error classification for proper handling
 * - Includes comprehensive configuration options for fine-tuning
 */

import { ConceptCandidate, DistilledContent, MultiConceptDistillation } from '../contracts/schemas';

/**
 * Core interface for educational content distillation services
 * 
 * Implementations must provide both single and multi-concept extraction
 * capabilities with production-grade reliability and performance.
 */
export interface IDistillationService {
  /**
   * Extract the most specific primary concept from educational content
   * 
   * Focuses on identifying a single, testable concept that is specific enough
   * to generate targeted practice questions. Uses advanced prompting techniques
   * with Chain-of-Thought reasoning and OCR-aware processing.
   * 
   * @param candidate - The concept candidate to distill
   * @returns Promise resolving to enriched content with title and summary
   * @throws DistillationError for validation failures or processing errors
   * @throws DistillationTimeoutError for request timeouts
   * @throws DistillationQuotaError for API quota/rate limit issues
   */
  distill(candidate: ConceptCandidate): Promise<DistilledContent>;

  /**
   * Extract multiple specific concepts from educational content
   * 
   * Identifies individual, testable concepts that are each specific enough
   * to become separate flashcards. Enforces extreme specificity requirements
   * to ensure concepts are suitable for the folder system.
   * 
   * @param candidate - The concept candidate potentially containing multiple concepts
   * @returns Promise resolving to multiple extracted concepts with metadata
   * @throws DistillationError for validation failures or processing errors
   * @throws DistillationTimeoutError for request timeouts  
   * @throws DistillationQuotaError for API quota/rate limit issues
   */
  distillMultiple?(candidate: ConceptCandidate): Promise<MultiConceptDistillation>;

  /**
   * Get the identifier of the distillation provider
   * 
   * @returns Provider identifier for logging, debugging, and audit trails
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
 * Comprehensive configuration for distillation services
 * 
 * Provides fine-grained control over all aspects of the distillation process
 * including model selection, performance tuning, and feature toggles.
 */
export interface DistillationConfig {
  /** AI provider selection */
  provider: 'openai' | 'local' | 'anthropic' | 'google';
  
  /** Authentication */
  apiKey?: string;
  
  /** Model configuration */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  
  /** Performance and reliability */
  cacheEnabled?: boolean;
  requestTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  
  /** Multi-concept extraction */
  multiConceptEnabled?: boolean;
  maxConceptsPerDistillation?: number;
  specificityEnforcement?: boolean;
  
  /** Rate limiting and quota management */
  dailyRequestLimit?: number;
  burstLimit?: number;
  quotaWarningThreshold?: number;
  
  /** Advanced prompting */
  promptVersion?: string;
  chainOfThoughtEnabled?: boolean;
  fewShotExamplesEnabled?: boolean;
  ocrAwarenessEnabled?: boolean;
  
  /** Content filtering */
  educationalContentFilter?: boolean;
  commercialContentFilter?: boolean;
  minContentLength?: number;
  maxContentLength?: number;
  
  /** Fallback behavior */
  fallbackEnabled?: boolean;
  fallbackStrategy?: 'simple' | 'rule-based' | 'local-model';
  
  /** Monitoring and debugging */
  debugMode?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  metricsEnabled?: boolean;
}

/**
 * Comprehensive error hierarchy for distillation operations
 * 
 * Provides detailed error classification for proper error handling
 * and debugging in production environments.
 */

/**
 * Base error class for all distillation-related failures
 */
export class DistillationError extends Error {
  constructor(
    message: string, 
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DistillationError';
    
    // Maintain stack trace for debugging
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DistillationError);
    }
  }

  /**
   * Create error with additional context
   */
  static withContext(message: string, context: Record<string, unknown>, cause?: Error): DistillationError {
    return new DistillationError(message, cause, context);
  }
}

/**
 * Timeout errors for request-level timeouts
 */
export class DistillationTimeoutError extends DistillationError {
  constructor(
    timeout: number,
    public readonly requestType: 'single' | 'multi' = 'single'
  ) {
    super(`Distillation timed out after ${timeout}ms for ${requestType} concept extraction`);
    this.name = 'DistillationTimeoutError';
  }
}

/**
 * Quota and rate limiting errors
 */
export class DistillationQuotaError extends DistillationError {
  constructor(
    message: string,
    public readonly quotaType: 'daily' | 'burst' | 'api' = 'api',
    public readonly remainingQuota?: number
  ) {
    super(message);
    this.name = 'DistillationQuotaError';
  }
}

/**
 * Input validation errors
 */
export class DistillationValidationError extends DistillationError {
  constructor(
    message: string,
    public readonly validationErrors: string[]
  ) {
    super(`Validation failed: ${message}. Errors: ${validationErrors.join(', ')}`);
    this.name = 'DistillationValidationError';
  }
}

/**
 * Content-specific errors (non-educational content, etc.)
 */
export class DistillationContentError extends DistillationError {
  constructor(
    message: string,
    public readonly contentType: 'non-educational' | 'too-short' | 'too-long' | 'malicious'
  ) {
    super(message);
    this.name = 'DistillationContentError';
  }
}

/**
 * Provider-specific errors (API errors, authentication, etc.)
 */
export class DistillationProviderError extends DistillationError {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly providerErrorCode?: string
  ) {
    super(`${provider} error: ${message}`);
    this.name = 'DistillationProviderError';
  }
}