/**
 * Cache Partitioner
 *
 * Partitions cache by agent, session, or custom criteria.
 * Manages cache isolation and resource allocation per partition.
 */
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../logger';

const logger = createLogger('CachePartitioner');

// =============================================================================
// Types
// =============================================================================

/**
 * Partition type
 */
export type PartitionType = 'agent' | 'session' | 'task' | 'custom';

/**
 * Partition definition
 */
export interface CachePartition {
  id: string;
  type: PartitionType;
  ownerId: string;
  name: string;
  maxSize: number;
  currentSize: number;
  entryCount: number;
  createdAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Partition allocation
 */
export interface PartitionAllocation {
  partitionId: string;
  allocatedSize: number;
  usedSize: number;
  utilizationPercent: number;
}

/**
 * Partition statistics
 */
export interface PartitionStats {
  totalPartitions: number;
  totalAllocatedSize: number;
  totalUsedSize: number;
  byType: Record<PartitionType, number>;
  topPartitions: Array<{ id: string; name: string; size: number }>;
}

/**
 * Partitioner configuration
 */
export interface CachePartitionerConfig {
  /** Default partition size in bytes */
  defaultPartitionSize: number;
  /** Maximum partitions per session */
  maxPartitionsPerSession: number;
  /** Enable automatic partition creation */
  autoCreatePartitions: boolean;
  /** Enable partition size enforcement */
  enforcePartitionLimits: boolean;
  /** Partition cleanup threshold (utilization %) */
  cleanupThreshold: number;
  /** Enable partition inheritance */
  enableInheritance: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_PARTITIONER_CONFIG: CachePartitionerConfig = {
  defaultPartitionSize: 10 * 1024 * 1024, // 10MB
  maxPartitionsPerSession: 20,
  autoCreatePartitions: true,
  enforcePartitionLimits: true,
  cleanupThreshold: 90,
  enableInheritance: true,
};

// =============================================================================
// CachePartitioner
// =============================================================================

export class CachePartitioner extends EventEmitter {
  private config: CachePartitionerConfig;
  private partitions = new Map<string, CachePartition>();
  private ownerPartitions = new Map<string, Set<string>>();
  private sessionPartitions = new Map<string, Set<string>>();
  private inheritanceMap = new Map<string, string>(); // child -> parent

  constructor(config?: Partial<CachePartitionerConfig>) {
    super();
    this.config = { ...DEFAULT_PARTITIONER_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CachePartitionerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Create a new partition
   */
  createPartition(
    type: PartitionType,
    ownerId: string,
    name: string,
    options: {
      maxSize?: number;
      sessionId?: string;
      parentPartitionId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): CachePartition | null {
    // Check session limit
    if (options.sessionId) {
      const sessionParts = this.sessionPartitions.get(options.sessionId);
      if (sessionParts && sessionParts.size >= this.config.maxPartitionsPerSession) {
        logger.warn('Session partition limit reached', {
          sessionId: options.sessionId,
          limit: this.config.maxPartitionsPerSession,
        });
        return null;
      }
    }

    const partition: CachePartition = {
      id: randomUUID(),
      type,
      ownerId,
      name,
      maxSize: options.maxSize || this.config.defaultPartitionSize,
      currentSize: 0,
      entryCount: 0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      metadata: options.metadata,
    };

    this.partitions.set(partition.id, partition);

    // Track by owner
    const ownerSet = this.ownerPartitions.get(ownerId) || new Set();
    ownerSet.add(partition.id);
    this.ownerPartitions.set(ownerId, ownerSet);

    // Track by session
    if (options.sessionId) {
      const sessionSet = this.sessionPartitions.get(options.sessionId) || new Set();
      sessionSet.add(partition.id);
      this.sessionPartitions.set(options.sessionId, sessionSet);
    }

    // Set up inheritance
    if (options.parentPartitionId && this.config.enableInheritance) {
      this.inheritanceMap.set(partition.id, options.parentPartitionId);
    }

    this.emit('partitionCreated', partition);

    logger.debug('Partition created', {
      id: partition.id,
      type,
      ownerId,
      maxSize: partition.maxSize,
    });

    return partition;
  }

  /**
   * Get or create partition for an agent
   */
  getOrCreateAgentPartition(
    agentId: string,
    sessionId?: string,
    parentAgentId?: string
  ): CachePartition {
    // Check if partition exists
    const existing = this.getPartitionByOwner(agentId, 'agent');
    if (existing) {
      return existing;
    }

    // Auto-create if enabled
    if (this.config.autoCreatePartitions) {
      let parentPartitionId: string | undefined;
      
      if (parentAgentId && this.config.enableInheritance) {
        const parentPartition = this.getPartitionByOwner(parentAgentId, 'agent');
        parentPartitionId = parentPartition?.id;
      }

      const partition = this.createPartition('agent', agentId, `Agent ${agentId}`, {
        sessionId,
        parentPartitionId,
      });

      if (partition) {
        return partition;
      }
    }

    // Return a virtual partition if creation failed
    return {
      id: `virtual:${agentId}`,
      type: 'agent',
      ownerId: agentId,
      name: `Virtual Agent ${agentId}`,
      maxSize: this.config.defaultPartitionSize,
      currentSize: 0,
      entryCount: 0,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
  }

  /**
   * Get partition by ID
   */
  getPartition(partitionId: string): CachePartition | undefined {
    return this.partitions.get(partitionId);
  }

  /**
   * Get partition by owner
   */
  getPartitionByOwner(ownerId: string, type?: PartitionType): CachePartition | undefined {
    const ownerSet = this.ownerPartitions.get(ownerId);
    if (!ownerSet) return undefined;

    for (const partitionId of ownerSet) {
      const partition = this.partitions.get(partitionId);
      if (partition && (!type || partition.type === type)) {
        return partition;
      }
    }

    return undefined;
  }

  /**
   * Get all partitions for a session
   */
  getSessionPartitions(sessionId: string): CachePartition[] {
    const sessionSet = this.sessionPartitions.get(sessionId);
    if (!sessionSet) return [];

    const partitions: CachePartition[] = [];
    for (const partitionId of sessionSet) {
      const partition = this.partitions.get(partitionId);
      if (partition) {
        partitions.push(partition);
      }
    }

    return partitions;
  }

  /**
   * Check if partition can accommodate size
   */
  canAllocate(partitionId: string, size: number): boolean {
    const partition = this.partitions.get(partitionId);
    if (!partition) return false;

    if (!this.config.enforcePartitionLimits) return true;

    return partition.currentSize + size <= partition.maxSize;
  }

  /**
   * Allocate space in partition
   */
  allocate(partitionId: string, size: number): boolean {
    const partition = this.partitions.get(partitionId);
    if (!partition) return false;

    if (this.config.enforcePartitionLimits && partition.currentSize + size > partition.maxSize) {
      // Try to get space from parent if inheritance enabled
      if (this.config.enableInheritance) {
        const parentId = this.inheritanceMap.get(partitionId);
        if (parentId) {
          const borrowed = this.borrowFromParent(partitionId, size);
          if (borrowed) {
            partition.currentSize += size;
            partition.entryCount++;
            partition.lastAccessedAt = Date.now();
            return true;
          }
        }
      }
      return false;
    }

    partition.currentSize += size;
    partition.entryCount++;
    partition.lastAccessedAt = Date.now();

    // Check cleanup threshold
    const utilization = (partition.currentSize / partition.maxSize) * 100;
    if (utilization >= this.config.cleanupThreshold) {
      this.emit('partitionNearFull', partition);
    }

    return true;
  }

  /**
   * Deallocate space from partition
   */
  deallocate(partitionId: string, size: number): void {
    const partition = this.partitions.get(partitionId);
    if (!partition) return;

    partition.currentSize = Math.max(0, partition.currentSize - size);
    partition.entryCount = Math.max(0, partition.entryCount - 1);
    partition.lastAccessedAt = Date.now();
  }

  /**
   * Resize a partition
   */
  resizePartition(partitionId: string, newMaxSize: number): boolean {
    const partition = this.partitions.get(partitionId);
    if (!partition) return false;

    if (newMaxSize < partition.currentSize) {
      logger.warn('Cannot resize partition below current usage', {
        partitionId,
        currentSize: partition.currentSize,
        requestedSize: newMaxSize,
      });
      return false;
    }

    partition.maxSize = newMaxSize;

    this.emit('partitionResized', partition);

    return true;
  }

  /**
   * Delete a partition
   */
  deletePartition(partitionId: string): boolean {
    const partition = this.partitions.get(partitionId);
    if (!partition) return false;

    // Remove from tracking
    const ownerSet = this.ownerPartitions.get(partition.ownerId);
    if (ownerSet) {
      ownerSet.delete(partitionId);
      if (ownerSet.size === 0) {
        this.ownerPartitions.delete(partition.ownerId);
      }
    }

    // Remove from session tracking
    for (const [sessionId, sessionSet] of this.sessionPartitions) {
      if (sessionSet.has(partitionId)) {
        sessionSet.delete(partitionId);
        if (sessionSet.size === 0) {
          this.sessionPartitions.delete(sessionId);
        }
      }
    }

    // Remove inheritance
    this.inheritanceMap.delete(partitionId);
    for (const [childId, parentId] of this.inheritanceMap) {
      if (parentId === partitionId) {
        this.inheritanceMap.delete(childId);
      }
    }

    this.partitions.delete(partitionId);

    this.emit('partitionDeleted', partition);

    logger.debug('Partition deleted', { partitionId });

    return true;
  }

  /**
   * Clear all partitions for an owner
   */
  clearOwnerPartitions(ownerId: string): number {
    const ownerSet = this.ownerPartitions.get(ownerId);
    if (!ownerSet) return 0;

    let count = 0;
    for (const partitionId of ownerSet) {
      if (this.deletePartition(partitionId)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all partitions for a session
   */
  clearSessionPartitions(sessionId: string): number {
    const sessionSet = this.sessionPartitions.get(sessionId);
    if (!sessionSet) return 0;

    let count = 0;
    for (const partitionId of Array.from(sessionSet)) {
      if (this.deletePartition(partitionId)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get partition allocation info
   */
  getAllocation(partitionId: string): PartitionAllocation | undefined {
    const partition = this.partitions.get(partitionId);
    if (!partition) return undefined;

    return {
      partitionId,
      allocatedSize: partition.maxSize,
      usedSize: partition.currentSize,
      utilizationPercent: (partition.currentSize / partition.maxSize) * 100,
    };
  }

  /**
   * Get all allocations
   */
  getAllAllocations(): PartitionAllocation[] {
    const allocations: PartitionAllocation[] = [];

    for (const partition of this.partitions.values()) {
      allocations.push({
        partitionId: partition.id,
        allocatedSize: partition.maxSize,
        usedSize: partition.currentSize,
        utilizationPercent: (partition.currentSize / partition.maxSize) * 100,
      });
    }

    return allocations;
  }

  /**
   * Get statistics
   */
  getStats(): PartitionStats {
    const byType: Record<PartitionType, number> = {
      agent: 0,
      session: 0,
      task: 0,
      custom: 0,
    };

    let totalAllocated = 0;
    let totalUsed = 0;
    const partitionSizes: Array<{ id: string; name: string; size: number }> = [];

    for (const partition of this.partitions.values()) {
      byType[partition.type]++;
      totalAllocated += partition.maxSize;
      totalUsed += partition.currentSize;
      partitionSizes.push({
        id: partition.id,
        name: partition.name,
        size: partition.currentSize,
      });
    }

    // Sort by size descending
    partitionSizes.sort((a, b) => b.size - a.size);

    return {
      totalPartitions: this.partitions.size,
      totalAllocatedSize: totalAllocated,
      totalUsedSize: totalUsed,
      byType,
      topPartitions: partitionSizes.slice(0, 10),
    };
  }

  /**
   * Clear all partitions
   */
  clear(): void {
    this.partitions.clear();
    this.ownerPartitions.clear();
    this.sessionPartitions.clear();
    this.inheritanceMap.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private borrowFromParent(childId: string, size: number): boolean {
    const parentId = this.inheritanceMap.get(childId);
    if (!parentId) return false;

    const parent = this.partitions.get(parentId);
    const child = this.partitions.get(childId);

    if (!parent || !child) return false;

    // Check if parent has space
    const parentAvailable = parent.maxSize - parent.currentSize;
    if (parentAvailable < size) {
      // Try to borrow from grandparent
      return this.borrowFromParent(parentId, size);
    }

    // Transfer allocation from parent to child
    child.maxSize += size;
    parent.maxSize -= size;

    logger.debug('Borrowed space from parent partition', {
      childId,
      parentId,
      size,
    });

    return true;
  }
}

// Singleton instance
let partitionerInstance: CachePartitioner | null = null;

/**
 * Get or create the cache partitioner singleton
 */
export function getCachePartitioner(): CachePartitioner {
  if (!partitionerInstance) {
    partitionerInstance = new CachePartitioner();
  }
  return partitionerInstance;
}
