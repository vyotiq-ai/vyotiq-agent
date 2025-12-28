/**
 * SidebarFileTree Component
 * 
 * File tree section for the sidebar with collapsible header.
 * Follows the existing sidebar section pattern with VS Code-like features.
 */

import React, { useState, useCallback } from 'react';
import { FolderOpen } from 'lucide-react';
import { SectionHeader } from '../../../components/layout/sidebar/SectionHeader';
import { FileTree } from './FileTree';
import { useActiveWorkspace } from '../../../hooks/useActiveWorkspace';
import { useEditor } from '../../../state/EditorProvider';

interface SidebarFileTreeProps {
  collapsed: boolean;
  onFileOpen?: (path: string) => void;
}

export const SidebarFileTree: React.FC<SidebarFileTreeProps> = ({ collapsed, onFileOpen }) => {
  const activeWorkspace = useActiveWorkspace();
  const { openFile: openInEditor } = useEditor();
  const [isOpen, setIsOpen] = useState(true);
  
  const workspacePath = activeWorkspace?.path || null;
  const workspaceName = workspacePath?.split(/[/\\]/).pop() || 'Workspace';
  
  // Handle file open - open in integrated editor
  const handleFileOpen = useCallback((path: string) => {
    // Open in integrated editor
    openInEditor(path);
    
    // Also call the callback if provided
    if (onFileOpen) {
      onFileOpen(path);
    }
  }, [openInEditor, onFileOpen]);
  
  return (
    <div className="font-mono flex flex-col h-full min-h-0">
      <SectionHeader
        label="explorer"
        collapsed={collapsed}
        isOpen={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      />
      
      {isOpen && !collapsed && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Workspace header */}
          {workspacePath && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/50 shrink-0">
              <FolderOpen size={12} className="text-[var(--color-accent-secondary)] shrink-0" />
              <span className="text-[var(--color-text-primary)] font-medium truncate uppercase tracking-wide">
                {workspaceName}
              </span>
            </div>
          )}
          
          {/* File tree content - fills remaining space */}
          <div className="flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
            <FileTree 
              workspacePath={workspacePath} 
              collapsed={collapsed}
              onFileOpen={handleFileOpen}
            />
          </div>
        </div>
      )}
    </div>
  );
};
