/**
 * Semantic Search Service Implementation
 * 
 * Provides RAG-based semantic search capabilities using vector embeddings
 * and intelligent result ranking. Follows clean architecture principles
 * with clear separation of concerns.
 * 
 * @module SemanticSearchService
 */

import {
  ISearchService,
  SearchQuery,
  SearchResponse,
  SearchResult,
  SearchExplanation,
  FolderContext,
  RelatedConcept,
  SearchStatistics,
  SearchServiceConfig,
  TextHighlight,
  SearchMetadata,
  QueryProcessingError,
  IndexNotReadyError,
} from '../ISearchService';
import { IVectorIndexManager, SimilarConcept } from '../IVectorIndexManager';
import { IEmbeddingService } from '../IEmbeddingService';
import { IConceptArtifactRepository, IFolderRepository } from '../../contracts/repositories';
import { ConceptArtifact, FolderManifest } from '../../contracts/schemas';
import { FolderPath } from '../../domain/FolderPath';

/**
 * Cache entry for search results
 */
interface CacheEntry {
  response: SearchResponse;
  timestamp: number;
}

/**
 * Semantic Search Service
 * 
 * Implements RAG-based search with:
 * - Vector similarity search
 * - Keyword matching
 * - Result explanation
 * - Folder context
 * - Related concept discovery
 */
export class SemanticSearchService implements ISearchService {
  private searchCache: Map<string, CacheEntry> = new Map();
  
  constructor(
    private readonly vectorIndex: IVectorIndexManager,
    private readonly embeddingService: IEmbeddingService,
    private readonly conceptRepo: IConceptArtifactRepository,
    private readonly folderRepo: IFolderRepository,
    private readonly config: SearchServiceConfig
  ) {}

  /**
   * Perform semantic search across all concepts
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    
    // Check if index is ready
    const indexReady = await this.vectorIndex.isReady();
    if (!indexReady) {
      throw new IndexNotReadyError();
    }
    
    // Check cache if enabled
    const cacheKey = this.getCacheKey(query);
    if (this.config.cacheConfig?.enabled) {
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    try {
      // Process query and get embeddings
      const processedQuery = this.processQuery(query.query);
      const queryEmbedding = await this.getQueryEmbedding(processedQuery);
      
      // Perform vector search
      const vectorMatches = await this.performVectorSearch(queryEmbedding, query);
      
      // Filter and rank results
      const rankedResults = await this.rankAndFilterResults(
        vectorMatches,
        query,
        processedQuery
      );
      
      // Build search results with explanations
      const results = await this.buildSearchResults(
        rankedResults,
        query,
        processedQuery
      );
      
      // Count total valid matches (artifacts that were found)
      let totalValidMatches = 0;
      for (const match of vectorMatches) {
        const artifact = await this.conceptRepo.findById(match.conceptId);
        if (artifact) totalValidMatches++;
      }
      
      // Generate response
      const response: SearchResponse = {
        results,
        totalMatches: totalValidMatches,
        executionTime: Date.now() - startTime,
        suggestions: await this.generateSuggestions(query.query, results),
        metadata: this.buildMetadata(
          processedQuery,
          queryEmbedding,
          results,
          'vector'
        ),
      };
      
      // Cache response if enabled
      if (this.config.cacheConfig?.enabled) {
        this.cacheResponse(cacheKey, response);
      }
      
      return response;
      
    } catch (error) {
      throw new QueryProcessingError(query.query, error as Error);
    }
  }

  /**
   * Find similar concepts to a given concept
   */
  async findSimilar(conceptId: string, limit: number = 10): Promise<RelatedConcept[]> {
    // Get the base concept
    const baseConcept = await this.conceptRepo.findById(conceptId);
    if (!baseConcept || !baseConcept.embeddings) {
      return [];
    }
    
    // Search for similar concepts using the concept's embedding
    const similarMatches = await this.vectorIndex.searchByContext({
      vector: baseConcept.embeddings.vector,
      threshold: 0.7,
      limit: limit + 1, // +1 to exclude self
    });
    
    // Filter out self and build related concepts
    const relatedConcepts: RelatedConcept[] = [];
    
    for (const match of similarMatches) {
      if (match.conceptId === conceptId) continue;
      
      const artifact = await this.conceptRepo.findById(match.conceptId);
      if (!artifact) continue;
      
      relatedConcepts.push({
        conceptId: match.conceptId,
        title: artifact.title,
        relationshipType: this.determineRelationshipType(match.similarity),
        strength: match.similarity,
        folderPath: artifact.routing.primaryPath,
      });
      
      if (relatedConcepts.length >= limit) break;
    }
    
    return relatedConcepts;
  }

  /**
   * Suggest query completions
   */
  async suggest(partial: string, limit: number = 5): Promise<string[]> {
    // Simple implementation - in production, would use a proper suggestion index
    const suggestions: string[] = [];
    const lowerPartial = partial.toLowerCase();
    
    // Common search patterns
    const commonPatterns = [
      'neural networks',
      'machine learning',
      'deep learning',
      'gradient descent',
      'backpropagation',
      'convolutional',
      'recurrent',
      'transformer',
      'optimization',
      'classification',
    ];
    
    for (const pattern of commonPatterns) {
      if (pattern.toLowerCase().startsWith(lowerPartial)) {
        suggestions.push(pattern);
        if (suggestions.length >= limit) break;
      }
    }
    
    return suggestions;
  }

  /**
   * Get search system statistics
   */
  async getStatistics(): Promise<SearchStatistics> {
    const [totalConcepts, totalFolders, indexReady] = await Promise.all([
      this.conceptRepo.count(),
      this.folderRepo.count(),
      this.vectorIndex.isReady(),
    ]);
    
    return {
      totalConcepts,
      totalFolders,
      avgConceptsPerFolder: totalFolders > 0 ? totalConcepts / totalFolders : 0,
      indexHealth: indexReady ? 'healthy' : 'degraded',
      lastIndexUpdate: new Date(), // Would track this properly in production
    };
  }

  // ==================== Private Helper Methods ====================

  /**
   * Process and clean the query
   */
  private processQuery(query: string): string {
    let processed = query.trim().toLowerCase();
    
    // Apply spell correction if enabled
    if (this.config.enableSpellCorrection) {
      processed = this.applySpellCorrection(processed);
    }
    
    // Apply query expansion if enabled
    if (this.config.enableQueryExpansion) {
      processed = this.expandQuery(processed);
    }
    
    return processed;
  }

  /**
   * Get embedding for the query
   */
  private async getQueryEmbedding(query: string): Promise<number[]> {
    const embedding = await this.embeddingService.embed(query);
    return embedding.vector;
  }

  /**
   * Perform vector similarity search
   */
  private async performVectorSearch(
    queryEmbedding: number[],
    query: SearchQuery
  ): Promise<SimilarConcept[]> {
    const threshold = query.threshold ?? this.config.defaultThreshold;
    const limit = query.limit ?? this.config.defaultLimit;
    
    const matches = await this.vectorIndex.searchByContext({
      vector: queryEmbedding,
      threshold,
      limit: limit * 3, // Get more for filtering
    });
    
    return matches;
  }

  /**
   * Rank and filter search results
   */
  private async rankAndFilterResults(
    matches: SimilarConcept[],
    query: SearchQuery,
    processedQuery: string
  ): Promise<SimilarConcept[]> {
    let filtered = matches;
    
    // Apply folder filter if specified
    if (query.folderFilter && query.folderFilter.length > 0) {
      filtered = await this.filterByFolders(matches, query.folderFilter);
    }
    
    // Apply threshold filter
    const threshold = query.threshold ?? this.config.defaultThreshold;
    filtered = filtered.filter(m => m.similarity >= threshold);
    
    // Sort by similarity
    filtered.sort((a, b) => b.similarity - a.similarity);
    
    // Apply limit
    const limit = query.limit ?? this.config.defaultLimit;
    return filtered.slice(0, limit);
  }

  /**
   * Filter matches by folder paths
   */
  private async filterByFolders(
    matches: SimilarConcept[],
    folderFilter: string[]
  ): Promise<SimilarConcept[]> {
    const filtered: SimilarConcept[] = [];
    
    for (const match of matches) {
      const artifact = await this.conceptRepo.findById(match.conceptId);
      if (!artifact) continue;
      
      const primaryPath = artifact.routing.primaryPath;
      const isInFilter = folderFilter.some(filter => 
        primaryPath.startsWith(filter)
      );
      
      if (isInFilter) {
        filtered.push(match);
      }
    }
    
    return filtered;
  }

  /**
   * Build search results with full context
   */
  private async buildSearchResults(
    matches: SimilarConcept[],
    query: SearchQuery,
    processedQuery: string
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    
    for (const match of matches) {
      const artifact = await this.conceptRepo.findById(match.conceptId);
      if (!artifact) continue;
      
      const folderPath = FolderPath.fromString(artifact.routing.primaryPath);
      const folder = await this.folderRepo.findByPath(folderPath);
      if (!folder) continue;
      
      // Build explanation
      const explanation = this.buildExplanation(
        artifact,
        match,
        processedQuery
      );
      
      // Build folder context
      const folderContext = this.buildFolderContext(folder, artifact);
      
      // Get related concepts if requested
      let relatedConcepts: RelatedConcept[] | undefined;
      if (query.includeRelated) {
        relatedConcepts = await this.findSimilar(artifact.artifactId, 3);
      }
      
      results.push({
        artifact,
        score: match.similarity,
        explanation,
        folderContext,
        relatedConcepts,
      });
    }
    
    return results;
  }

  /**
   * Build explanation for why a result matched
   */
  private buildExplanation(
    artifact: ConceptArtifact,
    match: SimilarConcept,
    query: string
  ): SearchExplanation {
    const highlights = this.findHighlights(artifact, query);
    const matchType = this.determineMatchType(artifact, query, match.similarity);
    
    return {
      matchType,
      highlights,
      semanticScore: match.similarity,
      keywordScore: this.calculateKeywordScore(artifact, query),
      contextScore: match.similarity * 0.8, // Simplified
    };
  }

  /**
   * Find text highlights in the artifact
   */
  private findHighlights(
    artifact: ConceptArtifact,
    query: string
  ): TextHighlight[] {
    const highlights: TextHighlight[] = [];
    const queryWords = query.toLowerCase().split(/\s+/);
    
    // Check title
    const titleLower = artifact.title.toLowerCase();
    for (const word of queryWords) {
      const index = titleLower.indexOf(word);
      if (index !== -1) {
        highlights.push({
          field: 'title',
          fragment: artifact.title,
          startPos: index,
          endPos: index + word.length,
        });
      }
    }
    
    // Check summary
    const summaryLower = artifact.summary.toLowerCase();
    for (const word of queryWords) {
      const index = summaryLower.indexOf(word);
      if (index !== -1) {
        const start = Math.max(0, index - 20);
        const end = Math.min(artifact.summary.length, index + word.length + 20);
        highlights.push({
          field: 'summary',
          fragment: '...' + artifact.summary.substring(start, end) + '...',
          startPos: index - start + 3, // Account for '...'
          endPos: index - start + 3 + word.length,
        });
      }
    }
    
    return highlights;
  }

  /**
   * Determine the type of match
   */
  private determineMatchType(
    artifact: ConceptArtifact,
    query: string,
    similarity: number
  ): 'exact' | 'semantic' | 'keyword' | 'related' {
    // Check for exact title match
    if (artifact.title.toLowerCase() === query.toLowerCase()) {
      return 'exact';
    }
    
    // High similarity indicates semantic match
    if (similarity > 0.85) {
      return 'semantic';
    }
    
    // Check for keyword match
    const keywordScore = this.calculateKeywordScore(artifact, query);
    if (keywordScore > 0.5) {
      return 'keyword';
    }
    
    return 'related';
  }

  /**
   * Calculate keyword match score
   */
  private calculateKeywordScore(
    artifact: ConceptArtifact,
    query: string
  ): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = new Set(
      (artifact.title + ' ' + artifact.summary)
        .toLowerCase()
        .split(/\s+/)
    );
    
    let matches = 0;
    for (const word of queryWords) {
      if (textWords.has(word)) {
        matches++;
      }
    }
    
    return queryWords.length > 0 ? matches / queryWords.length : 0;
  }

  /**
   * Determine relationship type based on similarity
   */
  private determineRelationshipType(
    similarity: number
  ): 'similar' | 'prerequisite' | 'followup' | 'crossReference' {
    if (similarity > 0.9) return 'similar';
    if (similarity > 0.8) return 'crossReference';
    if (similarity > 0.7) return 'prerequisite';
    return 'followup';
  }

  /**
   * Build folder context for a result
   */
  private buildFolderContext(
    folder: FolderManifest,
    artifact: ConceptArtifact
  ): FolderContext {
    const pathParts = artifact.routing.primaryPath
      .split('/')
      .filter(p => p.length > 0);
    
    return {
      folder,
      breadcrumb: pathParts,
      siblingCount: folder.stats.artifactCount,
      description: folder.description,
    };
  }

  /**
   * Generate query suggestions based on results
   */
  private async generateSuggestions(
    query: string,
    results: SearchResult[]
  ): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Extract common terms from top results
    if (results.length > 0) {
      const topTitles = results.slice(0, 3).map(r => r.artifact.title);
      const commonWords = this.extractCommonWords(topTitles);
      
      for (const word of commonWords) {
        if (!query.toLowerCase().includes(word.toLowerCase())) {
          suggestions.push(`${query} ${word}`);
        }
      }
    }
    
    return suggestions.slice(0, 3);
  }

  /**
   * Extract common words from titles
   */
  private extractCommonWords(titles: string[]): string[] {
    const wordCounts = new Map<string, number>();
    
    for (const title of titles) {
      const words = title.split(/\s+/)
        .filter(w => w.length > 3)
        .map(w => w.toLowerCase());
      
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
    
    // Return words that appear in multiple titles
    return Array.from(wordCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([word, _]) => word)
      .slice(0, 5);
  }

  /**
   * Build search metadata
   */
  private buildMetadata(
    processedQuery: string,
    queryEmbedding: number[],
    results: SearchResult[],
    strategy: 'vector' | 'keyword' | 'hybrid'
  ): SearchMetadata {
    const uniqueFolders = new Set(
      results.map(r => r.artifact.routing.primaryPath)
    );
    
    return {
      processedQuery,
      queryEmbedding,
      foldersSearched: uniqueFolders.size,
      conceptsEvaluated: results.length,
      strategy,
    };
  }

  /**
   * Simple spell correction (production would use proper library)
   */
  private applySpellCorrection(query: string): string {
    // Simple replacement for common misspellings
    const corrections: Record<string, string> = {
      'nural': 'neural',
      'netwrok': 'network',
      'machien': 'machine',
      'learing': 'learning',
      'algoritm': 'algorithm',
    };
    
    let corrected = query;
    for (const [wrong, right] of Object.entries(corrections)) {
      corrected = corrected.replace(new RegExp(wrong, 'gi'), right);
    }
    
    return corrected;
  }

  /**
   * Expand query with synonyms
   */
  private expandQuery(query: string): string {
    // Simple synonym expansion
    const synonyms: Record<string, string[]> = {
      'nn': ['neural network'],
      'ml': ['machine learning'],
      'dl': ['deep learning'],
      'ai': ['artificial intelligence'],
    };
    
    let expanded = query;
    for (const [abbr, expansions] of Object.entries(synonyms)) {
      if (query.includes(abbr)) {
        expanded = `${expanded} ${expansions.join(' ')}`;
      }
    }
    
    return expanded;
  }

  /**
   * Generate cache key for query
   */
  private getCacheKey(query: SearchQuery): string {
    return JSON.stringify({
      query: query.query,
      limit: query.limit,
      threshold: query.threshold,
      folderFilter: query.folderFilter,
      mode: query.mode,
    });
  }

  /**
   * Get cached response if valid
   */
  private getCachedResponse(key: string): SearchResponse | null {
    const entry = this.searchCache.get(key);
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    const ttl = (this.config.cacheConfig?.ttl || 300) * 1000;
    
    if (age > ttl) {
      this.searchCache.delete(key);
      return null;
    }
    
    return entry.response;
  }

  /**
   * Cache search response
   */
  private cacheResponse(key: string, response: SearchResponse): void {
    // Enforce max cache size
    const maxSize = this.config.cacheConfig?.maxSize || 100;
    if (this.searchCache.size >= maxSize) {
      // Remove oldest entry
      const firstKey = this.searchCache.keys().next().value;
      if (firstKey) {
        this.searchCache.delete(firstKey);
      }
    }
    
    this.searchCache.set(key, {
      response,
      timestamp: Date.now(),
    });
  }
}