/**
 * IEmbeddingService - Vector embedding generation for routing
 * 
 * This service implements the EMBED step of our pipeline:
 * ConceptCandidate → DISTILL → EMBED (titleVector + contextVector) → ROUTE
 * 
 * Two-vector approach:
 * - titleVector: Fast deduplication and similar concept detection
 * - contextVector: Rich semantic routing to appropriate folders
 */

import { DistilledContent, VectorEmbeddings } from '../contracts/schemas';

/**
 * Interface for embedding generation services
 * Supports dependency inversion for swappable AI providers
 */
export interface IEmbeddingService {
  /**
   * Generate title and context embeddings from distilled content
   * @param distilled - The title + summary from distillation
   * @returns Promise<VectorEmbeddings> - Two vectors for routing
   */
  embed(distilled: DistilledContent): Promise<VectorEmbeddings>;

  /**
   * Get the name of the embedding provider
   * @returns string - Provider name for logging/audit
   */
  getProvider(): string;

  /**
   * Get the dimensionality of generated vectors
   * @returns number - Vector dimension (e.g., 1536 for OpenAI)
   */
  getDimensions(): number;
}

/**
 * Configuration for embedding services
 */
export interface EmbeddingConfig {
  provider: 'openai' | 'local';
  apiKey?: string;
  model?: string;
  dimensions?: number;
  cacheEnabled?: boolean;
}

/**
 * Error types for embedding operations
 */
export class EmbeddingError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

export class EmbeddingTimeoutError extends EmbeddingError {
  constructor(timeout: number) {
    super(`Embedding generation timed out after ${timeout}ms`);
    this.name = 'EmbeddingTimeoutError';
  }
}

export class EmbeddingQuotaError extends EmbeddingError {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingQuotaError';
  }
}