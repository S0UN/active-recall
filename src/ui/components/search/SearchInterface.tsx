/**
 * Search Interface Component
 * 
 * Clean, modular React component for semantic search functionality.
 * Follows best practices with proper separation of concerns.
 * 
 * @module SearchInterface
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { debounce } from 'lodash';
import { 
  SearchResult, 
  SearchResponse, 
  SearchQuery,
  RelatedConcept 
} from '../../../core/services/ISearchService';
import { SearchAPI } from '../../api/SearchAPI';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { SearchFilters } from './SearchFilters';
import { SearchStats } from './SearchStats';

/**
 * Search interface props
 */
interface SearchInterfaceProps {
  /** API client for search operations */
  api: SearchAPI;
  
  /** Callback when a result is selected */
  onResultSelect?: (result: SearchResult) => void;
  
  /** Initial search query */
  initialQuery?: string;
  
  /** Custom class name */
  className?: string;
}

/**
 * Search interface state
 */
interface SearchState {
  query: string;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  suggestions: string[];
  totalMatches: number;
  executionTime: number;
  filters: SearchFilters;
}

/**
 * Search filters
 */
interface SearchFilters {
  folders: string[];
  threshold: number;
  includeRelated: boolean;
  limit: number;
}

/**
 * Main Search Interface Component
 * 
 * Provides a complete search experience with:
 * - Smart search bar with suggestions
 * - Result display with explanations
 * - Filtering capabilities
 * - Related concept discovery
 */
export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  api,
  onResultSelect,
  initialQuery = '',
  className = '',
}) => {
  // ==================== State Management ====================
  
  const [state, setState] = useState<SearchState>({
    query: initialQuery,
    results: [],
    loading: false,
    error: null,
    suggestions: [],
    totalMatches: 0,
    executionTime: 0,
    filters: {
      folders: [],
      threshold: 0.7,
      includeRelated: false,
      limit: 10,
    },
  });

  // ==================== Search Logic ====================
  
  /**
   * Perform search with current state
   */
  const performSearch = useCallback(async () => {
    if (!state.query.trim()) {
      setState(prev => ({
        ...prev,
        results: [],
        totalMatches: 0,
        error: null,
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const searchQuery: SearchQuery = {
        query: state.query,
        limit: state.filters.limit,
        threshold: state.filters.threshold,
        folderFilter: state.filters.folders.length > 0 ? state.filters.folders : undefined,
        includeRelated: state.filters.includeRelated,
        mode: 'semantic',
      };

      const response = await api.search(searchQuery);

      setState(prev => ({
        ...prev,
        results: response.results,
        totalMatches: response.totalMatches,
        executionTime: response.executionTime,
        loading: false,
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Search failed',
        results: [],
      }));
    }
  }, [state.query, state.filters, api]);

  /**
   * Debounced search for auto-search
   */
  const debouncedSearch = useMemo(
    () => debounce(performSearch, 300),
    [performSearch]
  );

  /**
   * Get search suggestions
   */
  const getSuggestions = useCallback(async (partial: string) => {
    if (partial.length < 2) {
      setState(prev => ({ ...prev, suggestions: [] }));
      return;
    }

    try {
      const suggestions = await api.getSuggestions(partial, 5);
      setState(prev => ({ ...prev, suggestions }));
    } catch {
      // Silently fail for suggestions
    }
  }, [api]);

  /**
   * Debounced suggestions
   */
  const debouncedSuggestions = useMemo(
    () => debounce(getSuggestions, 200),
    [getSuggestions]
  );

  // ==================== Event Handlers ====================

  /**
   * Handle query change
   */
  const handleQueryChange = useCallback((query: string) => {
    setState(prev => ({ ...prev, query }));
    debouncedSuggestions(query);
    debouncedSearch();
  }, [debouncedSuggestions, debouncedSearch]);

  /**
   * Handle search submit
   */
  const handleSearch = useCallback(() => {
    performSearch();
  }, [performSearch]);

  /**
   * Handle filter change
   */
  const handleFilterChange = useCallback((filters: Partial<SearchFilters>) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...filters },
    }));
  }, []);

  /**
   * Handle result selection
   */
  const handleResultSelect = useCallback((result: SearchResult) => {
    onResultSelect?.(result);
  }, [onResultSelect]);

  /**
   * Handle suggestion selection
   */
  const handleSuggestionSelect = useCallback((suggestion: string) => {
    setState(prev => ({ ...prev, query: suggestion, suggestions: [] }));
    performSearch();
  }, [performSearch]);

  // ==================== Effects ====================

  /**
   * Perform initial search if query provided
   */
  useEffect(() => {
    if (initialQuery) {
      performSearch();
    }
  }, []); // Only on mount

  /**
   * Re-search when filters change
   */
  useEffect(() => {
    if (state.query.trim()) {
      debouncedSearch();
    }
  }, [state.filters]); // When filters change

  // ==================== Render ====================

  return (
    <div className={`search-interface ${className}`}>
      {/* Search Bar */}
      <SearchBar
        query={state.query}
        suggestions={state.suggestions}
        loading={state.loading}
        onQueryChange={handleQueryChange}
        onSearch={handleSearch}
        onSuggestionSelect={handleSuggestionSelect}
      />

      {/* Error Display */}
      {state.error && (
        <div className="search-error">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{state.error}</span>
        </div>
      )}

      {/* Search Filters */}
      <SearchFilters
        filters={state.filters}
        onChange={handleFilterChange}
      />

      {/* Search Stats */}
      {state.results.length > 0 && (
        <SearchStats
          totalMatches={state.totalMatches}
          displayedResults={state.results.length}
          executionTime={state.executionTime}
        />
      )}

      {/* Search Results */}
      <SearchResults
        results={state.results}
        loading={state.loading}
        onResultSelect={handleResultSelect}
      />

      {/* No Results Message */}
      {!state.loading && state.query && state.results.length === 0 && !state.error && (
        <div className="no-results">
          <p>No results found for "<strong>{state.query}</strong>"</p>
          <p className="help-text">
            Try adjusting your search terms or lowering the similarity threshold
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Search API Client
 * 
 * Clean API client for search operations
 */
export class SearchAPI {
  constructor(private baseUrl: string) {}

  /**
   * Perform search
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const response = await fetch(`${this.baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(partial: string, limit: number = 5): Promise<string[]> {
    const params = new URLSearchParams({
      q: partial,
      limit: limit.toString(),
    });

    const response = await fetch(`${this.baseUrl}/api/search/suggest?${params}`);
    
    if (!response.ok) {
      throw new Error('Failed to get suggestions');
    }

    const data = await response.json();
    return data.data.suggestions;
  }

  /**
   * Find similar concepts
   */
  async findSimilar(conceptId: string, limit: number = 10): Promise<RelatedConcept[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
    });

    const response = await fetch(`${this.baseUrl}/api/search/similar/${conceptId}?${params}`);
    
    if (!response.ok) {
      throw new Error('Failed to find similar concepts');
    }

    const data = await response.json();
    return data.data.similar;
  }

  /**
   * Get search statistics
   */
  async getStats(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/search/stats`);
    
    if (!response.ok) {
      throw new Error('Failed to get statistics');
    }

    const data = await response.json();
    return data.data;
  }
}