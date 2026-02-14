/**
 * CachingLayer
 *
 * LRU cache with TTL support for LLM responses, tool results,
 * file contents, and other cacheable data.
 */

import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import type {
  CacheKey,
  CachedItem,
  CacheStats,
  CacheConfig,
  PerformanceDeps,
} from './types';
import { DEFAULT_CACHE_CONFIG } from './types';
import { createLogger } from '../../logger';

const logger = createLogger('CachingLayer');

// =============================================================================
// CachingLayer
// =============================================================================

export class CachingLayer extends EventEmitter {
  private readonly config: CacheConfig;
  private readonly deps: PerformanceDeps;

  // Cache storage
  private cache: Map<string, CachedItem> = new Map();

  // LRU tracking (key -> position, lower = older)
  private lruOrder: Map<string, number> = new Map();
  private lruCounter = 0;

  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  // Cleanup interval
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(
    config: Partial<CacheConfig> = {},
    deps?: Partial<PerformanceDeps>
  ) {
    super();

    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };

    this.deps = {
      logger: deps?.logger ?? logger,
      emitEvent: deps?.emitEvent ?? (() => {}),
    };
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Start cache maintenance
   */
  start(): void {
    if (this.cleanupInterval) {
      return;
    }

    if (this.config.enableTtlExpiration) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpired();
      }, this.config.evictionCheckIntervalMs);
      if (this.cleanupInterval && typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
        (this.cleanupInterval as NodeJS.Timeout).unref();
      }
    }

    this.deps.logger.info('CachingLayer: started');
  }

  /**
   * Stop cache maintenance
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  // ===========================================================================
  // Cache Operations
  // ===========================================================================

  /**
   * Generate a string key from CacheKey
   */
  private generateKeyString(key: CacheKey): string {
    const parts = [key.type, key.id];
    if (key.namespace) parts.push(key.namespace);
    if (key.version) parts.push(key.version);
    return parts.join(':');
  }

  /**
   * Get an item from cache
   */
  get<T>(key: CacheKey): T | undefined {
    const keyString = this.generateKeyString(key);
    const item = this.cache.get(keyString);

    if (!item) {
      this.misses++;
      return undefined;
    }

    // Check expiration
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(keyString);
      this.lruOrder.delete(keyString);
      this.misses++;
      return undefined;
    }

    // Update access info
    this.hits++;
    item.accessCount++;
    item.lastAccessedAt = Date.now();
    this.lruOrder.set(keyString, ++this.lruCounter);

    return item.value as T;
  }

  /**
   * Set an item in cache
   */
  set<T>(
    key: CacheKey,
    value: T,
    options: {
      ttlMs?: number;
      priority?: number;
    } = {}
  ): void {
    const keyString = this.generateKeyString(key);
    const now = Date.now();

    // Calculate TTL
    let ttlMs = options.ttlMs ?? this.config.defaultTtlMs;
    if (this.config.ttlByType?.[key.type]) {
      ttlMs = this.config.ttlByType[key.type]!;
    }

    // Estimate size
    const sizeBytes = this.estimateSize(value);

    // Check type size limits
    if (this.config.sizeLimitsByType?.[key.type]) {
      const typeLimit = this.config.sizeLimitsByType[key.type]!;
      const currentTypeSize = this.getSizeByType(key.type);
      if (currentTypeSize + sizeBytes > typeLimit) {
        this.evictByType(key.type, sizeBytes);
      }
    }

    // Check overall limits
    this.ensureCapacity(sizeBytes);

    const item: CachedItem<T> = {
      key,
      value,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: this.config.enableTtlExpiration ? now + ttlMs : undefined,
      accessCount: 0,
      sizeBytes,
      ttlMs,
      priority: options.priority ?? 0,
    };

    this.cache.set(keyString, item);
    this.lruOrder.set(keyString, ++this.lruCounter);

    this.emit('cache-set', { key, sizeBytes });
  }

  /**
   * Check if key exists
   */
  has(key: CacheKey): boolean {
    const keyString = this.generateKeyString(key);
    const item = this.cache.get(keyString);

    if (!item) return false;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(keyString);
      this.lruOrder.delete(keyString);
      return false;
    }

    return true;
  }

  /**
   * Delete an item
   */
  delete(key: CacheKey): boolean {
    const keyString = this.generateKeyString(key);
    const existed = this.cache.delete(keyString);
    this.lruOrder.delete(keyString);
    return existed;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.cache.clear();
    this.lruOrder.clear();
    this.lruCounter = 0;
  }

  /**
   * Clear items by type
   */
  clearByType(type: CacheKey['type']): number {
    let cleared = 0;
    for (const [keyString, item] of this.cache) {
      if (item.key.type === type) {
        this.cache.delete(keyString);
        this.lruOrder.delete(keyString);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Clear items by namespace
   */
  clearByNamespace(namespace: string): number {
    let cleared = 0;
    for (const [keyString, item] of this.cache) {
      if (item.key.namespace === namespace) {
        this.cache.delete(keyString);
        this.lruOrder.delete(keyString);
        cleared++;
      }
    }
    return cleared;
  }

  // ===========================================================================
  // LLM Response Caching
  // ===========================================================================

  /**
   * Generate cache key for LLM request
   */
  generateLLMCacheKey(
    provider: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown> = {}
  ): CacheKey {
    const hash = createHash('sha256');

    hash.update(provider);
    hash.update(model);
    hash.update(JSON.stringify(messages));
    hash.update(JSON.stringify(options));

    return {
      type: 'llm-response',
      id: hash.digest('hex').slice(0, 32),
      namespace: `${provider}:${model}`,
    };
  }

  /**
   * Cache LLM response
   */
  cacheLLMResponse(
    provider: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    response: unknown,
    options: Record<string, unknown> = {}
  ): void {
    const key = this.generateLLMCacheKey(provider, model, messages, options);
    this.set(key, response, { priority: 1 });
  }

  /**
   * Get cached LLM response
   */
  getCachedLLMResponse(
    provider: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown> = {}
  ): unknown | undefined {
    const key = this.generateLLMCacheKey(provider, model, messages, options);
    return this.get(key);
  }

  // ===========================================================================
  // Tool Result Caching
  // ===========================================================================

  /**
   * Generate cache key for tool call
   */
  generateToolCacheKey(
    toolName: string,
    args: Record<string, unknown>
  ): CacheKey {
    const hash = createHash('sha256');
    hash.update(toolName);
    hash.update(JSON.stringify(args));

    return {
      type: 'tool-result',
      id: hash.digest('hex').slice(0, 32),
      namespace: toolName,
    };
  }

  /**
   * Cache tool result
   */
  cacheToolResult(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    ttlMs?: number
  ): void {
    const key = this.generateToolCacheKey(toolName, args);
    this.set(key, result, { ttlMs, priority: 0 });
  }

  /**
   * Get cached tool result
   */
  getCachedToolResult(
    toolName: string,
    args: Record<string, unknown>
  ): unknown | undefined {
    const key = this.generateToolCacheKey(toolName, args);
    return this.get(key);
  }

  // ===========================================================================
  // File Content Caching
  // ===========================================================================

  /**
   * Cache file content
   */
  cacheFileContent(filePath: string, content: string, hash?: string): void {
    const key: CacheKey = {
      type: 'file-content',
      id: filePath,
      version: hash,
    };
    this.set(key, content, { priority: 0 });
  }

  /**
   * Get cached file content
   */
  getCachedFileContent(filePath: string, hash?: string): string | undefined {
    const key: CacheKey = {
      type: 'file-content',
      id: filePath,
      version: hash,
    };
    return this.get<string>(key);
  }

  /**
   * Invalidate file content cache
   */
  invalidateFileContent(filePath: string): boolean {
    const key: CacheKey = {
      type: 'file-content',
      id: filePath,
    };
    return this.delete(key);
  }

  // ===========================================================================
  // Capacity Management
  // ===========================================================================

  /**
   * Estimate size of a value in bytes
   */
  private estimateSize(value: unknown): number {
    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    }
    if (typeof value === 'number') {
      return 8;
    }
    if (typeof value === 'boolean') {
      return 4;
    }
    if (value === null || value === undefined) {
      return 0;
    }
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + this.estimateSize(item), 0);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value).length * 2;
    }
    return 100; // Default estimate
  }

  /**
   * Get current total size
   */
  private getTotalSize(): number {
    let total = 0;
    for (const item of this.cache.values()) {
      total += item.sizeBytes;
    }
    return total;
  }

  /**
   * Get size by type
   */
  private getSizeByType(type: CacheKey['type']): number {
    let total = 0;
    for (const item of this.cache.values()) {
      if (item.key.type === type) {
        total += item.sizeBytes;
      }
    }
    return total;
  }

  /**
   * Ensure capacity for new item
   */
  private ensureCapacity(requiredBytes: number): void {
    // Check item count
    while (this.cache.size >= this.config.maxItems) {
      this.evictLRU();
    }

    // Check size
    while (this.getTotalSize() + requiredBytes > this.config.maxSizeBytes) {
      if (!this.evictLRU()) break;
    }
  }

  /**
   * Evict LRU item
   */
  private evictLRU(): boolean {
    if (!this.config.enableLruEviction || this.cache.size === 0) {
      return false;
    }

    // Find item with lowest LRU counter and lowest priority
    let lruKey: string | undefined;
    let lruOrder = Infinity;
    let lruPriority = Infinity;

    for (const [keyString, order] of this.lruOrder) {
      const item = this.cache.get(keyString);
      if (!item) continue;

      if (item.priority < lruPriority || (item.priority === lruPriority && order < lruOrder)) {
        lruKey = keyString;
        lruOrder = order;
        lruPriority = item.priority;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.lruOrder.delete(lruKey);
      this.evictions++;
      this.emit('cache-evict', { key: lruKey, reason: 'lru' });
      return true;
    }

    return false;
  }

  /**
   * Evict items by type until space is available
   */
  private evictByType(type: CacheKey['type'], requiredBytes: number): void {
    const typeItems: Array<{ keyString: string; item: CachedItem; order: number }> = [];

    for (const [keyString, item] of this.cache) {
      if (item.key.type === type) {
        typeItems.push({
          keyString,
          item,
          order: this.lruOrder.get(keyString) ?? 0,
        });
      }
    }

    // Sort by LRU order (oldest first)
    typeItems.sort((a, b) => a.order - b.order);

    let freedBytes = 0;
    for (const { keyString, item } of typeItems) {
      if (freedBytes >= requiredBytes) break;

      this.cache.delete(keyString);
      this.lruOrder.delete(keyString);
      freedBytes += item.sizeBytes;
      this.evictions++;
      this.emit('cache-evict', { key: keyString, reason: 'type-limit' });
    }
  }

  /**
   * Cleanup expired items
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [keyString, item] of this.cache) {
      if (item.expiresAt && now > item.expiresAt) {
        expired.push(keyString);
      }
    }

    for (const keyString of expired) {
      this.cache.delete(keyString);
      this.lruOrder.delete(keyString);
      this.emit('cache-evict', { key: keyString, reason: 'expired' });
    }

    if (expired.length > 0) {
      this.deps.logger.debug('CachingLayer: cleaned up expired items', {
        count: expired.length,
      });
    }
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const itemsByType: Record<string, number> = {};
    const sizeByType: Record<string, number> = {};
    let totalSize = 0;

    for (const item of this.cache.values()) {
      const type = item.key.type;
      itemsByType[type] = (itemsByType[type] ?? 0) + 1;
      sizeByType[type] = (sizeByType[type] ?? 0) + item.sizeBytes;
      totalSize += item.sizeBytes;
    }

    const total = this.hits + this.misses;

    return {
      totalItems: this.cache.size,
      totalSizeBytes: totalSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      evictions: this.evictions,
      itemsByType,
      sizeByType,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}
