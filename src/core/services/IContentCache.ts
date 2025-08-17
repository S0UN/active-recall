/**
 * IContentCache - Caching interface for distillation results
 * 
 * Provides efficient caching of LLM distillation results by contentHash.
 * This prevents redundant API calls and improves performance.
 */

import { DistilledContent } from '../contracts/schemas';

/**
 * Interface for content caching
 */
export interface IContentCache {
  /**
   * Get cached distilled content by content hash
   * @param contentHash - SHA-256 hash of the content
   * @returns Promise<DistilledContent | null> - Cached result or null
   */
  get(contentHash: string): Promise<DistilledContent | null>;

  /**
   * Store distilled content in cache
   * @param contentHash - SHA-256 hash of the content
   * @param content - Distilled content to cache
   * @param ttl - Optional TTL in seconds (default: 30 days)
   * @returns Promise<void>
   */
  set(contentHash: string, content: DistilledContent, ttl?: number): Promise<void>;

  /**
   * Check if content exists in cache
   * @param contentHash - SHA-256 hash of the content
   * @returns Promise<boolean> - True if cached
   */
  has(contentHash: string): Promise<boolean>;

  /**
   * Remove content from cache
   * @param contentHash - SHA-256 hash of the content
   * @returns Promise<void>
   */
  delete(contentHash: string): Promise<void>;

  /**
   * Clear all cached content
   * @returns Promise<void>
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   * @returns Promise<CacheStats> - Hit rate, size, etc.
   */
  getStats(): Promise<CacheStats>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  memoryUsage?: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  enabled: boolean;
  provider: 'memory' | 'redis' | 'file';
  maxSize?: number;
  defaultTtl?: number;
  cleanupInterval?: number;
}