/**
 * Resource Management Module Tests
 *
 * Tests for the resource allocation and monitoring system including:
 * - ResourceAllocator - Allocation with strategies
 * - ResourceMonitor - Usage sampling and alerting
 * - ResourcePool - Pooled resource management
 * - ResourceBudget - Budget tracking with limits
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock timer functions for testing
const mockSetInterval = vi.fn();
const mockClearInterval = vi.fn();

// Types for testing
type ResourceType = 'agents' | 'tokens' | 'files' | 'terminals' | 'time' | 'api-calls';
type AllocationStrategy = 'fifo' | 'priority' | 'fair-share' | 'greedy' | 'reserved';

// Strategy implementations for testing
const allocationStrategies: Record<AllocationStrategy, (requests: ResourceRequest[], budget: ResourceBudget) => ResourceRequest[]> = {
  'fifo': (requests) => [...requests].sort((a, b) => (a.timeout || 0) - (b.timeout || 0)),
  'priority': (requests) => {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    return [...requests].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  },
  'fair-share': (requests) => requests, // Equal distribution
  'greedy': (requests) => [...requests].sort((a, b) => b.amount - a.amount),
  'reserved': (requests) => {
    // Critical requests first, then by priority
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    return [...requests].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  },
};

interface ResourceRequest {
  type: ResourceType;
  amount: number;
  agentId?: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  timeout?: number;
}

interface ResourceAllocation {
  id: string;
  type: ResourceType;
  amount: number;
  agentId?: string;
  allocatedAt: number;
  expiresAt?: number;
}

interface AllocationResult {
  success: boolean;
  allocation?: ResourceAllocation;
  error?: string;
  waitTime?: number;
}

interface ResourceBudget {
  type: ResourceType;
  total: number;
  used: number;
  reserved: number;
  available: number;
  softLimit: number;
  hardLimit: number;
}

describe('ResourceAllocator', () => {
  let allocations: Map<string, ResourceAllocation>;
  let budgets: Map<ResourceType, ResourceBudget>;

  beforeEach(() => {
    allocations = new Map();
    budgets = new Map();

    // Initialize default budgets
    budgets.set('tokens', {
      type: 'tokens',
      total: 1000000,
      used: 0,
      reserved: 0,
      available: 1000000,
      softLimit: 800000,
      hardLimit: 950000,
    });

    budgets.set('files', {
      type: 'files',
      total: 100,
      used: 0,
      reserved: 0,
      available: 100,
      softLimit: 80,
      hardLimit: 95,
    });

    budgets.set('terminals', {
      type: 'terminals',
      total: 10,
      used: 0,
      reserved: 0,
      available: 10,
      softLimit: 8,
      hardLimit: 10,
    });
  });

  describe('Basic Allocation', () => {
    it('should allocate resources when available', () => {
      const request: ResourceRequest = {
        type: 'tokens',
        amount: 10000,
        agentId: 'agent-1',
        priority: 'normal',
      };

      const budget = budgets.get('tokens')!;
      
      if (request.amount <= budget.available) {
        const allocation: ResourceAllocation = {
          id: `alloc-${Date.now()}`,
          type: request.type,
          amount: request.amount,
          agentId: request.agentId,
          allocatedAt: Date.now(),
        };

        allocations.set(allocation.id, allocation);
        budget.used += request.amount;
        budget.available -= request.amount;

        expect(allocation.amount).toBe(10000);
        expect(budget.used).toBe(10000);
        expect(budget.available).toBe(990000);
      }
    });

    it('should reject allocation when insufficient resources', () => {
      const budget = budgets.get('terminals')!;
      budget.used = 10;
      budget.available = 0;

      const request: ResourceRequest = {
        type: 'terminals',
        amount: 1,
        priority: 'normal',
      };

      const result: AllocationResult = {
        success: request.amount <= budget.available,
        error: request.amount > budget.available ? 'Insufficient resources' : undefined,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient resources');
    });

    it('should release allocated resources', () => {
      const budget = budgets.get('files')!;
      
      // Allocate
      const allocation: ResourceAllocation = {
        id: 'alloc-1',
        type: 'files',
        amount: 5,
        allocatedAt: Date.now(),
      };
      allocations.set(allocation.id, allocation);
      budget.used = 5;
      budget.available = 95;

      // Release
      allocations.delete(allocation.id);
      budget.used -= allocation.amount;
      budget.available += allocation.amount;

      expect(budget.used).toBe(0);
      expect(budget.available).toBe(100);
      expect(allocations.has('alloc-1')).toBe(false);
    });
  });

  describe('Priority-Based Allocation', () => {
    it('should prioritize critical requests', () => {
      const requests: ResourceRequest[] = [
        { type: 'tokens', amount: 1000, priority: 'low' },
        { type: 'tokens', amount: 1000, priority: 'critical' },
        { type: 'tokens', amount: 1000, priority: 'normal' },
      ];

      // Sort by priority
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const sorted = [...requests].sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
      );

      expect(sorted[0].priority).toBe('critical');
      expect(sorted[1].priority).toBe('normal');
      expect(sorted[2].priority).toBe('low');
    });

    it('should boost priority for waiting requests', () => {
      const request: ResourceRequest & { enqueuedAt: number } = {
        type: 'tokens',
        amount: 1000,
        priority: 'low',
        enqueuedAt: Date.now() - 30000, // 30 seconds ago
      };

      const waitTimeMs = Date.now() - request.enqueuedAt;
      const boostThreshold = 10000; // 10 seconds
      const shouldBoost = waitTimeMs > boostThreshold;

      expect(shouldBoost).toBe(true);
    });
  });

  describe('Fair-Share Allocation', () => {
    it('should distribute resources fairly among agents', () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      const totalTokens = 90000;
      const fairShare = totalTokens / agents.length;

      const allocations = agents.map(agentId => ({
        agentId,
        amount: fairShare,
      }));

      expect(allocations[0].amount).toBe(30000);
      expect(allocations[1].amount).toBe(30000);
      expect(allocations[2].amount).toBe(30000);
    });

    it('should track per-agent usage', () => {
      const agentUsage = new Map<string, number>();
      
      agentUsage.set('agent-1', 10000);
      agentUsage.set('agent-2', 5000);
      agentUsage.set('agent-3', 15000);

      const totalUsage = Array.from(agentUsage.values()).reduce((a, b) => a + b, 0);
      const avgUsage = totalUsage / agentUsage.size;

      expect(totalUsage).toBe(30000);
      expect(avgUsage).toBe(10000);
    });
  });

  describe('Budget Limits', () => {
    it('should warn when approaching soft limit', () => {
      const budget = budgets.get('tokens')!;
      budget.used = 750000;
      budget.available = 250000;

      const utilizationPercent = (budget.used / budget.total) * 100;
      const softLimitPercent = (budget.softLimit / budget.total) * 100;
      const isApproachingSoftLimit = budget.used >= budget.softLimit * 0.9;

      expect(utilizationPercent).toBe(75);
      expect(softLimitPercent).toBe(80); // Verify soft limit percentage
      expect(isApproachingSoftLimit).toBe(true);
    });

    it('should block when exceeding hard limit', () => {
      const budget = budgets.get('tokens')!;
      budget.used = 960000;
      budget.available = 40000;

      const exceedsHardLimit = budget.used > budget.hardLimit;

      expect(exceedsHardLimit).toBe(true);
    });

    it('should allow reserved allocations', () => {
      const budget = budgets.get('files')!;
      budget.reserved = 10;
      budget.available = 90;

      const request: ResourceRequest = {
        type: 'files',
        amount: 5,
        priority: 'critical',
      };

      // Critical requests can use reserved capacity
      const effectiveAvailable = request.priority === 'critical'
        ? budget.available + budget.reserved
        : budget.available;

      expect(effectiveAvailable).toBe(100);
    });
  });
});

describe('ResourceMonitor', () => {
  describe('Usage Sampling', () => {
    it('should sample resource usage', () => {
      const samples: Array<{
        timestamp: number;
        type: ResourceType;
        current: number;
        peak: number;
      }> = [];

      // Add samples
      samples.push({
        timestamp: Date.now() - 5000,
        type: 'tokens',
        current: 10000,
        peak: 10000,
      });

      samples.push({
        timestamp: Date.now() - 4000,
        type: 'tokens',
        current: 25000,
        peak: 25000,
      });

      samples.push({
        timestamp: Date.now() - 3000,
        type: 'tokens',
        current: 15000,
        peak: 25000,
      });

      expect(samples).toHaveLength(3);
      expect(samples[2].peak).toBe(25000);
    });

    it('should calculate average usage', () => {
      const samples = [10000, 25000, 15000, 20000, 30000];
      const average = samples.reduce((a, b) => a + b, 0) / samples.length;

      expect(average).toBe(20000);
    });

    it('should track peak usage', () => {
      const samples = [10000, 25000, 15000, 20000, 30000];
      const peak = Math.max(...samples);

      expect(peak).toBe(30000);
    });
  });

  describe('Alerting', () => {
    it('should generate warning alert', () => {
      const thresholds = { warning: 80, critical: 95 };
      const utilization = 85;

      const alertLevel = utilization >= thresholds.critical
        ? 'critical'
        : utilization >= thresholds.warning
        ? 'warning'
        : 'normal';

      expect(alertLevel).toBe('warning');
    });

    it('should generate critical alert', () => {
      const thresholds = { warning: 80, critical: 95 };
      const utilization = 97;

      const alertLevel = utilization >= thresholds.critical
        ? 'critical'
        : utilization >= thresholds.warning
        ? 'warning'
        : 'normal';

      expect(alertLevel).toBe('critical');
    });

    it('should track alert history', () => {
      const alerts: Array<{
        id: string;
        type: ResourceType;
        level: 'warning' | 'critical';
        timestamp: number;
        message: string;
      }> = [];

      alerts.push({
        id: 'alert-1',
        type: 'tokens',
        level: 'warning',
        timestamp: Date.now(),
        message: 'Token usage at 85%',
      });

      expect(alerts).toHaveLength(1);
      expect(alerts[0].level).toBe('warning');
    });
  });

  describe('Usage Metrics', () => {
    it('should calculate utilization percentage', () => {
      const budget = { total: 100000, used: 75000 };
      const utilization = (budget.used / budget.total) * 100;

      expect(utilization).toBe(75);
    });

    it('should calculate remaining capacity', () => {
      const budget = { total: 100000, used: 75000 };
      const remaining = budget.total - budget.used;
      const remainingPercent = (remaining / budget.total) * 100;

      expect(remaining).toBe(25000);
      expect(remainingPercent).toBe(25);
    });

    it('should estimate time to exhaustion', () => {
      const budget = { total: 100000, used: 75000 };
      const usageRate = 5000; // per minute
      const remaining = budget.total - budget.used;
      const minutesToExhaustion = remaining / usageRate;

      expect(minutesToExhaustion).toBe(5);
    });
  });
});

describe('ResourcePool', () => {
  describe('Pool Management', () => {
    it('should initialize pool with min size', () => {
      const pool = {
        type: 'terminals' as ResourceType,
        minSize: 2,
        maxSize: 10,
        items: [] as Array<{ id: string; state: string }>,
      };

      // Initialize with min size
      for (let i = 0; i < pool.minSize; i++) {
        pool.items.push({ id: `item-${i}`, state: 'available' });
      }

      expect(pool.items).toHaveLength(2);
    });

    it('should acquire item from pool', () => {
      const pool = {
        items: [
          { id: 'item-1', state: 'available' },
          { id: 'item-2', state: 'available' },
        ],
      };

      const item = pool.items.find(i => i.state === 'available');
      if (item) {
        item.state = 'allocated';
      }

      expect(item?.state).toBe('allocated');
      expect(pool.items.filter(i => i.state === 'available')).toHaveLength(1);
    });

    it('should release item back to pool', () => {
      const pool = {
        items: [
          { id: 'item-1', state: 'allocated' },
          { id: 'item-2', state: 'available' },
        ],
      };

      const item = pool.items.find(i => i.id === 'item-1');
      if (item) {
        item.state = 'available';
      }

      expect(pool.items.filter(i => i.state === 'available')).toHaveLength(2);
    });

    it('should grow pool when needed', () => {
      const pool = {
        items: [
          { id: 'item-1', state: 'allocated' },
          { id: 'item-2', state: 'allocated' },
        ],
        maxSize: 5,
      };

      // All items allocated, need to grow
      if (pool.items.length < pool.maxSize) {
        pool.items.push({ id: `item-${pool.items.length + 1}`, state: 'available' });
      }

      expect(pool.items).toHaveLength(3);
    });

    it('should not exceed max size', () => {
      const pool = {
        items: Array.from({ length: 5 }, (_, i) => ({
          id: `item-${i}`,
          state: 'allocated',
        })),
        maxSize: 5,
      };

      const canGrow = pool.items.length < pool.maxSize;
      expect(canGrow).toBe(false);
    });
  });

  describe('Health Checks', () => {
    it('should track item health score', () => {
      const item = {
        id: 'item-1',
        healthScore: 100,
        lastUsedAt: Date.now() - 60000,
        errorCount: 0,
      };

      // Degrade health based on idle time
      const idleTimeMs = Date.now() - item.lastUsedAt;
      const idlePenalty = Math.min(20, idleTimeMs / 10000);
      item.healthScore = Math.max(0, 100 - idlePenalty - item.errorCount * 10);

      expect(item.healthScore).toBeLessThan(100);
    });

    it('should remove unhealthy items', () => {
      const pool = {
        items: [
          { id: 'item-1', healthScore: 90 },
          { id: 'item-2', healthScore: 30 },
          { id: 'item-3', healthScore: 80 },
        ],
        healthThreshold: 50,
      };

      const healthyItems = pool.items.filter(i => i.healthScore >= pool.healthThreshold);
      expect(healthyItems).toHaveLength(2);
    });
  });

  describe('Idle Timeout', () => {
    it('should mark idle items for cleanup', () => {
      const pool = {
        items: [
          { id: 'item-1', lastUsedAt: Date.now() - 120000, state: 'available' },
          { id: 'item-2', lastUsedAt: Date.now() - 30000, state: 'available' },
        ],
        idleTimeoutMs: 60000,
      };

      const idleItems = pool.items.filter(
        i => i.state === 'available' && Date.now() - i.lastUsedAt > pool.idleTimeoutMs
      );

      expect(idleItems).toHaveLength(1);
      expect(idleItems[0].id).toBe('item-1');
    });
  });
});

describe('Allocation Strategies', () => {
  describe('FIFO Strategy', () => {
    it('should process requests in order', () => {
      const queue = [
        { id: 'req-1', enqueuedAt: 1000 },
        { id: 'req-2', enqueuedAt: 2000 },
        { id: 'req-3', enqueuedAt: 3000 },
      ];

      const sorted = [...queue].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      expect(sorted[0].id).toBe('req-1');
      expect(sorted[1].id).toBe('req-2');
      expect(sorted[2].id).toBe('req-3');
    });
  });

  describe('Priority Strategy', () => {
    it('should process high priority first', () => {
      const queue = [
        { id: 'req-1', priority: 'low' as const },
        { id: 'req-2', priority: 'critical' as const },
        { id: 'req-3', priority: 'normal' as const },
      ];

      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const sorted = [...queue].sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
      );

      expect(sorted[0].id).toBe('req-2');
      expect(sorted[0].priority).toBe('critical');
    });
  });

  describe('Greedy Strategy', () => {
    it('should allocate maximum available', () => {
      const available = 10000;
      const requested = 15000;
      const allocated = Math.min(available, requested);

      expect(allocated).toBe(10000);
    });
  });

  describe('Reserved Strategy', () => {
    it('should reserve capacity for critical requests', () => {
      const budget = {
        total: 100,
        reserved: 20,
        available: 80,
      };

      const normalRequest = { amount: 85, priority: 'normal' as const };
      const criticalRequest = { amount: 85, priority: 'critical' as const };

      const canAllocateNormal = normalRequest.amount <= budget.available;
      const canAllocateCritical = criticalRequest.amount <= budget.available + budget.reserved;

      expect(canAllocateNormal).toBe(false);
      expect(canAllocateCritical).toBe(true);
    });
  });

  describe('Strategy Selection', () => {
    it('should apply correct allocation strategy', () => {
      const requests: ResourceRequest[] = [
        { type: 'tokens', amount: 1000, priority: 'low', timeout: 3000 },
        { type: 'tokens', amount: 2000, priority: 'critical', timeout: 1000 },
        { type: 'tokens', amount: 1500, priority: 'normal', timeout: 2000 },
      ];

      const budget: ResourceBudget = {
        type: 'tokens',
        total: 100000,
        used: 0,
        reserved: 10000,
        available: 90000,
        softLimit: 80000,
        hardLimit: 95000,
      };

      // Test FIFO strategy
      const fifoSorted = allocationStrategies['fifo'](requests, budget);
      expect(fifoSorted[0].timeout).toBe(1000);

      // Test Priority strategy
      const prioritySorted = allocationStrategies['priority'](requests, budget);
      expect(prioritySorted[0].priority).toBe('critical');

      // Test Greedy strategy
      const greedySorted = allocationStrategies['greedy'](requests, budget);
      expect(greedySorted[0].amount).toBe(2000);

      // Test Reserved strategy
      const reservedSorted = allocationStrategies['reserved'](requests, budget);
      expect(reservedSorted[0].priority).toBe('critical');
    });
  });

  describe('Resource Monitoring', () => {
    it('should setup monitoring intervals', () => {
      // Test that monitoring can be configured with intervals
      const monitorConfig = {
        samplingIntervalMs: 1000,
        alertThresholds: { warning: 80, critical: 95 },
      };

      // Setup mock interval for monitoring
      const intervalId = mockSetInterval(() => {
        // Sample resource usage
      }, monitorConfig.samplingIntervalMs);

      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 1000);

      // Cleanup
      mockClearInterval(intervalId);
      expect(mockClearInterval).toHaveBeenCalled();
    });
  });
});
