/**
 * Repository Interface Contracts
 * 
 * Defines standard interfaces for data persistence operations.
 * All implementations must satisfy these contracts.
 */

import { ConceptArtifact, FolderManifest, Batch } from './schemas';
import { FolderPath } from '../domain/FolderPath';

/**
 * Repository interface for ConceptArtifact storage and retrieval
 */
export interface IConceptArtifactRepository {
  /**
   * Save a concept artifact to storage
   * Must be idempotent - saving the same artifact multiple times should succeed
   */
  save(artifact: ConceptArtifact): Promise<void>;

  /**
   * Find an artifact by its unique ID
   * Returns null if not found
   */
  findById(id: string): Promise<ConceptArtifact | null>;

  /**
   * Find all artifacts in a specific folder path
   * Returns empty array if folder doesn't exist or has no artifacts
   */
  findByPath(path: FolderPath): Promise<ConceptArtifact[]>;

  /**
   * Check if an artifact exists by ID
   * More efficient than findById when only existence matters
   */
  exists(id: string): Promise<boolean>;

  /**
   * Find artifacts by their candidate IDs
   * Useful for deduplication checks
   */
  findByCandidateId(candidateId: string): Promise<ConceptArtifact | null>;

  /**
   * Find artifacts by content hash
   * Used for exact duplicate detection
   */
  findByContentHash(contentHash: string): Promise<ConceptArtifact[]>;

  /**
   * Update the folder path for an artifact
   * Used during rename/move operations
   */
  updatePath(artifactId: string, newPath: FolderPath): Promise<void>;

  /**
   * Delete an artifact by ID
   * Should be idempotent - deleting non-existent artifact should succeed
   */
  delete(artifactId: string): Promise<void>;

  /**
   * Count total artifacts in storage
   */
  count(): Promise<number>;

  /**
   * Count artifacts in a specific path
   */
  countByPath(path: FolderPath): Promise<number>;
}

/**
 * Repository interface for FolderManifest storage and management
 */
export interface IFolderRepository {
  /**
   * Create a new folder with its manifest
   * Should fail if folder already exists
   */
  create(path: FolderPath, manifest: FolderManifest): Promise<void>;

  /**
   * Find a folder manifest by path
   * Returns null if folder doesn't exist
   */
  findByPath(path: FolderPath): Promise<FolderManifest | null>;

  /**
   * Update folder manifest with partial changes
   * Merges provided updates with existing manifest
   */
  updateManifest(path: FolderPath, updates: Partial<FolderManifest>): Promise<void>;

  /**
   * List immediate children of a folder
   * Returns empty array if no children exist
   */
  listChildren(path: FolderPath): Promise<FolderManifest[]>;

  /**
   * List all descendants (recursive children) of a folder
   */
  listDescendants(path: FolderPath): Promise<FolderManifest[]>;

  /**
   * Rename a folder from old path to new path
   * Must update all child paths and maintain referential integrity
   */
  rename(oldPath: FolderPath, newPath: FolderPath): Promise<void>;

  /**
   * Delete a folder and all its children
   * Should be atomic - either all succeed or all fail
   */
  delete(path: FolderPath): Promise<void>;

  /**
   * Check if a folder exists
   */
  exists(path: FolderPath): Promise<boolean>;

  /**
   * Find all provisional folders
   * Used by rename jobs to find folders needing proper names
   */
  findProvisional(): Promise<FolderManifest[]>;

  /**
   * Find folders with artifact count below threshold
   * Used by tidy jobs to find merge candidates
   */
  findSmall(maxArtifacts: number): Promise<FolderManifest[]>;

  /**
   * Find folders with artifact count above threshold
   * Used by tidy jobs to find split candidates
   */
  findLarge(minArtifacts: number): Promise<FolderManifest[]>;

  /**
   * Get the complete folder tree structure
   */
  getTreeStructure(): Promise<FolderTree>;

  /**
   * Update folder statistics (artifact count, size, etc.)
   */
  updateStats(path: FolderPath, stats: Partial<FolderStats>): Promise<void>;
}

/**
 * Repository interface for Batch storage and retrieval
 */
export interface IBatchRepository {
  /**
   * Save a batch to storage
   * Must be idempotent
   */
  save(batch: Batch): Promise<void>;

  /**
   * Find a batch by its ID
   */
  findById(batchId: string): Promise<Batch | null>;

  /**
   * Find batches by session ID
   */
  findBySessionId(sessionId: string): Promise<Batch[]>;

  /**
   * Find batches within a time range
   */
  findByTimeRange(startTime: Date, endTime: Date): Promise<Batch[]>;

  /**
   * Find batches by topic
   */
  findByTopic(topic: string): Promise<Batch[]>;

  /**
   * Count total batches
   */
  count(): Promise<number>;

  /**
   * Delete batches older than specified date
   */
  deleteOlderThan(cutoffDate: Date): Promise<number>;
}

/**
 * Supporting types for repository operations
 */
export interface FolderStats {
  artifactCount: number;
  lastUpdated: Date;
  size: number;
  avgConfidence?: number;
  variance?: number;
}

export interface FolderTree {
  path: string;
  name: string;
  children: FolderTree[];
  stats: FolderStats;
  provisional: boolean;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

/**
 * Base repository error types
 */
export class RepositoryError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends RepositoryError {
  constructor(resource: string, id: string) {
    super(`${resource} already exists: ${id}`);
    this.name = 'ConflictError';
  }
}

export class IntegrityError extends RepositoryError {
  constructor(message: string) {
    super(`Data integrity violation: ${message}`);
    this.name = 'IntegrityError';
  }
}