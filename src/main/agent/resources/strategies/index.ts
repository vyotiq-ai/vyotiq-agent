/**
 * Resource Allocation Strategies
 *
 * Implements different allocation strategies for various use cases.
 */

import type {
  ResourceType,
  ResourceRequest,
  AllocationStrategy,
  ResourceAllocation,
} from '../../../../shared/types';

// =============================================================================
// Strategy Interface
// =============================================================================

export interface AllocationStrategyHandler {
  /**
   * Strategy name
   */
  readonly name: AllocationStrategy;

  /**
   * Prioritize requests based on strategy
   */
  prioritize(requests: ResourceRequest[]): ResourceRequest[];

  /**
   * Determine allocation order
   */
  getAllocationOrder(requests: ResourceRequest[]): ResourceRequest[];

  /**
   * Should preempt existing allocation?
   */
  shouldPreempt(
    newRequest: ResourceRequest,
    existing: ResourceAllocation
  ): boolean;

  /**
   * Calculate allocation amount (may be less than requested)
   */
  calculateAmount(
    request: ResourceRequest,
    available: number,
    totalRequested: number
  ): number;
}

// =============================================================================
// FIFO Strategy
// =============================================================================

export class FifoStrategy implements AllocationStrategyHandler {
  readonly name: AllocationStrategy = 'fifo';

  prioritize(requests: ResourceRequest[]): ResourceRequest[] {
    // First in, first out - sort by request timestamp
    return [...requests].sort((a, b) => {
      const timeA = extractTimestamp(a.id);
      const timeB = extractTimestamp(b.id);
      return timeA - timeB;
    });
  }

  getAllocationOrder(requests: ResourceRequest[]): ResourceRequest[] {
    return this.prioritize(requests);
  }

  shouldPreempt(): boolean {
    // FIFO never preempts
    return false;
  }

  calculateAmount(request: ResourceRequest, available: number): number {
    // All or nothing
    return request.amount <= available ? request.amount : 0;
  }
}

// =============================================================================
// Priority Strategy
// =============================================================================

export class PriorityStrategy implements AllocationStrategyHandler {
  readonly name: AllocationStrategy = 'priority';

  private readonly priorityOrder: Record<string, number> = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  prioritize(requests: ResourceRequest[]): ResourceRequest[] {
    return [...requests].sort((a, b) => {
      const priorityDiff =
        (this.priorityOrder[b.priority] || 2) -
        (this.priorityOrder[a.priority] || 2);

      if (priorityDiff !== 0) return priorityDiff;

      // Same priority - use FIFO
      return extractTimestamp(a.id) - extractTimestamp(b.id);
    });
  }

  getAllocationOrder(requests: ResourceRequest[]): ResourceRequest[] {
    return this.prioritize(requests);
  }

  shouldPreempt(
    newRequest: ResourceRequest,
    _existing: ResourceAllocation
  ): boolean {
    // Critical requests can preempt low priority
    if (newRequest.priority === 'critical') {
      // Would need to know existing request's priority
      // For now, critical preempts if marked as preemptable
      return true;
    }
    return false;
  }

  calculateAmount(request: ResourceRequest, available: number): number {
    // All or nothing
    return request.amount <= available ? request.amount : 0;
  }
}

// =============================================================================
// Fair Share Strategy
// =============================================================================

export class FairShareStrategy implements AllocationStrategyHandler {
  readonly name: AllocationStrategy = 'fair-share';

  prioritize(requests: ResourceRequest[]): ResourceRequest[] {
    // No prioritization - all equal
    return [...requests];
  }

  getAllocationOrder(requests: ResourceRequest[]): ResourceRequest[] {
    // Order by smallest request first (helps maximize fulfilled requests)
    return [...requests].sort((a, b) => a.amount - b.amount);
  }

  shouldPreempt(): boolean {
    // Fair share doesn't preempt
    return false;
  }

  calculateAmount(
    request: ResourceRequest,
    available: number,
    totalRequested: number
  ): number {
    if (totalRequested <= available) {
      // Enough for everyone
      return request.amount;
    }

    // Calculate fair share
    const share = (request.amount / totalRequested) * available;
    return Math.floor(share);
  }
}

// =============================================================================
// Greedy Strategy
// =============================================================================

export class GreedyStrategy implements AllocationStrategyHandler {
  readonly name: AllocationStrategy = 'greedy';

  prioritize(requests: ResourceRequest[]): ResourceRequest[] {
    // Largest requests first (maximize utilization)
    return [...requests].sort((a, b) => b.amount - a.amount);
  }

  getAllocationOrder(requests: ResourceRequest[]): ResourceRequest[] {
    return this.prioritize(requests);
  }

  shouldPreempt(): boolean {
    return false;
  }

  calculateAmount(request: ResourceRequest, available: number): number {
    // All or nothing
    return request.amount <= available ? request.amount : 0;
  }
}

// =============================================================================
// Reserved Strategy (for guaranteed allocations)
// =============================================================================

export class ReservedStrategy implements AllocationStrategyHandler {
  readonly name: AllocationStrategy = 'reserved';

  private reservations = new Map<string, number>(); // agentId -> reserved amount

  prioritize(requests: ResourceRequest[]): ResourceRequest[] {
    // Requests with reservations first
    return [...requests].sort((a, b) => {
      const hasReservationA = this.reservations.has(a.agentId || '');
      const hasReservationB = this.reservations.has(b.agentId || '');

      if (hasReservationA && !hasReservationB) return -1;
      if (!hasReservationA && hasReservationB) return 1;
      return 0;
    });
  }

  getAllocationOrder(requests: ResourceRequest[]): ResourceRequest[] {
    return this.prioritize(requests);
  }

  shouldPreempt(): boolean {
    return false;
  }

  calculateAmount(request: ResourceRequest, available: number): number {
    const reserved = this.reservations.get(request.agentId || '') || 0;

    // If has reservation, honor it
    if (reserved > 0) {
      return Math.min(request.amount, reserved, available);
    }

    // Otherwise, standard allocation
    return request.amount <= available ? request.amount : 0;
  }

  /**
   * Set reservation for an agent
   */
  setReservation(agentId: string, amount: number): void {
    this.reservations.set(agentId, amount);
  }

  /**
   * Remove reservation
   */
  removeReservation(agentId: string): void {
    this.reservations.delete(agentId);
  }
}

// =============================================================================
// Strategy Factory
// =============================================================================

const strategies = new Map<AllocationStrategy, AllocationStrategyHandler>();
strategies.set('fifo', new FifoStrategy());
strategies.set('priority', new PriorityStrategy());
strategies.set('fair-share', new FairShareStrategy());
strategies.set('greedy', new GreedyStrategy());
strategies.set('reserved', new ReservedStrategy());

/**
 * Get strategy handler by name
 */
export function getStrategy(name: AllocationStrategy): AllocationStrategyHandler {
  const strategy = strategies.get(name);
  if (!strategy) {
    // Default to priority
    return strategies.get('priority')!;
  }
  return strategy;
}

/**
 * Get all available strategies
 */
export function getAllStrategies(): AllocationStrategy[] {
  return Array.from(strategies.keys());
}

/**
 * Select best strategy based on context
 */
export function selectStrategy(context: StrategyContext): AllocationStrategy {
  const { resourceType, requestCount, urgency, fairnessRequired } = context;

  // High urgency - use priority
  if (urgency === 'high') {
    return 'priority';
  }

  // Fairness required - use fair-share
  if (fairnessRequired) {
    return 'fair-share';
  }

  // Many requests - use priority for efficiency
  if (requestCount > 10) {
    return 'priority';
  }

  // Agents or limited resources - use priority
  if (resourceType === 'agents' || resourceType === 'terminals') {
    return 'priority';
  }

  // Default to FIFO
  return 'fifo';
}

// =============================================================================
// Helpers
// =============================================================================

function extractTimestamp(_id: string): number {
  // Assume ID contains timestamp or use current time
  // In practice, you'd store creation time with the request
  return Date.now();
}

// =============================================================================
// Types
// =============================================================================

export interface StrategyContext {
  resourceType: ResourceType;
  requestCount: number;
  urgency: 'low' | 'normal' | 'high';
  fairnessRequired: boolean;
}
