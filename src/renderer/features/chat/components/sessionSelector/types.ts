/**
 * Session Selector Types
 * 
 * Type definitions for session selector components and utilities.
 */

// =============================================================================
// Session Types
// =============================================================================

/** Session metadata for display in selector */
export interface SessionMeta {
  id: string;
  title: string;
  updatedAt: number;
  status: string;
  messageCount: number;
}

/** Session group for date-based grouping */
export interface SessionGroup {
  label: string;
  sessions: SessionMeta[];
}

/** Session preview data for hover display */
export interface SessionPreview {
  firstMessage: string | null;
  lastActivity: string;
  totalMessages: number;
  hasRunningOperation: boolean;
}

// =============================================================================
// Dropdown Types
// =============================================================================

/** Position calculation for dropdown portal */
export interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  placement: 'above' | 'below';
}

/** View mode for session filtering */
export type SessionViewMode = 'workspace' | 'all' | 'running';

/** Sort options for sessions */
export type SessionSortKey = 'date' | 'title' | 'status' | 'messageCount';

/** Filter options for session list */
export interface SessionFilterOptions {
  searchQuery?: string;
  viewMode?: SessionViewMode;
  sortBy?: SessionSortKey;
  showPinned?: boolean;
}

// =============================================================================
// Component Props
// =============================================================================

/** Props for SessionSelector component */
export interface SessionSelectorProps {
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Reason for being disabled (tooltip) */
  disabledReason?: string;
  /** Additional className */
  className?: string;
}

/** Props for SessionOption component */
export interface SessionOptionProps {
  session: SessionMeta;
  isSelected: boolean;
  isFocused: boolean;
  workspaceLabel?: string;
  showWorkspaceBadge?: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onFocus: () => void;
  onPreviewRequest?: (sessionId: string) => void;
}

/** Props for SessionDropdown component */
export interface SessionDropdownProps {
  isOpen: boolean;
  position: DropdownPosition;
  sessionGroups: SessionGroup[];
  flatSessionList: SessionMeta[];
  activeSessionId: string | undefined;
  focusedIndex: number;
  sessionCount: number;
  hasWorkspace: boolean;
  isCreating: boolean;
  searchQuery: string;
  viewMode: SessionViewMode;
  onSelect: (sessionId: string) => void;
  onDelete: (e: React.MouseEvent, sessionId: string) => void;
  onNewSession: (e: React.MouseEvent) => void;
  onFocusItem: (index: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSearchChange: (query: string) => void;
  onViewModeChange: (mode: SessionViewMode) => void;
}

/** Props for session group header */
export interface SessionGroupHeaderProps {
  label: string;
  count: number;
}

// =============================================================================
// Hook Types
// =============================================================================

/** State returned from useSessionDropdown hook */
export interface SessionDropdownState {
  isOpen: boolean;
  isCreating: boolean;
  focusedIndex: number;
  dropdownPosition: DropdownPosition;
  searchQuery: string;
  viewMode: SessionViewMode;
  flatSessionList: SessionMeta[];
  sessionGroups: SessionGroup[];
  sessionCount: number;
  filteredCount: number;
  activeSession: SessionMeta | undefined;
  displayTitle: string;
  truncatedTitle: string;
  activeStatusLabel: string | null;
  tooltip: string;
  focusedSessionId: string | undefined;
}

/** Actions returned from useSessionDropdown hook */
export interface SessionDropdownActions {
  handleToggle: () => void;
  handleNewSession: (e: React.MouseEvent) => Promise<void>;
  handleSelect: (sessionId: string) => void;
  handleDelete: (e: React.MouseEvent, sessionId: string) => void;
  handleItemFocus: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSearchChange: (query: string) => void;
  handleViewModeChange: (mode: SessionViewMode) => void;
  getSessionGlobalIndex: (groupIndex: number, sessionIndex: number) => number;
}
