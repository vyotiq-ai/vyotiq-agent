/**
 * Debugging Module Index
 *
 * Re-exports all debugging-related types and classes for
 * tracing, state inspection, and breakpoint management.
 */

// Types
export * from './types';

// Single-agent debugging exports
export { AgentDebugger } from './AgentDebugger';
export type {
  DebugConfig,
  AgentTrace,
  AgentStep,
  TraceMetrics,
  BreakpointCondition,
  TraceExportOptions,
} from './types';
export { DEFAULT_DEBUG_CONFIG } from './types';

// Execution recording
export {
  ExecutionRecorder,
  type Recording,
  type RecordingEntry,
  type RecordingEntryType,
  type RecordingMetadata,
  type ExecutionRecorderConfig,
  DEFAULT_EXECUTION_RECORDER_CONFIG,
} from './ExecutionRecorder';

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
import { ExecutionRecorder } from './ExecutionRecorder';
import { StateInspector } from './StateInspector';
import { BreakpointManager } from './BreakpointManager';

let executionRecorderInstance: ExecutionRecorder | null = null;
let stateInspectorInstance: StateInspector | null = null;
let breakpointManagerInstance: BreakpointManager | null = null;

/**
 * Get or create the ExecutionRecorder singleton
 */
export function getExecutionRecorder(logger?: Logger): ExecutionRecorder {
  if (!executionRecorderInstance) {
    executionRecorderInstance = new ExecutionRecorder(logger || new VyotiqLogger('ExecutionRecorder'));
  }
  return executionRecorderInstance;
}

/**
 * Get or create the StateInspector singleton
 */
export function getStateInspector(logger?: Logger): StateInspector {
  if (!stateInspectorInstance) {
    stateInspectorInstance = new StateInspector(logger || new VyotiqLogger('StateInspector'));
  }
  return stateInspectorInstance;
}

/**
 * Get or create the BreakpointManager singleton
 */
export function getBreakpointManager(logger?: Logger): BreakpointManager {
  if (!breakpointManagerInstance) {
    breakpointManagerInstance = new BreakpointManager(logger || new VyotiqLogger('BreakpointManager'));
  }
  return breakpointManagerInstance;
}

/**
 * Reset all debugging singletons (for testing)
 */
export function resetDebuggingSingletons(): void {
  executionRecorderInstance = null;
  stateInspectorInstance = null;
  breakpointManagerInstance = null;
}
