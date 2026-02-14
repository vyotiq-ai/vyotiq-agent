/**
 * Session Utils Module
 * 
 * Utility functions for session management.
 */

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
} from './sessionUtils';

export type {
  SessionSortKey,
  SessionFilterOptions,
  SessionStats,
  SessionGroup,
} from './sessionUtils';
