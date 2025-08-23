/**
 * Search API Routes
 * 
 * RESTful API endpoints for the semantic search system.
 * Follows clean architecture with proper separation of concerns.
 * 
 * @module SearchRoutes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { 
  ISearchService, 
  SearchQuery, 
  SearchServiceError,
  IndexNotReadyError,
  QueryProcessingError
} from '../../core/services/ISearchService';
import { z } from 'zod';

/**
 * Search request validation schema
 */
const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(100).optional(),
  threshold: z.number().min(0).max(1).optional(),
  folderFilter: z.array(z.string()).optional(),
  includeRelated: z.boolean().optional(),
  mode: z.enum(['semantic', 'keyword', 'hybrid']).optional(),
});

/**
 * Similar concepts request schema
 */
const SimilarRequestSchema = z.object({
  conceptId: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * Suggestions request schema
 */
const SuggestRequestSchema = z.object({
  partial: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(20).optional(),
});

/**
 * Create search routes
 * 
 * @param searchService - The search service implementation
 * @returns Express router with search endpoints
 */
export function createSearchRoutes(searchService: ISearchService): Router {
  const router = Router();

  /**
   * POST /api/search
   * Perform semantic search
   */
  router.post('/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request
      const validation = SearchRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors,
        });
      }

      const query: SearchQuery = validation.data;

      // Perform search
      const response = await searchService.search(query);

      // Return results
      res.json({
        success: true,
        data: response,
      });

    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/search/similar/:conceptId
   * Find similar concepts
   */
  router.get('/search/similar/:conceptId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conceptId = req.params.conceptId;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      // Validate
      const validation = SimilarRequestSchema.safeParse({ conceptId, limit });
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors,
        });
      }

      // Find similar concepts
      const similar = await searchService.findSimilar(
        validation.data.conceptId,
        validation.data.limit
      );

      res.json({
        success: true,
        data: {
          conceptId: validation.data.conceptId,
          similar,
        },
      });

    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/search/suggest
   * Get search suggestions
   */
  router.get('/search/suggest', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const partial = req.query.q as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

      // Validate
      const validation = SuggestRequestSchema.safeParse({ partial, limit });
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid request',
          details: validation.error.errors,
        });
      }

      // Get suggestions
      const suggestions = await searchService.suggest(
        validation.data.partial,
        validation.data.limit
      );

      res.json({
        success: true,
        data: {
          query: validation.data.partial,
          suggestions,
        },
      });

    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/search/stats
   * Get search system statistics
   */
  router.get('/search/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await searchService.getStatistics();

      res.json({
        success: true,
        data: stats,
      });

    } catch (error) {
      next(error);
    }
  });

  /**
   * Error handling middleware
   */
  router.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('[Search API Error]', error);

    if (error instanceof IndexNotReadyError) {
      return res.status(503).json({
        error: 'Search service unavailable',
        message: 'The search index is not ready. Please try again later.',
      });
    }

    if (error instanceof QueryProcessingError) {
      return res.status(400).json({
        error: 'Query processing failed',
        message: error.message,
      });
    }

    if (error instanceof SearchServiceError) {
      return res.status(500).json({
        error: 'Search error',
        message: error.message,
      });
    }

    // Generic error
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred',
    });
  });

  return router;
}

/**
 * Search API documentation
 */
export const SEARCH_API_DOCS = {
  endpoints: [
    {
      method: 'POST',
      path: '/api/search',
      description: 'Perform semantic search across all concepts',
      requestBody: {
        query: 'string (required) - The search query',
        limit: 'number (optional) - Maximum results (1-100)',
        threshold: 'number (optional) - Similarity threshold (0-1)',
        folderFilter: 'string[] (optional) - Filter by folder paths',
        includeRelated: 'boolean (optional) - Include related concepts',
        mode: 'string (optional) - Search mode: semantic, keyword, or hybrid',
      },
      responses: {
        200: 'Search results with explanations and context',
        400: 'Invalid request parameters',
        503: 'Search service unavailable',
      },
    },
    {
      method: 'GET',
      path: '/api/search/similar/:conceptId',
      description: 'Find concepts similar to a given concept',
      parameters: {
        conceptId: 'string (required) - The concept ID',
        limit: 'number (optional) - Maximum results (query parameter)',
      },
      responses: {
        200: 'List of similar concepts',
        400: 'Invalid parameters',
        404: 'Concept not found',
      },
    },
    {
      method: 'GET',
      path: '/api/search/suggest',
      description: 'Get search query suggestions',
      parameters: {
        q: 'string (required) - Partial query',
        limit: 'number (optional) - Maximum suggestions',
      },
      responses: {
        200: 'List of query suggestions',
        400: 'Invalid parameters',
      },
    },
    {
      method: 'GET',
      path: '/api/search/stats',
      description: 'Get search system statistics',
      responses: {
        200: 'Search system statistics',
        500: 'Server error',
      },
    },
  ],
};