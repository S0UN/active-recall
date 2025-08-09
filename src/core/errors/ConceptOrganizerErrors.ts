/**
 * Custom error types for the Concept Organizer system.
 * 
 * This file defines:
 * - Hierarchical error classification
 * - Domain-specific error types with context
 * - Error recovery strategies
 * - Structured error reporting
 * 
 * Design principles:
 * - Fail fast with clear messages
 * - Preserve error context for debugging
 * - Enable graceful degradation
 * - Support retry logic where appropriate
 */

/**
 * Base error class with structured context
 * All domain errors extend this class
 */
export abstract class ConceptOrganizerError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  abstract readonly recoverable: boolean;
  
  public readonly timestamp: Date;
  public readonly context: Record<string, unknown>;
  
  constructor(
    message: string, 
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;
    
    // Preserve original error chain
    if (cause) {
      this.cause = cause;
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
    
    // Ensure proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
  
  /**
   * Serialize error for logging and audit
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      recoverable: this.recoverable,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Error categories for classification and handling
 */
export enum ErrorCategory {
  VALIDATION = 'validation',        // Input validation failures
  BUSINESS_LOGIC = 'business_logic', // Domain rule violations  
  INFRASTRUCTURE = 'infrastructure', // External service failures
  CONFIGURATION = 'configuration',  // Setup/config issues
  CONCURRENCY = 'concurrency',      // Race conditions, locks
  RESOURCE = 'resource',            // Memory, disk, limits
  SECURITY = 'security',            // Auth, permissions, validation
  NETWORK = 'network',              // API calls, connectivity
}

// =============================================================================
// VALIDATION ERRORS
// =============================================================================

/**
 * Schema validation failed
 * Input data doesn't match expected format
 */
export class ValidationError extends ConceptOrganizerError {
  readonly code = 'VALIDATION_FAILED';
  readonly category = ErrorCategory.VALIDATION;
  readonly recoverable = false; // Bad input requires fixing
  
  constructor(
    schema: string,
    validationErrors: unknown[],
    input: unknown,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Schema validation failed for ${schema}`,
      { 
        schema, 
        validationErrors, 
        input,
        ...context 
      }
    );
  }
}

/**
 * Required field is missing or invalid
 */
export class InvalidInputError extends ConceptOrganizerError {
  readonly code = 'INVALID_INPUT';
  readonly category = ErrorCategory.VALIDATION;
  readonly recoverable = false;
  
  constructor(
    field: string,
    value: unknown,
    expectedType: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Invalid input for field '${field}': expected ${expectedType}`,
      { field, value, expectedType, ...context }
    );
  }
}

// =============================================================================
// BUSINESS LOGIC ERRORS
// =============================================================================

/**
 * Duplicate artifact detected
 * Existing content prevents creation
 */
export class DuplicateArtifactError extends ConceptOrganizerError {
  readonly code = 'DUPLICATE_ARTIFACT';
  readonly category = ErrorCategory.BUSINESS_LOGIC;
  readonly recoverable = true; // Can link or skip
  
  constructor(
    candidateId: string,
    existingArtifactId: string,
    duplicateType: 'exact' | 'semantic',
    context: Record<string, unknown> = {}
  ) {
    super(
      `Duplicate artifact detected: ${duplicateType} match with ${existingArtifactId}`,
      { candidateId, existingArtifactId, duplicateType, ...context }
    );
  }
}

/**
 * Routing confidence too low for automatic placement
 * Requires human review or fallback to Unsorted
 */
export class LowConfidenceRoutingError extends ConceptOrganizerError {
  readonly code = 'LOW_CONFIDENCE_ROUTING';
  readonly category = ErrorCategory.BUSINESS_LOGIC;
  readonly recoverable = true; // Can route to Unsorted
  
  constructor(
    candidateId: string,
    maxConfidence: number,
    threshold: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Routing confidence ${maxConfidence} below threshold ${threshold}`,
      { candidateId, maxConfidence, threshold, ...context }
    );
  }
}

/**
 * Folder depth limit exceeded
 * Cannot create deeper hierarchy
 */
export class MaxDepthExceededError extends ConceptOrganizerError {
  readonly code = 'MAX_DEPTH_EXCEEDED';
  readonly category = ErrorCategory.BUSINESS_LOGIC;
  readonly recoverable = true; // Can place in parent folder
  
  constructor(
    requestedPath: string,
    requestedDepth: number,
    maxDepth: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Path depth ${requestedDepth} exceeds maximum ${maxDepth}`,
      { requestedPath, requestedDepth, maxDepth, ...context }
    );
  }
}

/**
 * Concept text too short or low quality
 * Cannot process meaningfully
 */
export class InsufficientContentError extends ConceptOrganizerError {
  readonly code = 'INSUFFICIENT_CONTENT';
  readonly category = ErrorCategory.BUSINESS_LOGIC;
  readonly recoverable = false; // Content needs improvement
  
  constructor(
    contentLength: number,
    minimumLength: number,
    quality: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Content too short (${contentLength} < ${minimumLength}) or low quality (${quality})`,
      { contentLength, minimumLength, quality, ...context }
    );
  }
}

// =============================================================================
// INFRASTRUCTURE ERRORS  
// =============================================================================

/**
 * Vector database operation failed
 * Indexing, search, or storage issue
 */
export class VectorStoreError extends ConceptOrganizerError {
  readonly code = 'VECTOR_STORE_ERROR';
  readonly category = ErrorCategory.INFRASTRUCTURE;
  readonly recoverable = true; // Can retry
  
  constructor(
    operation: string,
    reason: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Vector store operation '${operation}' failed: ${reason}`,
      { operation, reason, ...context },
      cause
    );
  }
}

/**
 * Embedding generation failed
 * Model or service unavailable
 */
export class EmbeddingGenerationError extends ConceptOrganizerError {
  readonly code = 'EMBEDDING_GENERATION_ERROR';
  readonly category = ErrorCategory.INFRASTRUCTURE;
  readonly recoverable = true; // Can retry or use fallback
  
  constructor(
    text: string,
    modelName: string,
    reason: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Embedding generation failed for model '${modelName}': ${reason}`,
      { textLength: text.length, modelName, reason, ...context },
      cause
    );
  }
}

/**
 * LLM service call failed
 * API error or response parsing issue
 */
export class LLMServiceError extends ConceptOrganizerError {
  readonly code = 'LLM_SERVICE_ERROR';
  readonly category = ErrorCategory.INFRASTRUCTURE;
  readonly recoverable = true; // Can retry or skip
  
  constructor(
    operation: string,
    provider: string,
    reason: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `LLM service '${operation}' failed for provider '${provider}': ${reason}`,
      { operation, provider, reason, ...context },
      cause
    );
  }
}

/**
 * File system operation failed
 * Storage, permissions, or disk space
 */
export class FileSystemError extends ConceptOrganizerError {
  readonly code = 'FILE_SYSTEM_ERROR';
  readonly category = ErrorCategory.INFRASTRUCTURE;
  readonly recoverable = true; // May be temporary
  
  constructor(
    operation: string,
    path: string,
    reason: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `File system operation '${operation}' failed for path '${path}': ${reason}`,
      { operation, path, reason, ...context },
      cause
    );
  }
}

/**
 * Database operation failed
 * SQLite or connection issue
 */
export class DatabaseError extends ConceptOrganizerError {
  readonly code = 'DATABASE_ERROR';
  readonly category = ErrorCategory.INFRASTRUCTURE;
  readonly recoverable = true; // Can retry
  
  constructor(
    operation: string,
    table: string,
    reason: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Database operation '${operation}' failed for table '${table}': ${reason}`,
      { operation, table, reason, ...context },
      cause
    );
  }
}

// =============================================================================
// CONFIGURATION ERRORS
// =============================================================================

/**
 * Configuration value missing or invalid
 * Setup problem preventing operation
 */
export class ConfigurationError extends ConceptOrganizerError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly category = ErrorCategory.CONFIGURATION;
  readonly recoverable = false; // Requires config fix
  
  constructor(
    configKey: string,
    value: unknown,
    reason: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Configuration error for '${configKey}': ${reason}`,
      { configKey, value, reason, ...context }
    );
  }
}

/**
 * Required dependency not available
 * Service or resource missing
 */
export class DependencyError extends ConceptOrganizerError {
  readonly code = 'DEPENDENCY_ERROR';
  readonly category = ErrorCategory.CONFIGURATION;
  readonly recoverable = false; // Requires setup
  
  constructor(
    dependency: string,
    reason: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Required dependency '${dependency}' unavailable: ${reason}`,
      { dependency, reason, ...context }
    );
  }
}

// =============================================================================
// RESOURCE ERRORS
// =============================================================================

/**
 * Token budget exceeded
 * LLM usage cap reached
 */
export class TokenBudgetExceededError extends ConceptOrganizerError {
  readonly code = 'TOKEN_BUDGET_EXCEEDED';
  readonly category = ErrorCategory.RESOURCE;
  readonly recoverable = true; // Can fallback to Unsorted
  
  constructor(
    operation: string,
    requestedTokens: number,
    availableTokens: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Token budget exceeded for '${operation}': requested ${requestedTokens}, available ${availableTokens}`,
      { operation, requestedTokens, availableTokens, ...context }
    );
  }
}

/**
 * Rate limit hit
 * Too many requests to external service
 */
export class RateLimitError extends ConceptOrganizerError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly category = ErrorCategory.RESOURCE;
  readonly recoverable = true; // Can retry after delay
  
  constructor(
    service: string,
    retryAfter: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Rate limit exceeded for service '${service}', retry after ${retryAfter}s`,
      { service, retryAfter, ...context }
    );
  }
}

/**
 * Storage quota exceeded
 * Disk space or file count limit
 */
export class StorageQuotaError extends ConceptOrganizerError {
  readonly code = 'STORAGE_QUOTA_EXCEEDED';
  readonly category = ErrorCategory.RESOURCE;
  readonly recoverable = false; // Requires cleanup
  
  constructor(
    quotaType: 'disk' | 'files' | 'artifacts',
    used: number,
    limit: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Storage quota exceeded for ${quotaType}: ${used}/${limit}`,
      { quotaType, used, limit, ...context }
    );
  }
}

// =============================================================================
// CONCURRENCY ERRORS
// =============================================================================

/**
 * Concurrent modification detected
 * Optimistic locking failure
 */
export class ConcurrentModificationError extends ConceptOrganizerError {
  readonly code = 'CONCURRENT_MODIFICATION';
  readonly category = ErrorCategory.CONCURRENCY;
  readonly recoverable = true; // Can reload and retry
  
  constructor(
    entityId: string,
    entityType: string,
    expectedVersion: string,
    actualVersion: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Concurrent modification of ${entityType} ${entityId}: expected version ${expectedVersion}, got ${actualVersion}`,
      { entityId, entityType, expectedVersion, actualVersion, ...context }
    );
  }
}

/**
 * Resource locked by another operation
 * Cannot acquire required lock
 */
export class ResourceLockedError extends ConceptOrganizerError {
  readonly code = 'RESOURCE_LOCKED';
  readonly category = ErrorCategory.CONCURRENCY;
  readonly recoverable = true; // Can retry
  
  constructor(
    resourceId: string,
    resourceType: string,
    lockHolder: string,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Resource ${resourceType} ${resourceId} locked by ${lockHolder}`,
      { resourceId, resourceType, lockHolder, ...context }
    );
  }
}

// =============================================================================
// NETWORK ERRORS
// =============================================================================

/**
 * External service unavailable
 * Network connectivity or service down
 */
export class ServiceUnavailableError extends ConceptOrganizerError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly category = ErrorCategory.NETWORK;
  readonly recoverable = true; // Can retry
  
  constructor(
    service: string,
    endpoint: string,
    reason: string,
    context: Record<string, unknown> = {},
    cause?: Error
  ) {
    super(
      `Service '${service}' unavailable at '${endpoint}': ${reason}`,
      { service, endpoint, reason, ...context },
      cause
    );
  }
}

/**
 * Request timeout
 * Operation took too long
 */
export class TimeoutError extends ConceptOrganizerError {
  readonly code = 'REQUEST_TIMEOUT';
  readonly category = ErrorCategory.NETWORK;
  readonly recoverable = true; // Can retry with longer timeout
  
  constructor(
    operation: string,
    timeoutMs: number,
    context: Record<string, unknown> = {}
  ) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      { operation, timeoutMs, ...context }
    );
  }
}

// =============================================================================
// ERROR FACTORY & UTILITIES
// =============================================================================

/**
 * Factory for creating appropriate error types
 * Analyzes error conditions and returns typed errors
 */
export class ErrorFactory {
  static fromZodError(error: unknown, schema: string, input: unknown): ValidationError {
    // TODO: Parse Zod validation results
    return new ValidationError(schema, [error], input);
  }
  
  static fromHttpError(
    error: unknown, 
    service: string, 
    endpoint: string
  ): ServiceUnavailableError | TimeoutError {
    // TODO: Analyze HTTP status codes and create appropriate errors
    if (this.isTimeoutError(error)) {
      return new TimeoutError('http_request', 5000, { service, endpoint });
    }
    
    return new ServiceUnavailableError(
      service, 
      endpoint, 
      'HTTP error',
      {},
      error instanceof Error ? error : undefined
    );
  }
  
  private static isTimeoutError(error: unknown): boolean {
    // TODO: Implement timeout detection logic
    return false;
  }
}

/**
 * Error aggregator for batch operations
 * Collects and categorizes multiple errors
 */
export class ErrorAggregator {
  private errors: ConceptOrganizerError[] = [];
  
  add(error: ConceptOrganizerError): void {
    this.errors.push(error);
  }
  
  hasErrors(): boolean {
    return this.errors.length > 0;
  }
  
  getRecoverableErrors(): ConceptOrganizerError[] {
    return this.errors.filter(e => e.recoverable);
  }
  
  getFatalErrors(): ConceptOrganizerError[] {
    return this.errors.filter(e => !e.recoverable);
  }
  
  getErrorsByCategory(category: ErrorCategory): ConceptOrganizerError[] {
    return this.errors.filter(e => e.category === category);
  }
  
  summarize(): ErrorSummary {
    const byCategory = Object.values(ErrorCategory).reduce(
      (acc, category) => ({
        ...acc,
        [category]: this.getErrorsByCategory(category).length
      }),
      {} as Record<ErrorCategory, number>
    );
    
    return {
      total: this.errors.length,
      recoverable: this.getRecoverableErrors().length,
      fatal: this.getFatalErrors().length,
      byCategory,
      firstError: this.errors[0]?.toJSON(),
    };
  }
  
  clear(): void {
    this.errors = [];
  }
}

/**
 * Error summary for reporting and metrics
 */
export interface ErrorSummary {
  total: number;
  recoverable: number;
  fatal: number;
  byCategory: Record<ErrorCategory, number>;
  firstError?: Record<string, unknown>;
}