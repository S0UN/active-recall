/**
 * IDistillationService - Content enrichment using LLM
 * 
 * This service implements the DISTILL step of our pipeline:
 * ConceptCandidate → DISTILL (title + summary) → EMBED → ROUTE
 * 
 * Key features:
 * - Swappable implementations (OpenAI, Local LLM)
 * - Content caching by contentHash for efficiency
 * - Tiny prompts with JSON schema output
 */

import { ConceptCandidate, DistilledContent } from '../contracts/schemas';

/**
 * Interface for content distillation services
 * Supports dependency inversion for swappable AI providers
 */
export interface IDistillationService {
  /**
   * Extract title and summary from concept candidate
   * @param candidate - The concept candidate to enrich
   * @returns Promise<DistilledContent> - Title + summary + metadata
   */
  distill(candidate: ConceptCandidate): Promise<DistilledContent>;

  /**
   * Get the name of the distillation provider
   * @returns string - Provider name for logging/audit
   */
  getProvider(): string;
}

/**
 * Configuration for distillation services
 */
export interface DistillationConfig {
  provider: 'openai' | 'local';
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  cacheEnabled?: boolean;
}

/**
 * Error types for distillation operations
 */
export class DistillationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DistillationError';
  }
}

export class DistillationTimeoutError extends DistillationError {
  constructor(timeout: number) {
    super(`Distillation timed out after ${timeout}ms`);
    this.name = 'DistillationTimeoutError';
  }
}

export class DistillationQuotaError extends DistillationError {
  constructor(message: string) {
    super(message);
    this.name = 'DistillationQuotaError';
  }
}