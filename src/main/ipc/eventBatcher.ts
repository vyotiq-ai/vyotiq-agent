/**
 * IPC Event Batcher
 * 
 * Optimizes high-frequency IPC events by batching them together.
 * Uses 2026 best practices for efficient event delivery:
 * - Micro-batching for streaming deltas
 * - Priority-based event scheduling
 * - Memory-efficient buffer management
 * - Automatic flush on idle
 */

import type { BrowserWindow } from 'electron';

// Event priority levels
export enum EventPriority {
  CRITICAL = 0,    // User-facing status changes (run-status, tool-call)
  HIGH = 1,        // Tool results, session updates
  NORMAL = 2,      // Stream deltas, progress updates
  LOW = 3,         // Context metrics, diagnostics
}

interface BatchedEvent {
  channel: string;
  data: unknown;
  priority: EventPriority;
  timestamp: number;
}

interface BatcherConfig {
  /** Batch interval in ms (default: 16ms for ~60fps) */
  batchIntervalMs?: number;
  /** Max events per batch (default: 50) */
  maxBatchSize?: number;
  /** Max delay for high priority events (default: 8ms) */
  highPriorityMaxDelayMs?: number;
  /** Enable compression for large payloads (default: false) */
  enableCompression?: boolean;
}

const DEFAULT_CONFIG: Required<BatcherConfig> = {
  batchIntervalMs: 16,
  maxBatchSize: 50,
  highPriorityMaxDelayMs: 8,
  enableCompression: false,
};

/**
 * High-frequency event channels that benefit from batching
 */
const BATCH_ELIGIBLE_CHANNELS = new Set([
  'agent:event',
  'browser:state-changed',
  'semantic:indexProgress',
  'semantic:modelProgress',
  'terminal:output',
  'diagnostics:updated',
]);

/**
 * Channels that should never be batched (critical user feedback)
 */
const NEVER_BATCH_CHANNELS = new Set([
  'agent:error',
  'workspace:error',
]);

/**
 * Event types within agent:event that can be merged
 */
const MERGEABLE_EVENT_TYPES = new Set([
  'stream-delta',
  'progress',
  'context-metrics',
  'semantic:indexProgress',
]);

export class IpcEventBatcher {
  private eventQueue: BatchedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private highPriorityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: Required<BatcherConfig>;
  private readonly getWindow: () => BrowserWindow | null;
  private isProcessing = false;

  // Statistics
  private stats = {
    eventsReceived: 0,
    eventsSent: 0,
    batchesSent: 0,
    eventsOptimized: 0,
  };

  constructor(getWindow: () => BrowserWindow | null, config: BatcherConfig = {}) {
    this.getWindow = getWindow;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Queue an event for batched delivery
   */
  send(channel: string, data: unknown, priority: EventPriority = EventPriority.NORMAL): void {
    this.stats.eventsReceived++;

    // Never batch critical events
    if (NEVER_BATCH_CHANNELS.has(channel)) {
      this.sendImmediate(channel, data);
      return;
    }

    // Critical priority always sends immediately
    if (priority === EventPriority.CRITICAL) {
      this.sendImmediate(channel, data);
      return;
    }

    // Non-batchable channels send immediately but don't bypass batching
    if (!BATCH_ELIGIBLE_CHANNELS.has(channel)) {
      this.sendImmediate(channel, data);
      return;
    }

    // Add to batch queue
    this.eventQueue.push({
      channel,
      data,
      priority,
      timestamp: Date.now(),
    });

    // Schedule flush if needed
    this.scheduleFlush(priority);
  }

  /**
   * Send event immediately bypassing the batch queue
   */
  private sendImmediate(channel: string, data: unknown): void {
    const window = this.getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, data);
      this.stats.eventsSent++;
    }
  }

  /**
   * Schedule a flush based on priority
   */
  private scheduleFlush(priority: EventPriority): void {
    // High priority events flush faster
    if (priority <= EventPriority.HIGH && !this.highPriorityTimer) {
      this.highPriorityTimer = setTimeout(() => {
        this.highPriorityTimer = null;
        this.flush();
      }, this.config.highPriorityMaxDelayMs);
    }

    // Normal flush timer
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, this.config.batchIntervalMs);
    }

    // Flush if queue is getting large
    if (this.eventQueue.length >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  /**
   * Flush all queued events
   */
  flush(): void {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    // Clear timers
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.highPriorityTimer) {
      clearTimeout(this.highPriorityTimer);
      this.highPriorityTimer = null;
    }

    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      this.eventQueue = [];
      this.isProcessing = false;
      return;
    }

    // Sort by priority (lower number = higher priority)
    const events = this.eventQueue;
    this.eventQueue = [];
    events.sort((a, b) => a.priority - b.priority);

    // Optimize events by channel
    const optimizedEvents = this.optimizeEvents(events);

    // Send all events
    for (const event of optimizedEvents) {
      window.webContents.send(event.channel, event.data);
      this.stats.eventsSent++;
    }

    this.stats.batchesSent++;
    this.stats.eventsOptimized += events.length - optimizedEvents.length;
    this.isProcessing = false;
  }

  /**
   * Optimize events by merging consecutive deltas
   */
  private optimizeEvents(events: BatchedEvent[]): BatchedEvent[] {
    if (events.length <= 1) {
      return events;
    }

    const result: BatchedEvent[] = [];
    let i = 0;

    while (i < events.length) {
      const current = events[i];
      
      // Check if this event type can be merged
      const eventData = current.data as { type?: string } | undefined;
      const eventType = eventData?.type;
      
      if (current.channel === 'agent:event' && eventType && MERGEABLE_EVENT_TYPES.has(eventType)) {
        // Find consecutive events of the same type for the same session
        const merged = this.mergeConsecutiveEvents(events, i);
        result.push(merged.event);
        i = merged.nextIndex;
      } else {
        result.push(current);
        i++;
      }
    }

    return result;
  }

  /**
   * Merge consecutive stream delta or progress events
   * 
   * IMPORTANT: Only merges events with the same isThinking flag to prevent
   * thinking deltas from being combined with regular content deltas.
   */
  private mergeConsecutiveEvents(events: BatchedEvent[], startIndex: number): { event: BatchedEvent; nextIndex: number } {
    const first = events[startIndex];
    const firstData = first.data as { 
      type: string; 
      sessionId?: string; 
      delta?: string; 
      messageId?: string;
      isThinking?: boolean;
    };
    
    if (firstData.type !== 'stream-delta') {
      return { event: first, nextIndex: startIndex + 1 };
    }

    let mergedDelta = firstData.delta || '';
    let i = startIndex + 1;
    const firstIsThinking = firstData.isThinking ?? false;

    // Merge consecutive stream-delta events for the same session, message, AND isThinking flag
    while (i < events.length) {
      const next = events[i];
      const nextData = next.data as { 
        type: string; 
        sessionId?: string; 
        delta?: string; 
        messageId?: string;
        isThinking?: boolean;
      };
      const nextIsThinking = nextData.isThinking ?? false;
      
      if (
        next.channel === first.channel &&
        nextData.type === 'stream-delta' &&
        nextData.sessionId === firstData.sessionId &&
        nextData.messageId === firstData.messageId &&
        nextIsThinking === firstIsThinking && // Critical: must match isThinking flag
        nextData.delta
      ) {
        mergedDelta += nextData.delta;
        i++;
      } else {
        break;
      }
    }

    // Create merged event - preserve the isThinking flag
    const mergedEvent: BatchedEvent = {
      ...first,
      data: {
        ...firstData,
        delta: mergedDelta,
        isThinking: firstIsThinking || undefined, // Preserve flag, omit if false for backward compat
      },
    };

    return { event: mergedEvent, nextIndex: i };
  }

  /**
   * Get batching statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      eventsReceived: 0,
      eventsSent: 0,
      batchesSent: 0,
      eventsOptimized: 0,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.highPriorityTimer) {
      clearTimeout(this.highPriorityTimer);
      this.highPriorityTimer = null;
    }
    this.eventQueue = [];
  }
}

// Singleton instance for global access
let globalBatcher: IpcEventBatcher | null = null;

/**
 * Initialize the global IPC event batcher
 */
export function initIpcEventBatcher(getWindow: () => BrowserWindow | null, config?: BatcherConfig): IpcEventBatcher {
  if (globalBatcher) {
    globalBatcher.destroy();
  }
  globalBatcher = new IpcEventBatcher(getWindow, config);
  return globalBatcher;
}

/**
 * Get the global IPC event batcher
 */
export function getIpcEventBatcher(): IpcEventBatcher | null {
  return globalBatcher;
}

/**
 * Send an event through the batcher
 * Falls back to direct send if batcher not initialized
 */
export function sendBatchedEvent(
  channel: string,
  data: unknown,
  priority: EventPriority = EventPriority.NORMAL,
  fallbackWindow?: BrowserWindow | null
): void {
  if (globalBatcher) {
    globalBatcher.send(channel, data, priority);
  } else if (fallbackWindow && !fallbackWindow.isDestroyed()) {
    fallbackWindow.webContents.send(channel, data);
  }
}

/**
 * Determine priority for common event types
 */
export function getEventPriority(eventType: string): EventPriority {
  switch (eventType) {
    case 'run-status':
    case 'tool-call':
    case 'error':
      return EventPriority.CRITICAL;
    
    case 'session-state':
    case 'tool-result':
      return EventPriority.HIGH;
    
    case 'stream-delta':
    case 'progress':
    case 'agent-status':
      return EventPriority.NORMAL;
    
    case 'context-metrics':
    case 'workspace-update':
    case 'settings-update':
      return EventPriority.LOW;
    
    default:
      return EventPriority.NORMAL;
  }
}
