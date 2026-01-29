/**
 * Context Cache
 * 
 * Advanced caching system for agent context including:
 * - File content caching with TTL
 * - Symbol cache for code intelligence
 * - Semantic cache for similar queries
 * - LRU eviction strategy
 * 
 * @see docs/IMPLEMENTATION_DETAILS.md - Performance Optimizations
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** When entry was created */
  createdAt: number;
  /** When entry was last accessed */
  lastAccessedAt: number;
  /** Time-to-live in milliseconds (0 = no expiry) */
  ttl: number;
  /** Size estimate in bytes */
  sizeBytes: number;
  /** Number of times this entry was accessed */
  accessCount: number;
  /** Cache key */
  key: string;
  /** Tags for grouping/invalidation */
  tags: string[];
}

/**
 * Context cache configuration
 */
export interface ContextCacheConfig {
  /** Maximum number of entries */
  maxEntries: number;
  /** Maximum cache size in bytes */
  maxSizeBytes: number;
  /** Default TTL in milliseconds */
  defaultTTL: number;
  /** Enable LRU eviction */
  enableLRU: boolean;
  /** Enable TTL-based expiration */
  enableTTL: boolean;
  /** Cleanup interval in milliseconds */
  cleanupIntervalMs: number;
}

/**
 * Cache statistics
 */
export interface ContextCacheStats {
  /** Total entries in cache */
  entries: number;
  /** Total size in bytes */
  sizeBytes: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Evictions due to size/count limits */
  evictions: number;
  /** Expirations due to TTL */
  expirations: number;
  /** Tags in use */
  tags: string[];
}

/**
 * Default cache configuration
 */
export const DEFAULT_CONTEXT_CACHE_CONFIG: ContextCacheConfig = {
  maxEntries: 1000,
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  enableLRU: true,
  enableTTL: true,
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

// =============================================================================
// Context Cache Implementation
// =============================================================================

/**
 * Advanced caching system for agent context
 * 
 * Features:
 * - Generic type support for different cached values
 * - LRU eviction when cache is full
 * - TTL-based expiration
 * - Tag-based invalidation
 * - Size-aware caching
 */
export class ContextCache<T = unknown> {
  private readonly logger = createLogger('ContextCache');
  private cache = new Map<string, CacheEntry<T>>();
  private config: ContextCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };
  private totalSizeBytes = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private tagIndex = new Map<string, Set<string>>(); // tag -> keys
  private estimateSizeErrorLogged = false;

  constructor(config: Partial<ContextCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CACHE_CONFIG, ...config };
    
    // Start cleanup timer if TTL is enabled
    if (this.config.enableTTL && this.config.cleanupIntervalMs > 0) {
      this.startCleanupTimer();
    }
  }

  // ===========================================================================
  // Core Operations
  // ===========================================================================

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }
    
    // Check TTL expiration
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      this.stats.expirations++;
      return undefined;
    }
    
    // Update access metadata
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(
    key: string,
    value: T,
    options?: {
      ttl?: number;
      tags?: string[];
      sizeBytes?: number;
    }
  ): void {
    const now = Date.now();
    const sizeBytes = options?.sizeBytes ?? this.estimateSize(value);
    const ttl = options?.ttl ?? this.config.defaultTTL;
    const tags = options?.tags ?? [];
    
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }
    
    // Make room if needed
    this.ensureCapacity(sizeBytes);
    
    // Create entry
    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: now,
      lastAccessedAt: now,
      ttl,
      sizeBytes,
      accessCount: 0,
      tags,
    };
    
    // Add to cache
    this.cache.set(key, entry);
    this.totalSizeBytes += sizeBytes;
    
    // Update tag index
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)?.add(key);
    }
  }

  /**
   * Check if key exists in cache (without updating access time)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check expiration
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Update size
    this.totalSizeBytes -= entry.sizeBytes;
    
    // Remove from tag index
    for (const tag of entry.tags) {
      this.tagIndex.get(tag)?.delete(key);
    }
    
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.tagIndex.clear();
    this.totalSizeBytes = 0;
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet(
    key: string,
    factory: () => T | Promise<T>,
    options?: {
      ttl?: number;
      tags?: string[];
      sizeBytes?: number;
    }
  ): Promise<T> {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }
    
    const value = await factory();
    this.set(key, value, options);
    return value;
  }

  // ===========================================================================
  // Tag-Based Operations
  // ===========================================================================

  /**
   * Invalidate all entries with a specific tag
   */
  invalidateByTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;
    
    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        count++;
      }
    }
    
    this.tagIndex.delete(tag);
    return count;
  }

  /**
   * Get all entries with a specific tag
   */
  getByTag(tag: string): T[] {
    const keys = this.tagIndex.get(tag);
    if (!keys) return [];
    
    const values: T[] = [];
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        values.push(value);
      }
    }
    
    return values;
  }

  /**
   * Get all tags currently in use
   */
  getTags(): string[] {
    return Array.from(this.tagIndex.keys());
  }

  // ===========================================================================
  // Statistics and Monitoring
  // ===========================================================================

  /**
   * Get cache statistics
   */
  getStats(): ContextCacheStats {
    const total = this.stats.hits + this.stats.misses;
    
    return {
      entries: this.cache.size,
      sizeBytes: this.totalSizeBytes,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
      tags: this.getTags(),
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): ContextCacheConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ContextCacheConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart cleanup timer if interval changed
    if (config.cleanupIntervalMs !== undefined) {
      this.stopCleanupTimer();
      if (this.config.enableTTL && this.config.cleanupIntervalMs > 0) {
        this.startCleanupTimer();
      }
    }
  }

  // ===========================================================================
  // Internal Methods
  // ===========================================================================

  /**
   * Check if an entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    if (!this.config.enableTTL || entry.ttl === 0) {
      return false;
    }
    return Date.now() > entry.createdAt + entry.ttl;
  }

  /**
   * Ensure there's capacity for a new entry
   */
  private ensureCapacity(requiredBytes: number): void {
    // Check entry count limit
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }
    
    // Check size limit
    while (this.totalSizeBytes + requiredBytes > this.config.maxSizeBytes) {
      if (!this.evictLRU()) {
        break; // No more entries to evict
      }
    }
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): boolean {
    if (this.cache.size === 0) return false;
    
    let lruKey: string | null = null;
    let lruTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.delete(lruKey);
      this.stats.evictions++;
      return true;
    }
    
    return false;
  }

  /**
   * Estimate size of a value in bytes
   */
  private estimateSize(value: T): number {
    try {
      return JSON.stringify(value).length * 2; // Rough estimate (UTF-16)
    } catch (error) {
      if (!this.estimateSizeErrorLogged) {
        this.estimateSizeErrorLogged = true;
        this.logger.debug('Failed to estimate cache entry size via JSON.stringify; using default estimate', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return 1024; // Default estimate for non-serializable values
    }
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.delete(key);
        this.stats.expirations++;
      }
    }
  }

  /**
   * Dispose of cache resources
   */
  dispose(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

// =============================================================================
// Specialized Caches
// =============================================================================

/**
 * File content cache
 */
export interface FileContentEntry {
  content: string;
  lineCount: number;
  encoding: string;
  mtime: number;
}

/**
 * Create a file content cache
 */
export function createFileContentCache(
  config?: Partial<ContextCacheConfig>
): ContextCache<FileContentEntry> {
  return new ContextCache<FileContentEntry>({
    maxEntries: 500,
    maxSizeBytes: 100 * 1024 * 1024, // 100MB for file contents
    defaultTTL: 10 * 60 * 1000, // 10 minutes
    ...config,
  });
}

/**
 * Symbol cache entry
 */
export interface SymbolCacheEntry {
  symbols: Array<{
    name: string;
    kind: string;
    line: number;
    containerName?: string;
  }>;
  fileHash: string;
}

/**
 * Create a symbol cache
 */
export function createSymbolCache(
  config?: Partial<ContextCacheConfig>
): ContextCache<SymbolCacheEntry> {
  return new ContextCache<SymbolCacheEntry>({
    maxEntries: 200,
    maxSizeBytes: 20 * 1024 * 1024, // 20MB for symbols
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    ...config,
  });
}

/**
 * Generate a cache key from file path and optional version
 */
export function generateFileKey(filePath: string, version?: string | number): string {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (version !== undefined) {
    return `${normalized}@${version}`;
  }
  return normalized;
}

/**
 * Generate a cache key from hash of content
 */
export function generateContentKey(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// =============================================================================
// Global Instance
// =============================================================================

let globalContextCache: ContextCache | null = null;

/**
 * Get or create the global context cache
 */
export function getContextCache(): ContextCache {
  if (!globalContextCache) {
    globalContextCache = new ContextCache();
  }
  return globalContextCache;
}

/**
 * Reset the global context cache
 */
export function resetContextCache(): void {
  if (globalContextCache) {
    globalContextCache.dispose();
    globalContextCache = null;
  }
}
