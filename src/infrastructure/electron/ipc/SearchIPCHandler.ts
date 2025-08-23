/**
 * Search IPC Handler for Electron
 * 
 * This is the INFRASTRUCTURE layer adapter that connects the
 * application use cases to Electron's IPC mechanism.
 * 
 * Instead of REST APIs, we use IPC for main-renderer communication.
 * 
 * @module Infrastructure/Electron/IPC
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { 
  SearchConceptsUseCase, 
  SearchConceptsInput,
  SearchConceptsOutput 
} from '../../../application/search/usecases/SearchConcepts';
import { 
  FindSimilarConceptsUseCase,
  FindSimilarInput,
  FindSimilarOutput
} from '../../../application/search/usecases/FindSimilarConcepts';
import {
  GetSearchSuggestionsUseCase,
  GetSuggestionsInput,
  GetSuggestionsOutput
} from '../../../application/search/usecases/GetSearchSuggestions';
import { ILogger } from '../../../shared/ports/ILogger';

/**
 * IPC Channel names - these are the "endpoints" for our Electron app
 * 
 * Using constants ensures type safety and prevents typos
 */
export const SearchIPCChannels = {
  SEARCH: 'search:execute',
  FIND_SIMILAR: 'search:findSimilar',
  GET_SUGGESTIONS: 'search:getSuggestions',
  GET_STATISTICS: 'search:getStatistics',
} as const;

/**
 * Search IPC Handler
 * 
 * This class registers IPC handlers for search-related operations.
 * It acts as an adapter between Electron's IPC and our clean use cases.
 */
export class SearchIPCHandler {
  
  constructor(
    private readonly searchUseCase: SearchConceptsUseCase,
    private readonly findSimilarUseCase: FindSimilarConceptsUseCase,
    private readonly getSuggestionsUseCase: GetSearchSuggestionsUseCase,
    private readonly logger: ILogger
  ) {}

  /**
   * Register all IPC handlers
   * 
   * This should be called in the main process during app initialization
   */
  registerHandlers(): void {
    this.logger.info('Registering search IPC handlers');
    
    // Register search handler
    this.registerSearchHandler();
    
    // Register find similar handler
    this.registerFindSimilarHandler();
    
    // Register suggestions handler
    this.registerSuggestionsHandler();
    
    // Register statistics handler
    this.registerStatisticsHandler();
    
    this.logger.info('Search IPC handlers registered successfully');
  }

  /**
   * Register the main search handler
   */
  private registerSearchHandler(): void {
    ipcMain.handle(
      SearchIPCChannels.SEARCH,
      async (event: IpcMainInvokeEvent, input: SearchConceptsInput): Promise<IPCResponse<SearchConceptsOutput>> => {
        this.logger.debug('Search IPC request received', { input });
        
        try {
          // Execute the use case
          const result = await this.searchUseCase.execute(input);
          
          // Return success response
          return {
            success: true,
            data: result
          };
          
        } catch (error) {
          this.logger.error('Search IPC request failed', { error });
          
          // Return error response
          return {
            success: false,
            error: this.formatError(error)
          };
        }
      }
    );
  }

  /**
   * Register find similar handler
   */
  private registerFindSimilarHandler(): void {
    ipcMain.handle(
      SearchIPCChannels.FIND_SIMILAR,
      async (event: IpcMainInvokeEvent, input: FindSimilarInput): Promise<IPCResponse<FindSimilarOutput>> => {
        this.logger.debug('Find similar IPC request received', { input });
        
        try {
          const result = await this.findSimilarUseCase.execute(input);
          
          return {
            success: true,
            data: result
          };
          
        } catch (error) {
          this.logger.error('Find similar IPC request failed', { error });
          
          return {
            success: false,
            error: this.formatError(error)
          };
        }
      }
    );
  }

  /**
   * Register suggestions handler
   */
  private registerSuggestionsHandler(): void {
    ipcMain.handle(
      SearchIPCChannels.GET_SUGGESTIONS,
      async (event: IpcMainInvokeEvent, input: GetSuggestionsInput): Promise<IPCResponse<GetSuggestionsOutput>> => {
        this.logger.debug('Get suggestions IPC request received', { input });
        
        try {
          const result = await this.getSuggestionsUseCase.execute(input);
          
          return {
            success: true,
            data: result
          };
          
        } catch (error) {
          this.logger.error('Get suggestions IPC request failed', { error });
          
          return {
            success: false,
            error: this.formatError(error)
          };
        }
      }
    );
  }

  /**
   * Register statistics handler
   */
  private registerStatisticsHandler(): void {
    ipcMain.handle(
      SearchIPCChannels.GET_STATISTICS,
      async (event: IpcMainInvokeEvent): Promise<IPCResponse<SearchStatistics>> => {
        this.logger.debug('Get statistics IPC request received');
        
        try {
          // This would call a GetSearchStatisticsUseCase
          const stats = await this.getStatistics();
          
          return {
            success: true,
            data: stats
          };
          
        } catch (error) {
          this.logger.error('Get statistics IPC request failed', { error });
          
          return {
            success: false,
            error: this.formatError(error)
          };
        }
      }
    );
  }

  /**
   * Get search statistics
   * 
   * This would normally call a dedicated use case
   */
  private async getStatistics(): Promise<SearchStatistics> {
    // Placeholder - would call GetSearchStatisticsUseCase
    return {
      totalConcepts: 0,
      totalFolders: 0,
      averageConceptsPerFolder: 0,
      indexHealth: 'healthy',
      lastIndexUpdate: new Date().toISOString(),
      popularSearches: []
    };
  }

  /**
   * Format error for IPC response
   */
  private formatError(error: unknown): IPCError {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    
    return {
      name: 'UnknownError',
      message: String(error),
      stack: undefined
    };
  }

  /**
   * Unregister all handlers
   * 
   * Useful for cleanup or testing
   */
  unregisterHandlers(): void {
    Object.values(SearchIPCChannels).forEach(channel => {
      ipcMain.removeHandler(channel);
    });
    
    this.logger.info('Search IPC handlers unregistered');
  }
}

/**
 * Standard IPC response structure
 * 
 * Using a consistent response structure makes error handling easier
 */
export interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: IPCError;
}

/**
 * Standard IPC error structure
 */
export interface IPCError {
  name: string;
  message: string;
  stack?: string;
}

/**
 * Search statistics interface
 */
interface SearchStatistics {
  totalConcepts: number;
  totalFolders: number;
  averageConceptsPerFolder: number;
  indexHealth: string;
  lastIndexUpdate: string;
  popularSearches: Array<{ term: string; count: number }>;
}