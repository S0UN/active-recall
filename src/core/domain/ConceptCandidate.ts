/**
 * ConceptCandidate domain model
 * 
 * This file defines:
 * - Core business entity for processing pipeline
 * - Deterministic ID generation for idempotency
 * - Text normalization and validation logic
 * - Immutable value object with rich behavior
 * 
 * Design principles:
 * - Immutable objects prevent accidental mutation
 * - Domain logic encapsulated in the model
 * - Deterministic operations for reproducibility
 * - Clear separation of concerns
 */

import { ConceptCandidate as ConceptCandidateData, SourceInfo } from '../contracts/schemas';
import { ValidationError, InsufficientContentError } from '../errors/ConceptOrganizerErrors';
import { createHash } from 'crypto';

/**
 * Configuration for candidate validation
 * Extracted to interface for easy testing and adjustment
 */
export interface CandidateValidationConfig {
  minTextLength: number;        // Minimum character count
  minWordCount: number;         // Minimum word count  
  maxTextLength: number;        // Maximum character count to prevent bloat
  minQualityScore: number;      // Minimum content quality (0-1)
  bannedPatterns: RegExp[];     // Patterns to reject (ads, navigation, etc)
}

/**
 * Default validation configuration
 * Can be overridden in production config
 */
export const DEFAULT_CANDIDATE_CONFIG: CandidateValidationConfig = {
  minTextLength: 10,
  minWordCount: 3,
  maxTextLength: 5000,
  minQualityScore: 0.3,
  bannedPatterns: [
    /^\s*(home|back|next|previous|menu|navbar)\s*$/i,
    /^\s*\d+\s*$/,  // Just numbers
    /^[^\w]*$/,     // Just punctuation
  ]
};

/**
 * Text normalization strategies
 * Strategy pattern allows swapping normalization approaches
 */
export interface ITextNormalizer {
  /**
   * Normalize raw OCR text for processing
   * Should be idempotent - same input produces same output
   */
  normalize(text: string): string;
  
  /**
   * Compute quality score for text (0-1)
   * Higher scores indicate better content
   */
  computeQuality(text: string): number;
}

/**
 * Content quality assessment
 * Determines if text is worth processing
 */
export interface IContentQualityAssessor {
  /**
   * Assess if content meets minimum quality standards
   */
  assess(text: string, config: CandidateValidationConfig): ContentQualityResult;
}

export interface ContentQualityResult {
  score: number;          // 0-1 quality score
  sufficient: boolean;    // Meets minimum threshold
  reasons: string[];      // Why quality is low/high
  wordCount: number;
  characterCount: number;
}

/**
 * ConceptCandidate domain model
 * Represents a potential concept extracted from raw text
 */
export class ConceptCandidate {
  private readonly _data: ConceptCandidateData;
  
  /**
   * Create a new candidate with validation
   * Private constructor enforces factory pattern
   */
  private constructor(data: ConceptCandidateData) {
    this._data = Object.freeze({ ...data });
  }
  
  /**
   * Factory method to create candidate from batch entry
   * Handles validation, normalization, and ID generation
   */
  static create(
    batchId: string,
    index: number,
    rawText: string,
    source: SourceInfo,
    normalizer: ITextNormalizer,
    qualityAssessor: IContentQualityAssessor,
    config: CandidateValidationConfig = DEFAULT_CANDIDATE_CONFIG
  ): ConceptCandidate {
    // Step 1: Normalize text
    const normalizedText = normalizer.normalize(rawText);
    
    // Step 2: Assess quality
    const qualityResult = qualityAssessor.assess(normalizedText, config);
    
    // Step 3: Validate sufficiency
    if (!qualityResult.sufficient) {
      throw new InsufficientContentError(
        qualityResult.characterCount,
        config.minTextLength,
        qualityResult.score,
        { 
          reasons: qualityResult.reasons,
          batchId,
          index 
        }
      );
    }
    
    // Step 4: Generate deterministic ID
    const candidateId = this.generateDeterministicId(batchId, index, normalizedText);
    
    // Step 5: Compute content hash for caching/dedup
    const contentHash = this.computeContentHash(normalizedText);
    
    // Step 6: Create immutable data object
    const data: ConceptCandidateData = {
      candidateId,
      batchId,
      index,
      rawText,
      normalizedText,
      contentHash,
      source,
      createdAt: new Date(),
      metadata: {
        quality: qualityResult,
        normalizer: normalizer.constructor.name,
      }
    };
    
    return new ConceptCandidate(data);
  }
  
  /**
   * Create from existing data (for persistence/reconstruction)
   * Validates data integrity but skips normalization
   */
  static fromData(data: ConceptCandidateData): ConceptCandidate {
    // TODO: Validate data with schema
    return new ConceptCandidate(data);
  }
  
  /**
   * Generate deterministic candidate ID
   * Same inputs always produce same ID for idempotency
   */
  private static generateDeterministicId(
    batchId: string,
    index: number,
    normalizedText: string
  ): string {
    const input = `${batchId}:${index}:${normalizedText}`;
    return createHash('sha256')
      .update(input, 'utf8')
      .digest('hex')
      .substring(0, 16); // Shorter ID for readability
  }
  
  /**
   * Compute content hash for deduplication
   * Only considers normalized text content
   */
  private static computeContentHash(normalizedText: string): string {
    return createHash('sha256')
      .update(normalizedText, 'utf8')
      .digest('hex');
  }
  
  // =============================================================================
  // ACCESSORS
  // =============================================================================
  
  get id(): string {
    return this._data.candidateId;
  }
  
  get batchId(): string {
    return this._data.batchId;
  }
  
  get index(): number {
    return this._data.index;
  }
  
  get rawText(): string {
    return this._data.rawText;
  }
  
  get normalizedText(): string {
    return this._data.normalizedText;
  }
  
  get contentHash(): string {
    return this._data.contentHash;
  }
  
  get source(): SourceInfo {
    return this._data.source;
  }
  
  get titleHint(): string | undefined {
    return this._data.titleHint;
  }
  
  get keyTerms(): string[] | undefined {
    return this._data.keyTerms;
  }
  
  get createdAt(): Date {
    return this._data.createdAt;
  }
  
  get metadata(): Record<string, unknown> {
    return this._data.metadata || {};
  }
  
  /**
   * Get the complete data object
   * Useful for persistence or serialization
   */
  toData(): ConceptCandidateData {
    return { ...this._data };
  }
  
  // =============================================================================
  // DOMAIN OPERATIONS
  // =============================================================================
  
  /**
   * Create enhanced version with LLM-extracted fields
   * Returns new instance - original is immutable
   */
  enhance(
    title: string,
    keyTerms: string[] = [],
    additionalMetadata: Record<string, unknown> = {}
  ): ConceptCandidate {
    if (title.length === 0 || title.length > 100) {
      throw new ValidationError(
        'EnhancedCandidate',
        ['Title must be 1-100 characters'],
        { title, candidateId: this.id }
      );
    }
    
    const enhancedData: ConceptCandidateData = {
      ...this._data,
      titleHint: title,
      keyTerms: keyTerms.filter(term => term.length > 0),
      metadata: {
        ...this._data.metadata,
        enhanced: true,
        enhancedAt: new Date(),
        ...additionalMetadata
      }
    };
    
    return new ConceptCandidate(enhancedData);
  }
  
  /**
   * Check if this candidate has same content as another
   * Uses content hash for efficient comparison
   */
  hasSameContent(other: ConceptCandidate): boolean {
    return this.contentHash === other.contentHash;
  }
  
  /**
   * Check if this candidate is from the same source
   */
  isSameSource(other: ConceptCandidate): boolean {
    return (
      this.source.window === other.source.window &&
      this.source.topic === other.source.topic &&
      this.batchId === other.batchId
    );
  }
  
  /**
   * Get text for embedding generation
   * Uses title hint if available, otherwise normalized text
   */
  getTextForEmbedding(): string {
    if (this.titleHint) {
      // Combine title and first part of text for better context
      const textPreview = this.normalizedText.substring(0, 200);
      return `${this.titleHint}\n\n${textPreview}`;
    }
    
    return this.normalizedText;
  }
  
  /**
   * Get display summary for UI
   */
  getSummary(): string {
    const maxLength = 150;
    const text = this.titleHint || this.normalizedText;
    
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * Check if candidate is enhanced with LLM data
   */
  isEnhanced(): boolean {
    return !!(this.titleHint && this.keyTerms);
  }
  
  /**
   * Get quality score from metadata
   */
  getQualityScore(): number {
    const quality = this.metadata.quality as ContentQualityResult | undefined;
    return quality?.score ?? 0;
  }
  
  // =============================================================================
  // UTILITY METHODS
  // =============================================================================
  
  /**
   * Serialize for JSON storage
   */
  toJSON(): ConceptCandidateData {
    return this.toData();
  }
  
  /**
   * Create human-readable string representation
   */
  toString(): string {
    return `ConceptCandidate(id=${this.id}, source=${this.source.topic}/${this.source.window})`;
  }
  
  /**
   * Compare candidates for sorting
   * Orders by creation time, then by quality score
   */
  compareTo(other: ConceptCandidate): number {
    // First compare by creation time (newer first)
    const timeCompare = other.createdAt.getTime() - this.createdAt.getTime();
    if (timeCompare !== 0) {
      return timeCompare;
    }
    
    // Then by quality score (higher first)
    const thisQuality = this.getQualityScore();
    const otherQuality = other.getQualityScore();
    return otherQuality - thisQuality;
  }
  
  /**
   * Create a copy with updated metadata
   * Useful for adding processing information
   */
  withMetadata(additionalMetadata: Record<string, unknown>): ConceptCandidate {
    const updatedData: ConceptCandidateData = {
      ...this._data,
      metadata: {
        ...this._data.metadata,
        ...additionalMetadata
      }
    };
    
    return new ConceptCandidate(updatedData);
  }
}

// =============================================================================
// DEFAULT IMPLEMENTATIONS
// =============================================================================

/**
 * Basic text normalizer implementation
 * Handles common OCR cleanup tasks
 */
export class BasicTextNormalizer implements ITextNormalizer {
  normalize(text: string): string {
    return text
      // Fix common OCR issues
      .replace(/\s+/g, ' ')           // Multiple spaces to single
      .replace(/\n\s*\n/g, '\n')      // Multiple newlines to single
      .replace(/([a-z])-\s*\n([a-z])/gi, '$1$2') // Fix hyphenated words
      
      // Clean up formatting
      .replace(/^\s+|\s+$/g, '')      // Trim whitespace
      .replace(/\t/g, ' ')            // Tabs to spaces
      
      // Fix encoding issues
      .replace(/â€™/g, "'")           // Smart quotes
      .replace(/â€œ/g, '"')           // Opening quote  
      .replace(/â€\x9D/g, '"')        // Closing quote
      
      // Normalize punctuation spacing
      .replace(/\s*([.!?])\s*/g, '$1 ')
      .replace(/\s*([,;:])\s*/g, '$1 ')
      
      // Final cleanup
      .trim();
  }
  
  computeQuality(text: string): number {
    if (text.length === 0) return 0;
    
    let score = 0.5; // Base score
    
    // Length scoring
    if (text.length > 50) score += 0.2;
    if (text.length > 200) score += 0.1;
    
    // Word count scoring  
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 5) score += 0.1;
    if (wordCount > 20) score += 0.1;
    
    // Sentence structure
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 1) score += 0.1;
    
    // Penalty for low complexity
    const uniqueWords = new Set(text.toLowerCase().split(/\s+/)).size;
    const repetition = wordCount / uniqueWords;
    if (repetition > 3) score -= 0.2;
    
    return Math.max(0, Math.min(1, score));
  }
}

/**
 * Basic content quality assessor
 * Applies configured rules to determine content quality
 */
export class BasicContentQualityAssessor implements IContentQualityAssessor {
  assess(text: string, config: CandidateValidationConfig): ContentQualityResult {
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    const characterCount = text.length;
    const reasons: string[] = [];
    
    // Check banned patterns
    for (const pattern of config.bannedPatterns) {
      if (pattern.test(text)) {
        reasons.push(`Matches banned pattern: ${pattern.source}`);
      }
    }
    
    // Check minimum lengths
    if (characterCount < config.minTextLength) {
      reasons.push(`Too short: ${characterCount} < ${config.minTextLength} characters`);
    }
    
    if (wordCount < config.minWordCount) {
      reasons.push(`Too few words: ${wordCount} < ${config.minWordCount} words`);
    }
    
    // Check maximum length
    if (characterCount > config.maxTextLength) {
      reasons.push(`Too long: ${characterCount} > ${config.maxTextLength} characters`);
    }
    
    // Compute quality score
    const normalizer = new BasicTextNormalizer();
    const score = normalizer.computeQuality(text);
    
    if (score < config.minQualityScore) {
      reasons.push(`Low quality score: ${score.toFixed(2)} < ${config.minQualityScore}`);
    }
    
    const sufficient = reasons.length === 0 && 
                      characterCount >= config.minTextLength &&
                      wordCount >= config.minWordCount &&
                      score >= config.minQualityScore;
    
    return {
      score,
      sufficient,
      reasons,
      wordCount,
      characterCount
    };
  }
}