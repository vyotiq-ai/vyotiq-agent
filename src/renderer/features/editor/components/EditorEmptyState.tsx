/**
 * EditorEmptyState Component
 * 
 * Shown when no files are open in the editor.
 */

import React, { memo } from 'react';
import { FileCode, FolderOpen, Command } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface EditorEmptyStateProps {
  onOpenFile?: () => void;
  className?: string;
}

export const EditorEmptyState: React.FC<EditorEmptyStateProps> = memo(({
  onOpenFile,
  className,
}) => {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';
  
  return (
    <div className={cn(
      'flex flex-col items-center justify-center h-full bg-[var(--color-surface-base)]',
      className
    )}>
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        {/* Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] flex items-center justify-center">
            <FileCode size={32} className="text-[var(--color-text-muted)]" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-[var(--color-accent-primary)]/10 border border-[var(--color-accent-primary)]/20 flex items-center justify-center">
            <Command size={14} className="text-[var(--color-accent-primary)]" />
          </div>
        </div>
        
        {/* Title */}
        <div>
          <h3 className="text-xs font-medium text-[var(--color-text-primary)] mb-2">
            No file open
          </h3>
          <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            Select a file from the explorer to start editing, or use the keyboard shortcuts below.
          </p>
        </div>
        
        {/* Shortcuts */}
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={onOpenFile}
            className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-lg hover:bg-[var(--color-surface-2)] transition-colors w-full text-left"
          >
            <div className="flex items-center gap-2">
              <FolderOpen size={14} className="text-[var(--color-text-muted)]" />
              <span className="text-[11px] text-[var(--color-text-secondary)]">Open file from explorer</span>
            </div>
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono">Click file</span>
          </button>
          
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-lg">
            <div className="flex items-center gap-2">
              <Command size={14} className="text-[var(--color-text-muted)]" />
              <span className="text-[11px] text-[var(--color-text-secondary)]">Quick open file</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-muted)]">
              {modKey}+P
            </kbd>
          </div>
          
          <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-lg">
            <div className="flex items-center gap-2">
              <Command size={14} className="text-[var(--color-text-muted)]" />
              <span className="text-[11px] text-[var(--color-text-secondary)]">Command palette</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-muted)]">
              {modKey}+K
            </kbd>
          </div>
        </div>
        
        {/* Recent files hint */}
        <p className="text-[10px] text-[var(--color-text-dim)]">
          Recently opened files will appear in tabs above
        </p>
      </div>
    </div>
  );
});

EditorEmptyState.displayName = 'EditorEmptyState';
