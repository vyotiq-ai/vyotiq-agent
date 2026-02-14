/**
 * Provider Health Monitor
 *
 * Monitors health, latency, and availability of LLM providers.
 */

import type {
  LLMProviderName,
  ProviderHealth,
} from '../../../shared/types';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Interval between health checks (ms) */
  checkIntervalMs: number;
  /** Latency threshold for degraded status (ms) */
  latencyThresholdMs: number;
  /** Error rate threshold for degraded status (0-1) */
  errorRateThreshold: number;
  /** Number of consecutive failures to mark as unhealthy */
  failureThreshold: number;
  /** Number of consecutive successes to mark as healthy */
  recoveryThreshold: number;
  /** Time window for calculating error rate (ms) */
  errorWindowMs: number;
}

/**
 * Default health check configuration
 */
export const DEFAULT_HEALTH_CONFIG: HealthCheckConfig = {
  checkIntervalMs: 30000,
  latencyThresholdMs: 5000,
  errorRateThreshold: 0.1,
  failureThreshold: 3,
  recoveryThreshold: 2,
  errorWindowMs: 300000, // 5 minutes
};

/**
 * Request record for health calculation
 */
interface RequestRecord {
  timestamp: number;
  latencyMs: number;
  success: boolean;
}

// =============================================================================
// ProviderHealthMonitor
// =============================================================================

/**
 * ProviderHealthMonitor tracks provider health metrics.
 *
 * Features:
 * - Latency tracking
 * - Error rate calculation
 * - Health status determination
 * - Proactive health checks
 */
export class ProviderHealthMonitor {
  private readonly logger: Logger;
  private config: HealthCheckConfig;

  // Health status per provider
  private readonly health = new Map<LLMProviderName, ProviderHealth>();

  // Request history for metrics
  private readonly requestHistory = new Map<LLMProviderName, RequestRecord[]>();

  // Consecutive failure/success counters
  private readonly consecutiveFailures = new Map<LLMProviderName, number>();
  private readonly consecutiveSuccesses = new Map<LLMProviderName, number>();

  // Health check interval
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    logger: Logger,
    config?: Partial<HealthCheckConfig>
  ) {
    this.logger = logger;
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };

    // Initialize for all providers
    const providers: LLMProviderName[] = ['anthropic', 'openai', 'deepseek', 'gemini', 'glm', 'openrouter', 'xai', 'mistral'];
    for (const provider of providers) {
      this.initializeProvider(provider);
    }
  }

  /**
   * Initialize health tracking for a provider
   */
  private initializeProvider(provider: LLMProviderName): void {
    this.health.set(provider, {
      provider,
      status: 'unknown',
      latencyMs: 0,
      errorRate: 0,
      lastCheck: 0,
      consecutiveFailures: 0,
    });
    this.requestHistory.set(provider, []);
    this.consecutiveFailures.set(provider, 0);
    this.consecutiveSuccesses.set(provider, 0);
  }

  // ===========================================================================
  // Request Tracking
  // ===========================================================================

  /**
   * Record a request result
   */
  recordRequest(
    provider: LLMProviderName,
    latencyMs: number,
    success: boolean
  ): void {
    const history = this.requestHistory.get(provider);
    if (!history) return;

    // Add record
    history.push({
      timestamp: Date.now(),
      latencyMs,
      success,
    });

    // Trim old records
    const cutoff = Date.now() - this.config.errorWindowMs;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }

    // Update consecutive counters
    if (success) {
      this.consecutiveSuccesses.set(
        provider,
        (this.consecutiveSuccesses.get(provider) ?? 0) + 1
      );
      this.consecutiveFailures.set(provider, 0);
    } else {
      this.consecutiveFailures.set(
        provider,
        (this.consecutiveFailures.get(provider) ?? 0) + 1
      );
      this.consecutiveSuccesses.set(provider, 0);
    }

    // Update health
    this.updateHealth(provider);
  }

  /**
   * Update health status for a provider
   */
  private updateHealth(provider: LLMProviderName): void {
    const history = this.requestHistory.get(provider) ?? [];
    const failures = this.consecutiveFailures.get(provider) ?? 0;
    const successes = this.consecutiveSuccesses.get(provider) ?? 0;

    // Calculate metrics
    const errorRate = this.calculateErrorRate(history);
    const avgLatency = this.calculateAverageLatency(history);

    // Determine status
    let status: ProviderHealth['status'] = 'healthy';

    if (failures >= this.config.failureThreshold) {
      status = 'unhealthy';
    } else if (
      errorRate > this.config.errorRateThreshold ||
      avgLatency > this.config.latencyThresholdMs
    ) {
      status = 'degraded';
    } else if (history.length === 0) {
      status = 'unknown';
    } else if (successes >= this.config.recoveryThreshold) {
      status = 'healthy';
    }

    const currentHealth = this.health.get(provider);
    const previousStatus = currentHealth?.status;

    this.health.set(provider, {
      provider,
      status,
      latencyMs: avgLatency,
      errorRate,
      lastCheck: Date.now(),
      consecutiveFailures: failures,
    });

    // Log status changes
    if (previousStatus && previousStatus !== status) {
      this.logger.info('Provider health status changed', {
        provider,
        from: previousStatus,
        to: status,
        errorRate: errorRate.toFixed(2),
        latencyMs: avgLatency.toFixed(0),
      });
    }
  }

  /**
   * Calculate error rate from history
   */
  private calculateErrorRate(history: RequestRecord[]): number {
    if (history.length === 0) return 0;
    const failures = history.filter(r => !r.success).length;
    return failures / history.length;
  }

  /**
   * Calculate average latency from history
   */
  private calculateAverageLatency(history: RequestRecord[]): number {
    const successful = history.filter(r => r.success);
    if (successful.length === 0) return 0;
    const total = successful.reduce((sum, r) => sum + r.latencyMs, 0);
    return total / successful.length;
  }

  // ===========================================================================
  // Health Queries
  // ===========================================================================

  /**
   * Get health status for a provider
   */
  getHealth(provider: LLMProviderName): ProviderHealth | undefined {
    return this.health.get(provider);
  }

  /**
   * Get health for all providers
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Check if provider is healthy
   */
  isHealthy(provider: LLMProviderName): boolean {
    const health = this.health.get(provider);
    return health?.status === 'healthy' || health?.status === 'unknown';
  }

  /**
   * Get healthy providers
   */
  getHealthyProviders(): LLMProviderName[] {
    return Array.from(this.health.entries())
      .filter(([_, h]) => h.status === 'healthy' || h.status === 'unknown')
      .map(([p, _]) => p);
  }

  /**
   * Get best provider based on health metrics
   */
  getBestProvider(candidates?: LLMProviderName[]): LLMProviderName | null {
    const providers = candidates ?? Array.from(this.health.keys());
    
    let bestProvider: LLMProviderName | null = null;
    let bestScore = -1;

    for (const provider of providers) {
      const health = this.health.get(provider);
      if (!health) continue;

      // Skip unhealthy providers
      if (health.status === 'unhealthy') continue;

      // Score based on status, latency, and error rate
      let score = 0;
      
      if (health.status === 'healthy') score += 100;
      else if (health.status === 'unknown') score += 50;
      else if (health.status === 'degraded') score += 25;

      // Lower latency is better
      if (health.latencyMs > 0) {
        score += Math.max(0, 50 - health.latencyMs / 100);
      }

      // Lower error rate is better
      score += (1 - health.errorRate) * 50;

      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }

  // ===========================================================================
  // Proactive Health Checks
  // ===========================================================================

  /**
   * Start periodic health checks
   */
  startHealthChecks(checkFn: (provider: LLMProviderName) => Promise<{ latencyMs: number; success: boolean }>): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const provider of this.health.keys()) {
        try {
          const result = await checkFn(provider);
          this.recordRequest(provider, result.latencyMs, result.success);
        } catch (error) {
          this.logger.warn('Health check failed for provider', {
            provider,
            error: error instanceof Error ? error.message : String(error),
          });
          this.recordRequest(provider, 0, false);
        }
      }
    }, this.config.checkIntervalMs);
    if (this.healthCheckInterval && typeof this.healthCheckInterval === 'object' && 'unref' in this.healthCheckInterval) {
      (this.healthCheckInterval as NodeJS.Timeout).unref();
    }

    this.logger.debug('Started health checks', {
      intervalMs: this.config.checkIntervalMs,
    });
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.debug('Stopped health checks');
    }
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear all health data
   */
  clear(): void {
    this.stopHealthChecks();
    
    for (const provider of this.health.keys()) {
      this.initializeProvider(provider);
    }
  }
}
