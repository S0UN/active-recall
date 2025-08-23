/**
 * Search Service Interface
 * 
 * Provides RAG-based semantic search capabilities for the folder system.
 * Users can search for concepts without knowing the exact folder structure.
 * 
 * @module ISearchService
 */

import { ConceptArtifact, FolderManifest } from '../contracts/schemas';

/**
 * Search query options
 */
export interface SearchQuery {
  /** The search query text */
  query: string;
  
  /** Maximum number of results to return */
  limit?: number;
  
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  
  /** Filter by specific folder paths */
  folderFilter?: string[];
  
  /** Include related concepts */
  includeRelated?: boolean;
  
  /** Search mode */
  mode?: 'semantic' | 'keyword' | 'hybrid';
}

/**
 * Individual search result
 */
export interface SearchResult {
  /** The concept artifact */
  artifact: ConceptArtifact;
  
  /** Relevance score (0-1) */
  score: number;
  
  /** Match explanation */
  explanation: SearchExplanation;
  
  /** Folder context */
  folderContext: FolderContext;
  
  /** Related concepts */
  relatedConcepts?: RelatedConcept[];
}

/**
 * Explanation of why this result matched
 */
export interface SearchExplanation {
  /** Primary reason for match */
  matchType: 'exact' | 'semantic' | 'keyword' | 'related';
  
  /** Matched fragments with highlights */
  highlights: TextHighlight[];
  
  /** Semantic similarity breakdown */
  semanticScore?: number;
  
  /** Keyword match score */
  keywordScore?: number;
  
  /** Context relevance score */
  contextScore?: number;
}

/**
 * Text highlight information
 */
export interface TextHighlight {
  /** The field that matched (title, summary, content) */
  field: string;
  
  /** The matched text with surrounding context */
  fragment: string;
  
  /** Start position of match in fragment */
  startPos: number;
  
  /** End position of match in fragment */
  endPos: number;
}

/**
 * Folder context for a search result
 */
export interface FolderContext {
  /** The folder containing this concept */
  folder: FolderManifest;
  
  /** Path breadcrumb from root */
  breadcrumb: string[];
  
  /** Sibling concepts in the same folder */
  siblingCount: number;
  
  /** Folder description if available */
  description?: string;
}

/**
 * Related concept information
 */
export interface RelatedConcept {
  /** Concept ID */
  conceptId: string;
  
  /** Title of the related concept */
  title: string;
  
  /** Relationship type */
  relationshipType: 'similar' | 'prerequisite' | 'followup' | 'crossReference';
  
  /** Relationship strength (0-1) */
  strength: number;
  
  /** Folder path of the related concept */
  folderPath: string;
}

/**
 * Search response with results and metadata
 */
export interface SearchResponse {
  /** Search results */
  results: SearchResult[];
  
  /** Total number of matches (before limiting) */
  totalMatches: number;
  
  /** Search execution time in milliseconds */
  executionTime: number;
  
  /** Suggested alternative queries */
  suggestions?: string[];
  
  /** Search metadata */
  metadata: SearchMetadata;
}

/**
 * Search metadata
 */
export interface SearchMetadata {
  /** The processed query */
  processedQuery: string;
  
  /** Query embeddings if semantic search was used */
  queryEmbedding?: number[];
  
  /** Folders searched */
  foldersSearched: number;
  
  /** Concepts evaluated */
  conceptsEvaluated: number;
  
  /** Search strategy used */
  strategy: 'vector' | 'keyword' | 'hybrid';
}

/**
 * Search service interface
 */
export interface ISearchService {
  /**
   * Perform a search across all concepts
   * 
   * @param query - The search query and options
   * @returns Search results with explanations and context
   */
  search(query: SearchQuery): Promise<SearchResponse>;
  
  /**
   * Get similar concepts to a given concept
   * 
   * @param conceptId - The concept to find similar items for
   * @param limit - Maximum number of similar concepts
   * @returns Similar concepts with relationship information
   */
  findSimilar(conceptId: string, limit?: number): Promise<RelatedConcept[]>;
  
  /**
   * Suggest completions for a partial query
   * 
   * @param partial - The partial query text
   * @param limit - Maximum number of suggestions
   * @returns Suggested query completions
   */
  suggest(partial: string, limit?: number): Promise<string[]>;
  
  /**
   * Get search statistics and insights
   * 
   * @returns Search system statistics
   */
  getStatistics(): Promise<SearchStatistics>;
}

/**
 * Search system statistics
 */
export interface SearchStatistics {
  /** Total indexed concepts */
  totalConcepts: number;
  
  /** Total folders */
  totalFolders: number;
  
  /** Average concepts per folder */
  avgConceptsPerFolder: number;
  
  /** Index health status */
  indexHealth: 'healthy' | 'degraded' | 'rebuilding';
  
  /** Last index update */
  lastIndexUpdate: Date;
  
  /** Popular search terms */
  popularSearches?: string[];
}

/**
 * Search service configuration
 */
export interface SearchServiceConfig {
  /** Embedding model for semantic search */
  embeddingModel: string;
  
  /** Default result limit */
  defaultLimit: number;
  
  /** Default similarity threshold */
  defaultThreshold: number;
  
  /** Enable query expansion */
  enableQueryExpansion: boolean;
  
  /** Enable spell correction */
  enableSpellCorrection: boolean;
  
  /** Cache configuration */
  cacheConfig?: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
}

/**
 * Search service errors
 */
export class SearchServiceError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'SearchServiceError';
  }
}

export class QueryProcessingError extends SearchServiceError {
  constructor(query: string, cause?: Error) {
    super(`Failed to process query: ${query}`, cause);
    this.name = 'QueryProcessingError';
  }
}

export class IndexNotReadyError extends SearchServiceError {
  constructor() {
    super('Search index is not ready');
    this.name = 'IndexNotReadyError';
  }
}