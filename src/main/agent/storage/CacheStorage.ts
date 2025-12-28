/**
 * Cache Storage Module
 *
 * Ephemeral cache storage with TTL support.
 * Used for caching tool results, validation outcomes,
 * and other frequently accessed data.
 */
import { getStorageManager, type StorageResult } from './StorageManager';
import { createLogger } from '../../logger';

const logger = createLogger('CacheStorage');

/**
 * Cached item wrapper
 */
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Maximum number of entries */
  maxEntries: number;
  /** Enable LRU eviction */
  enableLruEviction: boolean;
  /** Persist cache between sessions */
  persistCache: boolean;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  defaultTtlMs: 300000, // 5 minutes
  maxEntries: 1000,
  enableLruEviction: true,
  persistCache: false,
};

/**
 * Cache statistics
 */
export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  expirations: number;
}

/**
 * Cache Storage Manager
 */
export class CacheStorage {
  private readonly storage = getStorageManager();
  private readonly config: CacheConfig;
  private readonly cache = new Map<string, CacheEntry>();
  private stats: CacheStats = {
    entries: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
    evictions: 0,
    expirations: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  /**
   * Initialize cache
   */
  async initialize(): Promise<void> {
    if (this.config.persistCache) {
      await this.loadFromDisk();
    }
    logger.info('Cache storage initialized', { maxEntries: this.config.maxEntries });
  }

  /**
   * Get a cached value
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.entries = this.cache.size;
      this.stats.expirations++;
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.stats.hits++;
    this.updateHitRate();

    return entry.value as T;
  }

  /**
   * Set a cached value
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.config.defaultTtlMs;
    const now = Date.now();

    // Evict if at capacity
    if (!this.cache.has(key) && this.cache.size >= this.config.maxEntries) {
      this.evict();
    }

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: now,
      expiresAt: now + ttl,
      accessCount: 0,
      lastAccessedAt: now,
    };

    this.cache.set(key, entry);
    this.stats.entries = this.cache.size;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.entries = this.cache.size;
      this.stats.expirations++;
      return false;
    }

    return true;
  }

  /**
   * Delete a cached value
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.stats.entries = this.cache.size;
    return result;
  }

  /**
   * Invalidate entries matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.stats.entries = this.cache.size;
    return count;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.entries = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      entries: this.cache.size,
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      expirations: 0,
    };
  }

  /**
   * Clean up expired entries
   */
  vacuum(): number {
    const now = Date.now();
    let expired = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        expired++;
      }
    }

    this.stats.entries = this.cache.size;
    this.stats.expirations += expired;

    if (expired > 0) {
      logger.debug('Cache vacuum', { expired });
    }

    return expired;
  }

  /**
   * Get all entries (for debugging)
   */
  getEntries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Persist cache to disk (if enabled)
   */
  async persist(): Promise<StorageResult<void>> {
    if (!this.config.persistCache) {
      return { success: true };
    }

    // Clean expired before persisting
    this.vacuum();

    const entries = Array.from(this.cache.entries());
    return this.storage.write('cache', 'persistent-cache', { entries });
  }

  /**
   * Evict an entry based on LRU or oldest
   */
  private evict(): void {
    if (this.cache.size === 0) return;

    let keyToEvict: string | null = null;

    if (this.config.enableLruEviction) {
      // Find least recently used
      let lruTime = Infinity;
      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessedAt < lruTime) {
          lruTime = entry.lastAccessedAt;
          keyToEvict = key;
        }
      }
    } else {
      // Evict oldest by creation time
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache.entries()) {
        if (entry.createdAt < oldestTime) {
          oldestTime = entry.createdAt;
          keyToEvict = key;
        }
      }
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.stats.evictions++;
    }
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Load cache from disk
   */
  private async loadFromDisk(): Promise<void> {
    const result = await this.storage.read<{ entries: [string, CacheEntry][] }>('cache', 'persistent-cache');

    if (result.success && result.data?.entries) {
      const now = Date.now();
      for (const [key, entry] of result.data.entries) {
        // Only load non-expired entries
        if (entry.expiresAt > now) {
          this.cache.set(key, entry);
        }
      }
      this.stats.entries = this.cache.size;
      logger.info('Loaded cache from disk', { entries: this.cache.size });
    }
  }
}

// Singleton instance
let cacheStorageInstance: CacheStorage | null = null;

/**
 * Get or create the cache storage singleton
 */
export function getCacheStorage(config?: Partial<CacheConfig>): CacheStorage {
  if (!cacheStorageInstance) {
    cacheStorageInstance = new CacheStorage(config);
  }
  return cacheStorageInstance;
}
