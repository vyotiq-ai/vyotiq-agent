/**
 * ResourceAllocator
 *
 * Main resource allocation system that coordinates pools, budgets,
 * and allocation strategies for efficient resource management.
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  ResourceType,
  ResourceRequest,
  ResourceAllocation,
  AllocationResult,
  ResourceUsage as _ResourceUsage,
  ResourceUsageMetrics,
  AllocationStrategy,
  AutonomousFeatureFlags,
} from '../../../shared/types';

// Re-export for potential external use
export type ResourceUsage = _ResourceUsage;
import type {
  AllocatorConfig,
  QueuedRequest,
  AllocationEvent,
  ResourceAllocatorDeps,
} from './types';
import { DEFAULT_ALLOCATOR_CONFIG } from './types';
import { ResourcePool } from './ResourcePool';
import { ResourceBudgetManager, createDefaultBudgetConfig } from './ResourceBudget';

// =============================================================================
// ResourceAllocator
// =============================================================================

export class ResourceAllocator extends EventEmitter {
  private readonly logger: ResourceAllocatorDeps['logger'];
  private readonly config: AllocatorConfig;
  private readonly pools = new Map<ResourceType, ResourcePool>();
  private readonly budgetManager: ResourceBudgetManager;
  private readonly allocations = new Map<string, ResourceAllocation>();
  private readonly queues = new Map<ResourceType, QueuedRequest[]>();
  private readonly usageStats = new Map<ResourceType, UsageStats>();
  private readonly getFeatureFlags: () => AutonomousFeatureFlags;
  private queueProcessorInterval?: NodeJS.Timeout;

  constructor(
    deps: ResourceAllocatorDeps,
    getFeatureFlags: () => AutonomousFeatureFlags,
    config: Partial<AllocatorConfig> = {}
  ) {
    super();
    this.logger = deps.logger;
    this.config = { ...DEFAULT_ALLOCATOR_CONFIG, ...config };
    this.getFeatureFlags = getFeatureFlags;
    this.budgetManager = new ResourceBudgetManager();

    // Initialize queues and stats for each resource type
    const resourceTypes: ResourceType[] = ['tokens', 'agents', 'files', 'terminals', 'time', 'memory', 'api-calls'];
    for (const type of resourceTypes) {
      this.queues.set(type, []);
      this.usageStats.set(type, {
        current: 0,
        peak: 0,
        total: 0,
        allocationCount: 0,
        releaseCount: 0,
        waitTimes: [],
      });
    }
  }

  /**
   * Initialize the allocator
   */
  async initialize(): Promise<void> {
    // Start queue processor
    this.queueProcessorInterval = setInterval(() => {
      this.processQueues();
    }, 1000);

    this.logger.info('ResourceAllocator initialized');
  }

  /**
   * Shutdown the allocator
   */
  async shutdown(): Promise<void> {
    if (this.queueProcessorInterval) {
      clearInterval(this.queueProcessorInterval);
    }

    // Release all allocations
    for (const allocation of this.allocations.values()) {
      await this.deallocate(allocation.id);
    }

    // Shutdown pools
    for (const pool of this.pools.values()) {
      await pool.shutdown();
    }

    // Shutdown budget manager
    this.budgetManager.shutdown();

    this.logger.info('ResourceAllocator shutdown');
  }

  /**
   * Allocate resources
   */
  async allocate(request: ResourceRequest): Promise<AllocationResult> {
    this.logger.debug('Allocation request', {
      type: request.type,
      amount: request.amount,
      priority: request.priority,
      agentId: request.agentId,
    });

    // Try immediate allocation
    const result = this.tryAllocate(request);
    if (result.success) {
      this.emitEvent('allocated', request.type, request.amount, request.agentId, result.allocation?.id);
      return result;
    }

    // Queue if allowed
    if (request.allowQueue && this.config.enableQueueing) {
      return this.queueRequest(request);
    }

    return result;
  }

  /**
   * Deallocate resources
   */
  async deallocate(allocationId: string): Promise<boolean> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      this.logger.warn('Allocation not found for deallocation', { allocationId });
      return false;
    }

    // Release from pool if applicable
    const pool = this.pools.get(allocation.type);
    if (pool) {
      pool.release(allocationId);
    }

    // Update stats
    const stats = this.usageStats.get(allocation.type);
    if (stats) {
      stats.current = Math.max(0, stats.current - allocation.amount);
      stats.releaseCount++;
    }

    // Mark inactive and remove
    allocation.isActive = false;
    this.allocations.delete(allocationId);

    this.emitEvent('released', allocation.type, allocation.amount, allocation.agentId, allocationId);
    this.logger.debug('Resource deallocated', { allocationId, type: allocation.type, amount: allocation.amount });

    // Process queue for this type
    this.processQueueForType(allocation.type);

    return true;
  }

  /**
   * Reserve resources for a plan
   */
  async reserveForPlan(
    planId: string,
    requirements: Array<{ type: ResourceType; amount: number }>
  ): Promise<{ success: boolean; reservationId?: string; error?: string }> {
    // Check if all can be allocated
    for (const req of requirements) {
      const available = this.getAvailable(req.type);
      if (available < req.amount) {
        return {
          success: false,
          error: `Insufficient ${req.type}: need ${req.amount}, have ${available}`,
        };
      }
    }

    // Create reservation (just track, don't actually allocate)
    const reservationId = `plan-${planId}-${randomUUID()}`;

    this.logger.info('Plan resources reserved', { planId, reservationId, requirements });

    return { success: true, reservationId };
  }

  /**
   * Get current usage statistics
   */
  getUsage(type?: ResourceType): ResourceUsageMetrics | Map<ResourceType, ResourceUsageMetrics> {
    if (type) {
      return this.buildUsageReport(type);
    }

    const result = new Map<ResourceType, ResourceUsageMetrics>();
    for (const t of this.usageStats.keys()) {
      result.set(t, this.buildUsageReport(t));
    }
    return result;
  }

  /**
   * Get available amount for a resource type
   */
  getAvailable(type: ResourceType): number {
    const pool = this.pools.get(type);
    if (pool) {
      return pool.getAvailable();
    }

    // For non-pooled resources, calculate from stats
    const stats = this.usageStats.get(type);
    if (!stats) return 0;

    const maxByType = this.getMaxForType(type);
    return Math.max(0, maxByType - stats.current);
  }

  /**
   * Create a budget for a session/agent/run
   */
  createBudget(
    type: ResourceType,
    total: number,
    ownerId: string,
    ownerType: 'session' | 'agent' | 'run'
  ): string {
    const config = createDefaultBudgetConfig(type, total, 'normal');
    const budget = this.budgetManager.create(config, ownerId, ownerType);
    return budget.id;
  }

  /**
   * Get budget by ID
   */
  getBudget(budgetId: string) {
    return this.budgetManager.get(budgetId);
  }

  /**
   * Get budgets for an owner
   */
  getBudgetsForOwner(ownerId: string) {
    return this.budgetManager.getByOwner(ownerId);
  }

  /**
   * Record usage against a budget
   */
  recordBudgetUsage(budgetId: string, allocationId: string, amount: number): boolean {
    return this.budgetManager.recordUsage(budgetId, allocationId, amount);
  }

  /**
   * Check if budget is exhausted
   */
  isBudgetExhausted(budgetId: string): boolean {
    return this.budgetManager.isExhausted(budgetId);
  }

  /**
   * Register a resource pool
   */
  registerPool<T>(type: ResourceType, pool: ResourcePool<T>): void {
    this.pools.set(type, pool as unknown as ResourcePool);
  }

  /**
   * Set allocation strategy
   */
  setStrategy(strategy: AllocationStrategy): void {
    this.config.defaultStrategy = strategy;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private tryAllocate(request: ResourceRequest): AllocationResult {
    const available = this.getAvailable(request.type);

    if (available < request.amount) {
      return {
        success: false,
        error: `Insufficient ${request.type}: need ${request.amount}, have ${available}`,
        queued: false,
      };
    }

    // Create allocation
    const allocation: ResourceAllocation = {
      id: randomUUID(),
      type: request.type,
      amount: request.amount,
      used: 0,
      holderId: request.agentId,
      agentId: request.agentId,
      holderType: 'agent',
      status: 'granted',
      grantedAt: Date.now(),
      isActive: true,
    };

    // Update stats
    const stats = this.usageStats.get(request.type);
    if (stats) {
      stats.current += request.amount;
      stats.peak = Math.max(stats.peak, stats.current);
      stats.total += request.amount;
      stats.allocationCount++;
    }

    // Store allocation
    this.allocations.set(allocation.id, allocation);

    return {
      success: true,
      allocation,
      queued: false,
    };
  }

  private queueRequest(request: ResourceRequest): AllocationResult | Promise<AllocationResult> {
    const queue = this.queues.get(request.type);
    if (!queue) {
      return { success: false, error: 'Invalid resource type', queued: false };
    }

    if (queue.length >= this.config.maxQueueSize) {
      return { success: false, error: 'Queue is full', queued: false };
    }

    return new Promise((resolve) => {
      const queuedRequest: QueuedRequest = {
        request,
        resolve,
        reject: (error) => resolve({ success: false, error: error.message, queued: false }),
        enqueuedAt: Date.now(),
        expiresAt: request.timeoutMs ? Date.now() + request.timeoutMs : undefined,
      };

      // Insert based on priority
      const priorityBoost = this.config.priorityBoost[request.priority];
      let inserted = false;

      for (let i = 0; i < queue.length; i++) {
        const existingBoost = this.config.priorityBoost[queue[i].request.priority];
        if (priorityBoost > existingBoost) {
          queue.splice(i, 0, queuedRequest);
          inserted = true;
          break;
        }
      }

      if (!inserted) {
        queue.push(queuedRequest);
      }

      this.emitEvent('queued', request.type, request.amount, request.agentId);

      // Return queued status
      resolve({
        success: false,
        queued: true,
        queuePosition: queue.indexOf(queuedRequest),
        estimatedWaitMs: this.estimateWaitTime(request.type, queue.indexOf(queuedRequest)),
      });
    }) as Promise<AllocationResult>;
  }

  private processQueues(): void {
    for (const type of this.queues.keys()) {
      this.processQueueForType(type);
    }
  }

  private processQueueForType(type: ResourceType): void {
    const queue = this.queues.get(type);
    if (!queue || queue.length === 0) return;

    const now = Date.now();

    // Process expired requests first
    for (let i = queue.length - 1; i >= 0; i--) {
      const queued = queue[i];
      if (queued.expiresAt && now > queued.expiresAt) {
        queue.splice(i, 1);
        queued.resolve({
          success: false,
          error: 'Request timed out in queue',
          queued: false,
        });
      }
    }

    // Try to allocate from front of queue
    while (queue.length > 0) {
      const queued = queue[0];
      const result = this.tryAllocate(queued.request);

      if (result.success) {
        queue.shift();
        const waitTime = now - queued.enqueuedAt;

        // Record wait time
        const stats = this.usageStats.get(type);
        if (stats) {
          stats.waitTimes.push(waitTime);
          if (stats.waitTimes.length > 100) {
            stats.waitTimes.shift();
          }
        }

        this.emitEvent('dequeued', type, queued.request.amount, queued.request.agentId, result.allocation?.id);
        queued.resolve(result);
      } else {
        // Can't allocate, stop processing
        break;
      }
    }
  }

  private getMaxForType(type: ResourceType): number {
    // const flags = this.getFeatureFlags(); // TODO: Use flags when needed

    switch (type) {
      case 'agents':
        return 10; // Max 10 concurrent agents
      case 'tokens':
        return 1000000; // 1M tokens max
      case 'files':
        return 100;
      case 'terminals':
        return 10;
      case 'time':
        return 3600000; // 1 hour
      case 'memory':
        return 200000; // 200k context tokens
      case 'api-calls':
        return 1000; // Per minute
      default:
        return 100;
    }
  }

  private buildUsageReport(type: ResourceType): ResourceUsageMetrics {
    const stats = this.usageStats.get(type) || {
      current: 0,
      peak: 0,
      total: 0,
      allocationCount: 0,
      releaseCount: 0,
      waitTimes: [],
    };

    const waitTimeStats = {
      min: stats.waitTimes.length > 0 ? Math.min(...stats.waitTimes) : 0,
      max: stats.waitTimes.length > 0 ? Math.max(...stats.waitTimes) : 0,
      average: stats.waitTimes.length > 0
        ? stats.waitTimes.reduce((a, b) => a + b, 0) / stats.waitTimes.length
        : 0,
    };

    return {
      type,
      current: stats.current,
      peak: stats.peak,
      average: stats.total / Math.max(1, stats.allocationCount),
      history: [], // Would need proper history tracking
      allocationCount: stats.allocationCount,
      releaseCount: stats.releaseCount,
      waitTimeStats,
    };
  }

  private estimateWaitTime(type: ResourceType, position: number): number {
    const stats = this.usageStats.get(type);
    if (!stats || stats.waitTimes.length === 0) {
      return position * 5000; // Default 5s per position
    }

    const avgWait = stats.waitTimes.reduce((a, b) => a + b, 0) / stats.waitTimes.length;
    return Math.round(avgWait * position);
  }

  private emitEvent(
    type: AllocationEvent['type'],
    resourceType: ResourceType,
    amount: number,
    agentId?: string,
    allocationId?: string
  ): void {
    const event: AllocationEvent = {
      type,
      resourceType,
      amount,
      agentId,
      allocationId,
      timestamp: Date.now(),
    };

    this.emit('allocation', event);
  }
}

// =============================================================================
// Types
// =============================================================================

interface UsageStats {
  current: number;
  peak: number;
  total: number;
  allocationCount: number;
  releaseCount: number;
  waitTimes: number[];
}
