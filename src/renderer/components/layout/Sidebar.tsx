import React from 'react';
import { cn } from '../../utils/cn';
import { SidebarWorkspaceList } from '../../features/workspaces/components/SidebarWorkspaceList';
import { SidebarFileTree } from '../../features/fileTree/components/SidebarFileTree';

interface SidebarProps {
  collapsed: boolean;
  width?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, width = 248 }) => {
  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-[var(--color-surface-sidebar)] border-r border-[var(--color-border-subtle)] shrink-0 z-20 box-border overflow-hidden font-mono',
        collapsed ? 'w-0 border-none opacity-0 transition-all duration-300 ease-in-out' : 'opacity-100',
      )}
      style={{ width: collapsed ? 0 : width }}
      role="complementary"
      aria-label="Sidebar navigation"
      aria-hidden={collapsed}
    >
      {/* Workspaces section - fixed height, compact */}
      <div className="shrink-0 px-2 sm:px-3 pt-3 pb-2">
        <SidebarWorkspaceList collapsed={collapsed} />
      </div>
      
      {/* File tree section - fills remaining space */}
      <div className="flex-1 min-h-0 px-2 sm:px-3 pb-3 overflow-hidden">
        <SidebarFileTree collapsed={collapsed} />
      </div>
    </aside>
  );
};


