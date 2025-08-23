/**
 * Search Concepts Use Case
 * 
 * This is the APPLICATION layer in clean architecture.
 * It orchestrates the business logic without knowing about:
 * - UI details (Electron, React, etc.)
 * - Infrastructure details (Qdrant, OpenAI, etc.)
 * 
 * @module Application/Search/UseCases
 */

import { SearchQuery } from '../../../domain/search/entities/SearchQuery';
import { SearchResult } from '../../../domain/search/entities/SearchResult';
import { ISearchRepository, ISuggestionRepository, ISearchAnalyticsRepository } from '../ports/ISearchRepository';
import { IQueryProcessor } from '../ports/IQueryProcessor';
import { ICacheService } from '../ports/ICacheService';
import { ILogger } from '../../../shared/ports/ILogger';

/**
 * Input DTO for search use case
 * 
 * Using DTOs to decouple from domain entities at boundaries
 */
export interface SearchConceptsInput {
  query: string;
  threshold?: number;
  limit?: number;
  folderFilter?: string[];
  includeRelated?: boolean;
  mode?: 'semantic' | 'keyword' | 'hybrid';
}

/**
 * Output DTO for search use case
 */
export interface SearchConceptsOutput {
  results: SearchResultDTO[];
  totalMatches: number;
  executionTime: number;
  suggestions: string[];
  metadata: SearchMetadata;
}

/**
 * Search result DTO
 */
export interface SearchResultDTO {
  id: string;
  title: string;
  summary: string;
  score: number;
  folderPath: string;
  explanation: {
    matchType: string;
    highlights: Array<{
      field: string;
      fragment: string;
      positions: [number, number];
    }>;
  };
  relatedConcepts?: Array<{
    id: string;
    title: string;
    relationship: string;
    strength: number;
  }>;
}

/**
 * Search metadata
 */
export interface SearchMetadata {
  processedQuery: string;
  searchMode: string;
  conceptsEvaluated: number;
  cached: boolean;
}

/**
 * Search Concepts Use Case
 * 
 * Implements the business logic for searching concepts.
 * This class has NO dependencies on concrete implementations,
 * only on abstractions (interfaces).
 */
export class SearchConceptsUseCase {
  
  constructor(
    private readonly searchRepository: ISearchRepository,
    private readonly suggestionRepository: ISuggestionRepository,
    private readonly analyticsRepository: ISearchAnalyticsRepository,
    private readonly queryProcessor: IQueryProcessor,
    private readonly cache: ICacheService<SearchConceptsOutput>,
    private readonly logger: ILogger
  ) {
    // All dependencies are abstractions (interfaces)
    // This follows Dependency Inversion Principle
  }

  /**
   * Execute the search use case
   * 
   * This method orchestrates the entire search process with
   * clear, readable steps.
   */
  async execute(input: SearchConceptsInput): Promise<SearchConceptsOutput> {
    const startTime = performance.now();
    
    try {
      // Step 1: Validate and create domain entity
      const searchQuery = this.createSearchQuery(input);
      this.logger.debug('Executing search', { query: searchQuery.toString() });
      
      // Step 2: Check cache for existing results
      const cachedResult = await this.checkCache(searchQuery);
      if (cachedResult) {
        this.logger.debug('Returning cached result');
        return this.enrichWithMetadata(cachedResult, true);
      }
      
      // Step 3: Check if search index is ready
      await this.ensureIndexReady();
      
      // Step 4: Process the query (expand, correct spelling, etc.)
      const processedQuery = await this.queryProcessor.process(searchQuery);
      
      // Step 5: Perform the search
      const searchResults = await this.searchRepository.search(processedQuery);
      
      // Step 6: Generate suggestions for future searches
      const suggestions = await this.generateSuggestions(
        processedQuery.getTerm().getValue(),
        searchResults
      );
      
      // Step 7: Build the output
      const output = this.buildOutput(
        searchResults,
        suggestions,
        processedQuery,
        startTime
      );
      
      // Step 8: Cache the results
      await this.cacheResults(searchQuery, output);
      
      // Step 9: Record analytics
      await this.recordAnalytics(processedQuery, output);
      
      // Step 10: Record search term for improving suggestions
      await this.suggestionRepository.recordSearchTerm(
        processedQuery.getTerm().getValue()
      );
      
      return output;
      
    } catch (error) {
      this.logger.error('Search failed', { error, input });
      throw this.handleError(error);
    }
  }

  /**
   * Create domain entity from input DTO
   */
  private createSearchQuery(input: SearchConceptsInput): SearchQuery {
    return new SearchQuery({
      query: input.query,
      threshold: input.threshold,
      limit: input.limit,
      folderFilter: input.folderFilter,
      mode: this.mapSearchMode(input.mode),
      includeRelated: input.includeRelated
    });
  }

  /**
   * Map string mode to domain enum
   */
  private mapSearchMode(mode?: string): SearchMode | undefined {
    if (!mode) return undefined;
    
    const modeMap = {
      'semantic': SearchMode.SEMANTIC,
      'keyword': SearchMode.KEYWORD,
      'hybrid': SearchMode.HYBRID
    };
    
    return modeMap[mode as keyof typeof modeMap];
  }

  /**
   * Check cache for existing results
   */
  private async checkCache(query: SearchQuery): Promise<SearchConceptsOutput | null> {
    const cacheKey = query.getCacheKey();
    return await this.cache.get(cacheKey);
  }

  /**
   * Ensure search index is ready
   */
  private async ensureIndexReady(): Promise<void> {
    const isReady = await this.searchRepository.isReady();
    if (!isReady) {
      throw new SearchIndexNotReadyError();
    }
  }

  /**
   * Generate search suggestions
   */
  private async generateSuggestions(
    query: string,
    results: SearchResult[]
  ): Promise<string[]> {
    // Get suggestions based on the query
    const querySuggestions = await this.suggestionRepository.getSuggestions(query, 3);
    
    // Extract common terms from top results for additional suggestions
    const resultTerms = this.extractCommonTerms(results.slice(0, 3));
    
    // Combine and deduplicate
    const allSuggestions = [...new Set([...querySuggestions, ...resultTerms])];
    
    return allSuggestions.slice(0, 5);
  }

  /**
   * Extract common terms from search results
   */
  private extractCommonTerms(results: SearchResult[]): string[] {
    const termFrequency = new Map<string, number>();
    
    for (const result of results) {
      const words = result.getConcept().getTitle().split(/\s+/)
        .filter(word => word.length > 3)
        .map(word => word.toLowerCase());
      
      for (const word of words) {
        termFrequency.set(word, (termFrequency.get(word) || 0) + 1);
      }
    }
    
    // Return words that appear in multiple results
    return Array.from(termFrequency.entries())
      .filter(([_, count]) => count > 1)
      .map(([word, _]) => word)
      .slice(0, 3);
  }

  /**
   * Build output DTO from domain entities
   */
  private buildOutput(
    results: SearchResult[],
    suggestions: string[],
    query: SearchQuery,
    startTime: number
  ): SearchConceptsOutput {
    return {
      results: results.map(result => this.mapToResultDTO(result)),
      totalMatches: results.length,
      executionTime: performance.now() - startTime,
      suggestions,
      metadata: {
        processedQuery: query.getTerm().getValue(),
        searchMode: query.getMode(),
        conceptsEvaluated: results.length,
        cached: false
      }
    };
  }

  /**
   * Map domain entity to DTO
   */
  private mapToResultDTO(result: SearchResult): SearchResultDTO {
    const concept = result.getConcept();
    const explanation = result.getExplanation();
    
    return {
      id: concept.getId(),
      title: concept.getTitle(),
      summary: concept.getSummary(),
      score: result.getScore(),
      folderPath: concept.getFolderPath(),
      explanation: {
        matchType: explanation.getMatchType(),
        highlights: explanation.getHighlights().map(h => ({
          field: h.getField(),
          fragment: h.getFragment(),
          positions: h.getPositions()
        }))
      },
      relatedConcepts: result.getRelatedConcepts()?.map(related => ({
        id: related.getId(),
        title: related.getTitle(),
        relationship: related.getRelationshipType(),
        strength: related.getStrength()
      }))
    };
  }

  /**
   * Cache search results
   */
  private async cacheResults(
    query: SearchQuery,
    output: SearchConceptsOutput
  ): Promise<void> {
    const cacheKey = query.getCacheKey();
    await this.cache.set(cacheKey, output, 300); // 5 minute TTL
  }

  /**
   * Record analytics for the search
   */
  private async recordAnalytics(
    query: SearchQuery,
    output: SearchConceptsOutput
  ): Promise<void> {
    await this.analyticsRepository.recordSearch(
      query,
      output.totalMatches,
      output.executionTime
    );
  }

  /**
   * Enrich output with metadata
   */
  private enrichWithMetadata(
    output: SearchConceptsOutput,
    cached: boolean
  ): SearchConceptsOutput {
    return {
      ...output,
      metadata: {
        ...output.metadata,
        cached
      }
    };
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: unknown): Error {
    if (error instanceof SearchIndexNotReadyError) {
      return error;
    }
    
    if (error instanceof Error) {
      return new SearchExecutionError(error.message, error);
    }
    
    return new SearchExecutionError('Unknown error occurred');
  }
}

/**
 * Custom error for search index not ready
 */
export class SearchIndexNotReadyError extends Error {
  constructor() {
    super('Search index is not ready. Please wait for indexing to complete.');
    this.name = 'SearchIndexNotReadyError';
  }
}

/**
 * Custom error for search execution failures
 */
export class SearchExecutionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'SearchExecutionError';
  }
}

// Import domain entities
import { SearchMode } from '../../../domain/search/entities/SearchQuery';