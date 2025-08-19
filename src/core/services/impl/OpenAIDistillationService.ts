/**
 * OpenAIDistillationService - LLM-powered content enrichment
 * 
 * Uses OpenAI's API to generate concise titles and summaries from raw text.
 * Implements caching to avoid redundant API calls and reduce costs.
 */

import OpenAI from 'openai';
import { ConceptCandidate, DistilledContent, DistilledContentSchema } from '../../contracts/schemas';
import { 
  IDistillationService, 
  DistillationConfig, 
  DistillationError, 
  DistillationTimeoutError,
  DistillationQuotaError 
} from '../IDistillationService';
import { IContentCache } from '../IContentCache';

export class OpenAIDistillationService implements IDistillationService {
  private readonly openAiClient: OpenAI;
  private readonly distillationConfig: DistillationConfig;
  private readonly contentCache: IContentCache;
  private requestCount = 0;
  private dailyLimit = 1000;

  constructor(config: DistillationConfig, cache: IContentCache) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.distillationConfig = config;
    this.contentCache = cache;
    this.openAiClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: 30000, // 30 second timeout
    });
  }

  async distill(candidate: ConceptCandidate): Promise<DistilledContent> {
    // Check cache first
    if (this.distillationConfig.cacheEnabled) {
      const cached = await this.contentCache.get(candidate.contentHash);
      if (cached) {
        return {
          ...cached,
          cached: true
        };
      }
    }

    // Check daily limits
    if (this.requestCount >= this.dailyLimit) {
      throw new DistillationQuotaError(
        `Daily API limit reached (${this.dailyLimit} requests)`
      );
    }

    try {
      const response = await this.openAiClient.chat.completions.create({
        model: this.distillationConfig.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: candidate.normalizedText
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: this.distillationConfig.maxTokens || 200,
        temperature: this.distillationConfig.temperature || 0.1,
      });

      this.requestCount++;

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new DistillationError('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content);
      
      // Check if content was identified as non-study material
      if (parsed.title === 'NOT_STUDY_CONTENT' || parsed.summary === 'NOT_STUDY_CONTENT') {
        throw new DistillationError('Content is not study-related');
      }
      
      const distilled: DistilledContent = {
        title: this.sanitizeTitle(parsed.title || 'Concept'),
        summary: this.sanitizeSummary(parsed.summary || candidate.normalizedText.substring(0, 500)),
        contentHash: candidate.contentHash,
        cached: false,
        distilledAt: new Date()
      };

      // Validate against schema
      const validated = DistilledContentSchema.parse(distilled);

      // Cache the result
      if (this.distillationConfig.cacheEnabled) {
        await this.contentCache.set(candidate.contentHash, validated, 30 * 24 * 60 * 60); // 30 days
      }

      return validated;

    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'APITimeoutError') {
        throw new DistillationTimeoutError(30000);
      }
      if (error && typeof error === 'object' && 'name' in error && error.name === 'RateLimitError') {
        throw new DistillationQuotaError('OpenAI rate limit exceeded');
      }
      if (error instanceof SyntaxError) {
        // JSON parsing error - fallback to extraction
        return this.extractFallback(candidate);
      }
      
      throw new DistillationError(
        `OpenAI distillation failed: ${error}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }


  getProvider(): string {
    return 'openai';
  }

  /**
   * Get the system prompt for distillation
   */
  private getSystemPrompt(): string {
    return `Extract a concise title and summary from the provided text ONLY if it contains study-related or educational content.

Requirements:
- IMPORTANT: If the text is NOT related to studying, learning, or educational content, return: {"title": "NOT_STUDY_CONTENT", "summary": "NOT_STUDY_CONTENT"}
- Title: Maximum 100 characters, descriptive and specific
- Summary: 2-5 sentences (50-500 characters), captures key concepts
- Return as JSON: {"title": "...", "summary": "..."}

Study-related content includes:
- Academic subjects (math, science, history, etc.)
- Programming and technical concepts
- Educational tutorials and explanations
- Research papers and documentation
- Learning materials and course content

NOT study-related (return NOT_STUDY_CONTENT):
- Social media posts
- Entertainment content
- Shopping/e-commerce
- General web navigation
- News articles (unless educational)

Focus on the core concept or learning objective. Remove navigation, UI elements, and boilerplate text.`;
  }

  /**
   * Sanitize and validate title
   */
  private sanitizeTitle(title: string): string {
    const cleaned = title.trim();
    if (cleaned.length === 0) return 'Concept';
    if (cleaned.length > 100) return cleaned.substring(0, 97) + '...';
    return cleaned;
  }

  /**
   * Sanitize and validate summary
   */
  private sanitizeSummary(summary: string): string {
    const cleaned = summary.trim();
    if (cleaned.length < 50) {
      return cleaned.padEnd(50, ' '); // Pad to meet minimum
    }
    if (cleaned.length > 500) {
      return cleaned.substring(0, 497) + '...';
    }
    return cleaned;
  }

  /**
   * Fallback extraction when LLM fails
   */
  private extractFallback(candidate: ConceptCandidate): DistilledContent {
    const sentences = candidate.normalizedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const title = sentences[0]?.trim().substring(0, 100) || 'Concept';
    const summary = candidate.normalizedText.substring(0, 500);

    return {
      title: this.sanitizeTitle(title),
      summary: this.sanitizeSummary(summary),
      contentHash: candidate.contentHash,
      cached: false,
      distilledAt: new Date()
    };
  }

  /**
   * Reset daily request counter
   */
  resetDailyCounter(): void {
    this.requestCount = 0;
  }

  /**
   * Get current request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }
}