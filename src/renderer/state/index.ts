// State management barrel export
export { AgentProvider, useAgent } from './AgentProvider';
export { UIProvider } from './UIProvider';

// Types from centralized types module
export type { AgentUIState, AgentAction, AgentStatusInfo, AgentState, QueuedTool, ToolResultState, InlineArtifactState, RoutingDecisionState, TerminalStreamState } from './types';

// Utilities and initial state (still in agentReducer for backward compat)
export { initialState, computeSessionCostSnapshot } from './agentReducer';

// Domain-specific reducers
export { 
  combinedAgentReducer,
  sessionReducer,
  streamingReducer,
  taskReducer,
  confirmationReducer,
  settingsReducer,
  communicationReducer,
  type SessionAction,
  type StreamingAction,
  type TaskAction,
  type ConfirmationAction,
  type SettingsAction,
  type CommunicationAction,
} from './reducers';

// Loading state provider
export {
  LoadingProvider,
  useLoading,
  useLoadingOperation,
  type LoadingOperation,
  type LoadingState,
} from './LoadingProvider';

// Workspace state provider
export {
  WorkspaceProvider,
  useWorkspace,
  useWorkspaceState,
  useWorkspaceActions,
  getCurrentWorkspacePath,
} from './WorkspaceProvider';

// Rust backend state provider
export {
  RustBackendProvider,
  useRustBackendContext,
} from './RustBackendProvider';
