/**
 * Throttle Event Logger
 *
 * Provides structured logging for all throttling-related events with
 * consistent format and detailed tracking for debugging and monitoring.
 *
 * Log Categories:
 * - State changes (throttle activation/deactivation)
 * - Power events (suspend/resume)
 * - Window events (focus/blur/visibility)
 * - Timing anomalies (operations exceeding threshold)
 * - Agent lifecycle (start/stop)
 */

import type { Logger } from '../../logger';
import { createLogger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export type ThrottleLogCategory =
  | 'state'
  | 'power'
  | 'window'
  | 'timing'
  | 'agent'
  | 'system';

export interface ThrottleLogEntry {
  id: string;
  timestamp: number;
  category: ThrottleLogCategory;
  event: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
  sessionId?: string;
}

export interface ThrottleLogConfig {
  /** Enable state change logging */
  logStateChanges: boolean;
  /** Enable power event logging */
  logPowerEvents: boolean;
  /** Enable window event logging */
  logWindowEvents: boolean;
  /** Enable timing anomaly logging */
  logTimingAnomalies: boolean;
  /** Enable agent lifecycle logging */
  logAgentLifecycle: boolean;
  /** Maximum entries to keep in memory */
  maxEntries: number;
  /** Enable console output for debugging */
  enableConsoleOutput: boolean;
}

export const DEFAULT_THROTTLE_LOG_CONFIG: ThrottleLogConfig = {
  logStateChanges: true,
  logPowerEvents: true,
  logWindowEvents: true,
  logTimingAnomalies: true,
  logAgentLifecycle: true,
  maxEntries: 1000,
  enableConsoleOutput: false,
};

// =============================================================================
// ThrottleEventLogger
// =============================================================================

export class ThrottleEventLogger {
  private readonly logger: Logger;
  private readonly config: ThrottleLogConfig;
  private entries: ThrottleLogEntry[] = [];
  private entryCounter = 0;

  // Statistics per category
  private stats = {
    state: { total: 0, activations: 0, deactivations: 0 },
    power: { total: 0, suspends: 0, resumes: 0 },
    window: { total: 0, blurs: 0, focuses: 0, hides: 0, shows: 0 },
    timing: { total: 0, anomalies: 0, totalDelayMs: 0 },
    agent: { total: 0, starts: 0, stops: 0 },
    system: { total: 0 },
  };

  constructor(config: Partial<ThrottleLogConfig> = {}) {
    this.config = { ...DEFAULT_THROTTLE_LOG_CONFIG, ...config };
    this.logger = createLogger('ThrottleLog');
  }

  /**
   * Generate a unique entry ID
   */
  private generateId(): string {
    return `tl-${Date.now()}-${++this.entryCounter}`;
  }

  /**
   * Add a log entry
   */
  private addEntry(entry: Omit<ThrottleLogEntry, 'id' | 'timestamp'>): ThrottleLogEntry {
    const fullEntry: ThrottleLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    this.entries.push(fullEntry);

    // Trim if exceeds max
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    // Forward to main logger
    this.logger[entry.level](`[${entry.category.toUpperCase()}] ${entry.message}`, entry.metadata);

    return fullEntry;
  }

  // -------------------------------------------------------------------------
  // State Change Logging
  // -------------------------------------------------------------------------

  /**
   * Log throttle activation
   */
  logThrottleActivated(reasons: string[], metadata?: Record<string, unknown>): void {
    if (!this.config.logStateChanges) return;

    this.stats.state.total++;
    this.stats.state.activations++;

    this.addEntry({
      category: 'state',
      event: 'throttle-activated',
      level: 'info',
      message: `Throttling activated [${reasons.join(', ')}]`,
      metadata: { reasons, ...metadata },
    });
  }

  /**
   * Log throttle deactivation
   */
  logThrottleDeactivated(bypassReasons: string[], durationMs?: number): void {
    if (!this.config.logStateChanges) return;

    this.stats.state.total++;
    this.stats.state.deactivations++;

    this.addEntry({
      category: 'state',
      event: 'throttle-deactivated',
      level: 'info',
      message: `Throttling deactivated [${bypassReasons.join(', ')}]`,
      metadata: { bypassReasons },
      durationMs,
    });
  }

  /**
   * Log effective interval change
   */
  logIntervalChanged(previousMs: number, newMs: number, reason: string): void {
    if (!this.config.logStateChanges) return;

    this.stats.state.total++;

    this.addEntry({
      category: 'state',
      event: 'interval-changed',
      level: 'debug',
      message: `Interval changed ${previousMs}ms -> ${newMs}ms (${reason})`,
      metadata: { previousMs, newMs, reason },
    });
  }

  // -------------------------------------------------------------------------
  // Power Event Logging
  // -------------------------------------------------------------------------

  /**
   * Log system suspend
   */
  logSystemSuspend(agentRunning: boolean, runningSessions: number): void {
    if (!this.config.logPowerEvents) return;

    this.stats.power.total++;
    this.stats.power.suspends++;

    const level = agentRunning ? 'warn' : 'info';
    this.addEntry({
      category: 'power',
      event: 'system-suspend',
      level,
      message: agentRunning
        ? `System suspend while agent running [${runningSessions} sessions]`
        : 'System suspend detected',
      metadata: { agentRunning, runningSessions },
    });
  }

  /**
   * Log system resume
   */
  logSystemResume(agentRunning: boolean, suspendDurationMs?: number): void {
    if (!this.config.logPowerEvents) return;

    this.stats.power.total++;
    this.stats.power.resumes++;

    this.addEntry({
      category: 'power',
      event: 'system-resume',
      level: 'info',
      message: `System resumed${suspendDurationMs ? ` after ${Math.round(suspendDurationMs / 1000)}s` : ''}`,
      metadata: { agentRunning, suspendDurationMs },
      durationMs: suspendDurationMs,
    });
  }

  /**
   * Log screen lock/unlock
   */
  logScreenLockChange(locked: boolean): void {
    if (!this.config.logPowerEvents) return;

    this.stats.power.total++;

    this.addEntry({
      category: 'power',
      event: locked ? 'screen-locked' : 'screen-unlocked',
      level: 'debug',
      message: `Screen ${locked ? 'locked' : 'unlocked'}`,
    });
  }

  // -------------------------------------------------------------------------
  // Window Event Logging
  // -------------------------------------------------------------------------

  /**
   * Log window focus change
   */
  logWindowFocusChange(focused: boolean, agentRunning: boolean): void {
    if (!this.config.logWindowEvents) return;

    this.stats.window.total++;
    if (focused) {
      this.stats.window.focuses++;
    } else {
      this.stats.window.blurs++;
    }

    this.addEntry({
      category: 'window',
      event: focused ? 'window-focused' : 'window-blurred',
      level: 'debug',
      message: focused
        ? 'Window gained focus'
        : `Window lost focus${agentRunning ? ' (agent running - no throttle)' : ''}`,
      metadata: { focused, agentRunning },
    });
  }

  /**
   * Log window visibility change
   */
  logWindowVisibilityChange(visible: boolean, agentRunning: boolean): void {
    if (!this.config.logWindowEvents) return;

    this.stats.window.total++;
    if (visible) {
      this.stats.window.shows++;
    } else {
      this.stats.window.hides++;
    }

    const level = !visible && agentRunning ? 'warn' : 'debug';
    this.addEntry({
      category: 'window',
      event: visible ? 'window-shown' : 'window-hidden',
      level,
      message: visible
        ? 'Window visible'
        : `Window hidden${agentRunning ? ' (agent running - no throttle)' : ''}`,
      metadata: { visible, agentRunning },
    });
  }

  /**
   * Log window minimize/restore
   */
  logWindowMinimizeChange(minimized: boolean): void {
    if (!this.config.logWindowEvents) return;

    this.stats.window.total++;

    this.addEntry({
      category: 'window',
      event: minimized ? 'window-minimized' : 'window-restored',
      level: 'debug',
      message: `Window ${minimized ? 'minimized' : 'restored'}`,
    });
  }

  // -------------------------------------------------------------------------
  // Timing Anomaly Logging
  // -------------------------------------------------------------------------

  /**
   * Log timing anomaly
   */
  logTimingAnomaly(
    operationId: string,
    durationMs: number,
    expectedMs: number,
    wasThrottled: boolean
  ): void {
    if (!this.config.logTimingAnomalies) return;

    this.stats.timing.total++;
    this.stats.timing.anomalies++;
    this.stats.timing.totalDelayMs += durationMs - expectedMs;

    this.addEntry({
      category: 'timing',
      event: 'timing-anomaly',
      level: 'warn',
      message: `Operation exceeded threshold [${operationId}] ${durationMs}ms > ${expectedMs}ms`,
      metadata: {
        operationId,
        actualMs: durationMs,
        expectedMs,
        delayMs: durationMs - expectedMs,
        wasThrottled,
        possibleCause: wasThrottled ? 'background-throttle' : 'other',
      },
      durationMs,
    });
  }

  /**
   * Log operation start for timing tracking
   */
  logOperationStart(operationId: string, metadata?: Record<string, unknown>): void {
    this.addEntry({
      category: 'timing',
      event: 'operation-started',
      level: 'debug',
      message: `Operation started [${operationId}]`,
      metadata: { operationId, ...metadata },
    });
  }

  /**
   * Log operation completion
   */
  logOperationComplete(operationId: string, durationMs: number, success: boolean): void {
    this.stats.timing.total++;

    this.addEntry({
      category: 'timing',
      event: 'operation-completed',
      level: success ? 'debug' : 'warn',
      message: `Operation completed [${operationId}] ${durationMs}ms ${success ? 'OK' : 'FAILED'}`,
      metadata: { operationId, success },
      durationMs,
    });
  }

  // -------------------------------------------------------------------------
  // Agent Lifecycle Logging
  // -------------------------------------------------------------------------

  /**
   * Log agent session started
   */
  logAgentStarted(sessionId: string, totalRunningSessions: number): void {
    if (!this.config.logAgentLifecycle) return;

    this.stats.agent.total++;
    this.stats.agent.starts++;

    this.addEntry({
      category: 'agent',
      event: 'agent-started',
      level: 'info',
      message: `Agent started [${sessionId}] - throttle bypassed`,
      metadata: { totalRunningSessions },
      sessionId,
    });
  }

  /**
   * Log agent session stopped
   */
  logAgentStopped(sessionId: string, totalRunningSessions: number, runDurationMs: number): void {
    if (!this.config.logAgentLifecycle) return;

    this.stats.agent.total++;
    this.stats.agent.stops++;

    this.addEntry({
      category: 'agent',
      event: 'agent-stopped',
      level: 'info',
      message: `Agent stopped [${sessionId}] after ${Math.round(runDurationMs / 1000)}s`,
      metadata: { totalRunningSessions, remainingAgentsRunning: totalRunningSessions > 0 },
      durationMs: runDurationMs,
      sessionId,
    });
  }

  /**
   * Log agent paused (awaiting confirmation)
   */
  logAgentPaused(sessionId: string, reason: string): void {
    if (!this.config.logAgentLifecycle) return;

    this.stats.agent.total++;

    this.addEntry({
      category: 'agent',
      event: 'agent-paused',
      level: 'debug',
      message: `Agent paused [${sessionId}] - ${reason}`,
      metadata: { reason },
      sessionId,
    });
  }

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  /**
   * Get recent log entries
   */
  getRecentEntries(count: number = 100, category?: ThrottleLogCategory): ThrottleLogEntry[] {
    let filtered = this.entries;

    if (category) {
      filtered = filtered.filter((e) => e.category === category);
    }

    return filtered.slice(-count);
  }

  /**
   * Get entries for a specific session
   */
  getSessionEntries(sessionId: string): ThrottleLogEntry[] {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  /**
   * Get entries by time range
   */
  getEntriesByTimeRange(startTime: number, endTime: number): ThrottleLogEntry[] {
    return this.entries.filter((e) => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Get all timing anomalies
   */
  getTimingAnomalies(): ThrottleLogEntry[] {
    return this.entries.filter((e) => e.event === 'timing-anomaly');
  }

  /**
   * Get statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Export entries as JSON for debugging
   */
  exportEntries(): string {
    return JSON.stringify(
      {
        entries: this.entries,
        stats: this.stats,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let throttleLogger: ThrottleEventLogger | null = null;

/**
 * Get or create the throttle event logger
 */
export function getThrottleEventLogger(
  config?: Partial<ThrottleLogConfig>
): ThrottleEventLogger {
  if (!throttleLogger) {
    throttleLogger = new ThrottleEventLogger(config);
  }
  return throttleLogger;
}

/**
 * Create a new throttle event logger (for testing)
 */
export function createThrottleEventLogger(
  config?: Partial<ThrottleLogConfig>
): ThrottleEventLogger {
  return new ThrottleEventLogger(config);
}
