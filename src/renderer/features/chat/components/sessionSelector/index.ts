/**
 * Session Selector Module
 * 
 * Modular session selector components for the chat interface.
 * Provides dropdown selection, search, and management of sessions.
 */

// Main component
export { SessionSelector, default } from './SessionSelector';

// Sub-components
export { SessionOption } from './SessionOption';
export { SessionDropdown } from './SessionDropdown';

// Hook
export { useSessionDropdown } from './useSessionDropdown';

// Utilities
export {
  formatRelativeTime,
  formatFullTimestamp,
  groupSessionsByDate,
  groupSessionsByWorkspace,
  getStatusLabel,
  isSessionRunning,
  isSessionIdle,
  getStatusPriority,
  filterSessionsByQuery,
  sortSessions,
  filterAndSortSessions,
  truncateTitle,
  getDisplayTitle,
  getWorkspaceLabelFromPath,
  getSessionStats,
} from './utils';

// Types
export type {
  SessionMeta,
  SessionGroup,
  SessionPreview,
  DropdownPosition,
  SessionViewMode,
  SessionSortKey,
  SessionFilterOptions,
  SessionSelectorProps,
  SessionOptionProps,
  SessionDropdownProps,
  SessionGroupHeaderProps,
  SessionDropdownState,
  SessionDropdownActions,
} from './types';
