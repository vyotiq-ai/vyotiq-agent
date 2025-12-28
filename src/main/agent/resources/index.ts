/**
 * Resource Allocation Module
 *
 * Provides resource management including:
 * - Resource pools for reusable resources
 * - Budget tracking with soft/hard limits
 * - Allocation strategies (FIFO, priority, fair-share)
 * - Usage monitoring and alerting
 */

import { DEFAULT_AUTONOMOUS_FEATURE_FLAGS } from '../../../shared/types';

// Core types
export type {
  PoolItem,
  PoolConfig,
  BudgetConfig,
  QueuedRequest,
  AllocationEvent,
  UsageSample,
  MonitorConfig,
  AllocatorConfig,
} from './types';

export { DEFAULT_POOL_CONFIGS, DEFAULT_MONITOR_CONFIG, DEFAULT_ALLOCATOR_CONFIG } from './types';

// Resource Pool
export { ResourcePool } from './ResourcePool';

// Budget Manager
export {
  ResourceBudgetManager,
  createDefaultBudgetConfig,
  createTokenBudget,
  createTimeBudget,
} from './ResourceBudget';

// Resource Allocator
export { ResourceAllocator } from './ResourceAllocator';

// Resource Monitor
export { ResourceMonitor } from './ResourceMonitor';

// Allocation Strategies
export {
  getStrategy,
  getAllStrategies,
  selectStrategy,
  FifoStrategy,
  PriorityStrategy,
  FairShareStrategy,
  GreedyStrategy,
  ReservedStrategy,
} from './strategies';
export type { AllocationStrategyHandler, StrategyContext } from './strategies';

// =============================================================================
// Singleton Access
// =============================================================================

import { ResourceAllocator } from './ResourceAllocator';
import { ResourceMonitor } from './ResourceMonitor';

let resourceAllocatorInstance: ResourceAllocator | null = null;
let resourceMonitorInstance: ResourceMonitor | null = null;

/**
 * Get the singleton ResourceAllocator instance
 */
export function getResourceAllocator(): ResourceAllocator | null {
  return resourceAllocatorInstance;
}

/**
 * Initialize the singleton ResourceAllocator
 */
export function initResourceAllocator(
  deps: {
    logger: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void; error: (msg: string, meta?: Record<string, unknown>) => void; debug: (msg: string, meta?: Record<string, unknown>) => void };
    emitEvent: (event: unknown) => void;
  },
  getFeatureFlags?: () => import('../../../shared/types').AutonomousFeatureFlags
): ResourceAllocator {
  if (!resourceAllocatorInstance) {
    const defaultFlags = () => DEFAULT_AUTONOMOUS_FEATURE_FLAGS;
    resourceAllocatorInstance = new ResourceAllocator(deps, getFeatureFlags ?? defaultFlags);
  }
  return resourceAllocatorInstance;
}

/**
 * Reset the singleton ResourceAllocator (for testing)
 */
export function resetResourceAllocator(): void {
  if (resourceAllocatorInstance) {
    // Note: ResourceAllocator doesn't have a dispose method
    resourceAllocatorInstance = null;
  }
}

/**
 * Get the singleton ResourceMonitor instance
 */
export function getResourceMonitor(): ResourceMonitor | null {
  return resourceMonitorInstance;
}

/**
 * Initialize the singleton ResourceMonitor
 */
export function initResourceMonitor(
  deps: {
    logger: { info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void; error: (msg: string, meta?: Record<string, unknown>) => void; debug: (msg: string, meta?: Record<string, unknown>) => void };
    emitEvent: (event: unknown) => void;
    allocator: ResourceAllocator;
  },
  getFeatureFlags?: () => import('../../../shared/types').AutonomousFeatureFlags
): ResourceMonitor {
  if (!resourceMonitorInstance) {
    const defaultFlags = () => DEFAULT_AUTONOMOUS_FEATURE_FLAGS;
    resourceMonitorInstance = new ResourceMonitor(deps, deps.allocator, getFeatureFlags ?? defaultFlags);
  }
  return resourceMonitorInstance;
}

/**
 * Reset the singleton ResourceMonitor (for testing)
 */
export function resetResourceMonitor(): void {
  if (resourceMonitorInstance) {
    // Note: ResourceMonitor doesn't have a dispose method
    resourceMonitorInstance = null;
  }
}
