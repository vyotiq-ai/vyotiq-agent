/**
 * Throttle IPC Handlers
 *
 * Provides IPC handlers for the renderer to:
 * - Query current throttle state
 * - Get throttle statistics
 * - Mark operations as critical (bypass throttle)
 * - Receive throttle state change notifications
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import {
  getThrottleController,
} from '../agent/performance/BackgroundThrottleController';
import {
  getThrottleEventLogger,
  type ThrottleLogCategory,
  type ThrottleLogEntry,
} from '../agent/performance/ThrottleEventLogger';

const logger = createLogger('IPC:Throttle');

// =============================================================================
// Types
// =============================================================================

export interface ThrottleStateResponse {
  isThrottled: boolean;
  agentRunning: boolean;
  windowVisible: boolean;
  windowFocused: boolean;
  systemPowerState: 'active' | 'suspended' | 'resuming';
  effectiveInterval: number;
  throttleReasons: string[];
  bypassReasons: string[];
  runningSessions: string[];
}

export interface ThrottleStatsResponse {
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
}

export interface ThrottleLogsResponse {
  entries: ThrottleLogEntry[];
  stats: {
    state: { total: number; activations: number; deactivations: number };
    power: { total: number; suspends: number; resumes: number };
    window: { total: number; blurs: number; focuses: number; hides: number; shows: number };
    timing: { total: number; anomalies: number; totalDelayMs: number };
    agent: { total: number; starts: number; stops: number };
  };
}

// =============================================================================
// Handler Registration
// =============================================================================

/**
 * Register throttle-related IPC handlers
 */
export function registerThrottleHandlers(): void {
  logger.info('Registering throttle IPC handlers');

  // Get current throttle state
  ipcMain.handle('throttle:get-state', async (): Promise<ThrottleStateResponse | null> => {
    try {
      const controller = getThrottleController();
      if (!controller) {
        logger.warn('Throttle controller not initialized');
        return null;
      }

      const state = controller.getState();
      return {
        isThrottled: state.isThrottled,
        agentRunning: state.agentRunning,
        windowVisible: state.windowVisible,
        windowFocused: state.windowFocused,
        systemPowerState: state.systemPowerState,
        effectiveInterval: controller.getEffectiveInterval(),
        throttleReasons: Array.from(state.throttleReasons),
        bypassReasons: Array.from(state.bypassReasons),
        runningSessions: Array.from(state.runningSessions),
      };
    } catch (error) {
      logger.error('throttle:get-state failed', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  // Get throttle statistics
  ipcMain.handle('throttle:get-stats', async (): Promise<ThrottleStatsResponse | null> => {
    try {
      const controller = getThrottleController();
      if (!controller) {
        return null;
      }

      const stats = controller.getStats();
      return {
        totalStateChanges: stats.totalStateChanges,
        throttleActivations: stats.throttleActivations,
        throttleBypasses: stats.throttleBypasses,
        timingAnomalies: stats.timingAnomalies,
        agentRunningActivations: stats.agentRunningActivations,
        suspendEvents: stats.suspendEvents,
        resumeEvents: stats.resumeEvents,
        windowBlurEvents: stats.windowBlurEvents,
        windowFocusEvents: stats.windowFocusEvents,
        averageThrottleDurationMs: stats.averageThrottleDurationMs,
        longestThrottleDurationMs: stats.longestThrottleDurationMs,
      };
    } catch (error) {
      logger.error('throttle:get-stats failed', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  // Get throttle logs
  ipcMain.handle(
    'throttle:get-logs',
    async (
      _event,
      options?: { count?: number; category?: string }
    ): Promise<ThrottleLogsResponse | null> => {
      try {
        const throttleLogger = getThrottleEventLogger();
        const entries = throttleLogger.getRecentEntries(
          options?.count ?? 100,
          options?.category as ThrottleLogCategory | undefined
        );
        const stats = throttleLogger.getStats();

        return {
          entries,
          stats: {
            state: stats.state,
            power: stats.power,
            window: stats.window,
            timing: stats.timing,
            agent: stats.agent,
          },
        };
      } catch (error) {
        logger.error('throttle:get-logs failed', { error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    }
  );

  // Get timing anomalies
  ipcMain.handle('throttle:get-anomalies', async (): Promise<ThrottleLogEntry[]> => {
    try {
      const throttleLogger = getThrottleEventLogger();
      return throttleLogger.getTimingAnomalies();
    } catch (error) {
      logger.error('throttle:get-anomalies failed', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // Mark operation as critical (bypass throttle)
  ipcMain.handle(
    'throttle:start-critical-operation',
    async (_event, operationId: string): Promise<boolean> => {
      try {
        const controller = getThrottleController();
        if (!controller) {
          return false;
        }

        controller.addCriticalOperation(operationId);
        logger.debug('Critical operation started via IPC', { operationId });
        return true;
      } catch (error) {
        logger.error('throttle:start-critical-operation failed', { error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    }
  );

  // End critical operation
  ipcMain.handle(
    'throttle:end-critical-operation',
    async (_event, operationId: string): Promise<boolean> => {
      try {
        const controller = getThrottleController();
        if (!controller) {
          return false;
        }

        controller.removeCriticalOperation(operationId);
        logger.debug('Critical operation ended via IPC', { operationId });
        return true;
      } catch (error) {
        logger.error('throttle:end-critical-operation failed', { error: error instanceof Error ? error.message : String(error) });
        return false;
      }
    }
  );

  // Get effective interval
  ipcMain.handle('throttle:get-effective-interval', async (): Promise<number> => {
    try {
      const controller = getThrottleController();
      return controller?.getEffectiveInterval() ?? 16;
    } catch (error) {
      logger.error('throttle:get-effective-interval failed', { error: error instanceof Error ? error.message : String(error) });
      return 16;
    }
  });

  // Check if should bypass throttle
  ipcMain.handle('throttle:should-bypass', async (): Promise<boolean> => {
    try {
      const controller = getThrottleController();
      return controller?.shouldBypassThrottle() ?? true;
    } catch (error) {
      logger.error('throttle:should-bypass failed', { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  });

  // Export throttle logs for debugging
  ipcMain.handle('throttle:export-logs', async (): Promise<string> => {
    try {
      const throttleLogger = getThrottleEventLogger();
      return throttleLogger.exportEntries();
    } catch (error) {
      logger.error('throttle:export-logs failed', { error: error instanceof Error ? error.message : String(error) });
      return '{"error": "Failed to export logs"}';
    }
  });

  logger.info('Throttle IPC handlers registered');
}
