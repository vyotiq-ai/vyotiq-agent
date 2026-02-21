/**
 * SidebarFileTree Component
 * 
 * File tree section for the sidebar with collapsible header.
 * Follows the existing sidebar section pattern with VS Code-like features.
 * Now integrates with the Rust backend for workspace indexing status.
 */

import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { SectionHeader } from '../../../components/layout/sidebar/SectionHeader';
import { FileTree } from './FileTree';
import { useWorkspaceState } from '../../../state/WorkspaceProvider';
import { cn } from '../../../utils/cn';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('SidebarFileTree');

interface SidebarFileTreeProps {
  collapsed: boolean;
  onFileOpen?: (path: string) => void;
}

export const SidebarFileTree: React.FC<SidebarFileTreeProps> = ({ collapsed, onFileOpen }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  // Use workspace state from the context provider (no duplicate IPC loading)
  const wsState = useWorkspaceState();
  const workspacePath = wsState?.workspacePath ?? null;
  // Show loading only briefly while WorkspaceProvider initializes
  const isLoading = wsState === undefined;

  const workspaceName = workspacePath?.split(/[/\\]/).pop() || 'Workspace';
  
  // Handle opening a workspace folder
  const handleSelectFolder = useCallback(async () => {
    try {
      // WorkspaceProvider will automatically update workspacePath via its subscription
      await window.vyotiq.workspace.selectFolder();
    } catch (err) {
      logger.error('Failed to select workspace folder', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);
  
  // Handle closing (removing) the workspace folder from the explorer
  const handleCloseFolder = useCallback(async () => {
    try {
      // WorkspaceProvider will automatically clear workspacePath via its subscription
      await window.vyotiq.workspace.close();
    } catch (err) {
      logger.error('Failed to close workspace folder', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // Handle file open
  const handleFileOpen = useCallback((path: string) => {
    if (onFileOpen) {
      onFileOpen(path);
    }
  }, [onFileOpen]);
  
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
          {/* Workspace header with indexing status */}
          {workspacePath && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[9px] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/30 shrink-0 group/ws-header font-mono">
              <span className="text-[var(--color-accent-primary)] opacity-60 shrink-0">λ</span>
              <span className="text-[var(--color-text-secondary)] font-medium truncate uppercase tracking-wider flex-1">
                {workspaceName}
              </span>

              {/* Close folder button */}
              <button
                onClick={handleCloseFolder}
                className="shrink-0 p-0.5 rounded-sm opacity-0 group-hover/ws-header:opacity-100 transition-opacity text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]"
                title="Close folder"
              >
                <X size={10} />
              </button>
            </div>
          )}
          
          {/* No workspace selected — terminal prompt style */}
          {!workspacePath && !isLoading && (
            <div className="flex flex-col gap-2 px-3 py-6 font-mono">
              <div className="text-[10px] text-[var(--color-text-dim)] leading-relaxed">
                no folder opened
              </div>
              <button
                onClick={handleSelectFolder}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] rounded-sm',
                  'bg-[var(--color-accent-primary)]/8 border border-[var(--color-accent-primary)]/20',
                  'text-[var(--color-accent-primary)]',
                  'hover:bg-[var(--color-accent-primary)]/15 hover:border-[var(--color-accent-primary)]/40',
                  'transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              >
                <span className="opacity-60">λ</span>
                <span>open folder</span>
              </button>
            </div>
          )}

          {/* Loading state — terminal style */}
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-6 font-mono">
              <span className="text-[var(--color-accent-primary)] text-[10px] opacity-50">λ</span>
              <span className="text-[9px] text-[var(--color-text-dim)]">loading</span>
            </div>
          )}
          
          {/* File tree content - fills remaining space */}
          {workspacePath && (
            <div className="flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
              <FileTree 
                workspacePath={workspacePath} 
                collapsed={collapsed}
                onFileOpen={handleFileOpen}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
