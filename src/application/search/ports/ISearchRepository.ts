/**
 * Search Repository Port (Interface)
 * 
 * This is a PORT in hexagonal architecture - it defines what the 
 * application needs from the infrastructure layer.
 * 
 * Following Dependency Inversion Principle:
 * - High-level module (application) defines the interface
 * - Low-level module (infrastructure) implements it
 * 
 * @module Application/Search/Ports
 */

import { SearchQuery } from '../../../domain/search/entities/SearchQuery';
import { SearchResult } from '../../../domain/search/entities/SearchResult';
import { Concept } from '../../../domain/search/entities/Concept';

/**
 * Repository interface for search operations
 * 
 * This abstraction allows the application layer to perform searches
 * without knowing about the underlying infrastructure (Qdrant, embeddings, etc.)
 */
export interface ISearchRepository {
  
  /**
   * Search for concepts matching the query
   * 
   * @param query - The search query with all parameters
   * @returns Promise of search results
   */
  search(query: SearchQuery): Promise<SearchResult[]>;
  
  /**
   * Find concepts similar to a given concept
   * 
   * @param conceptId - The ID of the concept to find similar items for
   * @param limit - Maximum number of similar concepts to return
   * @returns Promise of similar concepts
   */
  findSimilar(conceptId: string, limit: number): Promise<Concept[]>;
  
  /**
   * Get a specific concept by ID
   * 
   * @param conceptId - The concept identifier
   * @returns Promise of concept or null if not found
   */
  findById(conceptId: string): Promise<Concept | null>;
  
  /**
   * Get total count of indexed concepts
   * 
   * @returns Promise of total concept count
   */
  getTotalCount(): Promise<number>;
  
  /**
   * Check if the search index is ready
   * 
   * @returns Promise of readiness status
   */
  isReady(): Promise<boolean>;
}

/**
 * Repository interface for search suggestions
 * 
 * Separate interface following Interface Segregation Principle
 */
export interface ISuggestionRepository {
  
  /**
   * Get search suggestions for a partial query
   * 
   * @param partial - The partial search term
   * @param limit - Maximum number of suggestions
   * @returns Promise of suggested terms
   */
  getSuggestions(partial: string, limit: number): Promise<string[]>;
  
  /**
   * Add a successful search term to improve future suggestions
   * 
   * @param term - The search term that was used
   */
  recordSearchTerm(term: string): Promise<void>;
  
  /**
   * Get popular search terms
   * 
   * @param limit - Maximum number of terms
   * @returns Promise of popular search terms
   */
  getPopularTerms(limit: number): Promise<string[]>;
}

/**
 * Repository interface for search analytics
 * 
 * Separate interface for analytics concerns
 */
export interface ISearchAnalyticsRepository {
  
  /**
   * Record a search query for analytics
   * 
   * @param query - The search query
   * @param resultCount - Number of results found
   * @param executionTime - Time taken in milliseconds
   */
  recordSearch(
    query: SearchQuery,
    resultCount: number,
    executionTime: number
  ): Promise<void>;
  
  /**
   * Record when a search result is selected
   * 
   * @param resultId - The selected result ID
   * @param position - Position in search results
   * @param query - The query that led to this result
   */
  recordSelection(
    resultId: string,
    position: number,
    query: SearchQuery
  ): Promise<void>;
  
  /**
   * Get search statistics
   * 
   * @returns Promise of search statistics
   */
  getStatistics(): Promise<SearchStatistics>;
}

/**
 * Search statistics data
 */
export interface SearchStatistics {
  totalSearches: number;
  averageResultCount: number;
  averageExecutionTime: number;
  popularQueries: Array<{ query: string; count: number }>;
  successRate: number; // Percentage of searches with results
}