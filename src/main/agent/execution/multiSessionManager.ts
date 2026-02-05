/**
 * Multi-Session Manager
 * 
 * Central coordinator for managing multiple concurrent agent sessions across
 * different workspaces. This module ensures that sessions can run simultaneously
 * without interfering with each other and provides visibility into all running
 * sessions regardless of which workspace is currently active in the UI.
 * 
 * Key responsibilities:
 * - Track all running sessions across all workspaces
 * - Emit global session state events for UI synchronization
 * - Coordinate with ConcurrentSessionExecutor for execution
 * - Handle session lifecycle events (start, complete, error)
 * - Provide APIs for querying session status across workspaces
 */

import { EventEmitter } from 'node:events';
import type { InternalSession } from '../types';
import type { 
  AgentSessionState, 
  RendererEvent, 
  AgentEvent,
  GlobalSessionEvent,
  GlobalSessionStats as SharedGlobalSessionStats,
  GlobalSessionsUpdateEvent,
  AgentRunStatus 
} from '../../../shared/types';
import type { Logger } from '../../logger';
import type { WorkspaceResourceManager } from './workspaceResourceManager';

// =============================================================================
// Types
// =============================================================================

export interface RunningSessionInfo {
  sessionId: string;
  workspaceId: string;
  runId: string;
  status: AgentSessionState['status'];
  startedAt: number;
  iteration: number;
  maxIterations: number;
  provider?: string;
  modelId?: string;
}

export interface GlobalSessionStats {
  totalRunning: number;
  totalQueued: number;
  runningByWorkspace: Map<string, number>;
  queuedByWorkspace: Map<string, number>;
  oldestRunStartedAt: number | null;
  newestRunStartedAt: number | null;
}

export interface MultiSessionConfig {
  /** Maximum concurrent sessions globally (across all workspaces) */
  maxGlobalConcurrent: number;
  /** Maximum concurrent sessions per workspace */
  maxPerWorkspaceConcurrent: number;
  /** Interval for emitting global stats updates (ms) */
  statsUpdateIntervalMs: number;
  /** Whether to emit events for sessions in non-active workspaces */
  emitCrossWorkspaceEvents: boolean;
}

// Re-export shared types for convenience
export type { GlobalSessionEventType, GlobalSessionEvent } from '../../../shared/types';

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: MultiSessionConfig = {
  maxGlobalConcurrent: 10,
  maxPerWorkspaceConcurrent: 5,
  statsUpdateIntervalMs: 1000,
  emitCrossWorkspaceEvents: true,
};

// =============================================================================
// Multi-Session Manager
// =============================================================================

export class MultiSessionManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: MultiSessionConfig;
  private readonly resourceManager: WorkspaceResourceManager;
  private readonly emitRendererEvent: (event: RendererEvent | AgentEvent) => void;

  // Session tracking
  private readonly runningSessions = new Map<string, RunningSessionInfo>();
  private readonly queuedSessions = new Map<string, { workspaceId: string; queuedAt: number }>();
  private readonly sessionToWorkspace = new Map<string, string>();
  
  // Stats update timer
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastStats: GlobalSessionStats | null = null;

  constructor(
    logger: Logger,
    resourceManager: WorkspaceResourceManager,
    emitRendererEvent: (event: RendererEvent | AgentEvent) => void,
    config: Partial<MultiSessionConfig> = {}
  ) {
    super();
    this.logger = logger;
    this.resourceManager = resourceManager;
    this.emitRendererEvent = emitRendererEvent;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.startStatsUpdater();
  }

  // ===========================================================================
  // Public API - Session Lifecycle
  // ===========================================================================

  /**
   * Register a session as starting execution
   * Called when a session begins running
   */
  registerSessionStart(
    session: InternalSession,
    runId: string,
    maxIterations: number
  ): void {
    const sessionId = session.state.id;
    const workspaceId = session.state.workspaceId ?? 'default';

    // Remove from queued if present
    this.queuedSessions.delete(sessionId);

    // Add to running sessions
    const info: RunningSessionInfo = {
      sessionId,
      workspaceId,
      runId,
      status: 'running',
      startedAt: Date.now(),
      iteration: 0,
      maxIterations,
      provider: session.agenticContext?.currentProvider,
      modelId: undefined,
    };

    this.runningSessions.set(sessionId, info);
    this.sessionToWorkspace.set(sessionId, workspaceId);

    this.logger.info('Multi-session: Session started', {
      sessionId,
      workspaceId,
      runId,
      totalRunning: this.runningSessions.size,
    });

    // Emit global event
    this.emitGlobalEvent({
      type: 'global-session-started',
      sessionId,
      workspaceId,
      runId,
      timestamp: Date.now(),
    });

    // Emit renderer event for global running sessions indicator
    this.emitGlobalSessionsUpdate();
  }

  /**
   * Update a running session's progress
   */
  updateSessionProgress(
    sessionId: string,
    update: Partial<Pick<RunningSessionInfo, 'iteration' | 'status' | 'provider' | 'modelId'>>
  ): void {
    const info = this.runningSessions.get(sessionId);
    if (!info) return;

    Object.assign(info, update);

    if (this.config.emitCrossWorkspaceEvents) {
      this.emitGlobalEvent({
        type: 'global-session-progress',
        sessionId,
        workspaceId: info.workspaceId,
        runId: info.runId,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Register a session as completing successfully
   */
  registerSessionComplete(sessionId: string): void {
    const info = this.runningSessions.get(sessionId);
    if (!info) return;

    this.runningSessions.delete(sessionId);
    this.sessionToWorkspace.delete(sessionId);

    this.logger.info('Multi-session: Session completed', {
      sessionId,
      workspaceId: info.workspaceId,
      runId: info.runId,
      duration: Date.now() - info.startedAt,
      totalRunning: this.runningSessions.size,
    });

    this.emitGlobalEvent({
      type: 'global-session-completed',
      sessionId,
      workspaceId: info.workspaceId,
      runId: info.runId,
      timestamp: Date.now(),
    });

    this.emitGlobalSessionsUpdate();
  }

  /**
   * Register a session as having an error
   */
  registerSessionError(sessionId: string, error: string): void {
    const info = this.runningSessions.get(sessionId);
    if (!info) return;

    this.runningSessions.delete(sessionId);
    this.sessionToWorkspace.delete(sessionId);

    this.logger.warn('Multi-session: Session error', {
      sessionId,
      workspaceId: info.workspaceId,
      runId: info.runId,
      error,
      totalRunning: this.runningSessions.size,
    });

    this.emitGlobalEvent({
      type: 'global-session-error',
      sessionId,
      workspaceId: info.workspaceId,
      runId: info.runId,
      error,
      timestamp: Date.now(),
    });

    this.emitGlobalSessionsUpdate();
  }

  /**
   * Register a session as queued for execution
   */
  registerSessionQueued(sessionId: string, workspaceId: string): void {
    this.queuedSessions.set(sessionId, {
      workspaceId,
      queuedAt: Date.now(),
    });

    this.logger.debug('Multi-session: Session queued', {
      sessionId,
      workspaceId,
      totalQueued: this.queuedSessions.size,
    });
  }

  /**
   * Remove a session from queued state (cancelled or started)
   */
  unregisterSessionQueued(sessionId: string): void {
    this.queuedSessions.delete(sessionId);
  }

  // ===========================================================================
  // Public API - Queries
  // ===========================================================================

  /**
   * Get all currently running sessions
   */
  getAllRunningSessions(): RunningSessionInfo[] {
    return Array.from(this.runningSessions.values());
  }

  /**
   * Get running sessions for a specific workspace
   */
  getRunningSessionsForWorkspace(workspaceId: string): RunningSessionInfo[] {
    return Array.from(this.runningSessions.values())
      .filter(info => info.workspaceId === workspaceId);
  }

  /**
   * Get running session count for a workspace
   */
  getRunningCountForWorkspace(workspaceId: string): number {
    return this.getRunningSessionsForWorkspace(workspaceId).length;
  }

  /**
   * Check if a session is currently running
   */
  isSessionRunning(sessionId: string): boolean {
    return this.runningSessions.has(sessionId);
  }

  /**
   * Get session info if running
   */
  getRunningSessionInfo(sessionId: string): RunningSessionInfo | undefined {
    return this.runningSessions.get(sessionId);
  }

  /**
   * Get global session statistics
   */
  getGlobalStats(): GlobalSessionStats {
    const runningByWorkspace = new Map<string, number>();
    const queuedByWorkspace = new Map<string, number>();
    let oldestStart: number | null = null;
    let newestStart: number | null = null;

    // Count running by workspace
    for (const info of this.runningSessions.values()) {
      const current = runningByWorkspace.get(info.workspaceId) ?? 0;
      runningByWorkspace.set(info.workspaceId, current + 1);

      if (oldestStart === null || info.startedAt < oldestStart) {
        oldestStart = info.startedAt;
      }
      if (newestStart === null || info.startedAt > newestStart) {
        newestStart = info.startedAt;
      }
    }

    // Count queued by workspace
    for (const { workspaceId } of this.queuedSessions.values()) {
      const current = queuedByWorkspace.get(workspaceId) ?? 0;
      queuedByWorkspace.set(workspaceId, current + 1);
    }

    return {
      totalRunning: this.runningSessions.size,
      totalQueued: this.queuedSessions.size,
      runningByWorkspace,
      queuedByWorkspace,
      oldestRunStartedAt: oldestStart,
      newestRunStartedAt: newestStart,
    };
  }

  /**
   * Check if we can start a new session (within limits)
   */
  canStartSession(workspaceId: string): { allowed: boolean; reason?: string } {
    // Check global limit
    if (this.runningSessions.size >= this.config.maxGlobalConcurrent) {
      return {
        allowed: false,
        reason: `Global concurrent session limit (${this.config.maxGlobalConcurrent}) reached`,
      };
    }

    // Check workspace limit
    const workspaceRunning = this.getRunningCountForWorkspace(workspaceId);
    if (workspaceRunning >= this.config.maxPerWorkspaceConcurrent) {
      return {
        allowed: false,
        reason: `Workspace concurrent session limit (${this.config.maxPerWorkspaceConcurrent}) reached`,
      };
    }

    return { allowed: true };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private startStatsUpdater(): void {
    this.statsTimer = setInterval(() => {
      const stats = this.getGlobalStats();
      
      // Only emit if stats changed
      if (this.hasStatsChanged(stats)) {
        this.lastStats = stats;
        this.emitGlobalEvent({
          type: 'global-stats-updated',
          stats,
          timestamp: Date.now(),
        });
      }
    }, this.config.statsUpdateIntervalMs);
  }

  private hasStatsChanged(newStats: GlobalSessionStats): boolean {
    if (!this.lastStats) return true;
    return (
      newStats.totalRunning !== this.lastStats.totalRunning ||
      newStats.totalQueued !== this.lastStats.totalQueued
    );
  }

  /**
   * Convert internal stats to shared type format for renderer events
   */
  private toSharedStats(stats: GlobalSessionStats): SharedGlobalSessionStats {
    return {
      totalRunning: stats.totalRunning,
      totalQueued: stats.totalQueued,
      runningByWorkspace: Object.fromEntries(stats.runningByWorkspace),
      canStartNew: stats.totalRunning < this.config.maxGlobalConcurrent,
      maxGlobal: this.config.maxGlobalConcurrent,
      maxPerWorkspace: this.config.maxPerWorkspaceConcurrent,
    };
  }

  private emitGlobalEvent(event: Omit<GlobalSessionEvent, 'stats'> & { stats?: GlobalSessionStats }): void {
    // Convert stats to shared format before emitting
    const rendererEvent: GlobalSessionEvent = {
      ...event,
      stats: event.stats ? this.toSharedStats(event.stats) : undefined,
    };
    
    this.emit(event.type, rendererEvent);
    
    // Also emit to renderer for UI updates
    if (this.config.emitCrossWorkspaceEvents) {
      // Emit a properly typed global sessions update
      this.emitGlobalSessionsUpdate();
    }
  }

  private emitGlobalSessionsUpdate(): void {
    const stats = this.getGlobalStats();
    const runningSessions = this.getAllRunningSessions();

    const event: GlobalSessionsUpdateEvent = {
      type: 'global-sessions-update',
      totalRunning: stats.totalRunning,
      totalQueued: stats.totalQueued,
      runningByWorkspace: Object.fromEntries(stats.runningByWorkspace),
      sessions: runningSessions.map(s => ({
        sessionId: s.sessionId,
        workspaceId: s.workspaceId,
        status: s.status as AgentRunStatus,
        startedAt: s.startedAt,
        iteration: s.iteration,
        maxIterations: s.maxIterations,
        provider: s.provider ?? 'unknown',
      })),
      timestamp: Date.now(),
    };

    this.emitRendererEvent(event);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    this.runningSessions.clear();
    this.queuedSessions.clear();
    this.sessionToWorkspace.clear();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let multiSessionManager: MultiSessionManager | null = null;

export function initMultiSessionManager(
  logger: Logger,
  resourceManager: WorkspaceResourceManager,
  emitRendererEvent: (event: RendererEvent | AgentEvent) => void,
  config?: Partial<MultiSessionConfig>
): MultiSessionManager {
  if (multiSessionManager) {
    multiSessionManager.dispose();
  }
  multiSessionManager = new MultiSessionManager(logger, resourceManager, emitRendererEvent, config);
  return multiSessionManager;
}

export function getMultiSessionManager(): MultiSessionManager | null {
  return multiSessionManager;
}
