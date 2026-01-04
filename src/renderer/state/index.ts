// State management barrel export
export { AgentProvider, useAgent } from './AgentProvider';
export { UIProvider } from './UIProvider';
export { 
  WorkspaceContextProvider, 
  useWorkspaceContext, 
  type WorkspaceContextState,
  type WorkspaceDiagnostic,
} from './WorkspaceContextProvider';
export { EditorProvider, useEditor } from './EditorProvider';
export { agentReducer, initialState, type AgentUIState, type AgentAction, type AgentStatusInfo } from './agentReducer';

// Domain-specific reducers
export { 
  combinedAgentReducer,
  sessionReducer,
  streamingReducer,
  taskReducer,
  confirmationReducer,
  settingsReducer,
  type SessionAction,
  type StreamingAction,
  type TaskAction,
  type ConfirmationAction,
  type SettingsAction,
} from './reducers';
