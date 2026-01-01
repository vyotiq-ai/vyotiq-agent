/**
 * Performance System Types
 *
 * Type definitions for caching, pooling, batching,
 * resource management, and performance monitoring.
 */

// =============================================================================
// Performance Metrics Types
// =============================================================================

/**
 * Timing information for operations
 */
export interface OperationTiming {
  /** Operation name */
  name: string;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  endedAt?: number;
  /** Duration in ms */
  durationMs?: number;
  /** Phase timings */
  phases?: Map<string, { startedAt: number; endedAt?: number }>;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Latency percentiles
 */
export interface LatencyPercentiles {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  count: number;
}

/**
 * Throughput metrics
 */
export interface ThroughputMetrics {
  /** Operations per second */
  opsPerSecond: number;
  /** Tokens per second */
  tokensPerSecond: number;
  /** Messages per second */
  messagesPerSecond: number;
  /** Total operations */
  totalOperations: number;
  /** Time window (ms) */
  windowMs: number;
}

/**
 * Resource usage snapshot
 */
export interface ResourceUsageSnapshot {
  /** Heap used (bytes) */
  heapUsed: number;
  /** Heap total (bytes) */
  heapTotal: number;
  /** External memory (bytes) */
  external: number;
  /** Array buffers (bytes) */
  arrayBuffers: number;
  /** RSS (bytes) */
  rss: number;
  /** CPU usage (0-1) */
  cpuUsage: number;
  /** Event loop lag (ms) */
  eventLoopLag: number;
  /** Active handles */
  activeHandles: number;
  /** Active requests */
  activeRequests: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Performance metrics summary
 */
export interface PerformanceMetrics {
  /** Latency by operation type */
  latencyByOperation: Map<string, LatencyPercentiles>;
  /** Throughput metrics */
  throughput: ThroughputMetrics;
  /** Resource usage */
  resourceUsage: ResourceUsageSnapshot;
  /** Cache hit rates */
  cacheHitRates: Record<string, number>;
  /** Pool utilization */
  poolUtilization: Record<string, number>;
  /** Error rates */
  errorRates: Record<string, number>;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// Caching Types
// =============================================================================

/**
 * Cache key components
 */
export interface CacheKey {
  /** Key type */
  type: 'llm-response' | 'tool-result' | 'file-content' | 'embedding' | 'custom';
  /** Primary identifier */
  id: string;
  /** Version/hash for invalidation */
  version?: string;
  /** Additional namespace */
  namespace?: string;
}

/**
 * Cached item
 */
export interface CachedItem<T = unknown> {
  /** Cache key */
  key: CacheKey;
  /** Cached value */
  value: T;
  /** Created timestamp */
  createdAt: number;
  /** Last accessed timestamp */
  lastAccessedAt: number;
  /** Expiration timestamp */
  expiresAt?: number;
  /** Access count */
  accessCount: number;
  /** Size in bytes (estimated) */
  sizeBytes: number;
  /** TTL in ms */
  ttlMs?: number;
  /** Priority (higher = less likely to evict) */
  priority: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total items */
  totalItems: number;
  /** Total size (bytes) */
  totalSizeBytes: number;
  /** Hits */
  hits: number;
  /** Misses */
  misses: number;
  /** Hit rate */
  hitRate: number;
  /** Evictions */
  evictions: number;
  /** Items by type */
  itemsByType: Record<string, number>;
  /** Size by type */
  sizeByType: Record<string, number>;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum items */
  maxItems: number;
  /** Maximum size (bytes) */
  maxSizeBytes: number;
  /** Default TTL (ms) */
  defaultTtlMs: number;
  /** Enable LRU eviction */
  enableLruEviction: boolean;
  /** Enable TTL expiration */
  enableTtlExpiration: boolean;
  /** Eviction check interval (ms) */
  evictionCheckIntervalMs: number;
  /** TTL by cache type */
  ttlByType?: Record<string, number>;
  /** Size limits by type */
  sizeLimitsByType?: Record<string, number>;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxItems: 1000,
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
  defaultTtlMs: 3600000, // 1 hour
  enableLruEviction: true,
  enableTtlExpiration: true,
  evictionCheckIntervalMs: 60000, // 1 minute
};

// =============================================================================
// Batch Processing Types
// =============================================================================

/**
 * Batch item
 */
export interface BatchItem<T = unknown, R = unknown> {
  /** Item ID */
  id: string;
  /** Item data */
  data: T;
  /** Result resolve function */
  resolve: (result: R) => void;
  /** Error reject function */
  reject: (error: Error) => void;
  /** Added timestamp */
  addedAt: number;
  /** Priority */
  priority: number;
}

/**
 * Batch configuration
 */
export interface BatchConfig {
  /** Maximum batch size */
  maxBatchSize: number;
  /** Maximum wait time (ms) */
  maxWaitMs: number;
  /** Minimum batch size to process */
  minBatchSize: number;
  /** Enable adaptive batching */
  enableAdaptiveBatching: boolean;
  /** Process timeout (ms) */
  processTimeoutMs: number;
}

/**
 * Default batch configuration
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxBatchSize: 10,
  maxWaitMs: 100,
  minBatchSize: 1,
  enableAdaptiveBatching: true,
  processTimeoutMs: 30000,
};

/**
 * Batch processor function type
 */
export type BatchProcessor<T, R> = (items: T[]) => Promise<R[]>;

/**
 * Batch statistics
 */
export interface BatchStats {
  /** Total batches processed */
  totalBatches: number;
  /** Total items processed */
  totalItems: number;
  /** Average batch size */
  averageBatchSize: number;
  /** Average wait time (ms) */
  averageWaitMs: number;
  /** Average process time (ms) */
  averageProcessMs: number;
  /** Current pending items */
  pendingItems: number;
  /** Failures */
  failures: number;
}

// =============================================================================
// Lazy Loading Types
// =============================================================================

/**
 * Lazy loaded component status
 */
export type LazyLoadStatus = 'not-loaded' | 'loading' | 'loaded' | 'failed';

/**
 * Lazy loaded component
 */
export interface LazyComponent<T = unknown> {
  /** Component name */
  name: string;
  /** Load status */
  status: LazyLoadStatus;
  /** Loader function */
  loader: () => Promise<T>;
  /** Loaded instance */
  instance?: T;
  /** Load error */
  error?: Error;
  /** Load started timestamp */
  loadStartedAt?: number;
  /** Load completed timestamp */
  loadCompletedAt?: number;
  /** Dependencies (other component names) */
  dependencies?: string[];
}

/**
 * Lazy loader configuration
 */
export interface LazyLoaderConfig {
  /** Preload on startup */
  preloadComponents: string[];
  /** Load timeout (ms) */
  loadTimeoutMs: number;
  /** Parallel load limit */
  parallelLoadLimit: number;
  /** Enable dependency resolution */
  enableDependencyResolution: boolean;
}

/**
 * Default lazy loader configuration
 */
export const DEFAULT_LAZY_LOADER_CONFIG: LazyLoaderConfig = {
  preloadComponents: [],
  loadTimeoutMs: 30000,
  parallelLoadLimit: 3,
  enableDependencyResolution: true,
};

// =============================================================================
// Resource Management Types
// =============================================================================

/**
 * Resource type
 */
export type PerformanceResourceType = 'cpu' | 'tokens' | 'api-calls' | 'connections';

/**
 * Resource budget
 */
export interface ResourceBudget {
  /** Resource type */
  type: PerformanceResourceType;
  /** Maximum allowed */
  max: number;
  /** Current usage */
  current: number;
  /** Reserved amount */
  reserved: number;
  /** Available amount */
  available: number;
  /** Warning threshold (0-1) */
  warningThreshold: number;
  /** Critical threshold (0-1) */
  criticalThreshold: number;
  /** Unit */
  unit: string;
}

/**
 * Resource allocation
 */
export interface ResourceAllocation {
  /** Allocation ID */
  id: string;
  /** Resource type */
  type: PerformanceResourceType;
  /** Allocated amount */
  amount: number;
  /** Owner (agent, task, etc.) */
  owner: string;
  /** Owner type */
  ownerType: 'agent' | 'task' | 'run' | 'system';
  /** Allocated timestamp */
  allocatedAt: number;
  /** Expires at */
  expiresAt?: number;
}

/**
 * Resource manager configuration
 */
export interface ResourceManagerConfig {
  /** CPU budget (percentage 0-100) */
  cpuBudget: number;
  /** Token budget per minute */
  tokenBudgetPerMinute: number;
  /** API call budget per minute */
  apiCallBudgetPerMinute: number;
  /** Connection pool size */
  connectionPoolSize: number;
  /** Enable adaptive budgeting */
  enableAdaptiveBudgeting: boolean;
  /** Budget check interval (ms) */
  budgetCheckIntervalMs: number;
}

/**
 * Default resource manager configuration
 */
export const DEFAULT_RESOURCE_MANAGER_CONFIG: ResourceManagerConfig = {
  cpuBudget: 80,
  tokenBudgetPerMinute: 100000,
  apiCallBudgetPerMinute: 100,
  connectionPoolSize: 10,
  enableAdaptiveBudgeting: true,
  budgetCheckIntervalMs: 5000,
};

// =============================================================================
// Resource Management Types
// =============================================================================

/**
 * Performance monitor configuration
 */
export interface PerformanceMonitorConfig {
  /** Enable performance monitoring */
  enabled: boolean;
  /** Metrics collection interval (ms) */
  collectionIntervalMs: number;
  /** Keep metrics history (ms) */
  metricsHistoryMs: number;
  /** Maximum samples to keep */
  maxSamples: number;
  /** Enable resource monitoring */
  enableResourceMonitoring: boolean;
  /** Enable latency tracking */
  enableLatencyTracking: boolean;
  /** Enable throughput tracking */
  enableThroughputTracking: boolean;
  /** Slow operation threshold (ms) */
  slowOperationThresholdMs: number;
}

/**
 * Default performance monitor configuration
 */
export const DEFAULT_PERFORMANCE_MONITOR_CONFIG: PerformanceMonitorConfig = {
  enabled: true,
  collectionIntervalMs: 10000,
  metricsHistoryMs: 3600000, // 1 hour
  maxSamples: 1000,
  enableResourceMonitoring: true,
  enableLatencyTracking: true,
  enableThroughputTracking: true,
  slowOperationThresholdMs: 5000,
};

// =============================================================================
// Dependencies
// =============================================================================

/**
 * Performance logger interface
 */
export interface PerformanceLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Dependencies for performance components
 */
export interface PerformanceDeps {
  logger: PerformanceLogger;
  emitEvent: (event: unknown) => void;
}
