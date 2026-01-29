/**
 * ResourcePool
 *
 * Manages pools of reusable resources with configurable sizing,
 * health checking, and lifecycle management.
 */

import { randomUUID } from 'node:crypto';
import type { ResourceType, ResourcePoolStatus } from '../../../shared/types';
import type { PoolItem, PoolConfig } from './types';
import { DEFAULT_POOL_CONFIGS } from './types';

// =============================================================================
// ResourcePool
// =============================================================================

export class ResourcePool<T = unknown> {
  private readonly config: PoolConfig;
  private readonly items: Map<string, PoolItem<T>> = new Map();
  private readonly createResource?: () => T;
  private readonly destroyResource?: (resource: T) => void;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    config: Partial<PoolConfig> & { type: ResourceType },
    createResource?: () => T,
    destroyResource?: (resource: T) => void
  ) {
    const defaultConfig = (DEFAULT_POOL_CONFIGS as Record<ResourceType, PoolConfig>)[config.type];
    this.config = { ...defaultConfig, ...config };
    this.createResource = createResource;
    this.destroyResource = destroyResource;
  }

  /**
   * Initialize the pool with warm-up resources
   */
  async initialize(): Promise<void> {
    // Create warm-up resources
    if (this.createResource && this.config.warmUpCount > 0) {
      for (let i = 0; i < this.config.warmUpCount; i++) {
        const id = randomUUID();
        const resource = this.createResource();
        this.items.set(id, {
          id,
          resource,
          state: 'available',
          healthScore: 100,
          lastUsedAt: Date.now(),
        });
      }
    }

    // Start health checking
    if (this.config.healthCheckIntervalMs > 0) {
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck();
      }, this.config.healthCheckIntervalMs);
    }
  }

  /**
   * Shutdown the pool and release all resources
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Destroy all resources
    if (this.destroyResource) {
      for (const item of this.items.values()) {
        try {
          this.destroyResource(item.resource);
        } catch {
          // Ignore destruction errors during shutdown
        }
      }
    }

    this.items.clear();
  }

  /**
   * Acquire a resource from the pool
   */
  acquire(requesterId?: string): { id: string; resource: T } | null {
    // Find available resource
    for (const item of this.items.values()) {
      if (item.state === 'available' && item.healthScore > 0) {
        item.state = 'allocated';
        item.allocatedTo = requesterId;
        item.allocatedAt = Date.now();
        return { id: item.id, resource: item.resource };
      }
    }

    // Try to create new resource if under max
    if (this.items.size < this.config.maxSize && this.createResource) {
      const id = randomUUID();
      const resource = this.createResource();
      const item: PoolItem<T> = {
        id,
        resource,
        state: 'allocated',
        allocatedTo: requesterId,
        allocatedAt: Date.now(),
        healthScore: 100,
      };
      this.items.set(id, item);
      return { id, resource };
    }

    // Check overflow
    if (this.config.allowOverflow && this.createResource) {
      const overflowCount = this.items.size - this.config.maxSize;
      if (overflowCount < this.config.overflowLimit) {
        const id = randomUUID();
        const resource = this.createResource();
        const item: PoolItem<T> = {
          id,
          resource,
          state: 'allocated',
          allocatedTo: requesterId,
          allocatedAt: Date.now(),
          healthScore: 100,
        };
        this.items.set(id, item);
        return { id, resource };
      }
    }

    return null;
  }

  /**
   * Release a resource back to the pool
   */
  release(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;

    item.state = 'available';
    item.allocatedTo = undefined;
    item.allocatedAt = undefined;
    item.lastUsedAt = Date.now();

    // Check if we should destroy overflow resources
    if (this.items.size > this.config.maxSize && this.destroyResource) {
      this.destroyResource(item.resource);
      this.items.delete(id);
    }

    return true;
  }

  /**
   * Get current available count
   */
  getAvailable(): number {
    let count = 0;
    for (const item of this.items.values()) {
      if (item.state === 'available' && item.healthScore > 0) {
        count++;
      }
    }

    // Add potential new allocations
    const potentialNew = this.config.maxSize - this.items.size;
    return count + Math.max(0, potentialNew);
  }

  /**
   * Get pool status
   */
  getStatus(): ResourcePoolStatus {
    let available = 0;
    let allocated = 0;

    for (const item of this.items.values()) {
      if (item.state === 'available' && item.healthScore > 0) {
        available++;
      } else if (item.state === 'allocated') {
        allocated++;
      }
    }

    // Include potential capacity
    const potentialCapacity = Math.max(0, this.config.maxSize - this.items.size);
    available += potentialCapacity;

    let health: 'healthy' | 'degraded' | 'exhausted' = 'healthy';
    if (available === 0) {
      health = 'exhausted';
    } else if (available < this.config.maxSize * 0.2) {
      health = 'degraded';
    }

    return {
      type: this.config.type,
      capacity: this.config.maxSize,
      available,
      activeAllocations: allocated,
      queuedRequests: 0, // Pool doesn't track queue
      health,
      updatedAt: Date.now(),
    };
  }

  /**
   * Resize the pool
   */
  resize(newMax: number): void {
    this.config.maxSize = newMax;

    // Remove excess items if shrinking
    if (this.items.size > newMax) {
      const toRemove: string[] = [];
      for (const item of this.items.values()) {
        if (toRemove.length >= this.items.size - newMax) break;
        if (item.state === 'available') {
          toRemove.push(item.id);
        }
      }

      for (const id of toRemove) {
        const item = this.items.get(id);
        if (item && this.destroyResource) {
          this.destroyResource(item.resource);
        }
        this.items.delete(id);
      }
    }
  }

  /**
   * Get a specific item by ID
   */
  getItem(id: string): PoolItem<T> | undefined {
    return this.items.get(id);
  }

  /**
   * Update health score for an item
   */
  updateHealth(id: string, score: number): void {
    const item = this.items.get(id);
    if (item) {
      item.healthScore = Math.max(0, Math.min(100, score));

      // Remove unhealthy items
      if (item.healthScore === 0 && item.state === 'available') {
        if (this.destroyResource) {
          this.destroyResource(item.resource);
        }
        this.items.delete(id);
      }
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private performHealthCheck(): void {
    const now = Date.now();

    for (const item of this.items.values()) {
      // Check idle timeout
      if (
        item.state === 'available' &&
        item.lastUsedAt &&
        this.config.idleTimeoutMs > 0 &&
        now - item.lastUsedAt > this.config.idleTimeoutMs
      ) {
        // Keep minimum pool size
        if (this.items.size > this.config.minSize) {
          if (this.destroyResource) {
            this.destroyResource(item.resource);
          }
          this.items.delete(item.id);
        }
      }

      // Degrade health for long-running allocations
      if (item.state === 'allocated' && item.allocatedAt) {
        const allocationTime = now - item.allocatedAt;
        if (allocationTime > 300000) {
          // 5 minutes
          item.healthScore = Math.max(0, item.healthScore - 1);
        }
      }
    }
  }
}
