/**
 * useSearch Hook
 * 
 * A clean, reusable React hook for search functionality.
 * This is the PRESENTATION layer - it knows about React but
 * not about Electron IPC or infrastructure details.
 * 
 * @module Presentation/Hooks
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { IRendererSearchService } from '../../infrastructure/electron/renderer/SearchService';
import { 
  SearchConceptsInput, 
  SearchConceptsOutput,
  SearchResultDTO 
} from '../../application/search/usecases/SearchConcepts';
import { debounce } from '../../shared/utils/debounce';

/**
 * Hook configuration options
 */
export interface UseSearchOptions {
  /** Debounce delay for auto-search in milliseconds */
  debounceDelay?: number;
  
  /** Whether to search automatically on query change */
  autoSearch?: boolean;
  
  /** Default search parameters */
  defaultParams?: Partial<SearchConceptsInput>;
  
  /** Callback when a result is selected */
  onResultSelect?: (result: SearchResultDTO) => void;
  
  /** Callback when search completes */
  onSearchComplete?: (results: SearchConceptsOutput) => void;
}

/**
 * Hook state
 */
export interface UseSearchState {
  /** Current search query */
  query: string;
  
  /** Search results */
  results: SearchResultDTO[];
  
  /** Total number of matches */
  totalMatches: number;
  
  /** Loading state */
  isLoading: boolean;
  
  /** Error state */
  error: string | null;
  
  /** Search suggestions */
  suggestions: string[];
  
  /** Whether results are from cache */
  isCached: boolean;
  
  /** Last execution time in ms */
  executionTime: number | null;
}

/**
 * Hook actions
 */
export interface UseSearchActions {
  /** Set the search query */
  setQuery: (query: string) => void;
  
  /** Perform search with current query */
  search: () => Promise<void>;
  
  /** Clear search results */
  clearResults: () => void;
  
  /** Select a search result */
  selectResult: (result: SearchResultDTO) => void;
  
  /** Set search filters */
  setFilters: (filters: SearchFilters) => void;
  
  /** Load search suggestions */
  loadSuggestions: (partial: string) => Promise<void>;
}

/**
 * Search filters
 */
export interface SearchFilters {
  threshold?: number;
  limit?: number;
  folderFilter?: string[];
  includeRelated?: boolean;
  mode?: 'semantic' | 'keyword' | 'hybrid';
}

/**
 * useSearch Hook
 * 
 * Provides a clean, testable interface for search functionality.
 * All business logic is delegated to the service layer.
 */
export function useSearch(
  searchService: IRendererSearchService,
  options: UseSearchOptions = {}
): [UseSearchState, UseSearchActions] {
  
  // ==================== Configuration ====================
  
  const {
    debounceDelay = 300,
    autoSearch = true,
    defaultParams = {},
    onResultSelect,
    onSearchComplete
  } = options;
  
  // ==================== State ====================
  
  const [state, setState] = useState<UseSearchState>({
    query: '',
    results: [],
    totalMatches: 0,
    isLoading: false,
    error: null,
    suggestions: [],
    isCached: false,
    executionTime: null
  });
  
  const [filters, setFilters] = useState<SearchFilters>({
    threshold: defaultParams.threshold,
    limit: defaultParams.limit,
    folderFilter: defaultParams.folderFilter,
    includeRelated: defaultParams.includeRelated,
    mode: defaultParams.mode
  });
  
  // ==================== Refs ====================
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // ==================== Search Logic ====================
  
  /**
   * Perform search
   */
  const performSearch = useCallback(async () => {
    // Cancel any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Don't search for empty query
    if (!state.query.trim()) {
      setState(prev => ({
        ...prev,
        results: [],
        totalMatches: 0,
        error: null,
        executionTime: null
      }));
      return;
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    // Set loading state
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Build search input
      const input: SearchConceptsInput = {
        query: state.query,
        ...filters,
        ...defaultParams
      };
      
      // Execute search
      const output = await searchService.search(input);
      
      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      
      // Update state with results
      setState(prev => ({
        ...prev,
        results: output.results,
        totalMatches: output.totalMatches,
        suggestions: output.suggestions,
        isCached: output.metadata.cached,
        executionTime: output.executionTime,
        isLoading: false,
        error: null
      }));
      
      // Call completion callback
      onSearchComplete?.(output);
      
    } catch (error) {
      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      
      // Handle error
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unexpected error occurred';
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
        results: [],
        totalMatches: 0
      }));
    }
  }, [state.query, filters, defaultParams, searchService, onSearchComplete]);
  
  /**
   * Debounced search for auto-search
   */
  const debouncedSearch = useRef(
    debounce(performSearch, debounceDelay)
  ).current;
  
  /**
   * Load search suggestions
   */
  const loadSuggestions = useCallback(async (partial: string) => {
    if (partial.length < 2) {
      setState(prev => ({ ...prev, suggestions: [] }));
      return;
    }
    
    try {
      const suggestions = await searchService.getSuggestions(partial, 5);
      setState(prev => ({ ...prev, suggestions }));
    } catch (error) {
      // Don't update error state for suggestion failures
      console.warn('Failed to load suggestions:', error);
    }
  }, [searchService]);
  
  /**
   * Debounced suggestions
   */
  const debouncedSuggestions = useRef(
    debounce(loadSuggestions, 200)
  ).current;
  
  // ==================== Actions ====================
  
  /**
   * Set search query
   */
  const setQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, query }));
    
    // Load suggestions
    debouncedSuggestions(query);
    
    // Auto-search if enabled
    if (autoSearch) {
      debouncedSearch();
    }
  }, [autoSearch, debouncedSearch, debouncedSuggestions]);
  
  /**
   * Manual search trigger
   */
  const search = useCallback(async () => {
    await performSearch();
  }, [performSearch]);
  
  /**
   * Clear search results
   */
  const clearResults = useCallback(() => {
    setState(prev => ({
      ...prev,
      results: [],
      totalMatches: 0,
      suggestions: [],
      error: null,
      executionTime: null,
      isCached: false
    }));
  }, []);
  
  /**
   * Select a search result
   */
  const selectResult = useCallback((result: SearchResultDTO) => {
    onResultSelect?.(result);
  }, [onResultSelect]);
  
  /**
   * Update search filters
   */
  const updateFilters = useCallback((newFilters: SearchFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);
  
  // ==================== Effects ====================
  
  /**
   * Re-search when filters change
   */
  useEffect(() => {
    if (state.query.trim() && autoSearch) {
      debouncedSearch();
    }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      debouncedSearch.cancel();
      debouncedSuggestions.cancel();
    };
  }, [debouncedSearch, debouncedSuggestions]);
  
  // ==================== Return ====================
  
  const actions: UseSearchActions = {
    setQuery,
    search,
    clearResults,
    selectResult,
    setFilters: updateFilters,
    loadSuggestions
  };
  
  return [state, actions];
}

/**
 * Create a mock search service for testing
 * 
 * This allows testing the hook without real IPC
 */
export function createMockSearchService(): IRendererSearchService {
  return {
    async search(input: SearchConceptsInput): Promise<SearchConceptsOutput> {
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        results: [],
        totalMatches: 0,
        executionTime: 100,
        suggestions: [],
        metadata: {
          processedQuery: input.query,
          searchMode: input.mode || 'semantic',
          conceptsEvaluated: 0,
          cached: false
        }
      };
    },
    
    async findSimilar(conceptId: string, limit?: number) {
      return [];
    },
    
    async getSuggestions(partial: string, limit?: number) {
      return [`${partial} suggestion 1`, `${partial} suggestion 2`];
    },
    
    async getStatistics() {
      return {
        totalConcepts: 0,
        totalFolders: 0,
        averageConceptsPerFolder: 0,
        indexHealth: 'healthy',
        lastIndexUpdate: new Date().toISOString(),
        popularSearches: []
      };
    }
  };
}