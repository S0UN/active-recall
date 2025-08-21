/**
 * IUnifiedFolderContents - Unified API for Folder Content Access
 * 
 * This service provides a unified interface for accessing folder contents,
 * combining local concepts with discovered related content from other folders.
 * It enables the discovery system where concepts can be found from multiple
 * places while maintaining single source of truth.
 * 
 * Key Features:
 * - Unified access to local and discovered content
 * - Smart relevance filtering based on context
 * - Performance-optimized with caching
 * - Configurable discovery depth and breadth
 * - Academic relationship preservation
 */

import { ConceptArtifact } from '../contracts/schemas';

/**
 * Unified folder contents including local and discovered
 */
export interface UnifiedFolderContents {
  /** Folder being viewed */
  folderId: string;
  folderPath: string;
  folderMetadata: FolderMetadata;
  
  /** Concepts that actually belong to this folder */
  localConcepts: LocalConcept[];
  
  /** Concepts discovered from other folders */
  discoveredConcepts: DiscoveredConcept[];
  
  /** Statistics about the contents */
  statistics: ContentStatistics;
  
  /** Discovery metadata */
  discoveryMetadata: DiscoveryMetadata;
}

/**
 * Local concept with enhanced metadata
 */
export interface LocalConcept extends ConceptArtifact {
  /** Position in folder (for ordering) */
  position: number;
  
  /** Related concepts in other folders */
  relatedCount: number;
  
  /** Last accessed timestamp */
  lastAccessed?: Date;
  
  /** User-specific metadata */
  userMetadata?: {
    starred: boolean;
    notes?: string;
    difficulty?: number;
  };
}

/**
 * Discovered concept from another folder
 */
export interface DiscoveredConcept extends ConceptArtifact {
  /** Original folder this concept belongs to */
  sourceFolderId: string;
  sourceFolderPath: string;
  
  /** Relevance to current folder context */
  relevanceScore: number;
  
  /** Type of relationship */
  relationshipType: ConceptRelationship;
  
  /** Academic connection description */
  academicConnection: string;
  
  /** Discovery method used */
  discoveryMethod: DiscoveryMethod;
}

/**
 * Types of concept relationships
 */
export type ConceptRelationship = 
  | 'prerequisite'        // Concept is prerequisite for folder topics
  | 'advanced'           // Concept builds on folder topics
  | 'parallel'           // Concept is parallel/alternative approach
  | 'application'        // Concept applies folder topics
  | 'theoretical_basis'  // Concept provides theory for folder topics
  | 'cross_reference'    // Concept references folder topics
  | 'interdisciplinary'; // Concept connects to different domain

/**
 * Discovery methods
 */
export type DiscoveryMethod = 
  | 'vector_similarity'
  | 'academic_hierarchy'
  | 'citation_network'
  | 'topic_modeling'
  | 'user_behavior';

/**
 * Folder metadata
 */
export interface FolderMetadata {
  name: string;
  description?: string;
  academicDomain?: string;
  academicLevel?: string;
  createdAt: Date;
  lastModified: Date;
  conceptCount: number;
  totalViews: number;
}

/**
 * Content statistics
 */
export interface ContentStatistics {
  localCount: number;
  discoveredCount: number;
  totalCount: number;
  averageDifficulty?: number;
  completionRate?: number;
  lastStudied?: Date;
  estimatedStudyTime?: number; // minutes
}

/**
 * Discovery metadata
 */
export interface DiscoveryMetadata {
  discoveryEnabled: boolean;
  maxDiscoveredConcepts: number;
  relevanceThreshold: number;
  searchRadius: number; // How many folders to search
  lastDiscoveryUpdate: Date;
  discoveryMethods: DiscoveryMethod[];
}

/**
 * Options for retrieving unified contents
 */
export interface UnifiedContentsOptions {
  /** Include discovered concepts */
  includeDiscovered?: boolean;
  
  /** Maximum discovered concepts to include */
  maxDiscovered?: number;
  
  /** Minimum relevance score for discovered concepts */
  minRelevance?: number;
  
  /** Discovery methods to use */
  discoveryMethods?: DiscoveryMethod[];
  
  /** Sort order for concepts */
  sortBy?: 'position' | 'title' | 'difficulty' | 'lastAccessed' | 'relevance';
  
  /** Filter by user metadata */
  filterStarred?: boolean;
  
  /** Include user-specific metadata */
  includeUserMetadata?: boolean;
  
  /** Page size for pagination */
  pageSize?: number;
  
  /** Page number (0-based) */
  page?: number;
}

/**
 * Batch contents request
 */
export interface BatchContentsRequest {
  folderIds: string[];
  options?: UnifiedContentsOptions;
}

/**
 * Batch contents response
 */
export interface BatchContentsResponse {
  folders: Map<string, UnifiedFolderContents>;
  errors: Map<string, string>;
  totalTime: number;
}

/**
 * Discovery configuration
 */
export interface DiscoveryConfig {
  enabled: boolean;
  maxConcepts: number;
  relevanceThreshold: number;
  searchRadius: number;
  methods: DiscoveryMethod[];
  cacheTimeout: number; // minutes
  updateInterval: number; // minutes
}

/**
 * Main interface for unified folder contents
 */
export interface IUnifiedFolderContents {
  /**
   * Get unified contents for a folder
   * 
   * Returns both local concepts and discovered related concepts
   * from other folders based on relevance and configuration.
   * 
   * @param folderId - Target folder
   * @param options - Retrieval options
   * @returns Promise<UnifiedFolderContents> - Unified contents
   */
  getFolderContents(
    folderId: string,
    options?: UnifiedContentsOptions
  ): Promise<UnifiedFolderContents>;

  /**
   * Get contents for multiple folders
   * 
   * Batch operation for efficiency when loading multiple folders.
   * 
   * @param request - Batch request
   * @returns Promise<BatchContentsResponse> - Batch response
   */
  getBatchContents(
    request: BatchContentsRequest
  ): Promise<BatchContentsResponse>;

  /**
   * Discover related concepts for a folder
   * 
   * Actively searches for and returns related concepts from
   * other folders without modifying the folder's contents.
   * 
   * @param folderId - Source folder
   * @param method - Discovery method to use
   * @param limit - Maximum concepts to discover
   * @returns Promise<DiscoveredConcept[]> - Discovered concepts
   */
  discoverRelatedConcepts(
    folderId: string,
    method?: DiscoveryMethod,
    limit?: number
  ): Promise<DiscoveredConcept[]>;

  /**
   * Get concept relationships
   * 
   * Analyzes and returns relationships between a concept
   * and other concepts across folders.
   * 
   * @param conceptId - Source concept
   * @param maxRelated - Maximum relationships to return
   * @returns Promise<ConceptRelationshipMap> - Relationship map
   */
  getConceptRelationships(
    conceptId: string,
    maxRelated?: number
  ): Promise<ConceptRelationshipMap>;

  /**
   * Update discovery cache
   * 
   * Forces update of discovery cache for a folder.
   * 
   * @param folderId - Target folder
   * @returns Promise<void>
   */
  updateDiscoveryCache(folderId: string): Promise<void>;

  /**
   * Clear discovery cache
   * 
   * Clears all discovery caches, forcing fresh discovery.
   * 
   * @returns Promise<void>
   */
  clearDiscoveryCache(): Promise<void>;

  /**
   * Get discovery statistics
   * 
   * Returns statistics about discovery system performance.
   * 
   * @returns Promise<DiscoveryStatistics> - Statistics
   */
  getDiscoveryStatistics(): Promise<DiscoveryStatistics>;

  /**
   * Configure discovery settings
   * 
   * Updates discovery configuration for the service.
   * 
   * @param config - New configuration
   * @returns Promise<void>
   */
  configureDiscovery(config: Partial<DiscoveryConfig>): Promise<void>;

  /**
   * Export folder contents
   * 
   * Exports unified folder contents in various formats.
   * 
   * @param folderId - Target folder
   * @param format - Export format
   * @param includeDiscovered - Include discovered concepts
   * @returns Promise<ExportResult> - Export data
   */
  exportFolderContents(
    folderId: string,
    format: 'json' | 'csv' | 'markdown',
    includeDiscovered?: boolean
  ): Promise<ExportResult>;
}

/**
 * Concept relationship map
 */
export interface ConceptRelationshipMap {
  conceptId: string;
  relationships: Array<{
    relatedConceptId: string;
    relationshipType: ConceptRelationship;
    strength: number;
    bidirectional: boolean;
    folderId: string;
    folderPath: string;
  }>;
  totalRelated: number;
}

/**
 * Discovery statistics
 */
export interface DiscoveryStatistics {
  totalDiscoveries: number;
  averageRelevance: number;
  topDiscoveryMethods: Array<{
    method: DiscoveryMethod;
    count: number;
    averageRelevance: number;
  }>;
  cacheHitRate: number;
  averageDiscoveryTime: number; // milliseconds
  lastCacheUpdate: Date;
}

/**
 * Export result
 */
export interface ExportResult {
  format: string;
  data: string | Buffer;
  filename: string;
  mimeType: string;
  conceptCount: number;
  includedDiscovered: boolean;
}

/**
 * Error hierarchy for unified contents operations
 */

/**
 * Base error for unified contents
 */
export class UnifiedContentsError extends Error {
  constructor(
    message: string,
    public readonly folderId?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'UnifiedContentsError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnifiedContentsError);
    }
  }
}

/**
 * Folder not found error
 */
export class FolderNotFoundError extends UnifiedContentsError {
  constructor(folderId: string) {
    super(`Folder not found: ${folderId}`, folderId);
    this.name = 'FolderNotFoundError';
  }
}

/**
 * Discovery error
 */
export class DiscoveryError extends UnifiedContentsError {
  constructor(
    folderId: string,
    method: DiscoveryMethod,
    reason: string,
    cause?: Error
  ) {
    super(
      `Discovery failed for folder ${folderId} using ${method}: ${reason}`,
      folderId,
      cause
    );
    this.name = 'DiscoveryError';
  }
}

/**
 * Export error
 */
export class ExportError extends UnifiedContentsError {
  constructor(
    folderId: string,
    format: string,
    reason: string,
    cause?: Error
  ) {
    super(
      `Export failed for folder ${folderId} to ${format}: ${reason}`,
      folderId,
      cause
    );
    this.name = 'ExportError';
  }
}