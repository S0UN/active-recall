/**
 * IDuplicateCleanupService - Two-layer duplicate management system
 * 
 * Implements the two-layer duplicate management strategy from the Enhanced Smart Trigger System:
 * Layer 1: Immediate prevention during concept ingestion
 * Layer 2: LLM-powered cleanup during folder expansion
 * 
 * Core responsibilities:
 * - Prevent duplicates during concept routing
 * - Detect semantic duplicates using vector similarity
 * - Clean up duplicates during folder expansion
 * - Merge similar concepts into unified artifacts
 */

import { ConceptCandidate, ConceptArtifact, VectorEmbeddings } from '../contracts/schemas';

/**
 * Result of duplicate check
 */
export interface DuplicateCheck {
  isDuplicate: boolean;
  type?: 'exact' | 'semantic';
  existingId?: string;
  similarity?: number;
  confidence: number;
}

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  duplicatesRemoved: number;
  conceptsMerged: number;
  mergedConcepts: MergedConcept[];
  tokensUsed: number;
  success: boolean;
  errors: string[];
}

/**
 * Information about merged concept
 */
export interface MergedConcept {
  newConceptId: string;
  mergedFromIds: string[];
  title: string;
  summary: string;
  confidence: number;
}

/**
 * Result of concept merge operation
 */
export interface MergeResult {
  mergedConceptId: string;
  originalConceptIds: string[];
  mergedTitle: string;
  mergedSummary: string;
  success: boolean;
  error?: string;
}

/**
 * Configuration for duplicate detection
 */
export interface DuplicateDetectionConfig {
  // Similarity thresholds
  exactDuplicateThreshold: number;      // 1.0 - content hash match
  semanticDuplicateThreshold: number;   // 0.95 - vector similarity
  mergeRecommendationThreshold: number; // 0.90 - suggest merging
  
  // Processing limits
  maxDuplicatesPerBatch: number;        // 10 - limit batch processing
  enableLLMCleanup: boolean;           // Feature flag
  
  // Vector search parameters
  searchLimit: number;                  // 50 - max concepts to compare against
  searchThreshold: number;              // 0.85 - minimum similarity to consider
}

/**
 * Statistics about duplicate detection
 */
export interface DuplicateStats {
  totalChecksPerformed: number;
  exactDuplicatesFound: number;
  semanticDuplicatesFound: number;
  conceptsMerged: number;
  averageProcessingTime: number;        // in milliseconds
  lastCleanupRun: Date;
}

/**
 * Main interface for duplicate cleanup service
 */
export interface IDuplicateCleanupService {
  /**
   * Layer 1: Check for duplicates during concept ingestion
   * Prevents duplicates from entering the system
   * @param concept - Concept candidate to check
   * @param embeddings - Vector embeddings for similarity search
   * @returns Promise<DuplicateCheck> - Duplicate detection result
   */
  checkDuplicate(
    concept: ConceptCandidate,
    embeddings: VectorEmbeddings
  ): Promise<DuplicateCheck>;

  /**
   * Layer 2: Clean up duplicates during folder expansion
   * Uses LLM to identify and merge duplicate concepts
   * @param folderId - Folder to clean up
   * @returns Promise<CleanupResult> - Cleanup operation result
   */
  cleanupDuringExpansion(folderId: string): Promise<CleanupResult>;

  /**
   * Merge multiple concepts into a single unified concept
   * @param conceptIds - IDs of concepts to merge
   * @param mergedTitle - Optional custom title for merged concept
   * @param mergedSummary - Optional custom summary for merged concept
   * @returns Promise<MergeResult> - Merge operation result
   */
  mergeConcepts(
    conceptIds: string[],
    mergedTitle?: string,
    mergedSummary?: string
  ): Promise<MergeResult>;

  /**
   * Identify potential duplicates in a batch of concepts
   * @param concepts - Concepts to analyze for duplicates
   * @returns Promise<ConceptGroup[]> - Groups of potential duplicates
   */
  identifyPotentialDuplicates(concepts: ConceptArtifact[]): Promise<ConceptGroup[]>;

  /**
   * Get duplicate detection statistics
   * @returns Promise<DuplicateStats> - Current statistics
   */
  getStats(): Promise<DuplicateStats>;

  /**
   * Update duplicate detection configuration
   * @param config - New configuration settings
   * @returns Promise<void>
   */
  updateConfig(config: Partial<DuplicateDetectionConfig>): Promise<void>;
}

/**
 * Group of concepts that might be duplicates
 */
export interface ConceptGroup {
  concepts: ConceptArtifact[];
  averageSimilarity: number;
  maxSimilarity: number;
  recommendedAction: 'merge' | 'keep_separate' | 'manual_review';
  confidence: number;
}

/**
 * Errors that can occur during duplicate cleanup
 */
export class DuplicateCleanupError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: Error
  ) {
    super(`Duplicate cleanup failed during ${operation}: ${message}`);
    this.name = 'DuplicateCleanupError';
  }
}

export class DuplicateMergeError extends DuplicateCleanupError {
  constructor(conceptIds: string[], reason: string) {
    super('merge', `Failed to merge concepts [${conceptIds.join(', ')}]: ${reason}`);
    this.name = 'DuplicateMergeError';
  }
}

export class DuplicateDetectionError extends DuplicateCleanupError {
  constructor(conceptId: string, reason: string) {
    super('detection', `Failed to check duplicates for concept ${conceptId}: ${reason}`);
    this.name = 'DuplicateDetectionError';
  }
}