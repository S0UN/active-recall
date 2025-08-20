/**
 * MemoryContentCache - In-memory implementation of IContentCache
 * 
 * Simple memory-based cache for development and testing.
 * Features:
 * - LRU eviction when max size reached
 * - TTL support with automatic cleanup
 * - Thread-safe operations
 * - Statistics tracking
 */

import { IContentCache, CacheStats, CacheConfig } from '../IContentCache';

interface CacheEntry {
  content: any;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

export class MemoryContentCache implements IContentCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly config: CacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0
  };
  
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      enabled: true,
      provider: 'memory',
      maxSize: 10000, // 10k entries
      defaultTtl: 30 * 24 * 60 * 60, // 30 days
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      ...config
    };

    if (this.config.enabled && this.config.cleanupInterval) {
      this.startCleanupTimer();
    }
  }

  async get(contentHash: string): Promise<any | null> {
    if (!this.config.enabled) return null;

    const entry = this.cache.get(contentHash);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(contentHash);
      this.stats.misses++;
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    return entry.content;
  }

  async set(contentHash: string, content: any, ttl?: number): Promise<void> {
    if (!this.config.enabled) return;

    const ttlMs = (ttl || this.config.defaultTtl!) * 1000;
    const expiresAt = Date.now() + ttlMs;

    const entry: CacheEntry = {
      content,
      expiresAt,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize!) {
      this.evictLRU();
    }

    this.cache.set(contentHash, entry);
    this.stats.sets++;
  }

  async has(contentHash: string): Promise<boolean> {
    if (!this.config.enabled) return false;

    const entry = this.cache.get(contentHash);
    if (!entry) return false;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(contentHash);
      return false;
    }

    return true;
  }

  async delete(contentHash: string): Promise<void> {
    this.cache.delete(contentHash);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async getStats(): Promise<CacheStats> {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      size: this.cache.size,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    let size = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      // Rough estimate: key + JSON-serialized content + metadata
      size += key.length * 2; // UTF-16
      size += JSON.stringify(entry.content).length * 2;
      size += 64; // Metadata overhead
    }

    return size;
  }
}