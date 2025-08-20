import { GoogleGenerativeAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { 
  IDistillationService, 
  DistilledContent, 
  DistillationError,
  DistillationTimeoutError,
  DistillationQuotaError,
  DistillationValidationError,
  DistillationContentError,
  DistillationProviderError
} from '../IDistillationService';
import { IContentCache } from '../IContentCache';
import { ConceptCandidate } from '../../domain/ConceptCandidate';
import { 
  ExtractedConceptSchema, 
  MultiConceptDistillationSchema,
  ExtractedConcept,
  MultiConceptDistillation
} from '../../contracts/schemas';
import { GeminiConfig } from '../../config/GeminiConfig';
import { z } from 'zod';

/**
 * Gemini implementation of the distillation service.
 * Supports multiple Gemini models with different cost/performance trade-offs.
 * 
 * Follows SOLID principles:
 * - Single Responsibility: Handles only Gemini-specific distillation logic
 * - Open/Closed: Extensible for new Gemini models without modification
 * - Liskov Substitution: Can be used anywhere IDistillationService is expected
 * - Interface Segregation: Implements focused IDistillationService interface
 * - Dependency Inversion: Depends on abstractions (interfaces) not concretions
 */
export class GeminiDistillationService implements IDistillationService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: GenerativeModel;
  private readonly contentCache: IContentCache;
  private readonly config: GeminiConfig;
  private requestCount: number = 0;
  private dailyRequestCount: number = 0;
  private lastResetDate: Date = new Date();

  constructor(config: GeminiConfig, contentCache: IContentCache) {
    // Validate configuration early to fail fast
    this.validateConfig(config);
    
    this.config = config;
    this.contentCache = contentCache;
    
    // Initialize Gemini AI with configuration
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    
    // Configure the model with explicit defaults (avoid implicit defaults)
    this.model = this.genAI.getGenerativeModel({
      model: config.model,
      generationConfig: this.createGenerationConfig(config),
      safetySettings: this.createSafetySettings(config)
    });

    if (config.debugMode) {
      console.log('[GeminiDistillation] Service initialized with model:', config.model);
    }
  }

  /**
   * Validates configuration to ensure all required fields are present
   * Follows fail-fast principle
   */
  private validateConfig(config: GeminiConfig): void {
    if (!config.apiKey) {
      throw new DistillationError('Gemini API key is required');
    }
    if (!config.model) {
      throw new DistillationError('Gemini model is required');
    }
    if (!config.provider || config.provider !== 'gemini') {
      throw new DistillationError('Invalid provider for GeminiDistillationService');
    }
  }

  /**
   * Creates generation configuration with explicit defaults
   * Better than using || operators throughout the code
   */
  private createGenerationConfig(config: GeminiConfig) {
    return {
      temperature: config.temperature ?? 0.1,
      maxOutputTokens: config.maxTokens ?? 200,
      topK: config.generationConfig?.topK ?? 40,
      topP: config.generationConfig?.topP ?? 0.95,
      stopSequences: config.generationConfig?.stopSequences
    };
  }

  /**
   * Creates safety settings configuration
   * Extracted for better readability and testability
   */
  private createSafetySettings(config: GeminiConfig) {
    return this.getSafetySettings();
  }

  private getSafetySettings() {
    const threshold = this.config.safetySettings?.harmBlockThreshold || 'BLOCK_MEDIUM';
    const thresholdMap: Record<string, HarmBlockThreshold> = {
      'BLOCK_NONE': HarmBlockThreshold.BLOCK_NONE,
      'BLOCK_LOW': HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
      'BLOCK_MEDIUM': HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      'BLOCK_HIGH': HarmBlockThreshold.BLOCK_ONLY_HIGH
    };

    return [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: thresholdMap[threshold]
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: thresholdMap[threshold]
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: thresholdMap[threshold]
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: thresholdMap[threshold]
      }
    ];
  }

  public async distill(candidate: ConceptCandidate): Promise<DistilledContent> {
    this.checkDailyLimit();
    
    // Check cache first
    const cacheKey = candidate.contentHash;
    const cached = await this.contentCache.get(cacheKey);
    if (cached) {
      if (this.config.debugMode) {
        console.log('[GeminiDistillation] Cache hit for single concept');
      }
      return cached;
    }

    try {
      this.validateInput(candidate);
      
      const prompt = this.buildSingleConceptPrompt(candidate.normalizedText);
      const result = await this.generateWithTimeout(prompt);
      
      const distilled = this.parseSingleConceptResponse(result);
      
      // Cache the result
      if (this.config.cacheEnabled) {
        await this.contentCache.set(cacheKey, distilled, 30 * 24 * 60 * 60);
      }
      
      this.incrementRequestCount();
      return distilled;
      
    } catch (error) {
      throw this.handleError(error);
    }
  }

  public async distillMultiple(candidate: ConceptCandidate): Promise<MultiConceptDistillation> {
    if (!this.config.multiConceptEnabled) {
      throw new DistillationError('Multi-concept extraction is not enabled');
    }

    this.checkDailyLimit();
    
    // Check cache first
    const cacheKey = `multi_${candidate.contentHash}`;
    const cached = await this.contentCache.get(cacheKey);
    if (cached) {
      if (this.config.debugMode) {
        console.log('[GeminiDistillation] Cache hit for multi-concept');
      }
      return cached;
    }

    try {
      this.validateInput(candidate);
      
      const prompt = this.buildMultiConceptPrompt(candidate.normalizedText);
      const result = await this.generateWithTimeout(prompt);
      
      const distilled = this.parseMultiConceptResponse(result, candidate.contentHash);
      
      // Cache the result
      if (this.config.cacheEnabled) {
        await this.contentCache.set(cacheKey, distilled, 30 * 24 * 60 * 60);
      }
      
      this.incrementRequestCount();
      return distilled;
      
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async generateWithTimeout(prompt: string): Promise<string> {
    const timeoutMs = this.config.requestTimeout || 30000;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new DistillationTimeoutError('Gemini API request timed out')), timeoutMs);
    });

    try {
      const resultPromise = this.model.generateContent(prompt);
      const result = await Promise.race([resultPromise, timeoutPromise]);
      
      const response = await result.response;
      const text = response.text();
      
      if (!text) {
        throw new DistillationProviderError('Gemini returned empty response');
      }
      
      return text;
    } catch (error) {
      if (error instanceof DistillationTimeoutError) {
        throw error;
      }
      throw new DistillationProviderError(`Gemini API error: ${error}`);
    }
  }

  private buildSingleConceptPrompt(text: string): string {
    const basePrompt = `Extract the single most specific educational concept from this text. 
The concept must be specific enough to create a targeted practice question.

Return a JSON object with:
{
  "title": "Specific concept name (e.g., 'Stack LIFO Push Operation', not 'Data Structures')",
  "summary": "Clear explanation of the concept (50-500 characters)"
}

Text to analyze:
${text}

Important: 
- Title must be extremely specific, not broad categories
- If the text is not educational, return {"title": "NOT_STUDY_CONTENT", "summary": "NOT_STUDY_CONTENT"}
- Return only valid JSON, no additional text`;

    return basePrompt;
  }

  private buildMultiConceptPrompt(text: string): string {
    const maxConcepts = this.config.maxConceptsPerDistillation || 5;
    
    let prompt = `You are an expert educational content analyst. Extract ${maxConcepts} or fewer SPECIFIC educational concepts from this text.

Each concept must be specific enough to generate an individual flashcard or practice question.`;

    if (this.config.chainOfThoughtEnabled) {
      prompt += `

## REASONING APPROACH:
1. Identify distinct educational topics in the text
2. Break down broad topics into specific, testable concepts
3. Ensure each concept is narrow enough for a single flashcard
4. Remove any duplicate or overlapping concepts`;
    }

    if (this.config.fewShotExamplesEnabled) {
      prompt += `

## EXAMPLES:

Input: "Object-Oriented Programming uses encapsulation to bundle data and methods. Inheritance allows classes to inherit properties."
Output: [
  {"title": "Encapsulation in OOP", "summary": "Bundling data and methods within a class to hide internal implementation"},
  {"title": "Inheritance in OOP", "summary": "Mechanism allowing classes to inherit properties and methods from parent classes"}
]

Input: "QuickSort uses a pivot to partition arrays. The pivot selection affects performance."
Output: [
  {"title": "QuickSort Pivot Selection", "summary": "Choosing a pivot element to partition the array into smaller and larger elements"},
  {"title": "QuickSort Partitioning Process", "summary": "Dividing array into two sub-arrays based on pivot comparison"}
]`;
    }

    if (this.config.ocrAwarenessEnabled) {
      prompt += `

Note: This text may contain OCR artifacts (missing spaces, wrong characters). Focus on the educational content.`;
    }

    prompt += `

## YOUR TASK:
Analyze the following text and extract up to ${maxConcepts} specific concepts.

Return a JSON array of concepts:
[
  {
    "title": "Extremely specific concept name",
    "summary": "Clear explanation (50-500 characters)",
    "relevanceScore": 0.0-1.0
  }
]

Text to analyze:
${text}

CRITICAL REQUIREMENTS:
- Titles must be specific enough for individual flashcards
- Reject broad terms like "Algorithms", "Programming", "Biology"
- If no educational content found, return empty array []
- Return only valid JSON array, no additional text`;

    return prompt;
  }

  private parseSingleConceptResponse(response: string): DistilledContent {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new DistillationValidationError('No JSON found in Gemini response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Check for non-educational content
      if (parsed.title === 'NOT_STUDY_CONTENT') {
        throw new DistillationContentError('Content is not educational');
      }

      // Validate with schema
      const validated = z.object({
        title: z.string().min(1).max(100),
        summary: z.string().min(50).max(500)
      }).parse(parsed);

      return {
        title: validated.title,
        summary: validated.summary
      };
    } catch (error) {
      if (error instanceof DistillationError) {
        throw error;
      }
      throw new DistillationValidationError(`Failed to parse Gemini response: ${error}`);
    }
  }

  private parseMultiConceptResponse(response: string, contentHash: string): MultiConceptDistillation {
    try {
      // Try to extract JSON array from the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new DistillationValidationError('No JSON array found in Gemini response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(parsed)) {
        throw new DistillationValidationError('Response is not an array');
      }

      // Filter out non-educational content and validate each concept
      const concepts: ExtractedConcept[] = parsed
        .filter((c: any) => c.title !== 'NOT_STUDY_CONTENT')
        .map((c: any) => {
          return ExtractedConceptSchema.parse({
            title: c.title,
            summary: c.summary,
            relevanceScore: c.relevanceScore || 0.8
          });
        });

      if (concepts.length === 0) {
        throw new DistillationContentError('No educational concepts found');
      }

      // Build the multi-concept result
      const result: MultiConceptDistillation = {
        concepts,
        sourceContentHash: contentHash,
        totalConcepts: concepts.length,
        processingTime: Date.now(),
        cached: false,
        distilledAt: new Date(),
        modelInfo: {
          model: this.config.model,
          promptVersion: this.config.promptVersion || 'v1.0-gemini'
        }
      };

      // Validate the complete result
      return MultiConceptDistillationSchema.parse(result);
      
    } catch (error) {
      if (error instanceof DistillationError) {
        throw error;
      }
      throw new DistillationValidationError(`Failed to parse Gemini multi-concept response: ${error}`);
    }
  }

  private validateInput(candidate: ConceptCandidate): void {
    if (!candidate.normalizedText || candidate.normalizedText.trim().length === 0) {
      throw new DistillationValidationError('Input text is empty');
    }

    const textLength = candidate.normalizedText.length;
    
    if (textLength < (this.config.minContentLength || 10)) {
      throw new DistillationValidationError(`Text too short: ${textLength} characters`);
    }

    if (textLength > (this.config.maxContentLength || 50000)) {
      throw new DistillationValidationError(`Text too long: ${textLength} characters`);
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\b(DROP|DELETE|INSERT|UPDATE|UNION|SELECT)\s+/i,
      /<script[\s\S]*?>[\s\S]*?<\/script>/i,
      /javascript:/i,
      /on\w+\s*=/i
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(candidate.normalizedText)) {
        throw new DistillationValidationError('Input contains potentially malicious content');
      }
    }
  }

  private checkDailyLimit(): void {
    // Reset daily counter if it's a new day
    const now = new Date();
    if (now.toDateString() !== this.lastResetDate.toDateString()) {
      this.dailyRequestCount = 0;
      this.lastResetDate = now;
    }

    const limit = this.config.dailyRequestLimit || 10000;
    if (this.dailyRequestCount >= limit) {
      throw new DistillationQuotaError(`Daily API limit reached (${limit} requests)`);
    }

    // Check warning threshold
    const warningThreshold = this.config.quotaWarningThreshold || 0.8;
    if (this.dailyRequestCount >= limit * warningThreshold) {
      console.warn(`[GeminiDistillation] Approaching daily limit: ${this.dailyRequestCount}/${limit}`);
    }
  }

  private incrementRequestCount(): void {
    this.requestCount++;
    this.dailyRequestCount++;
  }

  private handleError(error: any): Error {
    if (error instanceof DistillationError) {
      return error;
    }

    // Map Gemini-specific errors
    if (error?.status === 429 || error?.message?.includes('quota')) {
      return new DistillationQuotaError('Gemini API quota exceeded', error);
    }

    if (error?.status === 401 || error?.message?.includes('auth')) {
      return new DistillationProviderError('Gemini API authentication failed', error);
    }

    if (error?.status === 400 || error?.message?.includes('invalid')) {
      return new DistillationValidationError('Invalid request to Gemini API', error);
    }

    return new DistillationProviderError(`Gemini API error: ${error?.message || error}`, error);
  }

  public getProvider(): string {
    return `gemini-${this.config.model}`;
  }

  public getRequestCount(): number {
    return this.requestCount;
  }

  public resetDailyCounter(): void {
    this.dailyRequestCount = 0;
    this.lastResetDate = new Date();
    if (this.config.debugMode) {
      console.log('[GeminiDistillation] Daily counter reset');
    }
  }
}