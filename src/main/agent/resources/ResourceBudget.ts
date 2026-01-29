/**
 * ResourceBudget
 *
 * Tracks resource budgets with soft/hard limits, usage tracking,
 * and optional refill capabilities.
 */

import { randomUUID } from 'node:crypto';
import type { ResourceType, ResourceBudgetItem } from '../../../shared/types';
import type { BudgetConfig } from './types';

// =============================================================================
// ResourceBudgetManager
// =============================================================================

export class ResourceBudgetManager {
  private readonly budgets = new Map<string, BudgetState>();
  private refillIntervals = new Map<string, NodeJS.Timeout>();

  /**
   * Create a new budget
   */
  create(config: BudgetConfig, ownerId: string, ownerType: 'session' | 'agent' | 'run'): ResourceBudgetItem {
    const id = randomUUID();
    const softLimit = Math.round(config.total * (config.softLimitPercent / 100));
    const hardLimit = Math.round(config.total * (config.hardLimitPercent / 100));
    const reserved = Math.round(config.total * (config.reservePercent / 100));

    const budget: ResourceBudgetItem = {
      id,
      type: config.type,
      total: config.total,
      allocated: 0,
      used: 0,
      reserved,
      softLimit,
      hardLimit,
      isExhausted: false,
      percentUsed: 0,
      ownerId,
      ownerType,
    };

    const state: BudgetState = {
      budget,
      config,
      allocations: new Map(),
      history: [],
    };

    this.budgets.set(id, state);

    // Setup refill if configured
    if (config.refillRate && config.refillAmount) {
      const interval = setInterval(() => {
        this.refill(id, config.refillAmount!);
      }, config.refillRate * 60000); // Convert minutes to ms

      this.refillIntervals.set(id, interval);
    }

    return budget;
  }

  /**
   * Get a budget by ID
   */
  get(budgetId: string): ResourceBudgetItem | null {
    const state = this.budgets.get(budgetId);
    return state?.budget ?? null;
  }

  /**
   * Get budgets by owner
   */
  getByOwner(ownerId: string): ResourceBudgetItem[] {
    const result: ResourceBudgetItem[] = [];
    for (const state of this.budgets.values()) {
      if (state.budget.ownerId === ownerId) {
        result.push(state.budget);
      }
    }
    return result;
  }

  /**
   * Allocate from a budget
   */
  allocate(budgetId: string, amount: number, allocationId?: string): AllocateResult {
    const state = this.budgets.get(budgetId);
    if (!state) {
      return { success: false, error: 'Budget not found' };
    }

    const budget = state.budget;
    const available = budget.total - budget.allocated - budget.reserved;

    // Check hard limit
    if (budget.used + amount > budget.hardLimit) {
      return {
        success: false,
        error: 'Hard limit exceeded',
        available,
        atHardLimit: true,
      };
    }

    // Check available
    if (amount > available) {
      return {
        success: false,
        error: 'Insufficient budget',
        available,
        atHardLimit: false,
      };
    }

    // Allocate
    budget.allocated += amount;
    budget.percentUsed = Math.round((budget.used / budget.total) * 100);

    // Track allocation
    const allocId = allocationId ?? randomUUID();
    state.allocations.set(allocId, { amount, allocatedAt: Date.now() });

    // Record history
    state.history.push({
      type: 'allocate',
      amount,
      timestamp: Date.now(),
      balance: budget.total - budget.allocated,
    });

    // Check soft limit warning
    const atSoftLimit = budget.used + amount >= budget.softLimit;

    return {
      success: true,
      allocationId: allocId,
      remaining: budget.total - budget.allocated - budget.reserved,
      atSoftLimit,
      atHardLimit: false,
    };
  }

  /**
   * Record actual usage against an allocation
   */
  recordUsage(budgetId: string, allocationId: string, amount: number): boolean {
    const state = this.budgets.get(budgetId);
    if (!state) return false;

    const allocation = state.allocations.get(allocationId);
    if (!allocation) return false;

    // Update usage
    state.budget.used += amount;
    state.budget.percentUsed = Math.round((state.budget.used / state.budget.total) * 100);
    state.budget.isExhausted = state.budget.used >= state.budget.hardLimit;

    // Record history
    state.history.push({
      type: 'use',
      amount,
      timestamp: Date.now(),
      balance: state.budget.total - state.budget.used,
    });

    return true;
  }

  /**
   * Release an allocation back to the budget
   */
  release(budgetId: string, allocationId: string, actualUsed?: number): boolean {
    const state = this.budgets.get(budgetId);
    if (!state) return false;

    const allocation = state.allocations.get(allocationId);
    if (!allocation) return false;

    // Return unused allocation
    const unused = allocation.amount - (actualUsed ?? 0);
    if (unused > 0) {
      state.budget.allocated = Math.max(0, state.budget.allocated - unused);
    }

    state.allocations.delete(allocationId);

    // Record history
    state.history.push({
      type: 'release',
      amount: allocation.amount,
      timestamp: Date.now(),
      balance: state.budget.total - state.budget.allocated,
    });

    return true;
  }

  /**
   * Get remaining budget
   */
  getRemaining(budgetId: string): number {
    const state = this.budgets.get(budgetId);
    if (!state) return 0;

    return state.budget.total - state.budget.allocated - state.budget.reserved;
  }

  /**
   * Check if budget is exhausted
   */
  isExhausted(budgetId: string): boolean {
    const state = this.budgets.get(budgetId);
    if (!state) return true;

    return state.budget.isExhausted || state.budget.used >= state.budget.hardLimit;
  }

  /**
   * Check if budget is at soft limit
   */
  isAtSoftLimit(budgetId: string): boolean {
    const state = this.budgets.get(budgetId);
    if (!state) return true;

    return state.budget.used >= state.budget.softLimit;
  }

  /**
   * Adjust budget total
   */
  adjustTotal(budgetId: string, newTotal: number): boolean {
    const state = this.budgets.get(budgetId);
    if (!state) return false;

    const config = state.config;
    state.budget.total = newTotal;
    state.budget.softLimit = Math.round(newTotal * (config.softLimitPercent / 100));
    state.budget.hardLimit = Math.round(newTotal * (config.hardLimitPercent / 100));
    state.budget.reserved = Math.round(newTotal * (config.reservePercent / 100));
    state.budget.percentUsed = Math.round((state.budget.used / newTotal) * 100);
    state.budget.isExhausted = state.budget.used >= state.budget.hardLimit;

    return true;
  }

  /**
   * Delete a budget
   */
  delete(budgetId: string): void {
    const interval = this.refillIntervals.get(budgetId);
    if (interval) {
      clearInterval(interval);
      this.refillIntervals.delete(budgetId);
    }
    this.budgets.delete(budgetId);
  }

  /**
   * Delete all budgets for an owner
   */
  deleteByOwner(ownerId: string): void {
    const toDelete: string[] = [];
    for (const [id, state] of this.budgets) {
      if (state.budget.ownerId === ownerId) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      this.delete(id);
    }
  }

  /**
   * Get budget history
   */
  getHistory(budgetId: string, limit = 100): BudgetHistoryEntry[] {
    const state = this.budgets.get(budgetId);
    if (!state) return [];

    return state.history.slice(-limit);
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    for (const interval of this.refillIntervals.values()) {
      clearInterval(interval);
    }
    this.refillIntervals.clear();
    this.budgets.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private refill(budgetId: string, amount: number): void {
    const state = this.budgets.get(budgetId);
    if (!state) return;

    // Reduce used amount (simulating refill)
    state.budget.used = Math.max(0, state.budget.used - amount);
    state.budget.percentUsed = Math.round((state.budget.used / state.budget.total) * 100);
    state.budget.isExhausted = state.budget.used >= state.budget.hardLimit;

    state.history.push({
      type: 'refill',
      amount,
      timestamp: Date.now(),
      balance: state.budget.total - state.budget.used,
    });
  }
}

// =============================================================================
// Types
// =============================================================================

interface BudgetState {
  budget: ResourceBudgetItem;
  config: BudgetConfig;
  allocations: Map<string, { amount: number; allocatedAt: number }>;
  history: BudgetHistoryEntry[];
}

interface BudgetHistoryEntry {
  type: 'allocate' | 'use' | 'release' | 'refill';
  amount: number;
  timestamp: number;
  balance: number;
}

interface AllocateResult {
  success: boolean;
  error?: string;
  allocationId?: string;
  remaining?: number;
  available?: number;
  atSoftLimit?: boolean;
  atHardLimit?: boolean;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default budget configs for different scenarios
 */
export function createDefaultBudgetConfig(
  type: ResourceType,
  total: number,
  scenario: 'conservative' | 'normal' | 'aggressive' = 'normal'
): BudgetConfig {
  const scenarios = {
    conservative: { softLimitPercent: 60, hardLimitPercent: 80, reservePercent: 20 },
    normal: { softLimitPercent: 75, hardLimitPercent: 95, reservePercent: 10 },
    aggressive: { softLimitPercent: 90, hardLimitPercent: 100, reservePercent: 5 },
  };

  const config = scenarios[scenario];

  return {
    type,
    total,
    softLimitPercent: config.softLimitPercent,
    hardLimitPercent: config.hardLimitPercent,
    reservePercent: config.reservePercent,
  };
}

/**
 * Create a token budget for a session
 */
export function createTokenBudget(
  totalTokens: number,
  scenario: 'conservative' | 'normal' | 'aggressive' = 'normal'
): BudgetConfig {
  return createDefaultBudgetConfig('tokens', totalTokens, scenario);
}

/**
 * Create a time budget for a run
 */
export function createTimeBudget(
  totalMs: number,
  scenario: 'conservative' | 'normal' | 'aggressive' = 'normal'
): BudgetConfig {
  return createDefaultBudgetConfig('time', totalMs, scenario);
}
