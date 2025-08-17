/**
 * ConceptCandidate domain model
 * 
 * Represents a text snippet that has been extracted from a batch and is being
 * prepared for routing. This class handles normalization, validation, and
 * deterministic ID generation.
 * 
 * Key responsibilities:
 * - Normalize text content for consistent processing
 * - Generate deterministic IDs for idempotency
 * - Validate content quality and constraints
 * - Provide source tracking information
 */

import { createHash } from 'crypto';
import { Batch, SourceInfo } from '../contracts/schemas';
import { loadPipelineConfig, PipelineConfig } from '../config/PipelineConfig';

/**
 * Normalized candidate data returned by normalize()
 */
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

/**
 * ConceptCandidate domain model
 */
export class ConceptCandidate {
	private readonly _batch: Batch;
	private readonly _text: string;
	private readonly _index: number;
	private readonly _createdAt: Date;
	private readonly _config: PipelineConfig;
	private _normalizedText?: string;
	private _contentHash?: string;
	private _id?: string;

	constructor(batch: Batch, text: string, index: number, config?: PipelineConfig) {
		this._config = config || loadPipelineConfig();
		this.validateInput(text, index);
		
		this._batch = batch;
		this._text = text.trim();
		this._index = index;
		this._createdAt = new Date();
	}

	/**
	 * Get the deterministic ID for this candidate
	 */
	get id(): string {
		if (!this._id) {
			this._id = this.computeDeterministicId();
		}
		return this._id;
	}

	/**
	 * Get the original raw text
	 */
	get rawText(): string {
		return this._text;
	}

	/**
	 * Get the batch ID this candidate belongs to
	 */
	get batchId(): string {
		return this._batch.batchId;
	}

	/**
	 * Get the index of this candidate within the batch
	 */
	get index(): number {
		return this._index;
	}

	/**
	 * Normalize the text content and return complete candidate data
	 */
	normalize(): NormalizedCandidate {
		if (!this._normalizedText) {
			this._normalizedText = this.performNormalization();
			this._contentHash = this.computeContentHash(this._normalizedText);
		}

		return {
			candidateId: this.id,
			batchId: this.batchId,
			index: this.index,
			rawText: this.rawText,
			normalizedText: this._normalizedText,
			contentHash: this._contentHash!,
			source: this.getSourceInfo(),
			createdAt: this._createdAt,
		};
	}

	/**
	 * Get source information for tracking
	 */
	getSourceInfo(): SourceInfo {
		// Extract URI from first entry metadata if available
		const uri = this._batch.entries[0]?.metadata?.uri as string | undefined;

		return {
			window: this._batch.window,
			topic: this._batch.topic,
			batchId: this._batch.batchId,
			entryCount: this._batch.entries.length,
			uri: uri?.startsWith('http') ? uri : undefined,
		};
	}

	/**
	 * Validate input parameters
	 */
	private validateInput(text: string, index: number): void {
		this.ensureTextIsNotEmpty(text);
		this.ensureIndexIsValid(index);
		
		const trimmedText = text.trim();
		this.ensureTextMeetsLengthRequirements(trimmedText);
		this.ensureTextHasValidContent(trimmedText);
		this.ensureTextMeetsQualityStandards(trimmedText);
	}

	private ensureTextIsNotEmpty(text: string): void {
		if (!text || text.trim().length === 0) {
			throw new Error('Text cannot be empty');
		}
	}

	private ensureIndexIsValid(index: number): void {
		if (index < 0) {
			throw new Error('Index must be non-negative');
		}
	}

	private ensureTextMeetsLengthRequirements(trimmedText: string): void {
		const minLength = this._config.textValidation.minTextLength;
		const maxLength = this._config.textValidation.maxTextLength;
		
		if (trimmedText.length < minLength) {
			throw new Error(`Text must be at least ${minLength} characters`);
		}

		if (trimmedText.length > maxLength) {
			throw new Error(`Text must not exceed ${maxLength} characters`);
		}
	}

	private ensureTextHasValidContent(trimmedText: string): void {
		if (this.isOnlyWhitespace(trimmedText)) {
			throw new Error('Text cannot be empty or only whitespace');
		}
	}

	private ensureTextMeetsQualityStandards(trimmedText: string): void {
		const minQualityScore = this._config.textValidation.minQualityScore;
		const actualScore = this.getQualityScore(trimmedText);
		
		if (actualScore < minQualityScore) {
			throw new Error(`Text quality score too low: ${actualScore.toFixed(3)} < ${minQualityScore}`);
		}
	}

	/**
	 * Check if text is only whitespace characters
	 */
	private isOnlyWhitespace(text: string): boolean {
		return /^\s*$/.test(text);
	}

	/**
	 * Compute a simple quality score for the text
	 */
	private getQualityScore(text: string): number {
		const words = this.extractValidWords(text);
		
		if (this.hasInsufficientWords(words)) {
			return this.getMinimumQualityScore(words);
		}
		
		const uniqueness = this.calculateWordUniqueness(words);
		const lengthScore = this.calculateAverageWordLengthScore(words);
		
		return this.combineQualityFactors(uniqueness, lengthScore);
	}

	private extractValidWords(text: string): string[] {
		return text.split(/\s+/).filter(word => word.length > 0);
	}

	private hasInsufficientWords(words: string[]): boolean {
		const minWordCount = this._config.textValidation.minWordCount;
		const hasNoWords = words.length === 0;
		const hasTooFewWords = words.length < minWordCount;
		
		return hasNoWords || hasTooFewWords;
	}

	private getMinimumQualityScore(words: string[]): number {
		const noWordsScore = 0;
		const shortTextScore = this._config.textValidation.shortTextQualityScore;
		
		return words.length === 0 ? noWordsScore : shortTextScore;
	}

	private calculateWordUniqueness(words: string[]): number {
		const uniqueWords = new Set(words.map(word => word.toLowerCase()));
		return uniqueWords.size / words.length;
	}

	private calculateAverageWordLengthScore(words: string[]): number {
		const totalLength = words.reduce((sum, word) => sum + word.length, 0);
		const avgWordLength = totalLength / words.length;
		const normalizationFactor = this._config.qualityScore.avgWordLengthNormalization;
		const maxScore = 1;
		
		return Math.min(avgWordLength / normalizationFactor, maxScore);
	}

	private combineQualityFactors(uniqueness: number, lengthScore: number): number {
		const uniquenessWeight = this._config.qualityScore.uniquenessWeight;
		const lengthWeight = this._config.qualityScore.lengthWeight;
		
		return (uniqueness * uniquenessWeight) + (lengthScore * lengthWeight);
	}

	/**
	 * Generate deterministic ID based on batch, index, and normalized text
	 */
	private computeDeterministicId(): string {
		const normalizedText = this.performNormalization();
		const input = this.buildIdInputString(normalizedText);
		const hash = this.generateHashFromInput(input);
		const hashPrefix = this.extractHashPrefix(hash);
		
		return `candidate-${hashPrefix}`;
	}

	private buildIdInputString(normalizedText: string): string {
		const separator = ':';
		return [this._batch.batchId, this._index, normalizedText].join(separator);
	}

	private generateHashFromInput(input: string): string {
		const hashAlgorithm = 'sha256';
		const encoding = 'hex';
		return createHash(hashAlgorithm).update(input).digest(encoding);
	}

	private extractHashPrefix(hash: string): string {
		const prefixLength = 8;
		return hash.substring(0, prefixLength);
	}

	/**
	 * Perform text normalization
	 */
	private performNormalization(): string {
		let normalized = this._text;

		// Convert to lowercase
		normalized = normalized.toLowerCase();

		// Trim whitespace
		normalized = normalized.trim();

		// Replace multiple spaces with single space
		normalized = normalized.replace(/\s+/g, ' ');

		// Remove common UI artifacts (navigation, breadcrumbs)
		normalized = this.removeUIArtifacts(normalized);

		return normalized;
	}

	/**
	 * Remove common UI artifacts from text
	 */
	private removeUIArtifacts(text: string): string {
		// Remove navigation-like patterns
		let cleaned = text;

		// Remove breadcrumb-like patterns: "Home | About | Contact"
		cleaned = cleaned.replace(/\s*\|\s*(home|about|contact|login|register|menu|navigation)\s*(\|.*)?$/i, '');
		
		// Remove trailing navigation patterns
		cleaned = cleaned.replace(/\s*\|\s*[^|]{1,20}\s*$/, '');

		// Remove common footer patterns
		cleaned = cleaned.replace(/\s*(copyright|©|\(c\)|all rights reserved).*$/i, '');

		return cleaned.trim();
	}

	/**
	 * Compute SHA-256 hash of normalized content
	 */
	private computeContentHash(normalizedText: string): string {
		const hashAlgorithm = 'sha256';
		const encoding = 'hex';
		return createHash(hashAlgorithm).update(normalizedText).digest(encoding);
	}
}