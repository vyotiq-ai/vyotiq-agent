/**
 * Performance Module
 *
 * Provides background throttle control and throttle event logging.
 */

// Background throttle controller (used by main.ts, runExecutor, throttleHandlers)
export {
  BackgroundThrottleController,
  initThrottleController,
  getThrottleController,
  isAgentRunning as isAgentRunningThrottle,
  getEffectiveInterval,
  shouldBypassThrottle,
  type ThrottleState,
  type ThrottleConfig,
  type ThrottleEvent,
  type ThrottleStats,
  type ThrottleReason,
  type ThrottleBypassReason,
  DEFAULT_THROTTLE_CONFIG,
} from './BackgroundThrottleController';

// Throttle event logger (used by main.ts, runExecutor, throttleHandlers)
export {
  ThrottleEventLogger,
  getThrottleEventLogger,
  createThrottleEventLogger,
  type ThrottleLogCategory,
  type ThrottleLogEntry,
  type ThrottleLogConfig,
  DEFAULT_THROTTLE_LOG_CONFIG,
} from './ThrottleEventLogger';

