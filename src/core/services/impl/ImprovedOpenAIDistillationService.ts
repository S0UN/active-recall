/**
 * Improved OpenAI Distillation Service
 * 
 * Enhanced educational content extraction service with:
 * - Advanced OCR artifact handling
 * - Research-based prompt engineering (2024 best practices)
 * - Modular, maintainable architecture
 * - Comprehensive error handling and validation
 * 
 * @module ImprovedOpenAIDistillationService
 */

import OpenAI from 'openai';
import { 
  ConceptCandidate, 
  DistilledContent, 
  DistilledContentSchema, 
  MultiConceptDistillation, 
  MultiConceptDistillationSchema, 
  ExtractedConcept 
} from '../../contracts/schemas';
import { 
  IDistillationService, 
  DistillationConfig, 
  DistillationError, 
  DistillationTimeoutError,
  DistillationQuotaError 
} from '../IDistillationService';
import { IContentCache } from '../IContentCache';
import { buildSystemPrompt, PromptConfig } from './prompts/PromptTemplates';
import { cleanOCRText } from './prompts/OCRPatterns';
import {
  validateCandidate,
  sanitizeTitle,
  sanitizeSummary,
  createFallbackContent,
  createFallbackMultiConcepts,
  isStudyContent,
  parseAPIResponse,
  calculateRelevanceScore,
} from './helpers/DistillationHelpers';

/**
 * Configuration for the improved distillation service
 */
interface ServiceConfig {
  /** Maximum requests per day */
  dailyLimit: number;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Cache TTL in seconds */
  cacheTTL: number;
  /** Prompt configuration */
  promptConfig: PromptConfig;
}

/**
 * Default service configuration
 */
const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  dailyLimit: 1000,
  timeout: 30000,
  cacheTTL: 30 * 24 * 60 * 60, // 30 days
  promptConfig: {
    enableEmotionalTriggers: true,
    enableSelfConsistency: true,
    enableChainOfThought: true,
    maxExamples: 3,
  },
};

/**
 * Improved OpenAI Distillation Service
 * 
 * Provides enhanced educational content extraction with superior
 * OCR handling and concept specificity.
 */
export class ImprovedOpenAIDistillationService implements IDistillationService {
  private readonly openAiClient: OpenAI;
  private readonly distillationConfig: DistillationConfig;
  private readonly contentCache: IContentCache;
  private readonly serviceConfig: ServiceConfig;
  private requestCount: number = 0;
  private lastResetDate: Date = new Date();

  /**
   * Create a new improved distillation service
   * 
   * @param config - Distillation configuration
   * @param cache - Content cache implementation
   * @param serviceConfig - Optional service-specific configuration
   */
  constructor(
    config: DistillationConfig, 
    cache: IContentCache,
    serviceConfig?: Partial<ServiceConfig>
  ) {
    // Validate configuration
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    // Initialize configuration
    this.distillationConfig = config;
    this.contentCache = cache;
    this.serviceConfig = {
      ...DEFAULT_SERVICE_CONFIG,
      ...serviceConfig,
    };

    // Initialize OpenAI client
    this.openAiClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: this.serviceConfig.timeout,
    });

    // Reset daily counter if needed
    this.checkDailyReset();
  }

  /**
   * Extract a single educational concept from text
   * 
   * @param candidate - The content to distill
   * @returns Promise resolving to distilled content
   * @throws {DistillationError} if extraction fails
   */
  async distill(candidate: ConceptCandidate): Promise<DistilledContent> {
    // Validate input
    validateCandidate(candidate);
    
    // Check cache if enabled
    if (this.distillationConfig.cacheEnabled) {
      const cached = await this.getCachedContent(candidate.contentHash);
      if (cached) {
        return cached;
      }
    }

    // Check rate limits
    this.checkRateLimits();

    try {
      // Clean OCR artifacts from text
      const cleanedText = cleanOCRText(candidate.normalizedText);
      
      // Make API request
      const response = await this.makeAPIRequest(cleanedText, false);
      
      // Parse and validate response
      const parsed = parseAPIResponse(response);
      
      // Check if content is study-related
      if (!isStudyContent(parsed)) {
        throw new DistillationError('Content is not study-related');
      }
      
      // Create distilled content
      const distilled = this.createDistilledContent(parsed, candidate);
      
      // Validate with schema
      const validated = DistilledContentSchema.parse(distilled);

      // Cache if enabled
      if (this.distillationConfig.cacheEnabled) {
        await this.cacheContent(candidate.contentHash, validated);
      }

      return validated;

    } catch (error) {
      return this.handleError(error, candidate, false);
    }
  }

  /**
   * Extract multiple educational concepts from text
   * 
   * @param candidate - The content to distill
   * @returns Promise resolving to multi-concept distillation
   * @throws {DistillationError} if extraction fails
   */
  async distillMultiple(candidate: ConceptCandidate): Promise<MultiConceptDistillation> {
    // Validate input
    validateCandidate(candidate);
    
    const cacheKey = `multi_${candidate.contentHash}`;
    
    // Check cache if enabled
    if (this.distillationConfig.cacheEnabled) {
      const cached = await this.getCachedMultiContent(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Check rate limits
    this.checkRateLimits();

    try {
      // Clean OCR artifacts from text
      const cleanedText = cleanOCRText(candidate.normalizedText);
      
      // Make API request
      const response = await this.makeAPIRequest(cleanedText, true);
      
      // Parse and validate response
      const parsed = parseAPIResponse(response);
      
      // Check for valid concepts
      if (!parsed.concepts || !Array.isArray(parsed.concepts) || parsed.concepts.length === 0) {
        throw new DistillationError('No study-related concepts found');
      }

      // Filter and process concepts
      const concepts = this.processMultipleConcepts(parsed.concepts, candidate);
      
      if (concepts.length === 0) {
        throw new DistillationError('Content is not study-related');
      }

      // Create multi-concept result
      const result = this.createMultiConceptResult(concepts, candidate);
      
      // Validate with schema
      const validated = MultiConceptDistillationSchema.parse(result);

      // Cache if enabled
      if (this.distillationConfig.cacheEnabled) {
        await this.cacheContent(cacheKey, validated);
      }

      return validated;

    } catch (error) {
      return this.handleError(error, candidate, true);
    }
  }

  /**
   * Get the provider name
   */
  getProvider(): string {
    return 'improved-openai';
  }

  /**
   * Reset the daily request counter
   */
  resetDailyCounter(): void {
    this.requestCount = 0;
    this.lastResetDate = new Date();
  }

  /**
   * Get current request count
   */
  getRequestCount(): number {
    this.checkDailyReset();
    return this.requestCount;
  }

  // ==================== Private Helper Methods ====================

  /**
   * Check and reset daily counter if needed
   */
  private checkDailyReset(): void {
    const now = new Date();
    const lastReset = this.lastResetDate;
    
    // Reset if it's a new day
    if (now.getDate() !== lastReset.getDate() || 
        now.getMonth() !== lastReset.getMonth() || 
        now.getFullYear() !== lastReset.getFullYear()) {
      this.resetDailyCounter();
    }
  }

  /**
   * Check rate limits
   * @throws {DistillationQuotaError} if limit exceeded
   */
  private checkRateLimits(): void {
    this.checkDailyReset();
    
    if (this.requestCount >= this.serviceConfig.dailyLimit) {
      throw new DistillationQuotaError(
        `Daily API limit reached (${this.serviceConfig.dailyLimit} requests)`
      );
    }
  }

  /**
   * Make API request to OpenAI
   */
  private async makeAPIRequest(text: string, isMultiConcept: boolean): Promise<string> {
    const systemPrompt = buildSystemPrompt(isMultiConcept, this.serviceConfig.promptConfig);
    
    const response = await this.openAiClient.chat.completions.create({
      model: this.distillationConfig.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      response_format: { type: 'json_object' },
      max_tokens: this.calculateMaxTokens(isMultiConcept),
      temperature: this.distillationConfig.temperature || 0.1,
    });

    this.requestCount++;

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new DistillationError('Empty response from OpenAI');
    }

    return content;
  }

  /**
   * Calculate max tokens for request
   */
  private calculateMaxTokens(isMultiConcept: boolean): number {
    const baseTokens = this.distillationConfig.maxTokens || 300;
    
    if (isMultiConcept) {
      const maxConcepts = this.distillationConfig.maxConceptsPerDistillation || 3;
      return baseTokens * maxConcepts;
    }
    
    return baseTokens;
  }

  /**
   * Create distilled content from parsed response
   */
  private createDistilledContent(
    parsed: any, 
    candidate: ConceptCandidate
  ): DistilledContent {
    return {
      title: sanitizeTitle(parsed.title || 'Concept'),
      summary: sanitizeSummary(parsed.summary || candidate.normalizedText.substring(0, 500)),
      contentHash: candidate.contentHash,
      cached: false,
      distilledAt: new Date(),
    };
  }

  /**
   * Process multiple concepts from parsed response
   */
  private processMultipleConcepts(
    concepts: any[], 
    candidate: ConceptCandidate
  ): ExtractedConcept[] {
    // Filter out non-study content
    const validConcepts = concepts.filter((c: any) => 
      c.title !== 'NOT_STUDY_CONTENT' && c.summary !== 'NOT_STUDY_CONTENT'
    );

    // Limit to max concepts
    const maxConcepts = this.distillationConfig.maxConceptsPerDistillation || 5;
    const limitedConcepts = validConcepts.slice(0, maxConcepts);

    // Process each concept
    return limitedConcepts.map((concept: any) => ({
      title: sanitizeTitle(concept.title || 'Concept'),
      summary: sanitizeSummary(concept.summary || ''),
      relevanceScore: concept.relevanceScore || calculateRelevanceScore(
        concept.title || '',
        concept.summary || '',
        candidate.normalizedText
      ),
      startOffset: concept.startOffset,
      endOffset: concept.endOffset,
    }));
  }

  /**
   * Create multi-concept result
   */
  private createMultiConceptResult(
    concepts: ExtractedConcept[], 
    candidate: ConceptCandidate
  ): MultiConceptDistillation {
    return {
      concepts,
      sourceContentHash: candidate.contentHash,
      totalConcepts: concepts.length,
      processingTime: Date.now(),
      cached: false,
      distilledAt: new Date(),
    };
  }

  /**
   * Get cached content
   */
  private async getCachedContent(key: string): Promise<DistilledContent | null> {
    const cached = await this.contentCache.get(key);
    if (cached) {
      return { ...cached, cached: true };
    }
    return null;
  }

  /**
   * Get cached multi-concept content
   */
  private async getCachedMultiContent(key: string): Promise<MultiConceptDistillation | null> {
    const cached = await this.contentCache.get(key) as MultiConceptDistillation | undefined;
    if (cached) {
      return { ...cached, cached: true };
    }
    return null;
  }

  /**
   * Cache content
   */
  private async cacheContent(key: string, content: any): Promise<void> {
    await this.contentCache.set(key, content, this.serviceConfig.cacheTTL);
  }

  /**
   * Handle errors during distillation
   */
  private handleError(error: any, candidate: ConceptCandidate, isMultiConcept: boolean): any {
    // Handle specific HTTP status codes
    if (error && typeof error === 'object' && 'status' in error) {
      this.handleHTTPError(error);
    }

    // Handle timeout errors
    if (error?.name === 'APITimeoutError') {
      throw new DistillationTimeoutError(this.serviceConfig.timeout);
    }

    // Handle rate limit errors
    if (error?.name === 'RateLimitError') {
      throw new DistillationQuotaError('OpenAI rate limit exceeded');
    }

    // Handle JSON parsing errors with fallback
    if (error instanceof SyntaxError) {
      if (isMultiConcept) {
        const concepts = createFallbackMultiConcepts(candidate);
        return this.createMultiConceptResult(concepts, candidate);
      } else {
        return createFallbackContent(candidate);
      }
    }

    // Handle Zod validation errors
    if (error && typeof error === 'object' && '_zod' in error) {
      const zodError = error as any;
      const errorMessage = zodError.issues?.map((issue: any) => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ') || 'Validation failed';
      
      throw new DistillationError(`Schema validation failed: ${errorMessage}`);
    }

    // Handle generic errors
    const errorPrefix = isMultiConcept 
      ? 'OpenAI multi-concept distillation failed' 
      : 'OpenAI distillation failed';
    
    throw new DistillationError(
      `${errorPrefix}: ${error}`,
      error instanceof Error ? error : new Error(String(error))
    );
  }

  /**
   * Handle HTTP status code errors
   */
  private handleHTTPError(error: any): never {
    const status = error.status;
    const code = error.code;

    switch (status) {
      case 401:
        throw new DistillationError('OpenAI API authentication failed. Please check your API key.');
      
      case 403:
        throw new DistillationError('OpenAI API access forbidden. Please check your permissions.');
      
      case 404:
        throw new DistillationError('OpenAI API endpoint not found. Please check your model configuration.');
      
      case 429:
        if (code === 'insufficient_quota') {
          throw new DistillationQuotaError('OpenAI API quota exceeded. Please check your billing settings.');
        }
        throw new DistillationQuotaError('OpenAI rate limit exceeded. Please try again later.');
      
      case 500:
      case 502:
      case 503:
      case 504:
        throw new DistillationError('OpenAI API server error. Please try again later.');
      
      default:
        throw new DistillationError(`OpenAI API error (${status}): ${error.message || 'Unknown error'}`);
    }
  }
}