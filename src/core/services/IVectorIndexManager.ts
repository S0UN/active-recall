/**
 * IVectorIndexManager - Vector storage and search primitives
 * 
 * This service implements vector storage for the ROUTE step of our pipeline:
 * ConceptCandidate → DISTILL → EMBED → ROUTE (vector search)
 * 
 * Responsibilities:
 * - Store concept vectors in vector database (Qdrant)
 * - Perform similarity searches for routing decisions
 * - Manage folder centroids and exemplars
 * - NO clustering/policy logic - pure storage primitives
 */

import { VectorEmbeddings } from '../contracts/schemas';

/**
 * Vector search result for concept similarity
 */
export interface SimilarConcept {
  conceptId: string;
  similarity: number;
  folderId?: string;
  isPrimary?: boolean; // NEW: Indicates if this folder is the primary location
  metadata?: Record<string, any>;
}

/**
 * Folder representation with vectors
 */
export interface FolderVectorData {
  folderId: string;
  centroid: number[];
  exemplars: number[][];
  memberCount: number;
  lastUpdated: Date;
}

/**
 * Options for vector search operations
 */
export interface VectorSearchOptions {
  vector: number[];
  threshold: number;
  limit?: number;
  filterByFolder?: string;
}

/**
 * Multi-folder placement information
 */
export interface MultiFolderPlacement {
  primary: string;
  references: string[];
  confidences: Record<string, number>;
}

/**
 * Options for upserting concept vectors
 */
export interface UpsertConceptOptions {
  conceptId: string;
  embeddings: VectorEmbeddings;
  folderId?: string; // Backward compatibility
  placements?: MultiFolderPlacement; // NEW: Multi-folder support
}

/**
 * Interface for vector index management
 * Pure storage and search primitives - no clustering logic
 */
export interface IVectorIndexManager {
  /**
   * Store concept vectors in the index
   */
  upsert(options: UpsertConceptOptions): Promise<void>;

  /**
   * Find similar concepts by title vector (for deduplication)
   */
  searchByTitle(options: VectorSearchOptions): Promise<SimilarConcept[]>;

  /**
   * Find similar concepts by context vector (for routing)
   */
  searchByContext(options: VectorSearchOptions): Promise<SimilarConcept[]>;

  /**
   * Get context vectors for concepts in a folder
   * Used by clustering services for analysis
   * @param folderId - Folder to retrieve vectors from
   * @param limit - Maximum number of members to return
   */
  getFolderMembers(folderId: string, limit?: number): Promise<{ conceptId: string; vector: number[]; confidence?: number }[]>;

  /**
   * Search for concepts by folder (including primary and reference placements)
   * @param folderId - Folder to search in
   * @param includeReferences - Whether to include concepts where this folder is a reference
   */
  searchByFolder(folderId: string, includeReferences?: boolean): Promise<SimilarConcept[]>;

  /**
   * Get all unique folder IDs that have concepts
   */
  getAllFolderIds(): Promise<string[]>;

  /**
   * Update folder centroid vector
   * @param folderId - Folder identifier
   * @param centroid - Average vector for the folder
   */
  setFolderCentroid(folderId: string, centroid: number[]): Promise<void>;

  /**
   * Update folder exemplar vectors
   * @param folderId - Folder identifier
   * @param exemplars - Representative vectors for the folder
   */
  setFolderExemplars(folderId: string, exemplars: number[][]): Promise<void>;

  /**
   * Get folder vector data
   * @param folderId - Folder identifier
   */
  getFolderVectorData(folderId: string): Promise<FolderVectorData | null>;

  /**
   * Remove concept from the index
   * @param conceptId - Concept to remove
   */
  delete(conceptId: string): Promise<void>;

  /**
   * Get vector dimensionality supported by the index
   */
  getDimensions(): number;

  /**
   * Check if the index is ready for operations
   */
  isReady(): Promise<boolean>;
}

/**
 * Configuration for vector index services
 */
export interface VectorIndexConfig {
  provider: 'qdrant' | 'local';
  host?: string;
  port?: number;
  apiKey?: string;
  collectionPrefix?: string;
  dimensions: number;
}

/**
 * Error types for vector index operations
 */
export class VectorIndexError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'VectorIndexError';
  }
}

export class VectorDimensionError extends VectorIndexError {
  constructor(expected: number, actual: number) {
    super(`Vector dimension mismatch: expected ${expected}, got ${actual}`);
    this.name = 'VectorDimensionError';
  }
}

export class VectorIndexConnectionError extends VectorIndexError {
  constructor(message: string) {
    super(message);
    this.name = 'VectorIndexConnectionError';
  }
}