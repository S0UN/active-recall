/**
 * Search Query Domain Entity
 * 
 * Pure domain model representing a search query.
 * No dependencies on infrastructure or external libraries.
 * 
 * @module Domain/Search/Entities
 */

/**
 * Value object representing a normalized search term
 */
export class SearchTerm {
  private readonly value: string;

  constructor(term: string) {
    if (!term || term.trim().length === 0) {
      throw new Error('Search term cannot be empty');
    }
    
    if (term.length > 500) {
      throw new Error('Search term too long (max 500 characters)');
    }
    
    this.value = term.trim().toLowerCase();
  }

  /**
   * Get the normalized term value
   */
  getValue(): string {
    return this.value;
  }

  /**
   * Get individual words from the term
   */
  getWords(): string[] {
    return this.value.split(/\s+/).filter(word => word.length > 0);
  }

  /**
   * Check if term contains a word
   */
  contains(word: string): boolean {
    return this.value.includes(word.toLowerCase());
  }

  /**
   * Compare equality with another term
   */
  equals(other: SearchTerm): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Value object representing a similarity threshold
 */
export class SimilarityThreshold {
  private readonly value: number;

  constructor(threshold: number = 0.7) {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    this.value = threshold;
  }

  getValue(): number {
    return this.value;
  }

  /**
   * Check if a score meets this threshold
   */
  isMet(score: number): boolean {
    return score >= this.value;
  }

  toString(): string {
    return this.value.toString();
  }
}

/**
 * Value object representing result limit
 */
export class ResultLimit {
  private readonly value: number;
  private static readonly DEFAULT = 10;
  private static readonly MAX = 100;

  constructor(limit?: number) {
    const val = limit ?? ResultLimit.DEFAULT;
    
    if (val < 1) {
      throw new Error('Limit must be at least 1');
    }
    
    if (val > ResultLimit.MAX) {
      throw new Error(`Limit cannot exceed ${ResultLimit.MAX}`);
    }
    
    this.value = val;
  }

  getValue(): number {
    return this.value;
  }

  /**
   * Apply limit to an array
   */
  apply<T>(items: T[]): T[] {
    return items.slice(0, this.value);
  }

  toString(): string {
    return this.value.toString();
  }
}

/**
 * Value object representing folder filter paths
 */
export class FolderFilter {
  private readonly paths: Set<string>;

  constructor(paths?: string[]) {
    this.paths = new Set(paths?.filter(p => p.length > 0) ?? []);
  }

  /**
   * Check if a path matches the filter
   */
  matches(path: string): boolean {
    if (this.paths.size === 0) return true; // No filter means match all
    
    return Array.from(this.paths).some(filterPath => 
      path.startsWith(filterPath)
    );
  }

  /**
   * Get filter paths as array
   */
  getPaths(): string[] {
    return Array.from(this.paths);
  }

  /**
   * Check if filter is empty
   */
  isEmpty(): boolean {
    return this.paths.size === 0;
  }

  toString(): string {
    return this.paths.size > 0 
      ? `Folders: ${Array.from(this.paths).join(', ')}`
      : 'No folder filter';
  }
}

/**
 * Enum for search modes
 */
export enum SearchMode {
  SEMANTIC = 'semantic',
  KEYWORD = 'keyword',
  HYBRID = 'hybrid'
}

/**
 * Domain entity representing a complete search query
 * 
 * This is a rich domain model with behavior, not just data.
 */
export class SearchQuery {
  private readonly term: SearchTerm;
  private readonly threshold: SimilarityThreshold;
  private readonly limit: ResultLimit;
  private readonly folderFilter: FolderFilter;
  private readonly mode: SearchMode;
  private readonly includeRelated: boolean;

  constructor(params: {
    query: string;
    threshold?: number;
    limit?: number;
    folderFilter?: string[];
    mode?: SearchMode;
    includeRelated?: boolean;
  }) {
    this.term = new SearchTerm(params.query);
    this.threshold = new SimilarityThreshold(params.threshold);
    this.limit = new ResultLimit(params.limit);
    this.folderFilter = new FolderFilter(params.folderFilter);
    this.mode = params.mode ?? SearchMode.SEMANTIC;
    this.includeRelated = params.includeRelated ?? false;
  }

  /**
   * Get the search term
   */
  getTerm(): SearchTerm {
    return this.term;
  }

  /**
   * Get similarity threshold
   */
  getThreshold(): SimilarityThreshold {
    return this.threshold;
  }

  /**
   * Get result limit
   */
  getLimit(): ResultLimit {
    return this.limit;
  }

  /**
   * Get folder filter
   */
  getFolderFilter(): FolderFilter {
    return this.folderFilter;
  }

  /**
   * Get search mode
   */
  getMode(): SearchMode {
    return this.mode;
  }

  /**
   * Check if related concepts should be included
   */
  shouldIncludeRelated(): boolean {
    return this.includeRelated;
  }

  /**
   * Check if this is a semantic search
   */
  isSemanticSearch(): boolean {
    return this.mode === SearchMode.SEMANTIC || this.mode === SearchMode.HYBRID;
  }

  /**
   * Check if this is a keyword search
   */
  isKeywordSearch(): boolean {
    return this.mode === SearchMode.KEYWORD || this.mode === SearchMode.HYBRID;
  }

  /**
   * Create a modified copy with new parameters
   */
  withModifications(params: Partial<{
    query?: string;
    threshold?: number;
    limit?: number;
    folderFilter?: string[];
    mode?: SearchMode;
    includeRelated?: boolean;
  }>): SearchQuery {
    return new SearchQuery({
      query: params.query ?? this.term.getValue(),
      threshold: params.threshold ?? this.threshold.getValue(),
      limit: params.limit ?? this.limit.getValue(),
      folderFilter: params.folderFilter ?? this.folderFilter.getPaths(),
      mode: params.mode ?? this.mode,
      includeRelated: params.includeRelated ?? this.includeRelated,
    });
  }

  /**
   * Get a cache key for this query
   */
  getCacheKey(): string {
    return JSON.stringify({
      query: this.term.getValue(),
      threshold: this.threshold.getValue(),
      limit: this.limit.getValue(),
      folders: this.folderFilter.getPaths().sort(),
      mode: this.mode,
      related: this.includeRelated,
    });
  }

  toString(): string {
    return `SearchQuery: "${this.term}" (${this.mode}, limit: ${this.limit}, threshold: ${this.threshold})`;
  }
}