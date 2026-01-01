/**
 * ResourceManager
 *
 * Manages resource budgets for CPU, tokens, and API calls.
 * Enables adaptive resource allocation and enforcement.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  PerformanceResourceType,
  ResourceBudget,
  ResourceAllocation,
  ResourceManagerConfig,
  PerformanceDeps,
} from './types';
import { DEFAULT_RESOURCE_MANAGER_CONFIG } from './types';
import { createLogger } from '../../logger';

const logger = createLogger('ResourceManager');

// =============================================================================
// ResourceManager
// =============================================================================

export class ResourceManager extends EventEmitter {
  private readonly config: ResourceManagerConfig;
  private readonly deps: PerformanceDeps;

  // Budgets
  private budgets: Map<PerformanceResourceType, ResourceBudget> = new Map();

  // Active allocations
  private allocations: Map<string, ResourceAllocation> = new Map();

  // Rate limiting windows
  private tokenWindow: { tokens: number; resetAt: number } = { tokens: 0, resetAt: 0 };
  private apiCallWindow: { calls: number; resetAt: number } = { calls: 0, resetAt: 0 };

  // Monitoring
  private checkInterval?: ReturnType<typeof setInterval>;
  private started = false;

  constructor(
    config: Partial<ResourceManagerConfig> = {},
    deps?: Partial<PerformanceDeps>
  ) {
    super();

    this.config = { ...DEFAULT_RESOURCE_MANAGER_CONFIG, ...config };

    this.deps = {
      logger: deps?.logger ?? logger,
      emitEvent: deps?.emitEvent ?? (() => {}),
    };

    this.initializeBudgets();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize resource budgets
   */
  private initializeBudgets(): void {
    // CPU budget (percentage)
    this.budgets.set('cpu', {
      type: 'cpu',
      max: this.config.cpuBudget,
      current: 0,
      reserved: 0,
      available: this.config.cpuBudget,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      unit: 'percent',
    });

    // Token budget (per minute)
    this.budgets.set('tokens', {
      type: 'tokens',
      max: this.config.tokenBudgetPerMinute,
      current: 0,
      reserved: 0,
      available: this.config.tokenBudgetPerMinute,
      warningThreshold: 0.8,
      criticalThreshold: 0.95,
      unit: 'tokens/min',
    });

    // API call budget (per minute)
    this.budgets.set('api-calls', {
      type: 'api-calls',
      max: this.config.apiCallBudgetPerMinute,
      current: 0,
      reserved: 0,
      available: this.config.apiCallBudgetPerMinute,
      warningThreshold: 0.8,
      criticalThreshold: 0.95,
      unit: 'calls/min',
    });

    // Connections
    this.budgets.set('connections', {
      type: 'connections',
      max: this.config.connectionPoolSize,
      current: 0,
      reserved: 0,
      available: this.config.connectionPoolSize,
      warningThreshold: 0.8,
      criticalThreshold: 1.0,
      unit: 'connections',
    });
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Start resource monitoring
   */
  start(): void {
    if (this.started) return;

    this.started = true;

    this.checkInterval = setInterval(() => {
      this.updateResourceUsage();
      this.cleanupExpiredAllocations();
      this.resetRateLimitWindows();
    }, this.config.budgetCheckIntervalMs);

    this.deps.logger.info('ResourceManager: started');
  }

  /**
   * Stop resource monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.started = false;
    this.deps.logger.info('ResourceManager: stopped');
  }

  // ===========================================================================
  // Resource Allocation
  // ===========================================================================

  /**
   * Request resource allocation
   */
  allocate(
    type: PerformanceResourceType,
    amount: number,
    owner: string,
    ownerType: ResourceAllocation['ownerType'] = 'task',
    expiresInMs?: number
  ): ResourceAllocation | null {
    const budget = this.budgets.get(type);
    if (!budget) {
      this.deps.logger.error('ResourceManager: unknown resource type', { type });
      return null;
    }

    // Check if allocation is possible
    if (amount > budget.available) {
      this.emit('allocation-denied', {
        type,
        requested: amount,
        available: budget.available,
        owner,
      });

      this.deps.logger.warn('ResourceManager: allocation denied', {
        type,
        requested: amount,
        available: budget.available,
      });

      return null;
    }

    // Create allocation
    const allocation: ResourceAllocation = {
      id: randomUUID(),
      type,
      amount,
      owner,
      ownerType,
      allocatedAt: Date.now(),
      expiresAt: expiresInMs ? Date.now() + expiresInMs : undefined,
    };

    // Update budget
    budget.reserved += amount;
    budget.available = budget.max - budget.current - budget.reserved;

    this.allocations.set(allocation.id, allocation);

    this.emit('allocation-granted', allocation);

    this.deps.logger.debug('ResourceManager: allocation granted', {
      id: allocation.id,
      type,
      amount,
      owner,
    });

    return allocation;
  }

  /**
   * Release an allocation
   */
  release(allocationId: string): boolean {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      return false;
    }

    const budget = this.budgets.get(allocation.type);
    if (budget) {
      budget.reserved -= allocation.amount;
      budget.available = budget.max - budget.current - budget.reserved;
    }

    this.allocations.delete(allocationId);

    this.emit('allocation-released', allocation);

    this.deps.logger.debug('ResourceManager: allocation released', {
      id: allocationId,
      type: allocation.type,
      amount: allocation.amount,
    });

    return true;
  }

  /**
   * Get allocations by owner
   */
  getAllocationsByOwner(owner: string): ResourceAllocation[] {
    const result: ResourceAllocation[] = [];
    for (const allocation of this.allocations.values()) {
      if (allocation.owner === owner) {
        result.push(allocation);
      }
    }
    return result;
  }

  /**
   * Release all allocations for an owner
   */
  releaseAllForOwner(owner: string): number {
    let released = 0;
    for (const allocation of this.allocations.values()) {
      if (allocation.owner === owner) {
        this.release(allocation.id);
        released++;
      }
    }
    return released;
  }

  // ===========================================================================
  // Rate Limiting
  // ===========================================================================

  /**
   * Try to consume tokens
   */
  tryConsumeTokens(count: number): boolean {
    const now = Date.now();

    // Reset window if expired
    if (now > this.tokenWindow.resetAt) {
      this.tokenWindow = { tokens: 0, resetAt: now + 60000 };
    }

    // Check if within budget
    if (this.tokenWindow.tokens + count > this.config.tokenBudgetPerMinute) {
      this.emit('rate-limit', {
        type: 'tokens',
        current: this.tokenWindow.tokens,
        requested: count,
        max: this.config.tokenBudgetPerMinute,
        resetInMs: this.tokenWindow.resetAt - now,
      });
      return false;
    }

    this.tokenWindow.tokens += count;

    // Update budget
    const budget = this.budgets.get('tokens');
    if (budget) {
      budget.current = this.tokenWindow.tokens;
      budget.available = budget.max - budget.current - budget.reserved;
      this.checkThresholds(budget);
    }

    return true;
  }

  /**
   * Try to consume an API call
   */
  tryConsumeApiCall(): boolean {
    const now = Date.now();

    // Reset window if expired
    if (now > this.apiCallWindow.resetAt) {
      this.apiCallWindow = { calls: 0, resetAt: now + 60000 };
    }

    // Check if within budget
    if (this.apiCallWindow.calls >= this.config.apiCallBudgetPerMinute) {
      this.emit('rate-limit', {
        type: 'api-calls',
        current: this.apiCallWindow.calls,
        requested: 1,
        max: this.config.apiCallBudgetPerMinute,
        resetInMs: this.apiCallWindow.resetAt - now,
      });
      return false;
    }

    this.apiCallWindow.calls++;

    // Update budget
    const budget = this.budgets.get('api-calls');
    if (budget) {
      budget.current = this.apiCallWindow.calls;
      budget.available = budget.max - budget.current - budget.reserved;
      this.checkThresholds(budget);
    }

    return true;
  }

  /**
   * Get time until rate limit reset
   */
  getTimeUntilReset(type: 'tokens' | 'api-calls'): number {
    const now = Date.now();
    const window = type === 'tokens' ? this.tokenWindow : this.apiCallWindow;
    return Math.max(0, window.resetAt - now);
  }

  // ===========================================================================
  // Budget Queries
  // ===========================================================================

  /**
   * Get budget for a resource type
   */
  getBudget(type: PerformanceResourceType): ResourceBudget | undefined {
    return this.budgets.get(type);
  }

  /**
   * Get all budgets
   */
  getAllBudgets(): Map<PerformanceResourceType, ResourceBudget> {
    return new Map(this.budgets);
  }

  /**
   * Check if resources are available
   */
  hasAvailable(type: PerformanceResourceType, amount: number): boolean {
    const budget = this.budgets.get(type);
    return budget ? budget.available >= amount : false;
  }

  /**
   * Get utilization (0-1)
   */
  getUtilization(type: PerformanceResourceType): number {
    const budget = this.budgets.get(type);
    if (!budget || budget.max === 0) return 0;
    return (budget.current + budget.reserved) / budget.max;
  }

  /**
   * Check if at warning threshold
   */
  isAtWarningThreshold(type: PerformanceResourceType): boolean {
    const utilization = this.getUtilization(type);
    const budget = this.budgets.get(type);
    return budget ? utilization >= budget.warningThreshold : false;
  }

  /**
   * Check if at critical threshold
   */
  isAtCriticalThreshold(type: PerformanceResourceType): boolean {
    const utilization = this.getUtilization(type);
    const budget = this.budgets.get(type);
    return budget ? utilization >= budget.criticalThreshold : false;
  }

  // ===========================================================================
  // Budget Updates
  // ===========================================================================

  /**
   * Update budget max value
   */
  updateBudgetMax(type: PerformanceResourceType, newMax: number): void {
    const budget = this.budgets.get(type);
    if (!budget) return;

    budget.max = newMax;
    budget.available = newMax - budget.current - budget.reserved;

    this.deps.logger.info('ResourceManager: budget updated', {
      type,
      newMax,
    });
  }

  /**
   * Update current usage directly
   */
  updateCurrentUsage(type: PerformanceResourceType, current: number): void {
    const budget = this.budgets.get(type);
    if (!budget) return;

    budget.current = current;
    budget.available = budget.max - budget.current - budget.reserved;

    this.checkThresholds(budget);
  }

  // ===========================================================================
  // Internal Updates
  // ===========================================================================

  /**
   * Update resource usage from system
   */
  private updateResourceUsage(): void {
    // CPU usage would be updated here if needed
    // Currently no automatic system resource monitoring for CPU
  }

  /**
   * Clean up expired allocations
   */
  private cleanupExpiredAllocations(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, allocation] of this.allocations) {
      if (allocation.expiresAt && now > allocation.expiresAt) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      this.release(id);
      this.deps.logger.debug('ResourceManager: expired allocation released', { id });
    }
  }

  /**
   * Reset rate limit windows
   */
  private resetRateLimitWindows(): void {
    const now = Date.now();

    if (now > this.tokenWindow.resetAt) {
      this.tokenWindow = { tokens: 0, resetAt: now + 60000 };

      const budget = this.budgets.get('tokens');
      if (budget) {
        budget.current = 0;
        budget.available = budget.max - budget.reserved;
      }
    }

    if (now > this.apiCallWindow.resetAt) {
      this.apiCallWindow = { calls: 0, resetAt: now + 60000 };

      const budget = this.budgets.get('api-calls');
      if (budget) {
        budget.current = 0;
        budget.available = budget.max - budget.reserved;
      }
    }
  }

  /**
   * Check thresholds and emit events
   */
  private checkThresholds(budget: ResourceBudget): void {
    const utilization = (budget.current + budget.reserved) / budget.max;

    if (utilization >= budget.criticalThreshold) {
      this.emit('critical-threshold', {
        type: budget.type,
        utilization,
        budget,
      });
    } else if (utilization >= budget.warningThreshold) {
      this.emit('warning-threshold', {
        type: budget.type,
        utilization,
        budget,
      });
    }
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get statistics
   */
  getStats(): {
    activeAllocations: number;
    budgetSummary: Record<string, { current: number; max: number; utilization: number }>;
    tokensUsedThisMinute: number;
    apiCallsThisMinute: number;
  } {
    const budgetSummary: Record<string, { current: number; max: number; utilization: number }> = {};

    for (const [type, budget] of this.budgets) {
      budgetSummary[type] = {
        current: budget.current + budget.reserved,
        max: budget.max,
        utilization: this.getUtilization(type),
      };
    }

    return {
      activeAllocations: this.allocations.size,
      budgetSummary,
      tokensUsedThisMinute: this.tokenWindow.tokens,
      apiCallsThisMinute: this.apiCallWindow.calls,
    };
  }

  /**
   * Clear all allocations
   */
  clear(): void {
    for (const id of this.allocations.keys()) {
      this.release(id);
    }

    this.tokenWindow = { tokens: 0, resetAt: 0 };
    this.apiCallWindow = { calls: 0, resetAt: 0 };
  }
}
