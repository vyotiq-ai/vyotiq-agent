import React, { useState, useMemo, useCallback } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { SectionHeader } from '../../../components/layout/sidebar/SectionHeader';
import { useWorkspaceList } from '../../../hooks/useWorkspaceList';
import { useWorkspaceTabsActions, useWorkspaceTabsState } from '../../../state/WorkspaceTabsProvider';
import { TerminalSidebarList, type ListGroup } from '../../../components/ui/TerminalSidebarList';


interface SidebarWorkspaceListProps {
  collapsed: boolean;
}

export const SidebarWorkspaceList: React.FC<SidebarWorkspaceListProps> = ({ collapsed }) => {
  const {
    workspaces,
    isLoading,
    handleAddWorkspace,
    handleSelectWorkspace,
    handleRemoveWorkspace,
  } = useWorkspaceList();
  
  const tabsActions = useWorkspaceTabsActions();
  const tabsState = useWorkspaceTabsState();
  
  const [isOpen, setIsOpen] = useState(true);

  // Check if a workspace has an open tab
  const isTabOpen = useCallback((workspaceId: string) => {
    return tabsState.tabs.some(t => t.workspaceId === workspaceId);
  }, [tabsState.tabs]);

  // Handle workspace selection - opens in tab if multi-workspace mode enabled
  const handleWorkspaceSelect = useCallback(async (workspaceId: string) => {
    // If multiple tabs are already open, open in new tab
    // Otherwise, use legacy single-workspace behavior
    if (tabsState.tabs.length > 0) {
      await tabsActions.openTab(workspaceId);
    } else {
      await handleSelectWorkspace(workspaceId);
    }
  }, [tabsState.tabs.length, tabsActions, handleSelectWorkspace]);

  // Handle opening workspace in new tab (middle-click or Ctrl+click)
  const handleOpenInNewTab = useCallback(async (workspaceId: string) => {
    await tabsActions.openTab(workspaceId);
  }, [tabsActions]);

  const listGroups = useMemo((): ListGroup[] => [
    {
      label: 'default',
      items: workspaces.map(workspace => ({
        id: workspace.id,
        label: (workspace.label || workspace.path?.split(/[/\\]/).pop() || 'unnamed') + '/',
        isActive: workspace.isActive,
        tooltip: workspace.path,
        // Show indicator if workspace has an open tab
        badge: isTabOpen(workspace.id) ? '●' : undefined,
      }))
    }
  ], [workspaces, isTabOpen]);

  return (
    <div className="font-mono">
      <SectionHeader
        label="workspaces"
        action={
          !collapsed && (
            <button
              className="p-1 text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40 rounded-sm"
              onClick={handleAddWorkspace}
              disabled={isLoading}
              title="Add workspace"
            >
              {isLoading ? (
                <RefreshCw size={11} className="animate-spin" />
              ) : (
                <Plus size={11} />
              )}
            </button>
          )
        }
        collapsed={collapsed}
        isOpen={isOpen}
        onClick={() => (collapsed ? handleAddWorkspace() : setIsOpen((open) => !open))}
      />
      {isOpen && (
        <TerminalSidebarList
          collapsed={collapsed}
          groups={listGroups}
          onSelect={handleWorkspaceSelect}
          onRemove={handleRemoveWorkspace}
          onMiddleClick={handleOpenInNewTab}
          isLoading={isLoading}
          typeLabel="dir"
          emptyState={{
            message: "no workspaces",
            actionLabel: "add workspace",
            onAction: handleAddWorkspace
          }}
        />
      )}
    </div>
  );
};
