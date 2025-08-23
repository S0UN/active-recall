/**
 * Search Service for Electron Renderer Process
 * 
 * This service provides a clean interface for the renderer (UI) to
 * communicate with the main process search functionality via IPC.
 * 
 * The UI doesn't know about IPC details - it just calls methods.
 * 
 * @module Infrastructure/Electron/Renderer
 */

import { ipcRenderer } from 'electron';
import { SearchIPCChannels, IPCResponse } from '../ipc/SearchIPCHandler';
import { 
  SearchConceptsInput, 
  SearchConceptsOutput 
} from '../../../application/search/usecases/SearchConcepts';

/**
 * Search Service for Renderer Process
 * 
 * This class provides a clean, promise-based API for the UI to
 * interact with search functionality without knowing about IPC.
 * 
 * It acts as an Anti-Corruption Layer between the UI and IPC.
 */
export class RendererSearchService implements IRendererSearchService {
  
  /**
   * Perform a search
   * 
   * @param input - Search parameters
   * @returns Promise of search results
   * @throws {SearchError} if search fails
   */
  async search(input: SearchConceptsInput): Promise<SearchConceptsOutput> {
    try {
      const response = await ipcRenderer.invoke(
        SearchIPCChannels.SEARCH,
        input
      ) as IPCResponse<SearchConceptsOutput>;
      
      if (!response.success) {
        throw new SearchError(
          response.error?.message || 'Search failed',
          response.error?.name
        );
      }
      
      return response.data!;
      
    } catch (error) {
      // Handle IPC communication errors
      if (error instanceof Error) {
        throw new SearchError(
          `IPC communication failed: ${error.message}`,
          'IPCError'
        );
      }
      throw error;
    }
  }

  /**
   * Find similar concepts
   * 
   * @param conceptId - The concept to find similar items for
   * @param limit - Maximum number of results
   * @returns Promise of similar concepts
   */
  async findSimilar(conceptId: string, limit: number = 10): Promise<SimilarConcept[]> {
    try {
      const response = await ipcRenderer.invoke(
        SearchIPCChannels.FIND_SIMILAR,
        { conceptId, limit }
      ) as IPCResponse<{ concepts: SimilarConcept[] }>;
      
      if (!response.success) {
        throw new SearchError(
          response.error?.message || 'Find similar failed',
          response.error?.name
        );
      }
      
      return response.data?.concepts || [];
      
    } catch (error) {
      if (error instanceof Error) {
        throw new SearchError(
          `IPC communication failed: ${error.message}`,
          'IPCError'
        );
      }
      throw error;
    }
  }

  /**
   * Get search suggestions
   * 
   * @param partial - Partial search term
   * @param limit - Maximum number of suggestions
   * @returns Promise of search suggestions
   */
  async getSuggestions(partial: string, limit: number = 5): Promise<string[]> {
    try {
      const response = await ipcRenderer.invoke(
        SearchIPCChannels.GET_SUGGESTIONS,
        { partial, limit }
      ) as IPCResponse<{ suggestions: string[] }>;
      
      if (!response.success) {
        // Don't throw for suggestions - just return empty array
        console.warn('Failed to get suggestions:', response.error);
        return [];
      }
      
      return response.data?.suggestions || [];
      
    } catch (error) {
      // Don't fail the UI for suggestion errors
      console.error('Suggestion IPC failed:', error);
      return [];
    }
  }

  /**
   * Get search statistics
   * 
   * @returns Promise of search statistics
   */
  async getStatistics(): Promise<SearchStatistics> {
    try {
      const response = await ipcRenderer.invoke(
        SearchIPCChannels.GET_STATISTICS
      ) as IPCResponse<SearchStatistics>;
      
      if (!response.success) {
        throw new SearchError(
          response.error?.message || 'Failed to get statistics',
          response.error?.name
        );
      }
      
      return response.data!;
      
    } catch (error) {
      if (error instanceof Error) {
        throw new SearchError(
          `IPC communication failed: ${error.message}`,
          'IPCError'
        );
      }
      throw error;
    }
  }
}

/**
 * Interface for renderer search service
 * 
 * This allows for easy testing and dependency injection
 */
export interface IRendererSearchService {
  search(input: SearchConceptsInput): Promise<SearchConceptsOutput>;
  findSimilar(conceptId: string, limit?: number): Promise<SimilarConcept[]>;
  getSuggestions(partial: string, limit?: number): Promise<string[]>;
  getStatistics(): Promise<SearchStatistics>;
}

/**
 * Similar concept data
 */
export interface SimilarConcept {
  id: string;
  title: string;
  similarity: number;
  folderPath: string;
}

/**
 * Search statistics
 */
export interface SearchStatistics {
  totalConcepts: number;
  totalFolders: number;
  averageConceptsPerFolder: number;
  indexHealth: string;
  lastIndexUpdate: string;
  popularSearches: Array<{ term: string; count: number }>;
}

/**
 * Custom error class for search operations
 */
export class SearchError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'SearchError';
  }
  
  /**
   * Check if this is a specific type of error
   */
  isIndexNotReady(): boolean {
    return this.code === 'SearchIndexNotReadyError';
  }
  
  isNetworkError(): boolean {
    return this.code === 'IPCError' || this.code === 'NetworkError';
  }
}

/**
 * Factory function to create the search service
 * 
 * This provides a clean way to instantiate the service
 */
export function createSearchService(): IRendererSearchService {
  return new RendererSearchService();
}