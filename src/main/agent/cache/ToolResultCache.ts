/**
 * Tool Result Cache
 * 
 * Caches results from idempotent tool executions to avoid redundant operations.
 * This is particularly useful for read operations that may be called multiple
 * times during a single agentic loop.
 */

import { gzipSync, gunzipSync } from 'zlib';
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
  /** Whether the output is compressed */
  compressed: boolean;
  /** Original size before compression (only set if compressed) */
  originalSize?: number;
  /** Compressed size (only set if compressed) */
  compressedSize?: number;
  /** Session ID that created this cache entry (for session-scoped clearing) */
  sessionId?: string;
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
  /** Compression threshold in bytes (default: 4096 = 4KB) */
  compressionThreshold: number;
  /** Enable compression (default: true) */
  enableCompression: boolean;
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
  compressionThreshold: 65536, // 64KB - raised from 16KB to reduce main-thread gzipSync blocking
  enableCompression: true,
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
  /** Estimated tokens saved by cache hits */
  estimatedTokensSaved: number;
  /** Number of compressed entries */
  compressedEntries: number;
  /** Total bytes saved by compression */
  compressionBytesSaved: number;
  /** Average compression ratio (original/compressed) */
  averageCompressionRatio: number;
  /** Number of sessions with cache entries */
  sessionsWithCache: number;
  /** Entries by session */
  bySession: Record<string, number>;
}

export class ToolResultCache {
  private cache = new Map<string, CachedToolResult>();
  private config: ToolResultCacheConfig;
  // LRU tracking: Map preserves insertion order and has O(1) delete + re-insert
  // Using Map<string, true> instead of string[] for O(1) updateAccessOrder
  private accessOrderMap = new Map<string, true>();
  /** Index of cache keys by session ID for fast session clearing */
  private sessionIndex = new Map<string, Set<string>>();
  /** Secondary index: path -> Set<cache keys> for fast path-based invalidation */
  private pathIndex = new Map<string, Set<string>>();
  
  // Statistics
  private totalHits = 0;
  private totalMisses = 0;
  private estimatedTokensSaved = 0;

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
    
    // Decompress if needed
    let result = cached.result;
    if (cached.compressed) {
      result = this.decompressResult(cached.result);
    }
    
    // Track estimated token savings (roughly 4 chars per token)
    const tokensSaved = Math.ceil(result.output.length / 4);
    this.estimatedTokensSaved += tokensSaved;
    
    return result;
  }

  /**
   * Store a result in the cache
   * @param tool - Tool name
   * @param args - Tool arguments
   * @param result - Tool execution result
   * @param sessionId - Optional session ID for session-scoped cache clearing
   */
  set(tool: string, args: Record<string, unknown>, result: ToolExecutionResult, sessionId?: string): void {
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

    // Check if compression is needed
    const outputSize = result.output.length;
    const shouldCompress = this.config.enableCompression && outputSize > this.config.compressionThreshold;
    
    let cachedResult = result;
    let compressed = false;
    let originalSize: number | undefined;
    let compressedSize: number | undefined;
    
    if (shouldCompress) {
      const compressionResult = this.compressResult(result);
      cachedResult = compressionResult.result;
      compressed = true;
      originalSize = outputSize;
      compressedSize = compressionResult.result.output.length;
    }

    this.cache.set(key, {
      result: cachedResult,
      timestamp: Date.now(),
      hits: 0,
      argsHash: JSON.stringify(args),
      compressed,
      originalSize,
      compressedSize,
      sessionId,
    });

    // Track session index for fast session clearing
    if (sessionId) {
      let sessionKeys = this.sessionIndex.get(sessionId);
      if (!sessionKeys) {
        sessionKeys = new Set();
        this.sessionIndex.set(sessionId, sessionKeys);
      }
      sessionKeys.add(key);
    }

    // Track path index for fast path-based invalidation
    this.indexPathsForKey(key, args);

    if (this.config.enableLRU) {
      this.updateAccessOrder(key);
    }
  }

  /**
   * Extract file paths from tool arguments and index them for fast invalidation
   */
  private indexPathsForKey(key: string, args: Record<string, unknown>): void {
    const paths: string[] = [];
    // Common argument names that contain file paths
    for (const argName of ['path', 'file', 'filePath', 'file_path', 'directory', 'dir']) {
      const val = args[argName];
      if (typeof val === 'string' && val.length > 0) {
        paths.push(val);
      }
    }
    for (const p of paths) {
      let pathKeys = this.pathIndex.get(p);
      if (!pathKeys) {
        pathKeys = new Set();
        this.pathIndex.set(p, pathKeys);
      }
      pathKeys.add(key);
    }
  }

  /**
   * Remove a key from the path index
   */
  private removeFromPathIndex(key: string): void {
    for (const [, keys] of this.pathIndex) {
      keys.delete(key);
    }
  }

  /**
   * Invalidate cache for a specific path
   * Called when a file is modified.
   * Uses the path index for O(1) lookup instead of scanning all entries.
   */
  invalidatePath(path: string): number {
    let invalidated = 0;
    
    // Use path index for fast lookup
    const indexedKeys = this.pathIndex.get(path);
    if (indexedKeys) {
      for (const key of indexedKeys) {
        if (this.cache.has(key)) {
          this.removeFromSessionIndex(key);
          this.cache.delete(key);
          this.removeFromAccessOrder(key);
          invalidated++;
        }
      }
      this.pathIndex.delete(path);
    }
    
    // Fallback: also check argsHash for entries not caught by path index
    // (e.g., paths embedded in complex argument structures)
    if (invalidated === 0) {
      for (const [key, cached] of this.cache.entries()) {
        if (cached.argsHash.includes(path)) {
          this.removeFromSessionIndex(key);
          this.removeFromPathIndex(key);
          this.cache.delete(key);
          this.removeFromAccessOrder(key);
          invalidated++;
        }
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
        this.removeFromSessionIndex(key);
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
    this.accessOrderMap.clear();
    this.sessionIndex.clear();
    this.pathIndex.clear();
  }

  /**
   * Clear all cache entries for a specific session
   * Called when a session ends to free memory
   * 
   * @param sessionId - The session ID to clear cache entries for
   * @returns Statistics about what was cleared
   */
  clearSession(sessionId: string): { entriesCleared: number; bytesFreed: number } {
    const sessionKeys = this.sessionIndex.get(sessionId);
    if (!sessionKeys || sessionKeys.size === 0) {
      return { entriesCleared: 0, bytesFreed: 0 };
    }

    let entriesCleared = 0;
    let bytesFreed = 0;

    for (const key of sessionKeys) {
      const cached = this.cache.get(key);
      if (cached) {
        // Estimate bytes freed (compressed size if compressed, otherwise output length)
        if (cached.compressed && cached.compressedSize !== undefined) {
          bytesFreed += cached.compressedSize;
        } else {
          bytesFreed += cached.result.output.length;
        }
        
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        entriesCleared++;
      }
    }

    // Clear the session index entry
    this.sessionIndex.delete(sessionId);

    return { entriesCleared, bytesFreed };
  }

  /**
   * Get the number of cache entries for a specific session
   */
  getSessionEntryCount(sessionId: string): number {
    const sessionKeys = this.sessionIndex.get(sessionId);
    return sessionKeys?.size ?? 0;
  }

  /**
   * Get all session IDs that have cache entries
   */
  getSessionsWithCache(): string[] {
    return Array.from(this.sessionIndex.keys());
  }

  /**
   * Evict the oldest entry (LRU)
   */
  private evictOldest(): void {
    if (this.config.enableLRU && this.accessOrderMap.size > 0) {
      // Map.keys().next() returns the oldest (first inserted) key
      const oldest = this.accessOrderMap.keys().next().value;
      if (oldest) {
        this.accessOrderMap.delete(oldest);
        this.removeFromSessionIndex(oldest);
        this.cache.delete(oldest);
      }
    } else {
      // Fall back to FIFO
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.removeFromSessionIndex(firstKey);
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Remove a cache key from the session index
   */
  private removeFromSessionIndex(key: string): void {
    const cached = this.cache.get(key);
    if (cached?.sessionId) {
      const sessionKeys = this.sessionIndex.get(cached.sessionId);
      if (sessionKeys) {
        sessionKeys.delete(key);
        // Clean up empty session entries
        if (sessionKeys.size === 0) {
          this.sessionIndex.delete(cached.sessionId);
        }
      }
    }
  }

  /**
   * Update access order for LRU — O(1) with Map (delete + set preserves order)
   */
  private updateAccessOrder(key: string): void {
    this.accessOrderMap.delete(key);
    this.accessOrderMap.set(key, true);
  }

  /**
   * Remove from access order — O(1) with Map
   */
  private removeFromAccessOrder(key: string): void {
    this.accessOrderMap.delete(key);
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
        this.removeFromSessionIndex(key);
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
    const bySession: Record<string, number> = {};
    let compressedEntries = 0;
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    
    for (const [key, cached] of this.cache.entries()) {
      const tool = key.split('::')[0];
      byTool[tool] = (byTool[tool] || 0) + 1;
      
      if (cached.compressed && cached.originalSize !== undefined && cached.compressedSize !== undefined) {
        compressedEntries++;
        totalOriginalSize += cached.originalSize;
        totalCompressedSize += cached.compressedSize;
      }
    }

    // Build session statistics from the session index
    for (const [sessionId, keys] of this.sessionIndex.entries()) {
      bySession[sessionId] = keys.size;
    }

    const total = this.totalHits + this.totalMisses;
    const hitRate = total > 0 ? (this.totalHits / total) * 100 : 0;
    const compressionBytesSaved = totalOriginalSize - totalCompressedSize;
    const averageCompressionRatio = compressedEntries > 0 && totalCompressedSize > 0 
      ? totalOriginalSize / totalCompressedSize 
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.totalHits,
      misses: this.totalMisses,
      hitRate: Math.round(hitRate * 100) / 100,
      byTool,
      estimatedTokensSaved: this.estimatedTokensSaved,
      compressedEntries,
      compressionBytesSaved,
      averageCompressionRatio: Math.round(averageCompressionRatio * 100) / 100,
      sessionsWithCache: this.sessionIndex.size,
      bySession,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalHits = 0;
    this.totalMisses = 0;
    this.estimatedTokensSaved = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ToolResultCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Compress a tool result's output using gzip
   * Returns a new result with base64-encoded compressed output
   */
  private compressResult(result: ToolExecutionResult): { result: ToolExecutionResult; originalSize: number; compressedSize: number } {
    const originalSize = result.output.length;
    
    try {
      // Use sync gzip with level 1 (fastest) to minimize main-thread blocking
      const compressed = gzipSync(Buffer.from(result.output, 'utf-8'), { level: 1 });
      // Encode as base64 for safe storage
      const compressedOutput = compressed.toString('base64');
      
      return {
        result: {
          ...result,
          output: compressedOutput,
        },
        originalSize,
        compressedSize: compressedOutput.length,
      };
    } catch {
      // If compression fails, return original
      return {
        result,
        originalSize,
        compressedSize: originalSize,
      };
    }
  }

  /**
   * Decompress a tool result's output
   * Expects base64-encoded gzip data
   */
  private decompressResult(result: ToolExecutionResult): ToolExecutionResult {
    try {
      // Decode from base64 and decompress
      const compressed = Buffer.from(result.output, 'base64');
      const decompressed = gunzipSync(compressed);
      
      return {
        ...result,
        output: decompressed.toString('utf-8'),
      };
    } catch {
      // If decompression fails, return as-is (might not be compressed)
      return result;
    }
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
