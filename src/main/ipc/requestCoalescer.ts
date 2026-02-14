/**
 * IPC Request Coalescer
 * 
 * Prevents duplicate concurrent IPC calls by coalescing identical requests.
 * When multiple identical requests come in before the first one completes,
 * they all share the same promise/result instead of making separate calls.
 * 
 * Features:
 * - Automatic key generation from channel + params
 * - Configurable TTL for result caching
 * - Memory-efficient with automatic cleanup
 * - Backpressure support for high-volume requests
 * - Request deduplication statistics
 */

import { createLogger } from '../logger';

const logger = createLogger('RequestCoalescer');

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
  refCount: number;
}

interface CoalescerConfig {
  /** Default TTL for cached results in ms (default: 0 = no caching) */
  defaultTtlMs: number;
  /** Max pending requests before backpressure kicks in (default: 100) */
  maxPendingRequests: number;
  /** Enable request deduplication (default: true) */
  enabled: boolean;
  /** Channels that should always be deduplicated (even if they have different params) */
  alwaysDedupeChannels: Set<string>;
  /** Channels that should never be deduplicated */
  neverDedupeChannels: Set<string>;
}

interface CoalescerStats {
  totalRequests: number;
  coalescedRequests: number;
  pendingRequests: number;
  cacheHits: number;
  cacheMisses: number;
}

const DEFAULT_CONFIG: CoalescerConfig = {
  defaultTtlMs: 0,
  maxPendingRequests: 100,
  enabled: true,
  alwaysDedupeChannels: new Set([
    'settings:get',
    'files:prewarm-cache',
  ]),
  neverDedupeChannels: new Set([
    'agent:runPrompt',
    'agent:cancelRun',
    'terminal:run',
    'terminal:write',
  ]),
};

export class RequestCoalescer {
  private pendingRequests = new Map<string, PendingRequest<unknown>>();
  private cachedResults = new Map<string, { result: unknown; expiry: number }>();
  private config: CoalescerConfig;
  private cleanupInterval: ReturnType<typeof setInterval>;
  private stats: CoalescerStats = {
    totalRequests: 0,
    coalescedRequests: 0,
    pendingRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(config: Partial<CoalescerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Periodic cleanup of expired cache entries
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 30_000);
  }

  /**
   * Dispose the coalescer and clean up resources
   */
  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.pendingRequests.clear();
    this.cachedResults.clear();
  }

  /**
   * Execute a request with coalescing
   * If an identical request is already pending, return the existing promise
   */
  async execute<T>(
    channel: string,
    params: unknown[],
    executor: () => Promise<T>,
    options: { ttlMs?: number } = {}
  ): Promise<T> {
    this.stats.totalRequests++;

    // Check if deduplication is disabled for this channel
    if (!this.config.enabled || this.config.neverDedupeChannels.has(channel)) {
      return executor();
    }

    const key = this.generateKey(channel, params);

    // Check cache first (if TTL enabled)
    const ttlMs = options.ttlMs ?? this.config.defaultTtlMs;
    if (ttlMs > 0) {
      const cached = this.cachedResults.get(key);
      if (cached && cached.expiry > Date.now()) {
        this.stats.cacheHits++;
        return cached.result as T;
      }
      this.stats.cacheMisses++;
    }

    // Check for pending request
    const pending = this.pendingRequests.get(key);
    if (pending) {
      this.stats.coalescedRequests++;
      pending.refCount++;
      logger.debug('Request coalesced', { channel, coalescedCount: pending.refCount });
      return pending.promise as Promise<T>;
    }

    // Backpressure: if too many pending requests, wait
    if (this.pendingRequests.size >= this.config.maxPendingRequests) {
      logger.warn('Backpressure: waiting for pending requests to complete', {
        pending: this.pendingRequests.size,
        max: this.config.maxPendingRequests,
      });
      await this.waitForSlot();
    }

    // Create new pending request
    const promise = executor().finally(() => {
      this.pendingRequests.delete(key);
      this.stats.pendingRequests = this.pendingRequests.size;
    });

    const pendingRequest: PendingRequest<T> = {
      promise,
      timestamp: Date.now(),
      refCount: 1,
    };

    this.pendingRequests.set(key, pendingRequest as PendingRequest<unknown>);
    this.stats.pendingRequests = this.pendingRequests.size;

    // Cache result if TTL enabled
    if (ttlMs > 0) {
      promise.then(result => {
        this.cachedResults.set(key, {
          result,
          expiry: Date.now() + ttlMs,
        });
      }).catch(() => {
        // Don't cache errors
      });
    }

    return promise;
  }

  /**
   * Generate a unique key from channel and params
   */
  private generateKey(channel: string, params: unknown[]): string {
    // For always-dedupe channels, ignore params
    if (this.config.alwaysDedupeChannels.has(channel)) {
      return `${channel}:*`;
    }

    // Generate deterministic key from params
    const paramsKey = this.hashParams(params);
    return `${channel}:${paramsKey}`;
  }

  /**
   * Hash params for key generation
   * Uses a fast, deterministic approach
   */
  private hashParams(params: unknown[]): string {
    if (params.length === 0) return 'empty';
    
    try {
      // For simple params, use JSON
      const json = JSON.stringify(params, (_, value) => {
        // Handle functions and undefined
        if (typeof value === 'function') return '[function]';
        if (value === undefined) return '[undefined]';
        return value;
      });
      
      // Fast hash using simple string operations
      let hash = 0;
      for (let i = 0; i < json.length; i++) {
        const char = json.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash.toString(36);
    } catch {
      // Fallback for non-serializable params
      return String(Date.now());
    }
  }

  /**
   * Wait for a slot to become available (backpressure)
   */
  private async waitForSlot(): Promise<void> {
    const checkInterval = 10;
    const maxWait = 5000;
    let waited = 0;

    while (this.pendingRequests.size >= this.config.maxPendingRequests && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (waited >= maxWait) {
      logger.warn('Backpressure timeout: proceeding anyway', { waited });
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cachedResults) {
      if (entry.expiry <= now) {
        this.cachedResults.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cache cleanup', { cleaned, remaining: this.cachedResults.size });
    }
  }

  /**
   * Invalidate cache for a specific channel
   */
  invalidateCache(channel: string): void {
    for (const key of this.cachedResults.keys()) {
      if (key.startsWith(`${channel}:`)) {
        this.cachedResults.delete(key);
      }
    }
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAllCache(): void {
    this.cachedResults.clear();
  }

  /**
   * Get coalescer statistics
   */
  getStats(): CoalescerStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      coalescedRequests: 0,
      pendingRequests: this.pendingRequests.size,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * Get deduplication ratio (coalesced / total)
   */
  getDeduplicationRatio(): number {
    if (this.stats.totalRequests === 0) return 0;
    return this.stats.coalescedRequests / this.stats.totalRequests;
  }

  /**
   * Destroy the coalescer
   */
  destroy(): void {
    this.pendingRequests.clear();
    this.cachedResults.clear();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalCoalescer: RequestCoalescer | null = null;

/**
 * Initialize the global request coalescer
 */
export function initRequestCoalescer(config?: Partial<CoalescerConfig>): RequestCoalescer {
  if (globalCoalescer) {
    globalCoalescer.destroy();
  }
  globalCoalescer = new RequestCoalescer(config);
  return globalCoalescer;
}

/**
 * Get the global request coalescer
 */
export function getRequestCoalescer(): RequestCoalescer | null {
  return globalCoalescer;
}

/**
 * Execute a coalesced request
 */
export async function coalesceRequest<T>(
  channel: string,
  params: unknown[],
  executor: () => Promise<T>,
  options?: { ttlMs?: number }
): Promise<T> {
  if (!globalCoalescer) {
    // Fallback: execute without coalescing
    return executor();
  }
  return globalCoalescer.execute(channel, params, executor, options);
}

export default RequestCoalescer;
