/**
 * Failover Manager
 *
 * Handles automatic failover between LLM providers when
 * failures or degradation occurs.
 */

import type {
  LLMProviderName,
  FailoverConfig,
} from '../../../shared/types';
import type { Logger } from '../../logger';
import type { ProviderHealthMonitor } from './ProviderHealthMonitor';

// =============================================================================
// Types
// =============================================================================

/**
 * Failover decision result
 */
export interface FailoverDecision {
  shouldFailover: boolean;
  targetProvider?: LLMProviderName;
  reason?: string;
}

/**
 * Failover event
 */
export interface FailoverEvent {
  timestamp: number;
  fromProvider: LLMProviderName;
  toProvider: LLMProviderName;
  reason: string;
  agentId?: string;
}

/**
 * Provider preference configuration
 */
export interface ProviderPreference {
  provider: LLMProviderName;
  priority: number;
  capabilities: string[];
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default failover chain by capability
 */
export const DEFAULT_FAILOVER_CHAINS: Record<string, LLMProviderName[]> = {
  default: ['anthropic', 'openai', 'gemini', 'deepseek', 'glm', 'openrouter'],
  coding: ['anthropic', 'openai', 'deepseek', 'gemini', 'glm', 'openrouter'],
  reasoning: ['openai', 'anthropic', 'deepseek', 'gemini', 'glm', 'openrouter'],
  fast: ['gemini', 'deepseek', 'openai', 'anthropic', 'glm', 'openrouter'],
  cheap: ['deepseek', 'glm', 'gemini', 'openrouter', 'openai', 'anthropic'],
};

// =============================================================================
// FailoverManager
// =============================================================================

/**
 * FailoverManager handles provider failover logic.
 *
 * Features:
 * - Automatic failover on failure
 * - Health-aware provider selection
 * - Configurable failover chains
 * - Failover history tracking
 */
export class FailoverManager {
  private readonly logger: Logger;
  private config: FailoverConfig;
  private readonly healthMonitor?: ProviderHealthMonitor;

  // Failover history
  private readonly failoverHistory: FailoverEvent[] = [];

  // Circuit breaker state per provider
  private readonly circuitBreakerState = new Map<LLMProviderName, {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
    openUntil: number;
  }>();

  // Custom failover chains
  private failoverChains: Record<string, LLMProviderName[]>;

  constructor(
    logger: Logger,
    healthMonitor?: ProviderHealthMonitor,
    config?: Partial<FailoverConfig>
  ) {
    this.logger = logger;
    this.healthMonitor = healthMonitor;
    this.config = {
      enabled: config?.enabled ?? true,
      maxFailovers: config?.maxFailovers ?? 3,
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
      failoverThreshold: config?.failoverThreshold ?? 0.5,
      recoveryPeriodMs: config?.recoveryPeriodMs ?? 60000,
      excludedProviders: config?.excludedProviders ?? [],
      failoverChain: config?.failoverChain ?? DEFAULT_FAILOVER_CHAINS.default,
      circuitBreakerThreshold: config?.circuitBreakerThreshold ?? 5,
      circuitBreakerResetMs: config?.circuitBreakerResetMs ?? 60000,
    };

    this.failoverChains = { ...DEFAULT_FAILOVER_CHAINS };

    // Initialize circuit breakers
    const providers: LLMProviderName[] = ['anthropic', 'openai', 'deepseek', 'gemini', 'glm', 'openrouter'];
    for (const provider of providers) {
      this.resetCircuitBreaker(provider);
    }
  }

  /**
   * Reset circuit breaker for a provider
   */
  private resetCircuitBreaker(provider: LLMProviderName): void {
    this.circuitBreakerState.set(provider, {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
      openUntil: 0,
    });
  }

  // ===========================================================================
  // Failover Decision
  // ===========================================================================

  /**
   * Decide if failover is needed and to which provider
   */
  decideFailover(
    currentProvider: LLMProviderName,
    error: Error,
    capability?: string
  ): FailoverDecision {
    if (!this.config.enabled) {
      return { shouldFailover: false };
    }

    // Record failure
    this.recordFailure(currentProvider);

    // Check if we should failover
    const shouldFailover = this.shouldFailover(error);
    if (!shouldFailover) {
      return { shouldFailover: false, reason: 'Error not eligible for failover' };
    }

    // Find target provider
    const chain = this.failoverChains[capability ?? 'default'] ?? this.config.failoverChain;
    const target = this.findFailoverTarget(currentProvider, chain);

    if (!target) {
      return { shouldFailover: false, reason: 'No available failover target' };
    }

    return {
      shouldFailover: true,
      targetProvider: target,
      reason: this.getFailoverReason(error),
    };
  }

  /**
   * Check if error type should trigger failover
   */
  private shouldFailover(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Failover-worthy errors
    const failoverErrors = [
      'rate limit',
      'timeout',
      'service unavailable',
      'server error',
      '5xx',
      '429',
      '503',
      'connection refused',
      'network error',
      'econnreset',
    ];

    return failoverErrors.some(e => message.includes(e));
  }

  /**
   * Get reason for failover
   */
  private getFailoverReason(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('rate limit') || message.includes('429')) {
      return 'Rate limit exceeded';
    }
    if (message.includes('timeout')) {
      return 'Request timeout';
    }
    if (message.includes('503') || message.includes('service unavailable')) {
      return 'Service unavailable';
    }
    if (message.includes('5xx') || message.includes('server error')) {
      return 'Server error';
    }
    if (message.includes('connection') || message.includes('network')) {
      return 'Network error';
    }
    
    return 'Provider error';
  }

  /**
   * Find the best failover target
   */
  private findFailoverTarget(
    currentProvider: LLMProviderName,
    chain: LLMProviderName[]
  ): LLMProviderName | null {
    const currentIndex = chain.indexOf(currentProvider);
    
    // Try providers in chain order after current
    for (let i = currentIndex + 1; i < chain.length; i++) {
      const candidate = chain[i];
      if (this.isProviderAvailable(candidate)) {
        return candidate;
      }
    }

    // Try providers before current
    for (let i = 0; i < currentIndex; i++) {
      const candidate = chain[i];
      if (this.isProviderAvailable(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Check if a provider is available for failover
   */
  private isProviderAvailable(provider: LLMProviderName): boolean {
    // Check circuit breaker
    const circuitBreaker = this.circuitBreakerState.get(provider);
    if (circuitBreaker?.isOpen) {
      if (Date.now() < circuitBreaker.openUntil) {
        return false;
      }
      // Reset circuit breaker after timeout
      this.resetCircuitBreaker(provider);
    }

    // Check health if monitor available
    if (this.healthMonitor) {
      const health = this.healthMonitor.getHealth(provider);
      if (health?.status === 'unhealthy') {
        return false;
      }
    }

    return true;
  }

  // ===========================================================================
  // Failure Recording
  // ===========================================================================

  /**
   * Record a failure for a provider
   */
  recordFailure(provider: LLMProviderName): void {
    const state = this.circuitBreakerState.get(provider);
    if (!state) return;

    state.failures++;
    state.lastFailure = Date.now();

    // Check if circuit breaker should open
    if (state.failures >= this.config.circuitBreakerThreshold) {
      state.isOpen = true;
      state.openUntil = Date.now() + this.config.circuitBreakerResetMs;
      
      this.logger.warn('Circuit breaker opened', {
        provider,
        failures: state.failures,
        resetMs: this.config.circuitBreakerResetMs,
      });
    }
  }

  /**
   * Record a successful request (resets failure count)
   */
  recordSuccess(provider: LLMProviderName): void {
    const state = this.circuitBreakerState.get(provider);
    if (state) {
      state.failures = 0;
    }
  }

  // ===========================================================================
  // Failover Execution
  // ===========================================================================

  /**
   * Execute a failover
   */
  executeFailover(
    fromProvider: LLMProviderName,
    toProvider: LLMProviderName,
    reason: string,
    agentId?: string
  ): void {
    const event: FailoverEvent = {
      timestamp: Date.now(),
      fromProvider,
      toProvider,
      reason,
      agentId,
    };

    this.failoverHistory.push(event);

    // Keep last 100 events
    if (this.failoverHistory.length > 100) {
      this.failoverHistory.shift();
    }

    this.logger.info('Failover executed', event as unknown as Record<string, unknown>);
  }

  /**
   * Check if failover limit reached for session
   */
  hasReachedFailoverLimit(agentId?: string): boolean {
    const recentWindow = Date.now() - 300000; // 5 minutes
    const recentFailovers = this.failoverHistory.filter(e => {
      if (e.timestamp < recentWindow) return false;
      if (agentId && e.agentId !== agentId) return false;
      return true;
    });

    return recentFailovers.length >= this.config.maxFailovers;
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set custom failover chain for a capability
   */
  setFailoverChain(capability: string, chain: LLMProviderName[]): void {
    this.failoverChains[capability] = chain;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FailoverConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FailoverConfig {
    return { ...this.config };
  }

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get failover history
   */
  getHistory(options?: {
    provider?: LLMProviderName;
    agentId?: string;
    since?: number;
    limit?: number;
  }): FailoverEvent[] {
    let results = [...this.failoverHistory];

    if (options?.provider) {
      results = results.filter(
        e => e.fromProvider === options.provider || e.toProvider === options.provider
      );
    }

    if (options?.agentId) {
      results = results.filter(e => e.agentId === options.agentId);
    }

    if (options?.since) {
      results = results.filter(e => e.timestamp >= options.since);
    }

    if (options?.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): Map<LLMProviderName, {
    isOpen: boolean;
    failures: number;
    resetsIn?: number;
  }> {
    const status = new Map<LLMProviderName, {
      isOpen: boolean;
      failures: number;
      resetsIn?: number;
    }>();

    const now = Date.now();
    for (const [provider, state] of this.circuitBreakerState.entries()) {
      status.set(provider, {
        isOpen: state.isOpen && state.openUntil > now,
        failures: state.failures,
        resetsIn: state.isOpen ? Math.max(0, state.openUntil - now) : undefined,
      });
    }

    return status;
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear all state
   */
  clear(): void {
    this.failoverHistory.length = 0;
    
    for (const provider of this.circuitBreakerState.keys()) {
      this.resetCircuitBreaker(provider);
    }
  }
}
