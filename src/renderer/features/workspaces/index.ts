/**
 * Workspaces Feature Module
 * 
 * Exports workspace management components and utilities.
 */

// Components
export { SidebarWorkspaceList } from './components/SidebarWorkspaceList';
export { WorkspaceTabBar } from './components/WorkspaceTabBar';

// Tab Bar Sub-components
export { TabItem, TabContextMenu, TabSessionDropdown } from './components/tabBar';
export type {
  TabItemProps,
  TabActivityState,
  ContextMenuProps,
  ContextMenuItem as TabContextMenuItem,
  TabSessionDropdownProps,
  TabSessionItem,
  TabBarState,
  TabBarActions,
} from './components/tabBar';
