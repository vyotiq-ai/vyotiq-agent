/**
 * IPC Event Batcher
 * 
 * Optimizes high-frequency IPC events by batching them together.
 * Uses 2026 best practices for efficient event delivery:
 * - Micro-batching for streaming deltas
 * - Priority-based event scheduling
 * - Memory-efficient buffer management
 * - Automatic flush on idle
 * - Workspace-scoped event routing for multi-workspace support
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
  workspaceId?: string;  // Optional workspace scope
  sessionId?: string;    // Optional session scope
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
  /** Enable workspace-scoped filtering (default: true) */
  enableWorkspaceFiltering?: boolean;
  /** Batch interval for background workspaces (default: 100ms) */
  backgroundBatchIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<BatcherConfig> = {
  batchIntervalMs: 16,
  maxBatchSize: 50,
  highPriorityMaxDelayMs: 8,
  enableCompression: false,
  enableWorkspaceFiltering: true,
  backgroundBatchIntervalMs: 100,
};

/**
 * High-frequency event channels that benefit from batching
 */
const BATCH_ELIGIBLE_CHANNELS = new Set([
  'agent:event',
  'browser:state-changed',
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
]);

export class IpcEventBatcher {
  private eventQueue: BatchedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private highPriorityTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: Required<BatcherConfig>;
  private readonly getWindow: () => BrowserWindow | null;
  private isProcessing = false;

  // Workspace tracking for filtering
  private focusedWorkspaceId: string | null = null;
  private focusedSessionId: string | null = null;
  
  // Background event queue for non-focused workspaces
  private backgroundQueue: BatchedEvent[] = [];

  // Agent running state - when true, disables background throttling
  private agentRunning = false;
  private runningSessionIds = new Set<string>();

  // Statistics
  private stats = {
    eventsReceived: 0,
    eventsSent: 0,
    batchesSent: 0,
    eventsOptimized: 0,
    eventsDropped: 0,
    // Agent running mode stats
    agentRunningModeActivations: 0,
    eventsWhileAgentRunning: 0,
    backgroundQueueBypassed: 0,
  };

  constructor(getWindow: () => BrowserWindow | null, config: BatcherConfig = {}) {
    this.getWindow = getWindow;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set agent running state to disable background throttling
   * When agent is running, all events use foreground timing for responsive streaming
   */
  setAgentRunning(isRunning: boolean): void {
    const wasRunning = this.agentRunning;
    this.agentRunning = isRunning;
    
    // Track mode activations for debugging
    if (isRunning && !wasRunning) {
      this.stats.agentRunningModeActivations++;
      console.debug('[IpcEventBatcher] Agent running mode ENABLED - background throttling disabled', {
        activeSessions: this.runningSessionIds.size,
        pendingBackgroundEvents: this.backgroundQueue.length,
      });
    } else if (!isRunning && wasRunning) {
      console.debug('[IpcEventBatcher] Agent running mode DISABLED - background throttling re-enabled', {
        eventsProcessedWhileRunning: this.stats.eventsWhileAgentRunning,
        backgroundQueueBypassed: this.stats.backgroundQueueBypassed,
      });
    }
    
    // When agent starts running, flush any pending background events immediately
    if (isRunning && !wasRunning && this.backgroundQueue.length > 0) {
      this.flushBackgroundQueue();
    }
  }

  /**
   * Track individual session running state for granular control
   * Background throttling is disabled when any session is running
   */
  setSessionRunning(sessionId: string, isRunning: boolean): void {
    if (isRunning) {
      this.runningSessionIds.add(sessionId);
    } else {
      this.runningSessionIds.delete(sessionId);
    }
    
    // Update overall agent running state based on any active sessions
    this.setAgentRunning(this.runningSessionIds.size > 0);
  }

  /**
   * Check if agent is currently running (any session active)
   */
  isAgentRunning(): boolean {
    return this.agentRunning || this.runningSessionIds.size > 0;
  }

  /**
   * Get the effective background batch interval
   * Returns foreground interval when agent is running for responsive streaming
   */
  private getEffectiveBackgroundInterval(): number {
    return this.isAgentRunning() 
      ? this.config.batchIntervalMs  // Use foreground timing when agent running
      : this.config.backgroundBatchIntervalMs;
  }

  /**
   * Set the currently focused workspace for event filtering
   */
  setFocusedWorkspace(workspaceId: string | null): void {
    if (this.focusedWorkspaceId !== workspaceId) {
      this.focusedWorkspaceId = workspaceId;
      // Flush background queue when focus changes
      this.flushBackgroundQueue();
    }
  }

  /**
   * Set the currently focused session
   */
  setFocusedSession(sessionId: string | null): void {
    this.focusedSessionId = sessionId;
  }

  /**
   * Queue an event for batched delivery
   * Enhanced with workspace-scoped routing for multi-workspace support
   * Background throttling is disabled when agent is running for responsive streaming
   */
  send(channel: string, data: unknown, priority: EventPriority = EventPriority.NORMAL): void {
    this.stats.eventsReceived++;

    // Extract workspace/session from data if present
    const eventData = data as { workspaceId?: string; sessionId?: string } | undefined;
    const workspaceId = eventData?.workspaceId;
    const sessionId = eventData?.sessionId;

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

    // Create batched event
    const batchedEvent: BatchedEvent = {
      channel,
      data,
      priority,
      timestamp: Date.now(),
      workspaceId,
      sessionId,
    };

    // Track events processed while agent is running
    const agentCurrentlyRunning = this.isAgentRunning();
    if (agentCurrentlyRunning) {
      this.stats.eventsWhileAgentRunning++;
    }

    // When agent is running, skip background queue routing for responsive streaming
    // Workspace-scoped routing: route to background queue for non-focused workspaces
    // only when agent is NOT running
    const wouldRouteToBackground = 
      this.config.enableWorkspaceFiltering &&
      workspaceId &&
      this.focusedWorkspaceId &&
      workspaceId !== this.focusedWorkspaceId &&
      priority >= EventPriority.NORMAL;

    if (wouldRouteToBackground && !agentCurrentlyRunning) {
      this.backgroundQueue.push(batchedEvent);
      this.scheduleBackgroundFlush();
      return;
    }
    
    // Track when we bypass background queue due to agent running
    if (wouldRouteToBackground && agentCurrentlyRunning) {
      this.stats.backgroundQueueBypassed++;
    }

    // Add to main batch queue
    this.eventQueue.push(batchedEvent);

    // Schedule flush if needed
    this.scheduleFlush(priority);
  }

  /**
   * Send event with explicit workspace/session scope
   */
  sendScoped(
    channel: string,
    data: unknown,
    workspaceId: string | null,
    sessionId: string | null,
    priority: EventPriority = EventPriority.NORMAL
  ): void {
    // Merge scope into data
    const scopedData = {
      ...(typeof data === 'object' && data !== null ? data : { value: data }),
      ...(workspaceId && { workspaceId }),
      ...(sessionId && { sessionId }),
    };
    this.send(channel, scopedData, priority);
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
   * Schedule background queue flush (for non-focused workspaces)
   * Uses faster interval when agent is running for responsive streaming
   */
  private scheduleBackgroundFlush(): void {
    if (this.backgroundFlushTimer) return;
    
    const interval = this.getEffectiveBackgroundInterval();
    this.backgroundFlushTimer = setTimeout(() => {
      this.backgroundFlushTimer = null;
      this.flushBackgroundQueue();
    }, interval);

    // Also flush if background queue is getting large
    if (this.backgroundQueue.length >= this.config.maxBatchSize * 2) {
      this.flushBackgroundQueue();
    }
  }

  /**
   * Flush background queue
   * Sends condensed updates for non-focused workspaces
   */
  private flushBackgroundQueue(): void {
    if (this.backgroundQueue.length === 0) return;

    if (this.backgroundFlushTimer) {
      clearTimeout(this.backgroundFlushTimer);
      this.backgroundFlushTimer = null;
    }

    const window = this.getWindow();
    if (!window || window.isDestroyed()) {
      this.backgroundQueue = [];
      return;
    }

    // Group events by workspace and merge similar ones
    const eventsByWorkspace = new Map<string, BatchedEvent[]>();
    
    for (const event of this.backgroundQueue) {
      const wsId = event.workspaceId ?? 'unknown';
      const existing = eventsByWorkspace.get(wsId);
      if (existing) {
        existing.push(event);
      } else {
        eventsByWorkspace.set(wsId, [event]);
      }
    }

    // Send condensed events per workspace
    for (const [_workspaceId, events] of eventsByWorkspace) {
      // For stream-delta events, merge them together
      const optimizedEvents = this.optimizeEvents(events);
      
      for (const event of optimizedEvents) {
        window.webContents.send(event.channel, event.data);
        this.stats.eventsSent++;
      }
    }

    this.backgroundQueue = [];
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
      eventsDropped: 0,
      agentRunningModeActivations: 0,
      eventsWhileAgentRunning: 0,
      backgroundQueueBypassed: 0,
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
    if (this.backgroundFlushTimer) {
      clearTimeout(this.backgroundFlushTimer);
      this.backgroundFlushTimer = null;
    }
    this.eventQueue = [];
    this.backgroundQueue = [];
    this.runningSessionIds.clear();
    this.agentRunning = false;
  }

  /**
   * Get focused workspace ID
   */
  getFocusedWorkspace(): string | null {
    return this.focusedWorkspaceId;
  }

  /**
   * Get focused session ID
   */
  getFocusedSession(): string | null {
    return this.focusedSessionId;
  }

  /**
   * Get throttle control status for debugging/monitoring
   */
  getThrottleStatus(): {
    agentRunning: boolean;
    activeSessionCount: number;
    activeSessions: string[];
    effectiveBackgroundInterval: number;
    normalBackgroundInterval: number;
    throttlingBypassed: boolean;
  } {
    return {
      agentRunning: this.isAgentRunning(),
      activeSessionCount: this.runningSessionIds.size,
      activeSessions: Array.from(this.runningSessionIds),
      effectiveBackgroundInterval: this.getEffectiveBackgroundInterval(),
      normalBackgroundInterval: this.config.backgroundBatchIntervalMs,
      throttlingBypassed: this.isAgentRunning(),
    };
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
 * Set agent running state to disable background throttling
 * Call this when agent starts/stops running to ensure responsive streaming
 */
export function setAgentRunning(isRunning: boolean): void {
  if (globalBatcher) {
    globalBatcher.setAgentRunning(isRunning);
  }
}

/**
 * Track individual session running state
 * Background throttling is disabled when any session is running
 */
export function setSessionRunning(sessionId: string, isRunning: boolean): void {
  if (globalBatcher) {
    globalBatcher.setSessionRunning(sessionId, isRunning);
  }
}

/**
 * Check if agent is currently running (any session active)
 */
export function isAgentRunning(): boolean {
  return globalBatcher?.isAgentRunning() ?? false;
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

/**
 * Get throttle control status for debugging/monitoring
 * Shows whether background throttling is currently bypassed due to agent running
 */
export function getThrottleStatus(): {
  agentRunning: boolean;
  activeSessionCount: number;
  activeSessions: string[];
  effectiveBackgroundInterval: number;
  normalBackgroundInterval: number;
  throttlingBypassed: boolean;
} | null {
  return globalBatcher?.getThrottleStatus() ?? null;
}

/**
 * Get batcher statistics including agent running mode stats
 */
export function getBatcherStats(): {
  eventsReceived: number;
  eventsSent: number;
  batchesSent: number;
  eventsOptimized: number;
  eventsDropped: number;
  agentRunningModeActivations: number;
  eventsWhileAgentRunning: number;
  backgroundQueueBypassed: number;
} | null {
  return globalBatcher?.getStats() ?? null;
}
