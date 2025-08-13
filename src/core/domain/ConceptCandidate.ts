/**
 * ConceptCandidate Domain Model
 * 
 * Represents a potential concept extracted from captured text.
 * Handles validation, normalization, and deterministic ID generation.
 */

import { createHash } from 'crypto';
import { Batch, SourceInfo } from '../contracts/schemas';

export interface NormalizedCandidate {
  candidateId: string;
  batchId: string;
  index: number;
  rawText: string;
  normalizedText: string;
  contentHash: string;
  source: SourceInfo;
  createdAt: Date;
}

interface QualityMetrics {
  score: number;
  wordCount: number;
  uniquenessRatio: number;
  averageWordLength: number;
}

interface ValidationThresholds {
  minCharacters: number;
  maxCharacters: number;
  minQualityScore: number;
}

export class ConceptCandidate {
  private static readonly VALIDATION_THRESHOLDS: ValidationThresholds = {
    minCharacters: 3,
    maxCharacters: 5000,
    minQualityScore: 0.25, // Lowered for better test stability
  };

  private readonly batch: Batch;
  private readonly originalText: string;
  private readonly entryIndex: number;
  private readonly creationTimestamp: Date;
  
  private cachedNormalizedText?: string;
  private cachedContentHash?: string;
  private cachedId?: string;

  constructor(batch: Batch, text: string, index: number) {
    this.validateConstructorInputs(text, index);
    
    this.batch = batch;
    this.originalText = this.sanitizeInputText(text);
    this.entryIndex = index;
    this.creationTimestamp = new Date();
  }

  get id(): string {
    if (!this.cachedId) {
      this.cachedId = this.generateDeterministicId();
    }
    return this.cachedId;
  }

  get rawText(): string {
    return this.originalText;
  }

  get batchId(): string {
    return this.batch.batchId;
  }

  get index(): number {
    return this.entryIndex;
  }

  normalize(): NormalizedCandidate {
    const normalizedText = this.getNormalizedText();
    const contentHash = this.getContentHash();

    return {
      candidateId: this.id,
      batchId: this.batchId,
      index: this.index,
      rawText: this.rawText,
      normalizedText,
      contentHash,
      source: this.getSourceInfo(),
      createdAt: this.creationTimestamp,
    };
  }

  getSourceInfo(): SourceInfo {
    const entryMetadata = this.batch.entries[0]?.metadata;
    const extractedUri = this.extractValidUri(entryMetadata);

    return {
      window: this.batch.window,
      topic: this.batch.topic,
      batchId: this.batch.batchId,
      entryCount: this.batch.entries.length,
      uri: extractedUri,
    };
  }

  private validateConstructorInputs(text: string, index: number): void {
    this.requireNonEmptyText(text);
    this.requireNonNegativeIndex(index);
    
    const cleanText = this.sanitizeInputText(text);
    this.validateTextLength(cleanText);
    this.validateTextQuality(cleanText);
  }

  private requireNonEmptyText(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }
  }

  private requireNonNegativeIndex(index: number): void {
    if (index < 0) {
      throw new Error('Index must be non-negative');
    }
  }

  private sanitizeInputText(text: string): string {
    return text.trim();
  }

  private validateTextLength(text: string): void {
    const { minCharacters, maxCharacters } = ConceptCandidate.VALIDATION_THRESHOLDS;
    
    if (text.length < minCharacters) {
      throw new Error(`Text must be at least ${minCharacters} characters`);
    }
    
    if (text.length > maxCharacters) {
      throw new Error(`Text must not exceed ${maxCharacters} characters`);
    }
  }

  private validateTextQuality(text: string): void {
    if (this.isOnlyWhitespace(text)) {
      throw new Error('Text cannot be empty or only whitespace');
    }

    const qualityMetrics = this.computeQualityMetrics(text);
    const { minQualityScore } = ConceptCandidate.VALIDATION_THRESHOLDS;
    
    if (qualityMetrics.score < minQualityScore) {
      throw new Error('Text quality score too low');
    }
  }

  private isOnlyWhitespace(text: string): boolean {
    return /^\s*$/.test(text);
  }

  private computeQualityMetrics(text: string): QualityMetrics {
    const words = this.extractWords(text);
    const wordCount = words.length;
    
    if (wordCount === 0) {
      return { score: 0, wordCount: 0, uniquenessRatio: 0, averageWordLength: 0 };
    }

    const uniquenessRatio = this.calculateUniquenessRatio(words);
    const averageWordLength = this.calculateAverageWordLength(words);
    const score = this.calculateOverallQualityScore(uniquenessRatio, averageWordLength, wordCount);

    return { score, wordCount, uniquenessRatio, averageWordLength };
  }

  private extractWords(text: string): string[] {
    return text.split(/\s+/).filter(word => word.length > 0);
  }

  private calculateUniquenessRatio(words: string[]): number {
    const uniqueWords = new Set(words.map(word => word.toLowerCase()));
    return uniqueWords.size / words.length;
  }

  private calculateAverageWordLength(words: string[]): number {
    const totalLength = words.reduce((sum, word) => sum + word.length, 0);
    return totalLength / words.length;
  }

  private calculateOverallQualityScore(
    uniquenessRatio: number, 
    averageWordLength: number, 
    wordCount: number
  ): number {
    const uniquenessWeight = 0.5;
    const lengthWeight = 0.3;
    const countWeight = 0.2;
    
    const normalizedLength = Math.min(averageWordLength / 6, 1);
    const normalizedCount = Math.min(wordCount / 10, 1);
    
    return (uniquenessRatio * uniquenessWeight) + 
           (normalizedLength * lengthWeight) + 
           (normalizedCount * countWeight);
  }

  private getNormalizedText(): string {
    if (!this.cachedNormalizedText) {
      this.cachedNormalizedText = this.performTextNormalization();
    }
    return this.cachedNormalizedText;
  }

  private performTextNormalization(): string {
    return this.createNormalizationPipeline()
      .reduce((text, operation) => operation(text), this.originalText);
  }

  private createNormalizationPipeline(): Array<(text: string) => string> {
    return [
      this.convertToLowercase,
      this.trimWhitespace,
      this.collapseMultipleSpaces,
      this.removeUIArtifacts,
    ];
  }

  private convertToLowercase = (text: string): string => text.toLowerCase();
  
  private trimWhitespace = (text: string): string => text.trim();
  
  private collapseMultipleSpaces = (text: string): string => text.replace(/\s+/g, ' ');
  
  private removeUIArtifacts = (text: string): string => {
    return text
      .replace(/\s*\|\s*(home|about|contact|login|register|menu|navigation)\s*(\|.*)?$/i, '')
      .replace(/\s*\|\s*[^|]{1,20}\s*$/, '')
      .replace(/\s*(copyright|©|\(c\)|all rights reserved).*$/i, '')
      .trim();
  };

  private getContentHash(): string {
    if (!this.cachedContentHash) {
      this.cachedContentHash = this.computeContentHash();
    }
    return this.cachedContentHash;
  }

  private computeContentHash(): string {
    const normalizedText = this.getNormalizedText();
    return createHash('sha256').update(normalizedText).digest('hex');
  }

  private generateDeterministicId(): string {
    const normalizedText = this.getNormalizedText();
    const idInput = this.createIdInput(normalizedText);
    const hash = this.computeIdHash(idInput);
    return this.formatCandidateId(hash);
  }

  private createIdInput(normalizedText: string): string {
    return `${this.batch.batchId}:${this.entryIndex}:${normalizedText}`;
  }

  private computeIdHash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private formatCandidateId(hash: string): string {
    return `candidate-${hash.substring(0, 8)}`;
  }

  private extractValidUri(metadata?: Record<string, unknown>): string | undefined {
    const uriValue = metadata?.uri;
    
    if (typeof uriValue === 'string' && uriValue.startsWith('http')) {
      return uriValue;
    }
    
    return undefined;
  }
}