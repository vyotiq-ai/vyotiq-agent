/**
 * Tool Result Cache
 * 
 * Caches results from idempotent tool executions to avoid redundant operations.
 * This is particularly useful for read operations that may be called multiple
 * times during a single agentic loop.
 */

import type { ToolExecutionResult } from '../../../shared/types';

/**
 * Cached tool result with metadata
 */
interface CachedToolResult {
  /** The cached result */
  result: ToolExecutionResult;
  /** When the result was cached */
  timestamp: number;
  /** Number of cache hits */
  hits: number;
  /** Hash of the arguments for validation */
  argsHash: string;
}

/**
 * Cache configuration
 */
export interface ToolResultCacheConfig {
  /** Maximum age for cached results in ms (default: 60000 = 1 minute) */
  maxAge: number;
  /** Maximum number of cached entries */
  maxSize: number;
  /** Custom TTLs for specific tools */
  toolTTLs?: Record<string, number>;
  /** Enable LRU eviction (default: true) */
  enableLRU: boolean;
}

/**
 * Default TTLs for different tool types (in ms)
 */
const DEFAULT_TOOL_TTLS: Record<string, number> = {
  // File reads - longer TTL, files don't change often during agent loop
  read: 120000,
  read_file: 120000,
  
  // Directory listings - medium TTL
  ls: 60000,
  list_dir: 60000,
  
  // Search results - shorter TTL as workspace may change
  grep: 30000,
  search: 30000,
  glob: 45000,
  find: 45000,
  
  // Code analysis - medium TTL
  symbols: 60000,
  get_symbols: 60000,
  
  // Diagnostics - very short TTL as they change after edits
  diagnostics: 10000,
  get_errors: 10000,
  
  // Workspace info - longer TTL
  workspace_info: 120000,
};

/**
 * Tools that are safe to cache (idempotent, read-only)
 */
const CACHEABLE_TOOLS = new Set([
  'read', 'read_file',
  'ls', 'list_dir',
  'grep', 'search',
  'glob', 'find',
  'symbols', 'get_symbols',
  'diagnostics', 'get_errors',
  'workspace_info',
]);

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ToolResultCacheConfig = {
  maxAge: 60000,
  maxSize: 200,
  enableLRU: true,
};

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries in cache */
  size: number;
  /** Maximum cache size */
  maxSize: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Hit rate percentage */
  hitRate: number;
  /** Entries by tool */
  byTool: Record<string, number>;
}

export class ToolResultCache {
  private cache = new Map<string, CachedToolResult>();
  private config: ToolResultCacheConfig;
  private accessOrder: string[] = []; // For LRU tracking
  
  // Statistics
  private totalHits = 0;
  private totalMisses = 0;

  constructor(config: Partial<ToolResultCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a cache key for a tool call
   */
  private generateKey(tool: string, args: Record<string, unknown>): string {
    const sortedArgs = Object.keys(args)
      .sort()
      .map(k => `${k}:${this.hashValue(args[k])}`)
      .join('|');
    
    return `${tool}::${sortedArgs}`;
  }

  /**
   * Hash a value for cache key generation
   */
  private hashValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Check if a tool is cacheable
   */
  isCacheable(tool: string): boolean {
    return CACHEABLE_TOOLS.has(tool);
  }

  /**
   * Get TTL for a specific tool
   */
  private getTTL(tool: string): number {
    return this.config.toolTTLs?.[tool] || DEFAULT_TOOL_TTLS[tool] || this.config.maxAge;
  }

  /**
   * Get a cached result if valid
   */
  get(tool: string, args: Record<string, unknown>): ToolExecutionResult | null {
    if (!this.isCacheable(tool)) {
      return null;
    }

    const key = this.generateKey(tool, args);
    const cached = this.cache.get(key);

    if (!cached) {
      this.totalMisses++;
      return null;
    }

    // Check if expired
    const ttl = this.getTTL(tool);
    if (Date.now() - cached.timestamp > ttl) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.totalMisses++;
      return null;
    }

    // Update access order for LRU
    if (this.config.enableLRU) {
      this.updateAccessOrder(key);
    }

    cached.hits++;
    this.totalHits++;
    return cached.result;
  }

  /**
   * Store a result in the cache
   */
  set(tool: string, args: Record<string, unknown>, result: ToolExecutionResult): void {
    if (!this.isCacheable(tool)) {
      return;
    }

    // Don't cache failed results
    if (!result.success) {
      return;
    }

    const key = this.generateKey(tool, args);

    // Evict entries if at capacity
    while (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      hits: 0,
      argsHash: JSON.stringify(args),
    });

    if (this.config.enableLRU) {
      this.updateAccessOrder(key);
    }
  }

  /**
   * Invalidate cache for a specific path
   * Called when a file is modified
   */
  invalidatePath(path: string): number {
    let invalidated = 0;
    
    for (const [key, cached] of this.cache.entries()) {
      // Check if this cache entry references the path
      if (cached.argsHash.includes(path)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * Invalidate all cache entries for a specific tool
   */
  invalidateTool(tool: string): number {
    let invalidated = 0;
    const prefix = `${tool}::`;

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * Invalidate entire cache
   */
  invalidateAll(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Evict the oldest entry (LRU)
   */
  private evictOldest(): void {
    if (this.config.enableLRU && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    } else {
      // Fall back to FIFO
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      const tool = key.split('::')[0];
      const ttl = this.getTTL(tool);
      
      if (now - cached.timestamp > ttl) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const byTool: Record<string, number> = {};
    
    for (const key of this.cache.keys()) {
      const tool = key.split('::')[0];
      byTool[tool] = (byTool[tool] || 0) + 1;
    }

    const total = this.totalHits + this.totalMisses;
    const hitRate = total > 0 ? (this.totalHits / total) * 100 : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.totalHits,
      misses: this.totalMisses,
      hitRate: Math.round(hitRate * 100) / 100,
      byTool,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalHits = 0;
    this.totalMisses = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ToolResultCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Singleton instance
 */
let toolResultCache: ToolResultCache | null = null;

/**
 * Get the tool result cache instance
 */
export function getToolResultCache(): ToolResultCache {
  if (!toolResultCache) {
    toolResultCache = new ToolResultCache();
  }
  return toolResultCache;
}

/**
 * Reset the cache singleton (useful for testing)
 */
export function resetToolResultCache(): void {
  toolResultCache = null;
}
