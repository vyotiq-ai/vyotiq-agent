/**
 * Reducers Module
 * 
 * Exports all domain-specific reducers and the combined reducer.
 */

export { sessionReducer, type SessionAction } from './sessionReducer';
export { streamingReducer, type StreamingAction } from './streamingReducer';
export { taskReducer, type TaskAction } from './taskReducer';
export { confirmationReducer, type ConfirmationAction } from './confirmationReducer';
export { settingsReducer, type SettingsAction } from './settingsReducer';

import type { AgentUIState, AgentAction } from '../agentReducer';
import { sessionReducer } from './sessionReducer';
import { streamingReducer } from './streamingReducer';
import { taskReducer } from './taskReducer';
import { confirmationReducer } from './confirmationReducer';
import { settingsReducer } from './settingsReducer';

/**
 * Action type guards
 */
const SESSION_ACTIONS = new Set([
  'SESSION_UPSERT',
  'SESSION_SET_ACTIVE',
  'SESSION_RENAME',
  'SESSION_DELETE',
  'SESSIONS_CLEAR',
  'SESSIONS_CLEAR_FOR_WORKSPACE',
]);

const STREAMING_ACTIONS = new Set([
  'STREAM_DELTA',
  'STREAM_DELTA_BATCH',
  'STREAM_THINKING_DELTA',
  'RUN_STATUS',
]);

const TASK_ACTIONS = new Set([
  'PROGRESS_UPDATE',
  'ARTIFACT_ADD',
  'CLEAR_SESSION_TASK_STATE',
  'AGENT_STATUS_UPDATE',
  'CONTEXT_METRICS_UPDATE',
  'TERMINAL_OUTPUT',
  'TERMINAL_EXIT',
  'TERMINAL_CLEAR',
  // Tool result actions for rich content display
  'TOOL_RESULT_RECEIVE',
  'INLINE_ARTIFACT_ADD',
  'RUN_CLEANUP',
  // Media output actions (generated images/audio from multimodal models)
  'MEDIA_OUTPUT_RECEIVE',
  // Task-based routing decision
  'ROUTING_DECISION',
]);


const CONFIRMATION_ACTIONS = new Set([
  'PENDING_TOOL_ADD',
  'PENDING_TOOL_REMOVE',
]);

const SETTINGS_ACTIONS = new Set([
  'WORKSPACES_UPDATE',
  'SETTINGS_UPDATE',
]);

/**
 * Combined reducer that delegates to domain-specific reducers
 * 
 * This approach:
 * 1. Keeps each domain's logic isolated and testable
 * 2. Routes actions efficiently to the appropriate reducer
 * 3. Avoids unnecessary state updates when action doesn't match
 */
export function combinedAgentReducer(
  state: AgentUIState,
  action: AgentAction
): AgentUIState {
  const actionType = action.type;

  // Route to the appropriate domain reducer
  if (SESSION_ACTIONS.has(actionType)) {
    return sessionReducer(state, action as Parameters<typeof sessionReducer>[1]);
  }

  if (STREAMING_ACTIONS.has(actionType)) {
    return streamingReducer(state, action as Parameters<typeof streamingReducer>[1]);
  }

  if (TASK_ACTIONS.has(actionType)) {
    return taskReducer(state, action as Parameters<typeof taskReducer>[1]);
  }

  if (CONFIRMATION_ACTIONS.has(actionType)) {
    return confirmationReducer(state, action as Parameters<typeof confirmationReducer>[1]);
  }

  if (SETTINGS_ACTIONS.has(actionType)) {
    return settingsReducer(state, action as Parameters<typeof settingsReducer>[1]);
  }

  // Unknown action type - return state unchanged
  return state;
}
