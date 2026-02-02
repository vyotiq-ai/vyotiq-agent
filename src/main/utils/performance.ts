/**
 * Performance Utilities
 * 
 * Modern performance optimization utilities for the main process.
 * Implements 2026 best practices for Node.js 22+ and Electron 39+.
 * 
 * Features:
 * - Lazy module loading with WeakRef caching
 * - Memory-sensitive caching utilities
 * - Debounced/throttled execution helpers
 * - Object pooling for frequent allocations
 * - Streaming utilities with backpressure support
 */

import { performance as nodePerf } from 'node:perf_hooks';

// ==========================================================================
// Lazy Module Loader with WeakRef Caching
// ==========================================================================

type ModuleLoader<T extends WeakKey> = () => Promise<T>;

interface LazyModuleEntry<T extends WeakKey> {
  loader: ModuleLoader<T>;
  ref: WeakRef<T> | null;
  loadPromise: Promise<T> | null;
}

const moduleCache = new Map<string, LazyModuleEntry<object>>();
const registry = new FinalizationRegistry<string>((key) => {
  const entry = moduleCache.get(key);
  if (entry) {
    entry.ref = null;
  }
});

/**
 * Create a lazy-loaded module that uses WeakRef for memory-efficient caching.
 * Module is loaded on first access and garbage collected when memory is needed.
 */
export function createLazyModule<T extends object>(
  key: string,
  loader: ModuleLoader<T>
): () => Promise<T> {
  moduleCache.set(key, { loader, ref: null, loadPromise: null });

  return async (): Promise<T> => {
    const entry = moduleCache.get(key) as LazyModuleEntry<T>;
    
    // Check if we have a cached reference
    if (entry.ref) {
      const cached = entry.ref.deref();
      if (cached !== undefined) {
        return cached;
      }
    }

    // Check if already loading
    if (entry.loadPromise) {
      return entry.loadPromise;
    }

    // Load the module
    entry.loadPromise = entry.loader().then((module) => {
      entry.ref = new WeakRef(module);
      entry.loadPromise = null;
      registry.register(module, key);
      return module;
    });

    return entry.loadPromise;
  };
}

// ==========================================================================
// Memory-Sensitive Cache with Automatic Eviction
// ==========================================================================

interface MemorySensitiveCacheOptions<K, V> {
  maxSize: number;
  maxMemoryMB?: number;
  onEvict?: (key: K, value: V) => void;
  ttlMs?: number;
}

interface CacheEntry<V extends WeakKey> {
  ref: WeakRef<V> | V;
  expiresAt: number;
  isWeak: boolean;
  lastAccess: number;
}

/**
 * Memory-sensitive LRU cache that uses WeakRef for values when memory pressure is high.
 * Automatically converts to weak references when approaching memory limits.
 */
export class MemorySensitiveCache<K, V extends object> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];
  private readonly maxSize: number;
  private readonly maxMemoryBytes: number;
  private readonly onEvict?: (key: K, value: V) => void;
  private readonly ttlMs: number;

  constructor(options: MemorySensitiveCacheOptions<K, V>) {
    this.maxSize = options.maxSize;
    this.maxMemoryBytes = (options.maxMemoryMB ?? 100) * 1024 * 1024;
    this.onEvict = options.onEvict;
    this.ttlMs = options.ttlMs ?? 0;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (this.ttlMs > 0 && Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }

    // Get value from WeakRef if applicable
    let value: V | undefined;
    if (entry.isWeak) {
      value = (entry.ref as WeakRef<V>).deref();
      if (value === undefined) {
        this.cache.delete(key);
        return undefined;
      }
    } else {
      value = entry.ref as V;
    }

    // Update access order
    entry.lastAccess = Date.now();
    this.updateAccessOrder(key);

    return value;
  }

  set(key: K, value: V): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    // Check memory pressure and decide whether to use WeakRef
    const useWeakRef = this.isMemoryPressureHigh();

    const entry: CacheEntry<V> = {
      ref: useWeakRef ? new WeakRef(value) : value,
      expiresAt: this.ttlMs > 0 ? Date.now() + this.ttlMs : Infinity,
      isWeak: useWeakRef,
      lastAccess: Date.now(),
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry && this.onEvict) {
      const value = entry.isWeak 
        ? (entry.ref as WeakRef<V>).deref() 
        : (entry.ref as V);
      if (value !== undefined) {
        this.onEvict(key, value);
      }
    }
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    return entry !== undefined;
  }

  clear(): void {
    if (this.onEvict) {
      for (const [key, entry] of this.cache) {
        const value = entry.isWeak 
          ? (entry.ref as WeakRef<V>).deref() 
          : (entry.ref as V);
        if (value !== undefined) {
          this.onEvict(key, value);
        }
      }
    }
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  private updateAccessOrder(key: K): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(key);
  }

  private evictOldest(): void {
    const oldest = this.accessOrder.shift();
    if (oldest !== undefined) {
      this.delete(oldest);
    }
  }

  private isMemoryPressureHigh(): boolean {
    try {
      const memUsage = process.memoryUsage();
      return memUsage.heapUsed > this.maxMemoryBytes * 0.8;
    } catch {
      return false;
    }
  }
}

// ==========================================================================
// Debounce and Throttle with AbortController Support
// ==========================================================================

interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
}

/**
 * Creates a debounced function with cancellation support.
 * Uses AbortController pattern for clean cleanup.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
  options?: { leading?: boolean; maxWaitMs?: number }
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime = 0;
  const { leading = false, maxWaitMs } = options ?? {};

  const invoke = () => {
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
      maxTimeoutId = null;
    }
  };

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    const now = Date.now();

    if (leading && now - lastCallTime > delayMs) {
      invoke();
      lastCallTime = now;
      return;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      invoke();
      timeoutId = null;
    }, delayMs);

    // Set up max wait timeout
    if (maxWaitMs && !maxTimeoutId) {
      maxTimeoutId = setTimeout(() => {
        invoke();
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }, maxWaitMs);
    }
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
      maxTimeoutId = null;
    }
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    invoke();
  };

  return debounced;
}

/**
 * Creates a throttled function that limits execution rate.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  intervalMs: number,
  options?: { leading?: boolean; trailing?: boolean }
): DebouncedFunction<T> {
  let lastCallTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  const { leading = true, trailing = true } = options ?? {};

  const invoke = () => {
    if (lastArgs) {
      fn(...lastArgs);
      lastCallTime = Date.now();
      lastArgs = null;
    }
  };

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = intervalMs - (now - lastCallTime);

    lastArgs = args;

    if (remaining <= 0 || remaining > intervalMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (leading) {
        invoke();
      }
    } else if (!timeoutId && trailing) {
      timeoutId = setTimeout(() => {
        invoke();
        timeoutId = null;
      }, remaining);
    }
  };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  throttled.flush = invoke;

  return throttled;
}

// ==========================================================================
// Object Pool for Frequent Allocations
// ==========================================================================

interface PooledObject {
  reset?(): void;
}

interface ObjectPoolOptions<T> {
  create: () => T;
  reset?: (obj: T) => void;
  maxSize?: number;
}

/**
 * Object pool for reducing GC pressure from frequent allocations.
 * Useful for buffers, parsers, and other reusable objects.
 */
export class ObjectPool<T extends PooledObject> {
  private readonly pool: T[] = [];
  private readonly create: () => T;
  private readonly reset?: (obj: T) => void;
  private readonly maxSize: number;

  constructor(options: ObjectPoolOptions<T>) {
    this.create = options.create;
    this.reset = options.reset;
    this.maxSize = options.maxSize ?? 10;
  }

  acquire(): T {
    const obj = this.pool.pop();
    if (obj) {
      return obj;
    }
    return this.create();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      if (this.reset) {
        this.reset(obj);
      } else if (typeof obj.reset === 'function') {
        obj.reset();
      }
      this.pool.push(obj);
    }
  }

  get size(): number {
    return this.pool.length;
  }

  clear(): void {
    this.pool.length = 0;
  }
}

// ==========================================================================
// Performance Measurement Utilities
// ==========================================================================

interface PerformanceMetric {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

const metrics = new Map<string, number[]>();

/**
 * Record a performance measurement.
 */
export function recordMetric(name: string, durationMs: number): void {
  let samples = metrics.get(name);
  if (!samples) {
    samples = [];
    metrics.set(name, samples);
  }
  samples.push(durationMs);
  
  // Keep only last 1000 samples to prevent memory growth
  if (samples.length > 1000) {
    samples.shift();
  }
}

/**
 * Create a performance timer that automatically records the metric.
 */
export function createTimer(name: string): () => number {
  const start = nodePerf.now();
  return () => {
    const duration = nodePerf.now() - start;
    recordMetric(name, duration);
    return duration;
  };
}

/**
 * Get performance metrics for a given measurement name.
 */
export function getMetric(name: string): PerformanceMetric | undefined {
  const samples = metrics.get(name);
  if (!samples || samples.length === 0) return undefined;

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);

  return {
    name,
    count: samples.length,
    totalMs: sum,
    avgMs: sum / samples.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    p99Ms: sorted[Math.floor(sorted.length * 0.99)],
  };
}

/**
 * Get all recorded metrics.
 */
export function getAllMetrics(): PerformanceMetric[] {
  const result: PerformanceMetric[] = [];
  for (const name of metrics.keys()) {
    const metric = getMetric(name);
    if (metric) {
      result.push(metric);
    }
  }
  return result;
}

/**
 * Clear all recorded metrics.
 */
export function clearMetrics(): void {
  metrics.clear();
}

// ==========================================================================
// Streaming Utilities with Backpressure Support
// ==========================================================================

interface StreamControllerOptions {
  highWaterMark?: number;
  onPause?: () => void;
  onResume?: () => void;
}

/**
 * Stream controller for managing backpressure in async generators.
 * Automatically pauses upstream when buffer fills up.
 */
export class StreamController<T> {
  private buffer: T[] = [];
  private readonly highWaterMark: number;
  private isPaused = false;
  private waitingResolvers: (() => void)[] = [];
  private readonly onPause?: () => void;
  private readonly onResume?: () => void;

  constructor(options: StreamControllerOptions = {}) {
    this.highWaterMark = options.highWaterMark ?? 16;
    this.onPause = options.onPause;
    this.onResume = options.onResume;
  }

  /**
   * Push an item to the buffer. Pauses if buffer exceeds high water mark.
   */
  async push(item: T): Promise<void> {
    this.buffer.push(item);
    
    if (this.buffer.length >= this.highWaterMark && !this.isPaused) {
      this.isPaused = true;
      this.onPause?.();
      
      // Wait until buffer drains below threshold
      await new Promise<void>(resolve => {
        this.waitingResolvers.push(resolve);
      });
    }
  }

  /**
   * Pull an item from the buffer.
   */
  pull(): T | undefined {
    const item = this.buffer.shift();
    
    // Resume if below low water mark (half of high water mark)
    if (this.isPaused && this.buffer.length < this.highWaterMark / 2) {
      this.isPaused = false;
      this.onResume?.();
      
      // Resolve waiting pushers
      const resolvers = this.waitingResolvers;
      this.waitingResolvers = [];
      resolvers.forEach(r => r());
    }
    
    return item;
  }

  /**
   * Check if there are items in the buffer.
   */
  hasItems(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Get current buffer size.
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Check if the stream is paused due to backpressure.
   */
  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * Clear the buffer.
   */
  clear(): void {
    this.buffer = [];
    this.isPaused = false;
    const resolvers = this.waitingResolvers;
    this.waitingResolvers = [];
    resolvers.forEach(r => r());
  }
}

// ==========================================================================
// Batch Processor
// ==========================================================================

interface BatchProcessorOptions<T, R> {
  maxBatchSize: number;
  maxWaitMs: number;
  processor: (batch: T[]) => Promise<R[]>;
}

/**
 * Batches multiple requests and processes them together.
 * Useful for reducing round trips to external services.
 */
export class BatchProcessor<T, R> {
  private batch: { item: T; resolve: (result: R) => void; reject: (error: Error) => void }[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly maxBatchSize: number;
  private readonly maxWaitMs: number;
  private readonly processor: (batch: T[]) => Promise<R[]>;

  constructor(options: BatchProcessorOptions<T, R>) {
    this.maxBatchSize = options.maxBatchSize;
    this.maxWaitMs = options.maxWaitMs;
    this.processor = options.processor;
  }

  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.batch.push({ item, resolve, reject });

      // Process immediately if batch is full
      if (this.batch.length >= this.maxBatchSize) {
        this.flush();
      } else if (!this.timeoutId) {
        // Start timer for max wait
        this.timeoutId = setTimeout(() => this.flush(), this.maxWaitMs);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.batch.length === 0) return;

    const currentBatch = this.batch;
    this.batch = [];

    try {
      const items = currentBatch.map(b => b.item);
      const results = await this.processor(items);
      
      // Resolve each promise with its result
      currentBatch.forEach((b, i) => {
        if (i < results.length) {
          b.resolve(results[i]);
        } else {
          b.reject(new Error('Result missing from batch processor'));
        }
      });
    } catch (error) {
      // Reject all promises on error
      currentBatch.forEach(b => b.reject(error instanceof Error ? error : new Error(String(error))));
    }
  }
}

// ==========================================================================
// Idle Callback Scheduler (uses setImmediate in Node.js)
// ==========================================================================

interface IdleTask {
  id: number;
  callback: () => void;
  priority: number;
}

const idleTasks: IdleTask[] = [];
let idleScheduled = false;
let nextTaskId = 0;

/**
 * Schedule a task to run during idle time.
 * Higher priority tasks run first.
 */
export function scheduleIdleTask(callback: () => void, priority = 0): number {
  const id = nextTaskId++;
  idleTasks.push({ id, callback, priority });
  idleTasks.sort((a, b) => b.priority - a.priority);

  if (!idleScheduled) {
    idleScheduled = true;
    setImmediate(runIdleTasks);
  }

  return id;
}

/**
 * Cancel a scheduled idle task.
 */
export function cancelIdleTask(id: number): boolean {
  const index = idleTasks.findIndex(t => t.id === id);
  if (index > -1) {
    idleTasks.splice(index, 1);
    return true;
  }
  return false;
}

function runIdleTasks(): void {
  idleScheduled = false;
  
  // Run up to 5 tasks per idle tick
  const tasksToRun = idleTasks.splice(0, 5);
  for (const task of tasksToRun) {
    try {
      task.callback();
    } catch (error) {
      console.error('Idle task error:', error);
    }
  }

  // Schedule next batch if more tasks remain
  if (idleTasks.length > 0 && !idleScheduled) {
    idleScheduled = true;
    setImmediate(runIdleTasks);
  }
}
