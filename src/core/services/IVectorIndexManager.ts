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
}

/**
 * Options for upserting concept vectors
 */
export interface UpsertConceptOptions {
  conceptId: string;
  embeddings: VectorEmbeddings;
  folderId?: string;
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
   * Get all context vectors for concepts in a folder
   * Used by clustering services for analysis
   * @param folderId - Folder to retrieve vectors from
   */
  getFolderMembers(folderId: string): Promise<{ conceptId: string; vector: number[] }[]>;

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