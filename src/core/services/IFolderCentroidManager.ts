/**
 * IFolderCentroidManager - Intelligent Folder Vector Management
 * 
 * This service manages folder centroids and exemplars for the intelligent folder system.
 * It provides vector-based context filtering to prevent LLM overload and enables
 * discovery of cross-folder relationships through semantic similarity.
 * 
 * Key Features:
 * - Automatic centroid calculation and updates
 * - Exemplar selection for folder representation
 * - Similarity-based folder ranking for context filtering
 * - Progressive centroid refinement as folders grow
 * - Efficient batch operations for system-wide updates
 * 
 * Architecture:
 * - Works with IVectorIndexManager for storage
 * - Integrates with IIntelligentFolderService for routing
 * - Supports incremental updates for performance
 */

import { VectorEmbeddings } from '../contracts/schemas';

/**
 * Folder centroid with metadata
 */
export interface FolderCentroid {
  folderId: string;
  centroid: number[];
  exemplars: number[][];
  memberCount: number;
  lastUpdated: Date;
  quality: CentroidQuality;
  domain?: string;
  academicLevel?: string;
}

/**
 * Centroid quality metrics
 */
export interface CentroidQuality {
  /** Cohesion score - how similar are concepts within folder (0-1) */
  cohesion: number;
  
  /** Separation score - how distinct from other folders (0-1) */
  separation: number;
  
  /** Stability score - how stable over recent updates (0-1) */
  stability: number;
  
  /** Overall quality score (0-1) */
  overall: number;
}

/**
 * Folder similarity result
 */
export interface FolderSimilarity {
  folderId: string;
  similarity: number;
  centroidSimilarity: number;
  exemplarSimilarity: number;
  memberCount: number;
  path?: string;
  domain?: string;
}

/**
 * Context filtering result
 */
export interface FilteredFolderContext {
  /** Most relevant folders for LLM context */
  relevantFolders: FolderContextInfo[];
  
  /** Total folders considered */
  totalFolders: number;
  
  /** Filtering method used */
  filteringMethod: 'similarity' | 'hybrid' | 'academic_hierarchy';
  
  /** Estimated token usage */
  estimatedTokens: number;
}

/**
 * Folder context information
 */
export interface FolderContextInfo {
  folderId: string;
  name: string;
  path: string;
  similarity: number;
  conceptCount: number;
  sampleConcepts: ConceptSample[];
  centroidQuality: CentroidQuality;
}

/**
 * Concept sample for context
 */
export interface ConceptSample {
  conceptId: string;
  title: string;
  summary: string;
  similarity: number;
}

/**
 * Centroid update request
 */
export interface CentroidUpdateRequest {
  folderId: string;
  newConcepts?: Array<{
    conceptId: string;
    embeddings: VectorEmbeddings;
  }>;
  removedConcepts?: string[];
  forceRecalculation?: boolean;
}

/**
 * Batch centroid update result
 */
export interface BatchCentroidUpdate {
  updated: string[];
  failed: Array<{
    folderId: string;
    error: string;
  }>;
  totalTime: number;
  averageQuality: number;
}

/**
 * Exemplar selection strategy
 */
export type ExemplarStrategy = 
  | 'diverse'      // Maximize coverage of concept space
  | 'boundary'     // Select boundary points
  | 'medoid'       // Select most central points
  | 'hybrid';      // Combination of strategies

/**
 * Main interface for folder centroid management
 */
export interface IFolderCentroidManager {
  /**
   * Calculate or update folder centroid
   * 
   * Computes the centroid (average vector) for all concepts in a folder.
   * Uses incremental updates when possible for performance.
   * 
   * @param request - Update parameters
   * @returns Promise<FolderCentroid> - Updated centroid with metadata
   */
  updateFolderCentroid(request: CentroidUpdateRequest): Promise<FolderCentroid>;

  /**
   * Batch update multiple folder centroids
   * 
   * Efficiently updates centroids for multiple folders in parallel.
   * Used during reorganization or system maintenance.
   * 
   * @param folderIds - Folders to update
   * @param forceRecalculation - Force full recalculation
   * @returns Promise<BatchCentroidUpdate> - Update results
   */
  batchUpdateCentroids(
    folderIds: string[],
    forceRecalculation?: boolean
  ): Promise<BatchCentroidUpdate>;

  /**
   * Get folder centroid with quality metrics
   * 
   * @param folderId - Target folder
   * @returns Promise<FolderCentroid | null> - Centroid with metadata
   */
  getFolderCentroid(folderId: string): Promise<FolderCentroid | null>;

  /**
   * Find similar folders using centroid similarity
   * 
   * Core method for context filtering. Finds folders most similar
   * to a given concept vector for intelligent LLM context building.
   * 
   * @param vector - Concept embedding vector
   * @param limit - Maximum folders to return
   * @param threshold - Minimum similarity threshold
   * @returns Promise<FolderSimilarity[]> - Ranked similar folders
   */
  findSimilarFolders(
    vector: number[],
    limit?: number,
    threshold?: number
  ): Promise<FolderSimilarity[]>;

  /**
   * Filter folder context for LLM
   * 
   * Intelligently selects most relevant folders to include in LLM
   * context while staying within token budget.
   * 
   * @param conceptVector - Current concept vector
   * @param maxTokens - Token budget for context
   * @param systemState - Current system state (bootstrap/growing/mature)
   * @returns Promise<FilteredFolderContext> - Filtered context
   */
  filterFolderContext(
    conceptVector: number[],
    maxTokens: number,
    systemState: 'bootstrap' | 'growing' | 'mature'
  ): Promise<FilteredFolderContext>;

  /**
   * Select exemplars for a folder
   * 
   * Chooses representative concepts that best characterize the folder.
   * Used for efficient similarity comparisons and context building.
   * 
   * @param folderId - Target folder
   * @param count - Number of exemplars to select
   * @param strategy - Selection strategy
   * @returns Promise<Array<{conceptId: string; vector: number[]}>> - Selected exemplars
   */
  selectFolderExemplars(
    folderId: string,
    count?: number,
    strategy?: ExemplarStrategy
  ): Promise<Array<{conceptId: string; vector: number[]}>>;

  /**
   * Calculate centroid quality metrics
   * 
   * Evaluates how well a centroid represents its folder.
   * 
   * @param folderId - Target folder
   * @returns Promise<CentroidQuality> - Quality metrics
   */
  calculateCentroidQuality(folderId: string): Promise<CentroidQuality>;

  /**
   * Find folders needing centroid updates
   * 
   * Identifies folders with stale or low-quality centroids.
   * 
   * @param staleDays - Days since last update
   * @param qualityThreshold - Minimum quality score
   * @returns Promise<string[]> - Folder IDs needing updates
   */
  findStalecentroids(
    staleDays?: number,
    qualityThreshold?: number
  ): Promise<string[]>;

  /**
   * Calculate inter-folder similarity matrix
   * 
   * Computes pairwise similarities between all folder centroids.
   * Used for detecting redundant folders and reorganization opportunities.
   * 
   * @param folderIds - Folders to compare (all if not specified)
   * @returns Promise<Map<string, Map<string, number>>> - Similarity matrix
   */
  calculateFolderSimilarityMatrix(
    folderIds?: string[]
  ): Promise<Map<string, Map<string, number>>>;

  /**
   * Detect redundant or overlapping folders
   * 
   * Finds folders with high centroid similarity that might be merged.
   * 
   * @param similarityThreshold - Threshold for considering redundant
   * @returns Promise<Array<{folder1: string; folder2: string; similarity: number}>>
   */
  detectRedundantFolders(
    similarityThreshold?: number
  ): Promise<Array<{folder1: string; folder2: string; similarity: number}>>;

  /**
   * Initialize centroids for new system
   * 
   * Bootstrap centroids when system is first set up or reset.
   * 
   * @param folders - Initial folder structure
   * @returns Promise<BatchCentroidUpdate> - Initialization results
   */
  initializeCentroids(
    folders: Array<{folderId: string; conceptIds: string[]}>
  ): Promise<BatchCentroidUpdate>;

  /**
   * Get centroid statistics
   * 
   * @returns Promise<CentroidStatistics> - System-wide statistics
   */
  getStatistics(): Promise<CentroidStatistics>;
}

/**
 * System-wide centroid statistics
 */
export interface CentroidStatistics {
  totalFolders: number;
  foldersWithCentroids: number;
  averageQuality: number;
  averageCohesion: number;
  averageSeparation: number;
  lastUpdateTime: Date;
  staleCount: number;
}

/**
 * Configuration for centroid manager
 */
export interface CentroidManagerConfig {
  /** Exemplar selection settings */
  defaultExemplarCount: number;
  exemplarStrategy: ExemplarStrategy;
  
  /** Quality thresholds */
  minimumCohesion: number;
  minimumSeparation: number;
  staleThresholdDays: number;
  
  /** Performance settings */
  batchSize: number;
  parallelUpdates: number;
  incrementalUpdateThreshold: number; // Use incremental if < this many changes
  
  /** Context filtering */
  maxContextFolders: number;
  minFolderSimilarity: number;
  tokenEstimatePerFolder: number;
  
  /** Similarity calculation */
  similarityMetric: 'cosine' | 'euclidean' | 'dot';
  exemplarWeight: number; // Weight of exemplar similarity vs centroid
}

/**
 * Error hierarchy for centroid operations
 */

/**
 * Base error for centroid operations
 */
export class CentroidError extends Error {
  constructor(
    message: string,
    public readonly folderId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CentroidError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CentroidError);
    }
  }
}

/**
 * Insufficient data for centroid calculation
 */
export class InsufficientDataError extends CentroidError {
  constructor(folderId: string, conceptCount: number, required: number) {
    super(
      `Insufficient concepts for centroid: ${conceptCount} < ${required}`,
      folderId
    );
    this.name = 'InsufficientDataError';
  }
}

/**
 * Centroid calculation error
 */
export class CentroidCalculationError extends CentroidError {
  constructor(folderId: string, reason: string, cause?: Error) {
    super(`Failed to calculate centroid: ${reason}`, folderId, cause);
    this.name = 'CentroidCalculationError';
  }
}

/**
 * Context filtering error
 */
export class ContextFilteringError extends CentroidError {
  constructor(reason: string, cause?: Error) {
    super(`Context filtering failed: ${reason}`, undefined, cause);
    this.name = 'ContextFilteringError';
  }
}