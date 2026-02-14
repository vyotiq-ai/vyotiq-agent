/**
 * Debugging Module
 *
 * Provides agent debugging, tracing, state inspection, and breakpoint management.
 */

// Types
export * from './types';
export { DEFAULT_DEBUG_CONFIG } from './types';

// Core debugger
export { AgentDebugger } from './AgentDebugger';
export type {
  DebugConfig,
  AgentTrace,
  AgentStep,
  TraceMetrics,
  BreakpointCondition,
  TraceExportOptions,
} from './types';

// State inspection
export {
  StateInspector,
  type AgentState,
  type AgentContext,
  type ToolHistoryEntry,
  type QueuedMessage,
  type ResourceUsage,
  type StateSnapshot,
  type StateDiff,
  type StateInspectorConfig,
  DEFAULT_STATE_INSPECTOR_CONFIG,
} from './StateInspector';

// Breakpoint management
export {
  BreakpointManager,
  type BreakpointType,
  type Breakpoint,
  type BreakpointCondition as BreakpointConditionType,
  type BreakpointContext,
  type BreakpointHit,
  type BreakpointManagerConfig,
  DEFAULT_BREAKPOINT_MANAGER_CONFIG,
} from './BreakpointManager';

// =============================================================================
// Singleton Access
// =============================================================================

import { VyotiqLogger, type Logger } from '../../logger';
import { StateInspector } from './StateInspector';
import { BreakpointManager } from './BreakpointManager';

let stateInspectorInstance: StateInspector | null = null;
let breakpointManagerInstance: BreakpointManager | null = null;

/** Get or create the StateInspector singleton */
export function getStateInspector(logger?: Logger): StateInspector {
  if (!stateInspectorInstance) {
    stateInspectorInstance = new StateInspector(logger || new VyotiqLogger('StateInspector'));
  }
  return stateInspectorInstance;
}

/** Get or create the BreakpointManager singleton */
export function getBreakpointManager(logger?: Logger): BreakpointManager {
  if (!breakpointManagerInstance) {
    breakpointManagerInstance = new BreakpointManager(logger || new VyotiqLogger('BreakpointManager'));
  }
  return breakpointManagerInstance;
}

/** Reset all debugging singletons (for testing) */
export function resetDebuggingSingletons(): void {
  stateInspectorInstance = null;
  breakpointManagerInstance = null;
}
