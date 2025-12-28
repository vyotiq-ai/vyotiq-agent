import React, { useState, useMemo } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { SectionHeader } from '../../../components/layout/sidebar/SectionHeader';
import { useWorkspaceList } from '../../../hooks/useWorkspaceList';


interface SidebarWorkspaceListProps {
  collapsed: boolean;
}

import { TerminalSidebarList, type ListGroup } from '../../../components/ui/TerminalSidebarList';

export const SidebarWorkspaceList: React.FC<SidebarWorkspaceListProps> = ({ collapsed }) => {
  const {
    workspaces,
    isLoading,
    handleAddWorkspace,
    handleSelectWorkspace,
    handleRemoveWorkspace,
  } = useWorkspaceList();
  const [isOpen, setIsOpen] = useState(true);

  const listGroups = useMemo((): ListGroup[] => [
    {
      label: 'default',
      items: workspaces.map(workspace => ({
        id: workspace.id,
        label: (workspace.label || workspace.path?.split(/[/\\]/).pop() || 'unnamed') + '/',
        isActive: workspace.isActive,
        tooltip: workspace.path,
      }))
    }
  ], [workspaces]);

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
          onSelect={handleSelectWorkspace}
          onRemove={handleRemoveWorkspace}
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

