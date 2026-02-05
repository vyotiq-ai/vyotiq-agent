/**
 * Tab Bar Types
 * 
 * Type definitions for workspace tab bar components.
 */
import type { WorkspaceTabWithInfo } from '../../../../state/WorkspaceTabsProvider';

// =============================================================================
// Tab Item Types
// =============================================================================

export interface TabItemProps {
  tab: WorkspaceTabWithInfo;
  isActive: boolean;
  onFocus: (workspaceId: string) => void;
  onClose: (workspaceId: string) => void;
  onContextMenu: (e: React.MouseEvent, workspaceId: string) => void;
  onRename?: (workspaceId: string, newLabel: string) => void;
}

export interface TabActivityState {
  isRunning: boolean;
  runningCount: number;
  sessionCount: number;
  hasAwaitingConfirmation: boolean;
}

// =============================================================================
// Context Menu Types
// =============================================================================

export interface ContextMenuProps {
  x: number;
  y: number;
  workspaceId: string;
  onClose: () => void;
}

export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
}

// =============================================================================
// Tab Session Dropdown Types
// =============================================================================

export interface TabSessionDropdownProps {
  workspaceId: string;
  workspaceLabel: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
}

export interface TabSessionItem {
  id: string;
  title: string;
  status: string;
  updatedAt: number;
  messageCount: number;
  isActive: boolean;
}

// =============================================================================
// Tab Bar State Types
// =============================================================================

export interface TabBarState {
  tabs: WorkspaceTabWithInfo[];
  focusedTabId: string | null;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  contextMenu: { x: number; y: number; workspaceId: string } | null;
  sessionDropdown: { workspaceId: string; anchorEl: HTMLElement } | null;
}

export interface TabBarActions {
  handleFocusTab: (workspaceId: string) => void;
  handleCloseTab: (workspaceId: string) => void;
  handleContextMenu: (e: React.MouseEvent, workspaceId: string) => void;
  handleAddWorkspace: () => void;
  handleScroll: (direction: 'left' | 'right') => void;
  handleOpenSessionDropdown: (workspaceId: string, anchorEl: HTMLElement) => void;
  handleCloseSessionDropdown: () => void;
  handleCloseContextMenu: () => void;
}
