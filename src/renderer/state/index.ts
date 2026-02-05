// State management barrel export
export { AgentProvider, useAgent } from './AgentProvider';
export { UIProvider } from './UIProvider';
export { 
  WorkspaceContextProvider, 
  useWorkspaceContext, 
  type WorkspaceContextState,
  type WorkspaceDiagnostic,
} from './WorkspaceContextProvider';
export { 
  WorkspaceTabsProvider, 
  useWorkspaceTabs,
  useWorkspaceTabsState,
  useWorkspaceTabsActions,
  useFocusedWorkspace,
  useIsWorkspaceTabOpen,
  type WorkspaceTabWithInfo,
  type WorkspaceTabsState,
  type WorkspaceTabsActions,
} from './WorkspaceTabsProvider';
export { EditorProvider, useEditor, type DiffState } from './EditorProvider';
export { agentReducer, initialState, type AgentUIState, type AgentAction, type AgentStatusInfo } from './agentReducer';

// Multi-workspace selectors for efficient state queries
export {
  selectSessionsByWorkspace,
  selectWorkspaceSessions,
  selectWorkspaceSummaries,
  selectWorkspaceSummary,
  selectActiveSessionsByWorkspace,
  selectGlobalRunningSessionCount,
  selectWaitingConfirmationCount,
  selectIsWorkspaceActive,
  selectSessionById,
  sessionIdsEqual,
  workspaceSummaryEqual,
  workspaceSummariesEqual,
  type WorkspaceSessionSummary,
  type SessionsByWorkspace,
} from './workspaceSelectors';

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
