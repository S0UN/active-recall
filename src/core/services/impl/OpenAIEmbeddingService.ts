/**
 * OpenAIEmbeddingService - Vector generation using OpenAI embeddings
 * 
 * Uses OpenAI's text-embedding-3-small model to generate a single vector from
 * distilled content (title + summary) for both deduplication and routing.
 */

import OpenAI from 'openai';
import { DistilledContent, VectorEmbeddings, VectorEmbeddingsSchema } from '../../contracts/schemas';
import { 
  IEmbeddingService, 
  EmbeddingConfig, 
  EmbeddingError, 
  EmbeddingTimeoutError,
  EmbeddingQuotaError 
} from '../IEmbeddingService';
import { IContentCache } from '../IContentCache';

export class OpenAIEmbeddingService implements IEmbeddingService {
  private readonly openAiClient: OpenAI;
  private readonly embeddingConfig: EmbeddingConfig;
  private currentRequestCount = 0;
  private readonly dailyRequestLimit = 3000; // OpenAI embeddings are cheaper

  constructor(config: EmbeddingConfig, _cache: IContentCache) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.embeddingConfig = {
      model: 'text-embedding-3-small',
      dimensions: 1536,
      ...config
    };
    this.openAiClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: 30000,
    });
  }

  async embed(distilled: DistilledContent): Promise<VectorEmbeddings> {
    // Note: Embedding caching would require a separate cache interface
    // For now, we skip caching to maintain type safety

    // Check daily limits
    if (this.currentRequestCount >= this.dailyRequestLimit) {
      throw new EmbeddingQuotaError(
        `Daily embedding limit reached (${this.dailyRequestLimit} requests)`
      );
    }

    try {
      // Generate single embedding for title + summary
      const response = await this.generateEmbedding(`${distilled.title}\n\n${distilled.summary}`);

      this.currentRequestCount += 1; // Single API call

      const embeddings: VectorEmbeddings = {
        vector: response.data[0].embedding,
        contentHash: distilled.contentHash,
        model: this.embeddingConfig.model!,
        dimensions: this.embeddingConfig.dimensions!,
        cached: false,
        embeddedAt: new Date()
      };

      // Validate against schema
      const validated = VectorEmbeddingsSchema.parse(embeddings);

      // Note: Embedding caching would require a separate cache interface

      return validated;

    } catch (error) {
      // Check for timeout errors
      if (error && typeof error === 'object' && 'name' in error && error.name === 'APITimeoutError') {
        throw new EmbeddingTimeoutError(30000);
      }
      
      // Check for rate limit errors (both real and mocked)
      const isRateLimitError = (error as any)?.name === 'RateLimitError' ||
                              (OpenAI.RateLimitError && error instanceof OpenAI.RateLimitError);
      if (isRateLimitError) {
        throw new EmbeddingQuotaError('OpenAI embedding rate limit exceeded');
      }
      
      throw new EmbeddingError(
        `OpenAI embedding failed: ${error}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  getProvider(): string {
    return 'openai';
  }

  getDimensions(): number {
    return this.embeddingConfig.dimensions!;
  }

  /**
   * Generate a single embedding using OpenAI API
   */
  private async generateEmbedding(text: string): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
    return await this.openAiClient.embeddings.create({
      model: this.embeddingConfig.model!,
      input: text,
      dimensions: this.embeddingConfig.dimensions,
    });
  }

  /**
   * Reset daily request counter
   */
  resetDailyCounter(): void {
    this.currentRequestCount = 0;
  }

  /**
   * Get current request count
   */
  getRequestCount(): number {
    return this.currentRequestCount;
  }
}