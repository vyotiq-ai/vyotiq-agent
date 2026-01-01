/**
 * Resource Allocation Internal Types
 *
 * Internal types for resource pools, budgets, and allocation.
 * Re-exports shared types and adds implementation-specific types.
 */

import type {
  ResourceType,
  ResourceRequest,
  ResourceAllocation,
  AllocationResult,
  ResourceBudget,
  ResourceBudgetItem,
  ResourceUsage,
  ResourceUsageMetrics,
  AllocationStrategy,
  ResourcePoolStatus,
} from '../../../shared/types';

// Re-export shared types
export type {
  ResourceType,
  ResourceRequest,
  ResourceAllocation,
  AllocationResult,
  ResourceBudget,
  ResourceBudgetItem,
  ResourceUsage,
  ResourceUsageMetrics,
  AllocationStrategy,
  ResourcePoolStatus,
};

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Default maximum values for each resource type.
 * Used by ResourceAllocator and ResourceMonitor for limit calculations.
 */
export const RESOURCE_MAX_LIMITS: Record<ResourceType, number> = {
  agents: 10,
  tokens: 1000000,
  files: 100,
  terminals: 10,
  time: 3600000,
  'api-calls': 1000,
};

/**
 * Get the maximum limit for a resource type
 */
export function getResourceMaxLimit(type: ResourceType): number {
  return RESOURCE_MAX_LIMITS[type] ?? 100;
}

/**
 * Pool item for tracking individual resources
 */
export interface PoolItem<T = unknown> {
  id: string;
  resource: T;
  state: 'available' | 'allocated' | 'warming' | 'cooling';
  allocatedTo?: string;
  allocatedAt?: number;
  lastUsedAt?: number;
  healthScore: number;
}

/**
 * Pool configuration
 */
export interface PoolConfig {
  type: ResourceType;
  minSize: number;
  maxSize: number;
  warmUpCount: number;
  idleTimeoutMs: number;
  healthCheckIntervalMs: number;
  allowOverflow: boolean;
  overflowLimit: number;
}

/**
 * Default pool configurations by resource type
 */
export const DEFAULT_POOL_CONFIGS: Record<ResourceType, PoolConfig> = {
  tokens: {
    type: 'tokens',
    minSize: 0,
    maxSize: 1000000,
    warmUpCount: 0,
    idleTimeoutMs: 0,
    healthCheckIntervalMs: 0,
    allowOverflow: false,
    overflowLimit: 0,
  },
  agents: {
    type: 'agents',
    minSize: 0,
    maxSize: 10,
    warmUpCount: 0,
    idleTimeoutMs: 60000,
    healthCheckIntervalMs: 30000,
    allowOverflow: false,
    overflowLimit: 2,
  },
  files: {
    type: 'files',
    minSize: 0,
    maxSize: 100,
    warmUpCount: 0,
    idleTimeoutMs: 30000,
    healthCheckIntervalMs: 10000,
    allowOverflow: true,
    overflowLimit: 20,
  },
  terminals: {
    type: 'terminals',
    minSize: 0,
    maxSize: 5,
    warmUpCount: 0,
    idleTimeoutMs: 120000,
    healthCheckIntervalMs: 60000,
    allowOverflow: false,
    overflowLimit: 1,
  },
  time: {
    type: 'time',
    minSize: 0,
    maxSize: 3600000, // 1 hour max
    warmUpCount: 0,
    idleTimeoutMs: 0,
    healthCheckIntervalMs: 0,
    allowOverflow: false,
    overflowLimit: 0,
  },
  'api-calls': {
    type: 'api-calls',
    minSize: 0,
    maxSize: 1000, // Per minute
    warmUpCount: 0,
    idleTimeoutMs: 0,
    healthCheckIntervalMs: 60000,
    allowOverflow: false,
    overflowLimit: 0,
  },
};

/**
 * Budget configuration
 */
export interface BudgetConfig {
  type: ResourceType;
  total: number;
  softLimitPercent: number;
  hardLimitPercent: number;
  reservePercent: number;
  refillRate?: number; // Per minute
  refillAmount?: number;
}

/**
 * Allocation request in queue
 */
export interface QueuedRequest {
  request: ResourceRequest;
  resolve: (result: AllocationResult) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  expiresAt?: number;
}

/**
 * Resource allocation event
 */
export interface AllocationEvent {
  type: 'allocated' | 'released' | 'expired' | 'queued' | 'dequeued';
  resourceType: ResourceType;
  amount: number;
  agentId?: string;
  allocationId?: string;
  timestamp: number;
}

/**
 * Resource monitor sample
 */
export interface UsageSample {
  timestamp: number;
  type: ResourceType;
  current: number;
  peak: number;
  allocated: number;
  available: number;
  queueLength?: number;
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  samplingIntervalMs: number;
  retentionPeriodMs: number;
  maxAlertsPerType: number;
  thresholds: Partial<Record<ResourceType, { warning: number; critical: number }>>;
}

/**
 * Default monitor configuration
 */
export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  samplingIntervalMs: 5000,
  retentionPeriodMs: 3600000, // 1 hour
  maxAlertsPerType: 50,
  thresholds: {
    tokens: { warning: 80, critical: 95 },
    agents: { warning: 70, critical: 90 },
    files: { warning: 80, critical: 95 },
    terminals: { warning: 80, critical: 100 },
    time: { warning: 80, critical: 95 },
    'api-calls': { warning: 80, critical: 95 },
  },
};

/**
 * Resource monitor dependencies
 */
export interface ResourceMonitorDeps {
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    debug: (message: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * Allocator configuration
 */
export interface AllocatorConfig {
  defaultStrategy: AllocationStrategy;
  enableQueueing: boolean;
  maxQueueSize: number;
  maxQueueWaitMs: number;
  fairShareWindow: number; // Agents considered in fair share
  priorityBoost: Record<ResourceRequest['priority'], number>;
}

/**
 * Default allocator configuration
 */
export const DEFAULT_ALLOCATOR_CONFIG: AllocatorConfig = {
  defaultStrategy: 'priority',
  enableQueueing: true,
  maxQueueSize: 50,
  maxQueueWaitMs: 30000,
  fairShareWindow: 10,
  priorityBoost: {
    low: 0,
    normal: 1,
    high: 2,
    critical: 3,
  },
};

/**
 * Resource allocator dependencies
 */
export interface ResourceAllocatorDeps {
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    debug: (message: string, meta?: Record<string, unknown>) => void;
  };
  onAllocationEvent?: (event: AllocationEvent) => void;
}
