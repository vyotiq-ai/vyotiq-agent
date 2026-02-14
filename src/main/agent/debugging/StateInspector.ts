/**
 * State Inspector
 *
 * Inspects agent state for debugging, providing views into
 * context, tool history, message queues, and resource usage.
 */

import { EventEmitter } from 'node:events';
import type { Logger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export interface AgentState {
  agentId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  context: AgentContext;
  toolHistory: ToolHistoryEntry[];
  messageQueue: QueuedMessage[];
  resourceUsage: ResourceUsage;
  metadata: Record<string, unknown>;
  capturedAt: number;
}

export interface AgentContext {
  sessionId: string;
  runId?: string;
  parentAgentId?: string;
  systemPrompt?: string;
  currentTask?: string;
  variables: Record<string, unknown>;
  files: string[];
  workingDirectory?: string;
}

export interface ToolHistoryEntry {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  success: boolean;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
}

export interface QueuedMessage {
  id: string;
  type: 'task' | 'result' | 'error';
  fromAgentId?: string;
  toAgentId: string;
  payload: unknown;
  priority: number;
  enqueuedAt: number;
  status: 'pending' | 'processing' | 'delivered' | 'failed';
}

export interface ResourceUsage {
  /** Memory usage in MB (calculated from process.memoryUsage().heapUsed) */
  memoryMb: number;
  cpuPercent: number;
  activeConnections: number;
  pendingOperations: number;
  locksHeld: string[];
  filesOpen: string[];
}

export interface StateSnapshot {
  id: string;
  agentId: string;
  state: AgentState;
  timestamp: number;
  trigger: 'manual' | 'breakpoint' | 'periodic' | 'error';
  diff?: StateDiff;
}

export interface StateDiff {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { from: unknown; to: unknown }>;
}

export interface StateInspectorConfig {
  maxSnapshots: number;
  maxToolHistory: number;
  maxMessageQueue: number;
  snapshotIntervalMs: number;
  enablePeriodicSnapshots: boolean;
}

export const DEFAULT_STATE_INSPECTOR_CONFIG: StateInspectorConfig = {
  maxSnapshots: 100,
  maxToolHistory: 500,
  maxMessageQueue: 100,
  snapshotIntervalMs: 5000,
  enablePeriodicSnapshots: false,
};

// =============================================================================
// StateInspector
// =============================================================================

export class StateInspector extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: StateInspectorConfig;
  private readonly agentStates = new Map<string, AgentState>();
  private readonly snapshots = new Map<string, StateSnapshot[]>();
  private readonly toolHistories = new Map<string, ToolHistoryEntry[]>();
  private readonly messageQueues = new Map<string, QueuedMessage[]>();
  private periodicSnapshotInterval?: NodeJS.Timeout;

  constructor(logger: Logger, config: Partial<StateInspectorConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_STATE_INSPECTOR_CONFIG, ...config };
  }

  /**
   * Initialize the inspector
   */
  initialize(): void {
    if (this.config.enablePeriodicSnapshots) {
      this.periodicSnapshotInterval = setInterval(() => {
        this.capturePeriodicSnapshots();
      }, this.config.snapshotIntervalMs);
      if (this.periodicSnapshotInterval && typeof this.periodicSnapshotInterval === 'object' && 'unref' in this.periodicSnapshotInterval) {
        (this.periodicSnapshotInterval as NodeJS.Timeout).unref();
      }
    }

    this.logger.info('StateInspector initialized');
  }

  /**
   * Shutdown the inspector
   */
  shutdown(): void {
    if (this.periodicSnapshotInterval) {
      clearInterval(this.periodicSnapshotInterval);
    }

    this.agentStates.clear();
    this.snapshots.clear();
    this.toolHistories.clear();
    this.messageQueues.clear();

    this.logger.info('StateInspector shutdown');
  }

  /**
   * Register an agent for inspection
   */
  registerAgent(agentId: string, initialContext: Partial<AgentContext> = {}): void {
    const state: AgentState = {
      agentId,
      status: 'idle',
      context: {
        sessionId: initialContext.sessionId || '',
        runId: initialContext.runId,
        parentAgentId: initialContext.parentAgentId,
        systemPrompt: initialContext.systemPrompt,
        currentTask: initialContext.currentTask,
        variables: initialContext.variables || {},
        files: initialContext.files || [],
        workingDirectory: initialContext.workingDirectory,
      },
      toolHistory: [],
      messageQueue: [],
      resourceUsage: this.createEmptyResourceUsage(),
      metadata: {},
      capturedAt: Date.now(),
    };

    this.agentStates.set(agentId, state);
    this.toolHistories.set(agentId, []);
    this.messageQueues.set(agentId, []);
    this.snapshots.set(agentId, []);

    this.logger.debug('Agent registered for inspection', { agentId });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agentStates.delete(agentId);
    this.toolHistories.delete(agentId);
    this.messageQueues.delete(agentId);
    // Keep snapshots for post-mortem analysis
  }

  /**
   * Inspect full agent state
   */
  inspectAgent(agentId: string): AgentState | undefined {
    const state = this.agentStates.get(agentId);
    if (!state) return undefined;

    // Update with current tool history and message queue
    state.toolHistory = this.toolHistories.get(agentId) || [];
    state.messageQueue = this.messageQueues.get(agentId) || [];
    state.capturedAt = Date.now();

    return { ...state };
  }

  /**
   * Alias for inspectAgent - for backwards compatibility with debug handlers
   */
  getAgentState(agentId: string): AgentState | undefined {
    return this.inspectAgent(agentId);
  }

  /**
   * Get agent context only
   */
  getContext(agentId: string): AgentContext | undefined {
    return this.agentStates.get(agentId)?.context;
  }

  /**
   * Update agent context
   */
  updateContext(agentId: string, updates: Partial<AgentContext>): void {
    const state = this.agentStates.get(agentId);
    if (!state) return;

    state.context = { ...state.context, ...updates };
    state.capturedAt = Date.now();

    this.emit('context-updated', { agentId, updates });
  }

  /**
   * Update agent status
   */
  updateStatus(agentId: string, status: AgentState['status']): void {
    const state = this.agentStates.get(agentId);
    if (!state) return;

    const previousStatus = state.status;
    state.status = status;
    state.capturedAt = Date.now();

    this.emit('status-changed', { agentId, previousStatus, newStatus: status });
  }

  /**
   * Get tool history for an agent
   */
  getToolHistory(agentId: string, limit?: number): ToolHistoryEntry[] {
    const history = this.toolHistories.get(agentId) || [];
    if (limit) {
      return history.slice(-limit);
    }
    return [...history];
  }

  /**
   * Record a tool call
   */
  recordToolCall(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>
  ): string {
    const history = this.toolHistories.get(agentId);
    if (!history) return '';

    const entry: ToolHistoryEntry = {
      id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolName,
      args,
      success: false,
      startedAt: Date.now(),
    };

    history.push(entry);

    // Prune if over limit
    if (history.length > this.config.maxToolHistory) {
      history.splice(0, history.length - this.config.maxToolHistory);
    }

    return entry.id;
  }

  /**
   * Record tool result
   */
  recordToolResult(
    agentId: string,
    toolCallId: string,
    success: boolean,
    result?: unknown,
    error?: string
  ): void {
    const history = this.toolHistories.get(agentId);
    if (!history) return;

    const entry = history.find(e => e.id === toolCallId);
    if (entry) {
      entry.success = success;
      entry.result = result;
      entry.error = error;
      entry.completedAt = Date.now();
      entry.durationMs = entry.completedAt - entry.startedAt;
    }
  }

  /**
   * Get message queue for an agent
   */
  getMessageQueue(agentId: string): QueuedMessage[] {
    return [...(this.messageQueues.get(agentId) || [])];
  }

  /**
   * Add message to queue
   */
  enqueueMessage(message: Omit<QueuedMessage, 'id' | 'enqueuedAt' | 'status'>): string {
    const queue = this.messageQueues.get(message.toAgentId);
    if (!queue) return '';

    const queuedMessage: QueuedMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      enqueuedAt: Date.now(),
      status: 'pending',
    };

    queue.push(queuedMessage);

    // Prune if over limit
    if (queue.length > this.config.maxMessageQueue) {
      queue.splice(0, queue.length - this.config.maxMessageQueue);
    }

    return queuedMessage.id;
  }

  /**
   * Update message status
   */
  updateMessageStatus(agentId: string, messageId: string, status: QueuedMessage['status']): void {
    const queue = this.messageQueues.get(agentId);
    if (!queue) return;

    const message = queue.find(m => m.id === messageId);
    if (message) {
      message.status = status;
    }
  }

  /**
   * Get resource usage for an agent
   */
  getResourceUsage(agentId: string): ResourceUsage | undefined {
    return this.agentStates.get(agentId)?.resourceUsage;
  }

  /**
   * Update resource usage
   */
  updateResourceUsage(agentId: string, usage: Partial<ResourceUsage>): void {
    const state = this.agentStates.get(agentId);
    if (!state) return;

    state.resourceUsage = { ...state.resourceUsage, ...usage };
    state.capturedAt = Date.now();
  }

  /**
   * Capture a state snapshot
   */
  captureSnapshot(
    agentId: string,
    trigger: StateSnapshot['trigger'] = 'manual'
  ): StateSnapshot | undefined {
    const state = this.inspectAgent(agentId);
    if (!state) return undefined;

    const agentSnapshots = this.snapshots.get(agentId) || [];
    const previousSnapshot = agentSnapshots[agentSnapshots.length - 1];

    const snapshot: StateSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      state: JSON.parse(JSON.stringify(state)), // Deep clone
      timestamp: Date.now(),
      trigger,
      diff: previousSnapshot ? this.computeDiff(previousSnapshot.state, state) : undefined,
    };

    agentSnapshots.push(snapshot);

    // Prune if over limit
    if (agentSnapshots.length > this.config.maxSnapshots) {
      agentSnapshots.splice(0, agentSnapshots.length - this.config.maxSnapshots);
    }

    this.snapshots.set(agentId, agentSnapshots);
    this.emit('snapshot-captured', { agentId, snapshotId: snapshot.id, trigger });

    return snapshot;
  }

  /**
   * Alias for captureSnapshot - for backwards compatibility with debug handlers
   */
  takeSnapshot(
    agentId: string,
    trigger: StateSnapshot['trigger'] = 'manual'
  ): StateSnapshot | undefined {
    return this.captureSnapshot(agentId, trigger);
  }

  /**
   * Get snapshots for an agent
   */
  getSnapshots(agentId: string, limit?: number): StateSnapshot[] {
    const agentSnapshots = this.snapshots.get(agentId) || [];
    if (limit) {
      return agentSnapshots.slice(-limit);
    }
    return [...agentSnapshots];
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(agentId: string, snapshotId: string): StateSnapshot | undefined {
    const agentSnapshots = this.snapshots.get(agentId) || [];
    return agentSnapshots.find(s => s.id === snapshotId);
  }

  /**
   * Compare two snapshots
   */
  compareSnapshots(snapshot1: StateSnapshot, snapshot2: StateSnapshot): StateDiff {
    return this.computeDiff(snapshot1.state, snapshot2.state);
  }

  /**
   * Get all registered agents
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.agentStates.keys());
  }

  /**
   * Get summary of all agents
   */
  getAgentsSummary(): Array<{ agentId: string; status: string; toolCalls: number; messages: number }> {
    return Array.from(this.agentStates.entries()).map(([agentId, state]) => ({
      agentId,
      status: state.status,
      toolCalls: this.toolHistories.get(agentId)?.length || 0,
      messages: this.messageQueues.get(agentId)?.length || 0,
    }));
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private createEmptyResourceUsage(): ResourceUsage {
    return {
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      cpuPercent: 0,
      activeConnections: 0,
      pendingOperations: 0,
      locksHeld: [],
      filesOpen: [],
    };
  }

  private capturePeriodicSnapshots(): void {
    for (const agentId of this.agentStates.keys()) {
      const state = this.agentStates.get(agentId);
      if (state && state.status === 'running') {
        this.captureSnapshot(agentId, 'periodic');
      }
    }
  }

  private computeDiff(oldState: AgentState, newState: AgentState): StateDiff {
    const diff: StateDiff = {
      added: {},
      removed: {},
      changed: {},
    };

    // Compare context variables
    const oldVars = oldState.context.variables;
    const newVars = newState.context.variables;

    for (const key of Object.keys(newVars)) {
      if (!(key in oldVars)) {
        diff.added[`context.variables.${key}`] = newVars[key];
      } else if (JSON.stringify(oldVars[key]) !== JSON.stringify(newVars[key])) {
        diff.changed[`context.variables.${key}`] = {
          from: oldVars[key],
          to: newVars[key],
        };
      }
    }

    for (const key of Object.keys(oldVars)) {
      if (!(key in newVars)) {
        diff.removed[`context.variables.${key}`] = oldVars[key];
      }
    }

    // Compare status
    if (oldState.status !== newState.status) {
      diff.changed['status'] = { from: oldState.status, to: newState.status };
    }

    // Compare current task
    if (oldState.context.currentTask !== newState.context.currentTask) {
      diff.changed['context.currentTask'] = {
        from: oldState.context.currentTask,
        to: newState.context.currentTask,
      };
    }

    // Compare files
    const oldFiles = new Set(oldState.context.files);
    const newFiles = new Set(newState.context.files);

    const addedFiles = [...newFiles].filter(f => !oldFiles.has(f));
    const removedFiles = [...oldFiles].filter(f => !newFiles.has(f));

    if (addedFiles.length > 0) {
      diff.added['context.files'] = addedFiles;
    }
    if (removedFiles.length > 0) {
      diff.removed['context.files'] = removedFiles;
    }

    return diff;
  }
}
