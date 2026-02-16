/**
 * Sessions Feature Module
 * 
 * Exports session management hooks, utilities, and components.
 * Note: Session UI is handled by SessionSelector in the chat feature.
 */

// Hooks
export { useSessionList } from './hooks/useSessionList';
export { useSessionCost, type SessionCostState } from './hooks/useSessionCost';
export { useAllWorkspaceSessions, type AllWorkspaceSessionsState, type AllWorkspaceSessionsActions } from './hooks/useAllWorkspaceSessions';
export { useSessionSearch, type SessionSearchOptions, type SessionSearchState, type SessionSearchActions } from './hooks/useSessionSearch';
export { useRunningSessionsOverview, type RunningSessionInfo, type WorkspaceRunningInfo, type RunningSessionsOverviewState } from './hooks/useRunningSessionsOverview';

// Utilities
export {
  // Status helpers
  isSessionRunning,
  isSessionIdle,
  isSessionError,
  isSessionPaused,
  getStatusPriority,
  getStatusLabel,
  // Sorting
  sortSessions,
  sortSessionsRunningFirst,
  // Filtering
  filterSessionsByQuery,
  filterRunningSessions,
  filterIdleSessions,
  filterAndSortSessions,
  // Statistics
  getSessionStats,
  getRunningCountByWorkspace,
  getSessionCountsByWorkspace,
  // Grouping
  groupSessionsByDate,
  groupSessionsByWorkspace,
  groupSessionsByStatus,
  // Display helpers
  truncateTitle,
  formatRelativeTime,
  getWorkspaceLabelFromPath,
} from './utils';

export type {
  SessionSortKey,
  SessionFilterOptions,
  SessionStats,
  SessionGroup,
} from './utils';
