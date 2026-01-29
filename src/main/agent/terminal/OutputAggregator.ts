/**
 * Output Aggregator
 *
 * Aggregates and routes terminal output,
 * providing filtering, buffering, and notification capabilities.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export interface OutputEntry {
  id: string;
  agentId: string;
  sessionId: string;
  terminalId: string;
  content: string;
  streamType: 'stdout' | 'stderr';
  timestamp: number;
  commandId?: string;
}

export interface OutputBuffer {
  agentId: string;
  sessionId: string;
  entries: OutputEntry[];
  totalSize: number;
  lastUpdated: number;
}

export interface OutputFilter {
  id: string;
  name: string;
  pattern: RegExp;
  action: 'include' | 'exclude' | 'highlight';
  priority: number;
}

export interface OutputSubscription {
  id: string;
  agentId?: string;
  sessionId?: string;
  filters: string[];
  callback: (entry: OutputEntry) => void;
}

export interface OutputAggregatorConfig {
  maxBufferSize: number;
  maxEntriesPerBuffer: number;
  bufferTtlMs: number;
  enableCompression: boolean;
  defaultFilters: OutputFilter[];
}

export const DEFAULT_OUTPUT_AGGREGATOR_CONFIG: OutputAggregatorConfig = {
  maxBufferSize: 5 * 1024 * 1024, // 5MB total
  maxEntriesPerBuffer: 1000,
  bufferTtlMs: 3600000, // 1 hour
  enableCompression: false,
  defaultFilters: [
    {
      id: 'error-highlight',
      name: 'Error Highlight',
      pattern: /error|exception|failed|fatal/i,
      action: 'highlight',
      priority: 10,
    },
    {
      id: 'warning-highlight',
      name: 'Warning Highlight',
      pattern: /warning|warn|deprecated/i,
      action: 'highlight',
      priority: 5,
    },
  ],
};

// =============================================================================
// OutputAggregator
// =============================================================================

export class OutputAggregator extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: OutputAggregatorConfig;
  private readonly buffers = new Map<string, OutputBuffer>(); // sessionId -> buffer
  private readonly filters = new Map<string, OutputFilter>();
  private readonly subscriptions = new Map<string, OutputSubscription>();
  private totalBufferSize = 0;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(logger: Logger, config: Partial<OutputAggregatorConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_OUTPUT_AGGREGATOR_CONFIG, ...config };

    // Register default filters
    for (const filter of this.config.defaultFilters) {
      this.filters.set(filter.id, filter);
    }
  }

  /**
   * Initialize the aggregator
   */
  initialize(): void {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldBuffers();
    }, 60000); // Check every minute

    this.logger.info('OutputAggregator initialized');
  }

  /**
   * Shutdown the aggregator
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.buffers.clear();
    this.subscriptions.clear();
  }

  /**
   * Add output from a terminal
   */
  addOutput(
    agentId: string,
    sessionId: string,
    terminalId: string,
    content: string,
    streamType: 'stdout' | 'stderr' = 'stdout',
    commandId?: string
  ): OutputEntry {
    const entry: OutputEntry = {
      id: randomUUID(),
      agentId,
      sessionId,
      terminalId,
      content,
      streamType,
      timestamp: Date.now(),
      commandId,
    };

    // Get or create buffer
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = {
        agentId,
        sessionId,
        entries: [],
        totalSize: 0,
        lastUpdated: Date.now(),
      };
      this.buffers.set(sessionId, buffer);
    }

    // Check buffer limits
    const contentSize = content.length;
    if (buffer.entries.length >= this.config.maxEntriesPerBuffer) {
      // Remove oldest entry
      const removed = buffer.entries.shift();
      if (removed) {
        buffer.totalSize -= removed.content.length;
        this.totalBufferSize -= removed.content.length;
      }
    }

    // Check total buffer size
    while (this.totalBufferSize + contentSize > this.config.maxBufferSize) {
      this.removeOldestEntry();
    }

    // Add entry
    buffer.entries.push(entry);
    buffer.totalSize += contentSize;
    buffer.lastUpdated = Date.now();
    this.totalBufferSize += contentSize;

    // Apply filters and notify subscribers
    this.processEntry(entry);

    return entry;
  }

  /**
   * Get output for a session
   */
  getSessionOutput(sessionId: string, options: GetOutputOptions = {}): OutputEntry[] {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return [];

    let entries = buffer.entries;

    // Apply time filter
    if (options.since) {
      entries = entries.filter(e => e.timestamp >= options.since!);
    }

    // Apply stream type filter
    if (options.streamType) {
      entries = entries.filter(e => e.streamType === options.streamType);
    }

    // Apply command filter
    if (options.commandId) {
      entries = entries.filter(e => e.commandId === options.commandId);
    }

    // Apply custom filter
    if (options.filter) {
      entries = entries.filter(e => options.filter!.test(e.content));
    }

    // Apply limit
    if (options.limit) {
      entries = entries.slice(-options.limit);
    }

    return entries;
  }

  /**
   * Get output for an agent (all sessions)
   */
  getAgentOutput(agentId: string, options: GetOutputOptions = {}): OutputEntry[] {
    const entries: OutputEntry[] = [];

    for (const buffer of this.buffers.values()) {
      if (buffer.agentId === agentId) {
        entries.push(...buffer.entries);
      }
    }

    // Sort by timestamp
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // Apply filters
    let filtered = entries;

    if (options.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }

    if (options.streamType) {
      filtered = filtered.filter(e => e.streamType === options.streamType);
    }

    if (options.filter) {
      filtered = filtered.filter(e => options.filter!.test(e.content));
    }

    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Get combined output as string
   */
  getCombinedOutput(sessionId: string, options: GetOutputOptions = {}): string {
    const entries = this.getSessionOutput(sessionId, options);
    return entries.map(e => e.content).join('');
  }

  /**
   * Subscribe to output
   */
  subscribe(
    callback: (entry: OutputEntry) => void,
    options: { agentId?: string; sessionId?: string; filters?: string[] } = {}
  ): string {
    const subscription: OutputSubscription = {
      id: randomUUID(),
      agentId: options.agentId,
      sessionId: options.sessionId,
      filters: options.filters || [],
      callback,
    };

    this.subscriptions.set(subscription.id, subscription);
    return subscription.id;
  }

  /**
   * Unsubscribe from output
   */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Add a filter
   */
  addFilter(filter: Omit<OutputFilter, 'id'>): string {
    const id = randomUUID();
    this.filters.set(id, { ...filter, id });
    return id;
  }

  /**
   * Remove a filter
   */
  removeFilter(filterId: string): boolean {
    return this.filters.delete(filterId);
  }

  /**
   * Get all filters
   */
  getFilters(): OutputFilter[] {
    return Array.from(this.filters.values());
  }

  /**
   * Clear buffer for a session
   */
  clearSessionBuffer(sessionId: string): void {
    const buffer = this.buffers.get(sessionId);
    if (buffer) {
      this.totalBufferSize -= buffer.totalSize;
      this.buffers.delete(sessionId);
    }
  }

  /**
   * Clear all buffers for an agent
   */
  clearAgentBuffers(agentId: string): number {
    let cleared = 0;
    for (const [sessionId, buffer] of this.buffers) {
      if (buffer.agentId === agentId) {
        this.totalBufferSize -= buffer.totalSize;
        this.buffers.delete(sessionId);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Search output across all buffers
   */
  searchOutput(pattern: RegExp, options: { agentId?: string; limit?: number } = {}): OutputEntry[] {
    const results: OutputEntry[] = [];

    for (const buffer of this.buffers.values()) {
      if (options.agentId && buffer.agentId !== options.agentId) continue;

      for (const entry of buffer.entries) {
        if (pattern.test(entry.content)) {
          results.push(entry);
          if (options.limit && results.length >= options.limit) {
            return results;
          }
        }
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats(): OutputAggregatorStats {
    let totalEntries = 0;
    let errorCount = 0;

    for (const buffer of this.buffers.values()) {
      totalEntries += buffer.entries.length;
      errorCount += buffer.entries.filter(e => e.streamType === 'stderr').length;
    }

    return {
      bufferCount: this.buffers.size,
      totalEntries,
      totalSize: this.totalBufferSize,
      errorCount,
      subscriptionCount: this.subscriptions.size,
      filterCount: this.filters.size,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private processEntry(entry: OutputEntry): void {
    // Apply filters
    const highlights: string[] = [];
    let shouldExclude = false;

    for (const filter of this.filters.values()) {
      if (filter.pattern.test(entry.content)) {
        switch (filter.action) {
          case 'exclude':
            shouldExclude = true;
            break;
          case 'highlight':
            highlights.push(filter.name);
            break;
        }
      }
    }

    if (shouldExclude) return;

    // Notify subscribers
    for (const subscription of this.subscriptions.values()) {
      // Check agent filter
      if (subscription.agentId && subscription.agentId !== entry.agentId) continue;

      // Check session filter
      if (subscription.sessionId && subscription.sessionId !== entry.sessionId) continue;

      // Check custom filters
      if (subscription.filters.length > 0) {
        const matchesFilter = subscription.filters.some(filterId => {
          const filter = this.filters.get(filterId);
          return filter && filter.pattern.test(entry.content);
        });
        if (!matchesFilter) continue;
      }

      try {
        subscription.callback(entry);
      } catch (error) {
        this.logger.error('Subscription callback error', {
          subscriptionId: subscription.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Emit event
    this.emit('output', { entry, highlights });
  }

  private removeOldestEntry(): void {
    let oldestBuffer: OutputBuffer | null = null;
    let oldestTime = Infinity;

    for (const buffer of this.buffers.values()) {
      if (buffer.entries.length > 0) {
        const firstEntry = buffer.entries[0];
        if (firstEntry.timestamp < oldestTime) {
          oldestTime = firstEntry.timestamp;
          oldestBuffer = buffer;
        }
      }
    }

    if (oldestBuffer && oldestBuffer.entries.length > 0) {
      const removed = oldestBuffer.entries.shift();
      if (removed) {
        oldestBuffer.totalSize -= removed.content.length;
        this.totalBufferSize -= removed.content.length;
      }
    }
  }

  private cleanupOldBuffers(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [sessionId, buffer] of this.buffers) {
      if (now - buffer.lastUpdated > this.config.bufferTtlMs) {
        toRemove.push(sessionId);
      }
    }

    for (const sessionId of toRemove) {
      this.clearSessionBuffer(sessionId);
    }

    if (toRemove.length > 0) {
      this.logger.debug('Cleaned up old output buffers', { count: toRemove.length });
    }
  }
}

// =============================================================================
// Types
// =============================================================================

interface GetOutputOptions {
  since?: number;
  limit?: number;
  streamType?: 'stdout' | 'stderr';
  commandId?: string;
  filter?: RegExp;
}

interface OutputAggregatorStats {
  bufferCount: number;
  totalEntries: number;
  totalSize: number;
  errorCount: number;
  subscriptionCount: number;
  filterCount: number;
}
