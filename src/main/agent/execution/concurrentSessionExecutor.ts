/**
 * Concurrent Session Executor
 * 
 * Manages execution of multiple agent sessions across different workspaces
 * concurrently with proper resource isolation, prioritization, and throttling.
 * 
 * Key features:
 * - Per-workspace session isolation
 * - Fair resource allocation across workspaces
 * - Priority-based execution ordering
 * - Memory pressure management
 * - Graceful degradation under load
 */

import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { WorkspaceResourceManager } from './workspaceResourceManager';
import { EventEmitter } from 'node:events';

// =============================================================================
// Types
// =============================================================================

export interface SessionExecutionRequest {
  session: InternalSession;
  priority: 'high' | 'normal' | 'low';
  workspaceId: string;
  timestamp: number;
}

export interface ConcurrentExecutionConfig {
  /** Maximum concurrent sessions globally */
  maxGlobalConcurrent: number;
  /** Maximum concurrent sessions per workspace */
  maxPerWorkspaceConcurrent: number;
  /** High priority queue boost factor */
  priorityBoostFactor: number;
  /** Starvation prevention: max wait time before priority boost (ms) */
  starvationThresholdMs: number;
  /** Memory pressure threshold (0-1) above which to throttle */
  memoryPressureThreshold: number;
  /** Polling interval for queue processing (ms) */
  queuePollingIntervalMs: number;
}

export interface ExecutionStats {
  globalRunning: number;
  globalQueued: number;
  perWorkspace: Map<string, { running: number; queued: number }>;
  averageWaitTimeMs: number;
  totalExecuted: number;
  totalFailed: number;
}

export type SessionExecutor = (session: InternalSession) => Promise<void>;

interface QueuedSession {
  request: SessionExecutionRequest;
  resolve: () => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: ConcurrentExecutionConfig = {
  maxGlobalConcurrent: 10,
  maxPerWorkspaceConcurrent: 3,
  priorityBoostFactor: 2,
  starvationThresholdMs: 30_000, // 30 seconds
  memoryPressureThreshold: 0.85,
  queuePollingIntervalMs: 100,
};

// =============================================================================
// Concurrent Session Executor
// =============================================================================

export class ConcurrentSessionExecutor extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ConcurrentExecutionConfig;
  private readonly resourceManager: WorkspaceResourceManager;
  private readonly executeSession: SessionExecutor;

  // Queue management
  private readonly globalQueue: QueuedSession[] = [];
  private readonly workspaceQueues = new Map<string, QueuedSession[]>();
  private readonly runningByWorkspace = new Map<string, Set<string>>();
  private globalRunningCount = 0;

  // Stats tracking
  private totalExecuted = 0;
  private totalFailed = 0;
  private waitTimes: number[] = [];
  private readonly maxWaitTimeSamples = 100;

  // Queue processing
  private processingTimer: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  constructor(
    logger: Logger,
    resourceManager: WorkspaceResourceManager,
    executeSession: SessionExecutor,
    config: Partial<ConcurrentExecutionConfig> = {}
  ) {
    super();
    this.logger = logger;
    this.resourceManager = resourceManager;
    this.executeSession = executeSession;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start queue processor
    this.startQueueProcessor();
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Submit a session for concurrent execution
   * Returns a promise that resolves when execution completes
   */
  submit(
    session: InternalSession,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<void> {
    const workspaceId = session.state.workspaceId ?? 'default';

    return new Promise((resolve, reject) => {
      if (this.isShuttingDown) {
        reject(new Error('Executor is shutting down'));
        return;
      }

      const request: SessionExecutionRequest = {
        session,
        priority,
        workspaceId,
        timestamp: Date.now(),
      };

      const queuedSession: QueuedSession = {
        request,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };

      // Add to workspace queue
      let workspaceQueue = this.workspaceQueues.get(workspaceId);
      if (!workspaceQueue) {
        workspaceQueue = [];
        this.workspaceQueues.set(workspaceId, workspaceQueue);
      }
      workspaceQueue.push(queuedSession);

      // Also add to global queue for global scheduling
      this.globalQueue.push(queuedSession);

      this.logger.debug('Session submitted for execution', {
        sessionId: session.state.id,
        workspaceId,
        priority,
        globalQueueSize: this.globalQueue.length,
        workspaceQueueSize: workspaceQueue.length,
      });

      this.emit('session-queued', {
        sessionId: session.state.id,
        workspaceId,
        queuePosition: workspaceQueue.length,
      });

      // Try immediate processing
      this.processQueues().catch(err => {
        this.logger.error('Queue processing error after submit', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }

  /**
   * Cancel all queued sessions for a workspace
   */
  cancelWorkspace(workspaceId: string): number {
    const queue = this.workspaceQueues.get(workspaceId);
    if (!queue) return 0;

    const cancelled = queue.length;
    
    for (const queuedSession of queue) {
      queuedSession.reject(new Error('Workspace execution cancelled'));
      
      // Remove from global queue
      const globalIndex = this.globalQueue.indexOf(queuedSession);
      if (globalIndex !== -1) {
        this.globalQueue.splice(globalIndex, 1);
      }
    }

    this.workspaceQueues.set(workspaceId, []);
    
    this.logger.info('Cancelled workspace queue', { workspaceId, cancelled });
    return cancelled;
  }

  /**
   * Cancel a specific session
   */
  cancelSession(sessionId: string): boolean {
    for (const [workspaceId, queue] of this.workspaceQueues) {
      const index = queue.findIndex(q => q.request.session.state.id === sessionId);
      if (index !== -1) {
        const [removed] = queue.splice(index, 1);
        removed.reject(new Error('Session cancelled'));

        // Remove from global queue
        const globalIndex = this.globalQueue.indexOf(removed);
        if (globalIndex !== -1) {
          this.globalQueue.splice(globalIndex, 1);
        }

        this.logger.debug('Cancelled queued session', { sessionId, workspaceId });
        return true;
      }
    }
    return false;
  }

  /**
   * Get current execution statistics
   */
  getStats(): ExecutionStats {
    const perWorkspace = new Map<string, { running: number; queued: number }>();

    for (const [workspaceId, running] of this.runningByWorkspace) {
      const queue = this.workspaceQueues.get(workspaceId) ?? [];
      perWorkspace.set(workspaceId, {
        running: running.size,
        queued: queue.length,
      });
    }

    // Also include workspaces that only have queued sessions
    for (const [workspaceId, queue] of this.workspaceQueues) {
      if (!perWorkspace.has(workspaceId)) {
        perWorkspace.set(workspaceId, {
          running: 0,
          queued: queue.length,
        });
      }
    }

    const averageWaitTimeMs = this.waitTimes.length > 0
      ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length
      : 0;

    return {
      globalRunning: this.globalRunningCount,
      globalQueued: this.globalQueue.length,
      perWorkspace,
      averageWaitTimeMs,
      totalExecuted: this.totalExecuted,
      totalFailed: this.totalFailed,
    };
  }

  /**
   * Check if a session is currently running
   */
  isRunning(sessionId: string): boolean {
    for (const running of this.runningByWorkspace.values()) {
      if (running.has(sessionId)) return true;
    }
    return false;
  }

  /**
   * Get running session count for a workspace
   */
  getWorkspaceRunningCount(workspaceId: string): number {
    return this.runningByWorkspace.get(workspaceId)?.size ?? 0;
  }

  /**
   * Gracefully shut down the executor
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    // Wait for running sessions to complete (with timeout)
    const maxWait = 30_000; // 30 seconds
    const startTime = Date.now();

    while (this.globalRunningCount > 0 && Date.now() - startTime < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Reject all queued sessions
    for (const queuedSession of this.globalQueue) {
      queuedSession.reject(new Error('Executor shutdown'));
    }
    this.globalQueue.length = 0;
    this.workspaceQueues.clear();

    this.logger.info('Concurrent session executor shut down', {
      remainingRunning: this.globalRunningCount,
    });
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private startQueueProcessor(): void {
    this.processingTimer = setInterval(() => {
      this.processQueues().catch(err => {
        this.logger.error('Queue processing error', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.config.queuePollingIntervalMs);
  }

  private async processQueues(): Promise<void> {
    if (this.isShuttingDown) return;
    if (this.globalQueue.length === 0) return;

    // Check global concurrency limit
    if (this.globalRunningCount >= this.config.maxGlobalConcurrent) {
      return;
    }

    // Check memory pressure
    if (this.isUnderMemoryPressure()) {
      this.logger.debug('Skipping queue processing due to memory pressure');
      return;
    }

    // Sort queue by effective priority (accounting for wait time starvation)
    this.sortQueueByPriority();

    // Try to start sessions from the queue
    const sessionsToStart: QueuedSession[] = [];

    for (const queuedSession of this.globalQueue) {
      if (this.globalRunningCount + sessionsToStart.length >= this.config.maxGlobalConcurrent) {
        break;
      }

      const { workspaceId } = queuedSession.request;

      // Check workspace concurrency limit
      const workspaceRunning = this.getWorkspaceRunningCount(workspaceId);
      const workspaceStarting = sessionsToStart.filter(
        s => s.request.workspaceId === workspaceId
      ).length;

      if (workspaceRunning + workspaceStarting >= this.config.maxPerWorkspaceConcurrent) {
        continue; // Skip this workspace, try next
      }

      // Check resource availability
      const resourceResult = this.resourceManager.registerSession(queuedSession.request.session);
      if (!resourceResult.acquired) {
        this.logger.debug('Session blocked by resource manager', {
          sessionId: queuedSession.request.session.state.id,
          reason: resourceResult.reason,
        });
        continue;
      }

      sessionsToStart.push(queuedSession);
    }

    // Start selected sessions
    for (const queuedSession of sessionsToStart) {
      this.removeFromQueues(queuedSession);
      this.startSession(queuedSession);
    }
  }

  private sortQueueByPriority(): void {
    const now = Date.now();

    this.globalQueue.sort((a, b) => {
      const aPriority = this.calculateEffectivePriority(a, now);
      const bPriority = this.calculateEffectivePriority(b, now);
      return bPriority - aPriority; // Higher priority first
    });
  }

  private calculateEffectivePriority(queuedSession: QueuedSession, now: number): number {
    const basePriority = {
      high: 3,
      normal: 2,
      low: 1,
    }[queuedSession.request.priority];

    // Apply starvation boost
    const waitTime = now - queuedSession.enqueuedAt;
    const starvationBoost = waitTime > this.config.starvationThresholdMs
      ? Math.min(2, waitTime / this.config.starvationThresholdMs) * this.config.priorityBoostFactor
      : 0;

    return basePriority + starvationBoost;
  }

  private removeFromQueues(queuedSession: QueuedSession): void {
    // Remove from global queue
    const globalIndex = this.globalQueue.indexOf(queuedSession);
    if (globalIndex !== -1) {
      this.globalQueue.splice(globalIndex, 1);
    }

    // Remove from workspace queue
    const workspaceQueue = this.workspaceQueues.get(queuedSession.request.workspaceId);
    if (workspaceQueue) {
      const wsIndex = workspaceQueue.indexOf(queuedSession);
      if (wsIndex !== -1) {
        workspaceQueue.splice(wsIndex, 1);
      }
    }
  }

  private startSession(queuedSession: QueuedSession): void {
    const { session, workspaceId } = queuedSession.request;
    const sessionId = session.state.id;

    // Track running
    let workspaceRunning = this.runningByWorkspace.get(workspaceId);
    if (!workspaceRunning) {
      workspaceRunning = new Set();
      this.runningByWorkspace.set(workspaceId, workspaceRunning);
    }
    workspaceRunning.add(sessionId);
    this.globalRunningCount++;

    // Record wait time
    const waitTime = Date.now() - queuedSession.enqueuedAt;
    this.recordWaitTime(waitTime);

    this.logger.info('Starting concurrent session execution', {
      sessionId,
      workspaceId,
      waitTimeMs: waitTime,
      globalRunning: this.globalRunningCount,
      workspaceRunning: workspaceRunning.size,
    });

    this.emit('session-started', { sessionId, workspaceId, waitTimeMs: waitTime });

    // Execute asynchronously
    this.executeSession(session)
      .then(() => {
        this.totalExecuted++;
        queuedSession.resolve();
        this.emit('session-completed', { sessionId, workspaceId });
      })
      .catch(error => {
        this.totalFailed++;
        queuedSession.reject(error instanceof Error ? error : new Error(String(error)));
        this.emit('session-failed', { sessionId, workspaceId, error });
      })
      .finally(() => {
        // Clean up tracking
        workspaceRunning?.delete(sessionId);
        if (workspaceRunning?.size === 0) {
          this.runningByWorkspace.delete(workspaceId);
        }
        this.globalRunningCount--;

        // Unregister from resource manager
        this.resourceManager.unregisterSession(session);

        this.logger.debug('Session execution finished', {
          sessionId,
          workspaceId,
          globalRunning: this.globalRunningCount,
        });

        // Trigger queue processing for waiting sessions
        this.processQueues().catch(err => {
          this.logger.error('Post-execution queue processing error', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      });
  }

  private recordWaitTime(waitTimeMs: number): void {
    this.waitTimes.push(waitTimeMs);
    if (this.waitTimes.length > this.maxWaitTimeSamples) {
      this.waitTimes.shift();
    }
  }

  private isUnderMemoryPressure(): boolean {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedRatio = memUsage.heapUsed / memUsage.heapTotal;
      return heapUsedRatio > this.config.memoryPressureThreshold;
    } catch {
      return false;
    }
  }
}

export default ConcurrentSessionExecutor;
