/**
 * Background Throttle Controller
 *
 * Centralized controller for managing background throttling across the application.
 * Coordinates with:
 * - Agent session running state
 * - Electron power monitor (suspend/resume)
 * - Window visibility (focus/blur/minimize)
 * - IPC event batcher timing
 * - Streaming buffer intervals
 *
 * When agent is running, all background throttling is disabled for responsive streaming.
 */

import { EventEmitter } from 'node:events';
import { powerMonitor, BrowserWindow, app } from 'electron';
import type { Logger } from '../../logger';
import { createLogger } from '../../logger';

// =============================================================================
// Types
// =============================================================================

export type ThrottleReason =
  | 'window-hidden'
  | 'window-blurred'
  | 'window-minimized'
  | 'system-suspend'
  | 'power-saving'
  | 'idle';

export type ThrottleBypassReason =
  | 'agent-running'
  | 'critical-operation'
  | 'user-interaction'
  | 'foreground';

export interface ThrottleState {
  /** Whether throttling is currently active */
  isThrottled: boolean;
  /** Current throttle reasons (empty means not throttled) */
  throttleReasons: Set<ThrottleReason>;
  /** Current bypass reasons (any = no throttle) */
  bypassReasons: Set<ThrottleBypassReason>;
  /** Whether any agent session is running */
  agentRunning: boolean;
  /** Set of running session IDs */
  runningSessions: Set<string>;
  /** Current window visibility state */
  windowVisible: boolean;
  /** Current window focus state */
  windowFocused: boolean;
  /** System power state */
  systemPowerState: 'active' | 'suspended' | 'resuming';
  /** Timestamp of last state change */
  lastStateChange: number;
}

export interface ThrottleConfig {
  /** Base interval for foreground operations (ms) */
  foregroundIntervalMs: number;
  /** Base interval for background operations (ms) */
  backgroundIntervalMs: number;
  /** Interval when agent is running (ms) - fastest */
  agentRunningIntervalMs: number;
  /** Interval when system is suspended (ms) - slowest */
  suspendedIntervalMs: number;
  /** Enable power monitor integration */
  enablePowerMonitor: boolean;
  /** Enable window visibility tracking */
  enableWindowTracking: boolean;
  /** Log state changes for debugging */
  enableLogging: boolean;
  /** Detect timing anomalies */
  detectTimingAnomalies: boolean;
  /** Threshold for timing anomaly detection (ms) */
  anomalyThresholdMs: number;
}

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  foregroundIntervalMs: 16,      // ~60fps
  backgroundIntervalMs: 100,     // 10fps
  agentRunningIntervalMs: 16,    // ~60fps - no throttle
  suspendedIntervalMs: 1000,     // 1fps - minimal
  enablePowerMonitor: true,
  enableWindowTracking: true,
  enableLogging: true,
  detectTimingAnomalies: true,
  anomalyThresholdMs: 500,       // Flag operations taking > 500ms
};

export interface ThrottleEvent {
  type: 'state-changed' | 'throttle-applied' | 'throttle-bypassed' | 'timing-anomaly';
  timestamp: number;
  previousState?: Partial<ThrottleState>;
  currentState: Partial<ThrottleState>;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ThrottleStats {
  totalStateChanges: number;
  throttleActivations: number;
  throttleBypasses: number;
  timingAnomalies: number;
  agentRunningActivations: number;
  suspendEvents: number;
  resumeEvents: number;
  windowBlurEvents: number;
  windowFocusEvents: number;
  averageThrottleDurationMs: number;
  longestThrottleDurationMs: number;
  lastThrottleStartTime: number | null;
}

// =============================================================================
// BackgroundThrottleController
// =============================================================================

export class BackgroundThrottleController extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ThrottleConfig;
  private state: ThrottleState;
  private stats: ThrottleStats;
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;

  // Timing tracking for anomaly detection
  private operationTimers = new Map<string, number>();
  private throttleDurations: number[] = [];

  constructor(config: Partial<ThrottleConfig> = {}) {
    super();
    this.config = { ...DEFAULT_THROTTLE_CONFIG, ...config };
    this.logger = createLogger('ThrottleController');

    // Initialize state
    this.state = {
      isThrottled: false,
      throttleReasons: new Set(),
      bypassReasons: new Set(['foreground']), // Start in foreground
      agentRunning: false,
      runningSessions: new Set(),
      windowVisible: true,
      windowFocused: true,
      systemPowerState: 'active',
      lastStateChange: Date.now(),
    };

    // Initialize stats
    this.stats = {
      totalStateChanges: 0,
      throttleActivations: 0,
      throttleBypasses: 0,
      timingAnomalies: 0,
      agentRunningActivations: 0,
      suspendEvents: 0,
      resumeEvents: 0,
      windowBlurEvents: 0,
      windowFocusEvents: 0,
      averageThrottleDurationMs: 0,
      longestThrottleDurationMs: 0,
      lastThrottleStartTime: null,
    };
  }

  /**
   * Initialize the controller with the main window reference
   */
  initialize(window: BrowserWindow): void {
    if (this.initialized) {
      this.logger.warn('ThrottleController already initialized');
      return;
    }

    this.mainWindow = window;
    this.setupPowerMonitor();
    this.setupWindowTracking();
    this.initialized = true;

    this.log('info', 'BackgroundThrottleController initialized', {
      config: {
        foregroundInterval: this.config.foregroundIntervalMs,
        backgroundInterval: this.config.backgroundIntervalMs,
        agentRunningInterval: this.config.agentRunningIntervalMs,
      },
    });
  }

  /**
   * Setup Electron power monitor listeners
   */
  private setupPowerMonitor(): void {
    if (!this.config.enablePowerMonitor) return;

    // System suspend (sleep/hibernate)
    powerMonitor.on('suspend', () => {
      this.stats.suspendEvents++;
      this.log('info', 'System suspend detected', { agentRunning: this.state.agentRunning });
      this.updatePowerState('suspended');
    });

    // System resume from sleep
    powerMonitor.on('resume', () => {
      this.stats.resumeEvents++;
      this.log('info', 'System resume detected', {
        agentRunning: this.state.agentRunning,
        runningSessions: this.state.runningSessions.size,
      });
      this.updatePowerState('resuming');

      // Transition back to active after a short delay
      setTimeout(() => {
        if (this.state.systemPowerState === 'resuming') {
          this.updatePowerState('active');
        }
      }, 1000);
    });

    // Screen lock/unlock on supported platforms
    powerMonitor.on('lock-screen', () => {
      this.log('debug', 'Screen locked');
      this.addThrottleReason('idle');
    });

    powerMonitor.on('unlock-screen', () => {
      this.log('debug', 'Screen unlocked');
      this.removeThrottleReason('idle');
    });

    // Shutdown/restart detection
    powerMonitor.on('shutdown', () => {
      this.log('info', 'System shutdown detected');
    });

    this.log('debug', 'Power monitor listeners registered');
  }

  /**
   * Setup window visibility and focus tracking
   */
  private setupWindowTracking(): void {
    if (!this.config.enableWindowTracking || !this.mainWindow) return;

    // Window focus/blur
    this.mainWindow.on('focus', () => {
      this.stats.windowFocusEvents++;
      this.log('debug', 'Window focused');
      this.updateWindowFocus(true);
    });

    this.mainWindow.on('blur', () => {
      this.stats.windowBlurEvents++;
      this.log('debug', 'Window blurred', { agentRunning: this.state.agentRunning });
      this.updateWindowFocus(false);
    });

    // Window show/hide
    this.mainWindow.on('show', () => {
      this.log('debug', 'Window shown');
      this.updateWindowVisibility(true);
    });

    this.mainWindow.on('hide', () => {
      this.log('debug', 'Window hidden', { agentRunning: this.state.agentRunning });
      this.updateWindowVisibility(false);
    });

    // Window minimize/restore
    this.mainWindow.on('minimize', () => {
      this.log('debug', 'Window minimized');
      this.addThrottleReason('window-minimized');
    });

    this.mainWindow.on('restore', () => {
      this.log('debug', 'Window restored');
      this.removeThrottleReason('window-minimized');
    });

    this.log('debug', 'Window tracking listeners registered');
  }

  /**
   * Update power state and throttle accordingly
   */
  private updatePowerState(newState: ThrottleState['systemPowerState']): void {
    const previousState = this.state.systemPowerState;
    this.state.systemPowerState = newState;

    if (newState === 'suspended') {
      this.addThrottleReason('system-suspend');
    } else {
      this.removeThrottleReason('system-suspend');
    }

    this.emitStateChange('power-state-changed', { previousState, newState });
  }

  /**
   * Update window visibility state
   */
  private updateWindowVisibility(visible: boolean): void {
    this.state.windowVisible = visible;

    if (!visible) {
      this.addThrottleReason('window-hidden');
    } else {
      this.removeThrottleReason('window-hidden');
    }
  }

  /**
   * Update window focus state
   */
  private updateWindowFocus(focused: boolean): void {
    this.state.windowFocused = focused;

    if (focused) {
      this.addBypassReason('foreground');
      this.removeThrottleReason('window-blurred');
    } else {
      this.removeBypassReason('foreground');
      this.addThrottleReason('window-blurred');
    }
  }

  /**
   * Set agent running state - bypasses all throttling when true
   */
  setAgentRunning(sessionId: string, isRunning: boolean): void {
    const wasRunning = this.state.agentRunning;

    if (isRunning) {
      this.state.runningSessions.add(sessionId);
    } else {
      this.state.runningSessions.delete(sessionId);
    }

    const nowRunning = this.state.runningSessions.size > 0;
    this.state.agentRunning = nowRunning;

    // Update bypass reasons
    if (nowRunning && !wasRunning) {
      this.stats.agentRunningActivations++;
      this.addBypassReason('agent-running');
      this.log('info', 'Agent started - throttling bypassed', {
        sessionId,
        runningSessions: this.state.runningSessions.size,
      });
    } else if (!nowRunning && wasRunning) {
      this.removeBypassReason('agent-running');
      this.log('info', 'All agents stopped - throttling may resume', {
        lastSessionId: sessionId,
        currentThrottleReasons: Array.from(this.state.throttleReasons),
      });
    }
  }

  /**
   * Check if a specific session is running
   */
  isSessionRunning(sessionId: string): boolean {
    return this.state.runningSessions.has(sessionId);
  }

  /**
   * Get all running session IDs
   */
  getRunningSessions(): string[] {
    return Array.from(this.state.runningSessions);
  }

  /**
   * Add a throttle reason
   */
  private addThrottleReason(reason: ThrottleReason): void {
    if (this.state.throttleReasons.has(reason)) return;

    this.state.throttleReasons.add(reason);
    this.recalculateThrottleState();
  }

  /**
   * Remove a throttle reason
   */
  private removeThrottleReason(reason: ThrottleReason): void {
    if (!this.state.throttleReasons.has(reason)) return;

    this.state.throttleReasons.delete(reason);
    this.recalculateThrottleState();
  }

  /**
   * Add a bypass reason
   */
  private addBypassReason(reason: ThrottleBypassReason): void {
    if (this.state.bypassReasons.has(reason)) return;

    this.state.bypassReasons.add(reason);
    this.recalculateThrottleState();
  }

  /**
   * Remove a bypass reason
   */
  private removeBypassReason(reason: ThrottleBypassReason): void {
    if (!this.state.bypassReasons.has(reason)) return;

    this.state.bypassReasons.delete(reason);
    this.recalculateThrottleState();
  }

  /**
   * Temporarily add a bypass for critical operations
   */
  addCriticalOperation(operationId: string): void {
    this.addBypassReason('critical-operation');
    this.operationTimers.set(operationId, Date.now());
    this.log('debug', 'Critical operation started', { operationId });
  }

  /**
   * Remove critical operation bypass
   */
  removeCriticalOperation(operationId: string): void {
    const startTime = this.operationTimers.get(operationId);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.operationTimers.delete(operationId);

      // Check for timing anomaly
      if (this.config.detectTimingAnomalies && duration > this.config.anomalyThresholdMs) {
        this.stats.timingAnomalies++;
        this.log('warn', 'Timing anomaly detected - operation took longer than expected', {
          operationId,
          durationMs: duration,
          thresholdMs: this.config.anomalyThresholdMs,
          wasThrottled: this.state.isThrottled,
        });
        this.emitTimingAnomaly(operationId, duration);
      }
    }

    // Only remove bypass if no more critical operations
    if (this.operationTimers.size === 0) {
      this.removeBypassReason('critical-operation');
    }

    this.log('debug', 'Critical operation completed', { operationId });
  }

  /**
   * Recalculate overall throttle state
   */
  private recalculateThrottleState(): void {
    const wasThrottled = this.state.isThrottled;

    // Throttling is active if:
    // 1. There are throttle reasons AND
    // 2. There are no bypass reasons
    const shouldThrottle =
      this.state.throttleReasons.size > 0 && this.state.bypassReasons.size === 0;

    this.state.isThrottled = shouldThrottle;
    this.state.lastStateChange = Date.now();

    // Track state change
    if (wasThrottled !== shouldThrottle) {
      this.stats.totalStateChanges++;

      if (shouldThrottle) {
        this.stats.throttleActivations++;
        this.stats.lastThrottleStartTime = Date.now();
        this.log('info', 'Throttling activated', {
          reasons: Array.from(this.state.throttleReasons),
          bypassReasons: Array.from(this.state.bypassReasons),
        });
      } else {
        this.stats.throttleBypasses++;
        if (this.stats.lastThrottleStartTime) {
          const duration = Date.now() - this.stats.lastThrottleStartTime;
          this.throttleDurations.push(duration);
          this.stats.longestThrottleDurationMs = Math.max(
            this.stats.longestThrottleDurationMs,
            duration
          );
          this.stats.averageThrottleDurationMs =
            this.throttleDurations.reduce((a, b) => a + b, 0) / this.throttleDurations.length;
        }
        this.log('info', 'Throttling deactivated', {
          bypassReasons: Array.from(this.state.bypassReasons),
        });
      }

      this.emitStateChange('throttle-state-changed', {
        wasThrottled,
        isThrottled: shouldThrottle,
      });
    }
  }

  /**
   * Get the current effective interval based on state
   */
  getEffectiveInterval(): number {
    // Agent running = fastest
    if (this.state.agentRunning) {
      return this.config.agentRunningIntervalMs;
    }

    // System suspended = slowest
    if (this.state.systemPowerState === 'suspended') {
      return this.config.suspendedIntervalMs;
    }

    // Throttled (background) = slow
    if (this.state.isThrottled) {
      return this.config.backgroundIntervalMs;
    }

    // Foreground = normal speed
    return this.config.foregroundIntervalMs;
  }

  /**
   * Check if throttling should be bypassed
   */
  shouldBypassThrottle(): boolean {
    return !this.state.isThrottled || this.state.agentRunning;
  }

  /**
   * Get current throttle state (read-only copy)
   */
  getState(): Readonly<ThrottleState> {
    return {
      ...this.state,
      throttleReasons: new Set(this.state.throttleReasons),
      bypassReasons: new Set(this.state.bypassReasons),
      runningSessions: new Set(this.state.runningSessions),
    };
  }

  /**
   * Get throttle statistics
   */
  getStats(): Readonly<ThrottleStats> {
    return { ...this.stats };
  }

  /**
   * Emit a state change event
   */
  private emitStateChange(reason: string, metadata?: Record<string, unknown>): void {
    const event: ThrottleEvent = {
      type: 'state-changed',
      timestamp: Date.now(),
      currentState: {
        isThrottled: this.state.isThrottled,
        agentRunning: this.state.agentRunning,
        windowVisible: this.state.windowVisible,
        windowFocused: this.state.windowFocused,
        systemPowerState: this.state.systemPowerState,
      },
      reason,
      metadata,
    };

    this.emit('state-changed', event);
  }

  /**
   * Emit a timing anomaly event
   */
  private emitTimingAnomaly(operationId: string, durationMs: number): void {
    const event: ThrottleEvent = {
      type: 'timing-anomaly',
      timestamp: Date.now(),
      currentState: {
        isThrottled: this.state.isThrottled,
        agentRunning: this.state.agentRunning,
      },
      metadata: { operationId, durationMs },
    };

    this.emit('timing-anomaly', event);
  }

  /**
   * Log with optional console output based on config
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>
  ): void {
    if (!this.config.enableLogging && level === 'debug') return;

    this.logger[level](`[Throttle] ${message}`, {
      ...meta,
      effectiveInterval: this.getEffectiveInterval(),
    });
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    this.removeAllListeners();
    this.operationTimers.clear();
    this.throttleDurations = [];
    this.initialized = false;
    this.log('info', 'BackgroundThrottleController shutdown');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let throttleController: BackgroundThrottleController | null = null;

/**
 * Initialize the background throttle controller
 */
export function initThrottleController(
  window: BrowserWindow,
  config?: Partial<ThrottleConfig>
): BackgroundThrottleController {
  if (!throttleController) {
    throttleController = new BackgroundThrottleController(config);
  }
  throttleController.initialize(window);
  return throttleController;
}

/**
 * Get the throttle controller instance
 */
export function getThrottleController(): BackgroundThrottleController | null {
  return throttleController;
}

/**
 * Check if agent is running (convenience function)
 */
export function isAgentRunning(): boolean {
  return throttleController?.getState().agentRunning ?? false;
}

/**
 * Get effective interval for current state
 */
export function getEffectiveInterval(): number {
  return throttleController?.getEffectiveInterval() ?? 16;
}

/**
 * Should bypass throttle (convenience function)
 */
export function shouldBypassThrottle(): boolean {
  return throttleController?.shouldBypassThrottle() ?? true;
}
