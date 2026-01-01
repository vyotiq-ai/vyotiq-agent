/**
 * ResourceMonitor
 *
 * Monitors resource usage over time, detects anomalies,
 * and provides reporting and alerting capabilities.
 */

import { EventEmitter } from 'node:events';
import type {
  ResourceType,
  ResourceUsageMetrics,
  AutonomousFeatureFlags,
} from '../../../shared/types';
import type { MonitorConfig, UsageSample, ResourceMonitorDeps } from './types';
import { DEFAULT_MONITOR_CONFIG, getResourceMaxLimit } from './types';
import { ResourceAllocator } from './ResourceAllocator';

// =============================================================================
// ResourceMonitor
// =============================================================================

export class ResourceMonitor extends EventEmitter {
  private readonly logger: ResourceMonitorDeps['logger'];
  private readonly allocator: ResourceAllocator;
  private readonly config: MonitorConfig;
  private readonly getFeatureFlags: () => AutonomousFeatureFlags;
  private readonly samples = new Map<ResourceType, UsageSample[]>();
  private readonly alerts = new Map<ResourceType, Alert[]>();
  private readonly thresholdStates = new Map<ResourceType, ThresholdState>();
  private samplingInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    deps: ResourceMonitorDeps,
    allocator: ResourceAllocator,
    getFeatureFlags: () => AutonomousFeatureFlags,
    config: Partial<MonitorConfig> = {}
  ) {
    super();
    this.logger = deps.logger;
    this.allocator = allocator;
    this.getFeatureFlags = getFeatureFlags;
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };

    // Initialize storage for each resource type
    const resourceTypes: ResourceType[] = ['tokens', 'agents', 'files', 'terminals', 'time', 'api-calls'];
    for (const type of resourceTypes) {
      this.samples.set(type, []);
      this.alerts.set(type, []);
      this.thresholdStates.set(type, {
        hasReachedWarning: false,
        hasReachedCritical: false,
        lastAlertTime: 0,
      });
    }
  }

  /**
   * Start monitoring
   */
  start(): void {
    // Start sampling
    this.samplingInterval = setInterval(() => {
      this.collectSamples();
    }, this.config.samplingIntervalMs);

    // Start cleanup of old samples
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldSamples();
    }, 60000); // Every minute

    this.logger.info('ResourceMonitor started', {
      samplingInterval: this.config.samplingIntervalMs,
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.logger.info('ResourceMonitor stopped');
  }

  /**
   * Get usage samples for a resource type
   */
  getSamples(type: ResourceType, timeRangeMs?: number): UsageSample[] {
    const allSamples = this.samples.get(type) || [];

    if (!timeRangeMs) {
      return [...allSamples];
    }

    const cutoff = Date.now() - timeRangeMs;
    return allSamples.filter((s) => s.timestamp >= cutoff);
  }

  /**
   * Get current snapshot of all resources
   */
  getSnapshot(): ResourceSnapshot {
    const snapshot: ResourceSnapshot = {
      timestamp: Date.now(),
      resources: {},
    };

    const usageMap = this.allocator.getUsage() as Map<ResourceType, ResourceUsageMetrics>;

    for (const [type, usage] of usageMap) {
      const samples = this.samples.get(type) || [];
      const recentSamples = samples.slice(-10);

      snapshot.resources[type] = {
        current: usage.current,
        peak: usage.peak,
        average: usage.average,
        trend: this.calculateTrend(recentSamples),
        utilizationPercent: this.calculateUtilization(type, usage.current),
      };
    }

    return snapshot;
  }

  /**
   * Get alerts for a resource type
   */
  getAlerts(type?: ResourceType): Alert[] {
    if (type) {
      return [...(this.alerts.get(type) || [])];
    }

    const allAlerts: Alert[] = [];
    for (const alerts of this.alerts.values()) {
      allAlerts.push(...alerts);
    }
    return allAlerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clear alerts for a resource type
   */
  clearAlerts(type?: ResourceType): void {
    if (type) {
      this.alerts.set(type, []);
      const state = this.thresholdStates.get(type);
      if (state) {
        state.hasReachedWarning = false;
        state.hasReachedCritical = false;
      }
    } else {
      for (const t of this.alerts.keys()) {
        this.alerts.set(t, []);
        const state = this.thresholdStates.get(t);
        if (state) {
          state.hasReachedWarning = false;
          state.hasReachedCritical = false;
        }
      }
    }
  }

  /**
   * Get statistics for a resource type over a time period
   */
  getStatistics(type: ResourceType, timeRangeMs: number = 300000): ResourceStatistics {
    const samples = this.getSamples(type, timeRangeMs);

    if (samples.length === 0) {
      return {
        type,
        timeRangeMs,
        sampleCount: 0,
        min: 0,
        max: 0,
        average: 0,
        stdDev: 0,
        trend: 'stable',
        percentile95: 0,
      };
    }

    const values = samples.map((s) => s.current);
    const sorted = [...values].sort((a, b) => a - b);

    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - average, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const p95Index = Math.floor(sorted.length * 0.95);
    const percentile95 = sorted[p95Index] || max;

    return {
      type,
      timeRangeMs,
      sampleCount: samples.length,
      min,
      max,
      average,
      stdDev,
      trend: this.calculateTrend(samples),
      percentile95,
    };
  }

  /**
   * Set custom threshold for a resource type
   */
  setThreshold(type: ResourceType, warning: number, critical: number): void {
    this.config.thresholds[type] = { warning, critical };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private collectSamples(): void {
    const usageMap = this.allocator.getUsage() as Map<ResourceType, ResourceUsageMetrics>;

    for (const [type, usage] of usageMap) {
      const sample: UsageSample = {
        timestamp: Date.now(),
        type,
        current: usage.current,
        peak: usage.peak,
        allocated: usage.current,
        available: this.allocator.getAvailable(type),
      };

      const samples = this.samples.get(type) || [];
      samples.push(sample);
      this.samples.set(type, samples);

      // Check thresholds
      this.checkThresholds(type, sample);
    }
  }

  private checkThresholds(type: ResourceType, sample: UsageSample): void {
    const thresholds = this.config.thresholds[type];
    if (!thresholds) return;

    const state = this.thresholdStates.get(type);
    if (!state) return;

    const utilization = this.calculateUtilization(type, sample.current);
    const now = Date.now();

    // Check critical threshold
    if (utilization >= thresholds.critical && !state.hasReachedCritical) {
      state.hasReachedCritical = true;
      state.lastAlertTime = now;
      this.createAlert(type, 'critical', utilization, sample.current);
    }
    // Check warning threshold
    else if (utilization >= thresholds.warning && !state.hasReachedWarning) {
      state.hasReachedWarning = true;
      state.lastAlertTime = now;
      this.createAlert(type, 'warning', utilization, sample.current);
    }

    // Reset states if utilization drops
    if (utilization < thresholds.warning * 0.8) {
      state.hasReachedWarning = false;
      state.hasReachedCritical = false;
    }
  }

  private createAlert(
    type: ResourceType,
    severity: 'warning' | 'critical',
    utilization: number,
    current: number
  ): void {
    const alert: Alert = {
      id: `${type}-${Date.now()}`,
      type,
      severity,
      message: `${type} usage at ${utilization.toFixed(1)}%`,
      utilization,
      current,
      timestamp: Date.now(),
    };

    const alerts = this.alerts.get(type) || [];
    alerts.push(alert);

    // Keep only recent alerts
    if (alerts.length > this.config.maxAlertsPerType) {
      alerts.shift();
    }

    this.alerts.set(type, alerts);
    this.emit('alert', alert);

    this.logger.warn('Resource alert', {
      type,
      severity,
      utilization: `${utilization.toFixed(1)}%`,
      current,
    });
  }

  private calculateUtilization(type: ResourceType, current: number): number {
    const max = this.getMaxForType(type);
    if (max === 0) return 0;
    return (current / max) * 100;
  }

  private getMaxForType(type: ResourceType): number {
    return getResourceMaxLimit(type);
  }

  private calculateTrend(samples: UsageSample[]): 'increasing' | 'decreasing' | 'stable' {
    if (samples.length < 3) return 'stable';

    const recent = samples.slice(-5);
    const older = samples.slice(-10, -5);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((s, v) => s + v.current, 0) / recent.length;
    const olderAvg = older.reduce((s, v) => s + v.current, 0) / older.length;

    const changePercent = ((recentAvg - olderAvg) / Math.max(1, olderAvg)) * 100;

    if (changePercent > 10) return 'increasing';
    if (changePercent < -10) return 'decreasing';
    return 'stable';
  }

  private cleanupOldSamples(): void {
    const cutoff = Date.now() - this.config.retentionPeriodMs;

    for (const [type, samples] of this.samples) {
      const filtered = samples.filter((s) => s.timestamp >= cutoff);
      this.samples.set(type, filtered);
    }
  }
}

// =============================================================================
// Types
// =============================================================================

interface ThresholdState {
  hasReachedWarning: boolean;
  hasReachedCritical: boolean;
  lastAlertTime: number;
}

interface Alert {
  id: string;
  type: ResourceType;
  severity: 'warning' | 'critical';
  message: string;
  utilization: number;
  current: number;
  timestamp: number;
}

interface ResourceSnapshot {
  timestamp: number;
  resources: Record<
    string,
    {
      current: number;
      peak: number;
      average: number;
      trend: 'increasing' | 'decreasing' | 'stable';
      utilizationPercent: number;
    }
  >;
}

interface ResourceStatistics {
  type: ResourceType;
  timeRangeMs: number;
  sampleCount: number;
  min: number;
  max: number;
  average: number;
  stdDev: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  percentile95: number;
}
