/**
 * BatchProcessor
 *
 * Batches operations for efficient processing.
 * Useful for batching tool calls, API requests, or file operations.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  BatchItem,
  BatchConfig,
  BatchStats,
  BatchProcessor as BatchProcessorFn,
  PerformanceDeps,
} from './types';
import { DEFAULT_BATCH_CONFIG } from './types';
import { createLogger } from '../../logger';

const logger = createLogger('BatchProcessor');

// =============================================================================
// BatchProcessor
// =============================================================================

export class BatchProcessor<T = unknown, R = unknown> extends EventEmitter {
  private readonly config: BatchConfig;
  private readonly deps: PerformanceDeps;
  private readonly processor: BatchProcessorFn<T, R>;

  // Pending items
  private pendingItems: BatchItem<T, R>[] = [];

  // Processing state
  private isProcessing = false;
  private batchTimeout?: ReturnType<typeof setTimeout>;

  // Statistics
  private totalBatches = 0;
  private totalItems = 0;
  private totalWaitTime = 0;
  private totalProcessTime = 0;
  private failures = 0;

  constructor(
    processor: BatchProcessorFn<T, R>,
    config: Partial<BatchConfig> = {},
    deps?: Partial<PerformanceDeps>
  ) {
    super();

    this.processor = processor;
    this.config = { ...DEFAULT_BATCH_CONFIG, ...config };

    this.deps = {
      logger: deps?.logger ?? logger,
      emitEvent: deps?.emitEvent ?? (() => {}),
    };
  }

  // ===========================================================================
  // Main API
  // ===========================================================================

  /**
   * Add item to batch and wait for result
   */
  async add(data: T, priority: number = 0): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const item: BatchItem<T, R> = {
        id: randomUUID(),
        data,
        resolve,
        reject,
        addedAt: Date.now(),
        priority,
      };

      // Add in priority order (higher priority first)
      const insertIndex = this.pendingItems.findIndex(p => p.priority < priority);
      if (insertIndex === -1) {
        this.pendingItems.push(item);
      } else {
        this.pendingItems.splice(insertIndex, 0, item);
      }

      this.emit('item-added', { id: item.id, pendingCount: this.pendingItems.length });

      // Check if we should process immediately
      if (this.pendingItems.length >= this.config.maxBatchSize) {
        this.processBatch();
      } else if (!this.batchTimeout) {
        // Start timer for batch window
        this.batchTimeout = setTimeout(() => {
          this.processBatch();
        }, this.config.maxWaitMs);
      }
    });
  }

  /**
   * Add multiple items at once
   */
  async addMany(items: T[], priority: number = 0): Promise<R[]> {
    return Promise.all(items.map(item => this.add(item, priority)));
  }

  /**
   * Force process any pending items
   */
  async flush(): Promise<void> {
    if (this.pendingItems.length > 0) {
      await this.processBatch();
    }
  }

  // ===========================================================================
  // Batch Processing
  // ===========================================================================

  /**
   * Process a batch of items
   */
  private async processBatch(): Promise<void> {
    // Clear timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }

    // Check minimum batch size (unless timeout triggered)
    if (this.pendingItems.length < this.config.minBatchSize && this.pendingItems.length > 0) {
      // Wait for more items
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, this.config.maxWaitMs);
      return;
    }

    if (this.pendingItems.length === 0 || this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    // Take items for this batch
    const batchItems = this.pendingItems.splice(0, this.config.maxBatchSize);

    if (batchItems.length === 0) {
      this.isProcessing = false;
      return;
    }

    const batchId = randomUUID();
    const processStartTime = Date.now();

    // Calculate wait time
    const avgWaitTime = batchItems.reduce(
      (sum, item) => sum + (processStartTime - item.addedAt),
      0
    ) / batchItems.length;

    this.deps.logger.debug('BatchProcessor: processing batch', {
      batchId,
      itemCount: batchItems.length,
      avgWaitTime,
    });

    this.emit('batch-start', {
      batchId,
      itemCount: batchItems.length,
    });

    try {
      // Execute processor with timeout
      const results = await Promise.race([
        this.processor(batchItems.map(item => item.data)),
        this.createTimeout(this.config.processTimeoutMs),
      ]) as R[];

      const processDuration = Date.now() - processStartTime;

      // Resolve each item
      for (let i = 0; i < batchItems.length; i++) {
        const item = batchItems[i]!;
        const result = results[i];

        if (result !== undefined) {
          item.resolve(result);
        } else {
          item.reject(new Error('No result returned for batch item'));
          this.failures++;
        }
      }

      // Update statistics
      this.totalBatches++;
      this.totalItems += batchItems.length;
      this.totalWaitTime += avgWaitTime * batchItems.length;
      this.totalProcessTime += processDuration;

      this.emit('batch-complete', {
        batchId,
        itemCount: batchItems.length,
        durationMs: processDuration,
      });

      this.deps.logger.debug('BatchProcessor: batch complete', {
        batchId,
        itemCount: batchItems.length,
        durationMs: processDuration,
      });
    } catch (error) {
      // Reject all items in batch
      const errorMessage = error instanceof Error ? error.message : String(error);

      for (const item of batchItems) {
        item.reject(new Error(`Batch processing failed: ${errorMessage}`));
      }

      this.failures += batchItems.length;

      this.emit('batch-error', {
        batchId,
        error: errorMessage,
        itemCount: batchItems.length,
      });

      this.deps.logger.error('BatchProcessor: batch failed', {
        batchId,
        error: errorMessage,
      });
    } finally {
      this.isProcessing = false;

      // Process next batch if items are waiting
      if (this.pendingItems.length > 0) {
        if (this.pendingItems.length >= this.config.maxBatchSize) {
          // Process immediately if batch is full
          setImmediate(() => this.processBatch());
        } else {
          // Otherwise start timer
          this.batchTimeout = setTimeout(() => {
            this.processBatch();
          }, this.config.maxWaitMs);
        }
      }
    }
  }

  /**
   * Create timeout promise
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Batch processing timeout')), ms);
    });
  }

  // ===========================================================================
  // Adaptive Batching
  // ===========================================================================

  /**
   * Update batch size based on performance
   */
  adjustBatchSize(newSize: number): void {
    if (newSize >= 1 && newSize !== this.config.maxBatchSize) {
      this.config.maxBatchSize = Math.max(1, Math.min(newSize, 100));
      this.deps.logger.debug('BatchProcessor: adjusted batch size', {
        newSize: this.config.maxBatchSize,
      });
    }
  }

  /**
   * Get recommended batch size based on statistics
   */
  getRecommendedBatchSize(): number {
    if (this.totalBatches === 0) {
      return this.config.maxBatchSize;
    }

    const avgProcessTime = this.totalProcessTime / this.totalBatches;
    const avgBatchSize = this.totalItems / this.totalBatches;

    // If processing is fast, increase batch size
    if (avgProcessTime < 100 && avgBatchSize >= this.config.maxBatchSize) {
      return Math.min(this.config.maxBatchSize * 2, 100);
    }

    // If processing is slow, decrease batch size
    if (avgProcessTime > 1000) {
      return Math.max(Math.floor(this.config.maxBatchSize / 2), 1);
    }

    return this.config.maxBatchSize;
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get batch statistics
   */
  getStats(): BatchStats {
    return {
      totalBatches: this.totalBatches,
      totalItems: this.totalItems,
      averageBatchSize: this.totalBatches > 0 ? this.totalItems / this.totalBatches : 0,
      averageWaitMs: this.totalItems > 0 ? this.totalWaitTime / this.totalItems : 0,
      averageProcessMs: this.totalBatches > 0 ? this.totalProcessTime / this.totalBatches : 0,
      pendingItems: this.pendingItems.length,
      failures: this.failures,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalBatches = 0;
    this.totalItems = 0;
    this.totalWaitTime = 0;
    this.totalProcessTime = 0;
    this.failures = 0;
  }

  /**
   * Get pending item count
   */
  getPendingCount(): number {
    return this.pendingItems.length;
  }

  /**
   * Check if currently processing
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Clear pending items
   */
  clear(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }

    // Reject all pending items
    for (const item of this.pendingItems) {
      item.reject(new Error('Batch processor cleared'));
    }

    this.pendingItems = [];
  }

  /**
   * Stop and clear
   */
  stop(): void {
    this.clear();
    this.removeAllListeners();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a batch processor for API calls
 */
export function createAPIBatchProcessor<T, R>(
  apiFn: (items: T[]) => Promise<R[]>,
  config?: Partial<BatchConfig>
): BatchProcessor<T, R> {
  return new BatchProcessor(apiFn, {
    maxBatchSize: 10,
    maxWaitMs: 50,
    ...config,
  });
}

/**
 * Create a batch processor for file operations
 */
export function createFileBatchProcessor<R>(
  fileFn: (paths: string[]) => Promise<R[]>,
  config?: Partial<BatchConfig>
): BatchProcessor<string, R> {
  return new BatchProcessor(fileFn, {
    maxBatchSize: 20,
    maxWaitMs: 100,
    ...config,
  });
}
