/**
 * PerformanceMonitor
 *
 * Tracks timing, latency, throughput, and resource usage metrics.
 * Provides real-time and historical performance data.
 */

import { EventEmitter } from 'node:events';
import type {
  OperationTiming,
  LatencyPercentiles,
  ThroughputMetrics,
  ResourceUsageSnapshot,
  PerformanceMetrics,
  PerformanceMonitorConfig,
  PerformanceDeps,
} from './types';
import { DEFAULT_PERFORMANCE_MONITOR_CONFIG } from './types';
import { createLogger } from '../../logger';

const logger = createLogger('PerformanceMonitor');

// =============================================================================
// PerformanceMonitor
// =============================================================================

export class PerformanceMonitor extends EventEmitter {
  private readonly config: PerformanceMonitorConfig;
  private readonly deps: PerformanceDeps;

  // Timing data
  private activeOperations: Map<string, OperationTiming> = new Map();
  private latencySamples: Map<string, number[]> = new Map();

  // Throughput tracking
  private operationCounts: Map<string, { count: number; tokens: number; timestamp: number }[]> = new Map();

  // Resource samples
  private resourceSamples: ResourceUsageSnapshot[] = [];
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastCpuCheck: number = 0;

  // Metrics collection
  private collectionInterval?: ReturnType<typeof setInterval>;
  private started = false;

  constructor(
    config: Partial<PerformanceMonitorConfig> = {},
    deps?: Partial<PerformanceDeps>
  ) {
    super();

    this.config = { ...DEFAULT_PERFORMANCE_MONITOR_CONFIG, ...config };

    this.deps = {
      logger: deps?.logger ?? logger,
      emitEvent: deps?.emitEvent ?? (() => {}),
    };
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.started) return;

    this.started = true;
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = Date.now();

    if (this.config.enableResourceMonitoring) {
      this.collectionInterval = setInterval(() => {
        this.collectResourceMetrics();
      }, this.config.collectionIntervalMs);
    }

    this.deps.logger.info('PerformanceMonitor: started');
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
    }
    this.started = false;
    this.deps.logger.info('PerformanceMonitor: stopped');
  }

  // ===========================================================================
  // Operation Timing
  // ===========================================================================

  /**
   * Start timing an operation
   */
  startOperation(operationId: string, name: string, metadata?: Record<string, unknown>): void {
    const timing: OperationTiming = {
      name,
      startedAt: Date.now(),
      phases: new Map(),
      metadata,
    };

    this.activeOperations.set(operationId, timing);
  }

  /**
   * Start a phase within an operation
   */
  startPhase(operationId: string, phaseName: string): void {
    const timing = this.activeOperations.get(operationId);
    if (!timing) return;

    timing.phases?.set(phaseName, { startedAt: Date.now() });
  }

  /**
   * End a phase within an operation
   */
  endPhase(operationId: string, phaseName: string): number | undefined {
    const timing = this.activeOperations.get(operationId);
    if (!timing?.phases) return undefined;

    const phase = timing.phases.get(phaseName);
    if (!phase) return undefined;

    phase.endedAt = Date.now();
    return phase.endedAt - phase.startedAt;
  }

  /**
   * End timing an operation
   */
  endOperation(operationId: string, metadata?: Record<string, unknown>): number | undefined {
    const timing = this.activeOperations.get(operationId);
    if (!timing) return undefined;

    timing.endedAt = Date.now();
    timing.durationMs = timing.endedAt - timing.startedAt;

    if (metadata) {
      timing.metadata = { ...timing.metadata, ...metadata };
    }

    // Record latency sample
    this.recordLatencySample(timing.name, timing.durationMs);

    // Check for slow operation
    if (timing.durationMs > this.config.slowOperationThresholdMs) {
      this.emit('slow-operation', timing);
      this.deps.logger.warn('PerformanceMonitor: slow operation detected', {
        name: timing.name,
        durationMs: timing.durationMs,
      });
    }

    this.activeOperations.delete(operationId);
    return timing.durationMs;
  }

  /**
   * Record a latency sample
   */
  recordLatencySample(operationName: string, latencyMs: number): void {
    if (!this.config.enableLatencyTracking) return;

    let samples = this.latencySamples.get(operationName);
    if (!samples) {
      samples = [];
      this.latencySamples.set(operationName, samples);
    }

    samples.push(latencyMs);

    // Trim old samples
    if (samples.length > this.config.maxSamples) {
      samples.shift();
    }
  }

  /**
   * Get latency percentiles for an operation
   */
  getLatencyPercentiles(operationName: string): LatencyPercentiles | undefined {
    const samples = this.latencySamples.get(operationName);
    if (!samples || samples.length === 0) return undefined;

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;

    const percentile = (p: number) => sorted[Math.floor((p / 100) * count)] ?? 0;

    return {
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
      mean: sorted.reduce((a, b) => a + b, 0) / count,
      count,
    };
  }

  // ===========================================================================
  // Throughput Tracking
  // ===========================================================================

  /**
   * Record an operation for throughput tracking
   */
  recordOperation(operationType: string, tokens: number = 0): void {
    if (!this.config.enableThroughputTracking) return;

    let counts = this.operationCounts.get(operationType);
    if (!counts) {
      counts = [];
      this.operationCounts.set(operationType, counts);
    }

    counts.push({ count: 1, tokens, timestamp: Date.now() });

    // Trim old entries
    const cutoff = Date.now() - this.config.metricsHistoryMs;
    while (counts.length > 0 && counts[0]!.timestamp < cutoff) {
      counts.shift();
    }
  }

  /**
   * Get throughput metrics
   */
  getThroughputMetrics(windowMs: number = 60000): ThroughputMetrics {
    const cutoff = Date.now() - windowMs;
    let totalOps = 0;
    let totalTokens = 0;
    let totalMessages = 0;

    for (const [type, counts] of this.operationCounts) {
      for (const entry of counts) {
        if (entry.timestamp >= cutoff) {
          totalOps++;
          totalTokens += entry.tokens;
          if (type === 'message' || type.includes('message')) {
            totalMessages++;
          }
        }
      }
    }

    const windowSeconds = windowMs / 1000;

    return {
      opsPerSecond: totalOps / windowSeconds,
      tokensPerSecond: totalTokens / windowSeconds,
      messagesPerSecond: totalMessages / windowSeconds,
      totalOperations: totalOps,
      windowMs,
    };
  }

  // ===========================================================================
  // Resource Monitoring
  // ===========================================================================

  /**
   * Collect resource metrics
   */
  collectResourceMetrics(): ResourceUsageSnapshot {
    const memUsage = process.memoryUsage();
    const now = Date.now();

    // Calculate CPU usage
    let cpuUsage = 0;
    if (this.lastCpuUsage && this.lastCpuCheck) {
      const currentCpu = process.cpuUsage(this.lastCpuUsage);
      const elapsed = (now - this.lastCpuCheck) * 1000; // Convert to microseconds
      cpuUsage = (currentCpu.user + currentCpu.system) / elapsed;
    }

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = now;

    const snapshot: ResourceUsageSnapshot = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rss: memUsage.rss,
      cpuUsage,
      eventLoopLag: 0, // Would need async_hooks for accurate measurement
      activeHandles: (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.().length ?? 0,
      activeRequests: (process as NodeJS.Process & { _getActiveRequests?: () => unknown[] })._getActiveRequests?.().length ?? 0,
      timestamp: now,
    };

    this.resourceSamples.push(snapshot);

    // Trim old samples
    const cutoff = now - this.config.metricsHistoryMs;
    while (this.resourceSamples.length > 0 && this.resourceSamples[0]!.timestamp < cutoff) {
      this.resourceSamples.shift();
    }

    if (this.resourceSamples.length > this.config.maxSamples) {
      this.resourceSamples.shift();
    }

    this.emit('resource-sample', snapshot);
    return snapshot;
  }

  /**
   * Get latest resource usage
   */
  getLatestResourceUsage(): ResourceUsageSnapshot | undefined {
    return this.resourceSamples[this.resourceSamples.length - 1];
  }

  /**
   * Get resource usage history
   */
  getResourceHistory(limit?: number): ResourceUsageSnapshot[] {
    if (limit) {
      return this.resourceSamples.slice(-limit);
    }
    return [...this.resourceSamples];
  }

  // ===========================================================================
  // Aggregated Metrics
  // ===========================================================================

  /**
   * Get comprehensive performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const latencyByOperation = new Map<string, LatencyPercentiles>();

    for (const name of this.latencySamples.keys()) {
      const percentiles = this.getLatencyPercentiles(name);
      if (percentiles) {
        latencyByOperation.set(name, percentiles);
      }
    }

    return {
      latencyByOperation,
      throughput: this.getThroughputMetrics(),
      resourceUsage: this.getLatestResourceUsage() ?? this.collectResourceMetrics(),
      cacheHitRates: {}, // Will be filled by CachingLayer
      poolUtilization: {}, // Will be filled by resource pools
      errorRates: {}, // Will be filled by monitoring
      timestamp: Date.now(),
    };
  }

  // ===========================================================================
  // Timing Utilities
  // ===========================================================================

  /**
   * Time an async function
   */
  async timeAsync<T>(
    operationName: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<{ result: T; durationMs: number }> {
    const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.startOperation(operationId, operationName, metadata);

    try {
      const result = await fn();
      const durationMs = this.endOperation(operationId) ?? 0;
      return { result, durationMs };
    } catch (error) {
      this.endOperation(operationId, { error: true });
      throw error;
    }
  }

  /**
   * Create a timing wrapper
   */
  createTimer(operationName: string, metadata?: Record<string, unknown>): {
    startPhase: (name: string) => void;
    endPhase: (name: string) => number | undefined;
    end: () => number | undefined;
  } {
    const operationId = `${operationName}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.startOperation(operationId, operationName, metadata);

    return {
      startPhase: (name: string) => this.startPhase(operationId, name),
      endPhase: (name: string) => this.endPhase(operationId, name),
      end: () => this.endOperation(operationId),
    };
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get statistics summary
   */
  getStats(): {
    activeOperations: number;
    trackedOperationTypes: number;
    latencySamples: number;
    resourceSamples: number;
    isRunning: boolean;
  } {
    let totalLatencySamples = 0;
    for (const samples of this.latencySamples.values()) {
      totalLatencySamples += samples.length;
    }

    return {
      activeOperations: this.activeOperations.size,
      trackedOperationTypes: this.latencySamples.size,
      latencySamples: totalLatencySamples,
      resourceSamples: this.resourceSamples.length,
      isRunning: this.started,
    };
  }

  /**
   * Clear all collected data
   */
  clear(): void {
    this.activeOperations.clear();
    this.latencySamples.clear();
    this.operationCounts.clear();
    this.resourceSamples = [];
  }
}
