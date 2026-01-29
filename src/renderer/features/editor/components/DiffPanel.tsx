/**
 * DiffPanel Component
 * 
 * Floating panel for displaying diffs with keyboard shortcuts.
 */

import React, { memo, useEffect } from 'react';
import { X, Maximize2, Minimize2, GitCompare } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { DiffViewer, type DiffViewMode } from './DiffViewer';
import type { EditorSettings } from '../types';

export interface DiffPanelProps {
  isOpen: boolean;
  original: string;
  modified: string;
  language?: string;
  originalLabel?: string;
  modifiedLabel?: string;
  settings?: Partial<EditorSettings>;
  viewMode?: DiffViewMode;
  onClose: () => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
  position?: 'bottom' | 'right' | 'floating';
  initialHeight?: number;
  className?: string;
}

export const DiffPanel: React.FC<DiffPanelProps> = memo(({
  isOpen,
  original,
  modified,
  language = 'plaintext',
  originalLabel = 'Original',
  modifiedLabel = 'Modified',
  settings,
  viewMode = 'split',
  onClose,
  onAcceptAll,
  onRejectAll,
  position = 'bottom',
  initialHeight = 350,
  className,
}) => {
  const [isMaximized, setIsMaximized] = React.useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.ctrlKey && e.key === 'Enter' && onAcceptAll) {
        e.preventDefault();
        onAcceptAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onAcceptAll]);

  if (!isOpen) return null;

  const hasChanges = original !== modified;

  const positionStyles = {
    bottom: cn(
      'fixed bottom-0 left-0 right-0 z-50',
      'border-t border-[var(--color-border-subtle)]',
      isMaximized && 'top-0'
    ),
    right: cn(
      'fixed top-0 right-0 bottom-0 z-50',
      'border-l border-[var(--color-border-subtle)]',
      isMaximized && 'left-0'
    ),
    floating: cn(
      'fixed z-50 rounded-lg shadow-2xl',
      'border border-[var(--color-border-subtle)]',
      isMaximized ? 'inset-4' : 'bottom-4 right-4'
    ),
  };

  return (
    <div
      className={cn(
        'flex flex-col bg-[var(--color-surface-base)]',
        'animate-in fade-in-0 slide-in-from-bottom-4 duration-200',
        positionStyles[position],
        className
      )}
      style={isMaximized ? {} : { height: initialHeight }}
    >
      {/* Header - modern, refined gradient styling */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-border-subtle)]/30 bg-gradient-to-r from-[var(--color-surface-header)]/70 via-[var(--color-surface-1)]/50 to-[var(--color-surface-1)]/40">
        <div className="flex items-center gap-2.5">
          <GitCompare size={14} className="text-[#61afef]" />
          <span className="text-[11px] font-medium text-[var(--color-text-primary)]">
            Diff Viewer
          </span>
          {!hasChanges && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-surface-2)]/60 text-[var(--color-text-muted)] ring-1 ring-inset ring-[var(--color-border-subtle)]/20">
              No changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/60 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30"
            title={isMaximized ? 'Restore' : 'Maximize'}
            aria-label={isMaximized ? 'Restore panel size' : 'Maximize panel'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[#e06c75] hover:bg-[#e06c75]/10 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#e06c75]/30"
            title="Close (Esc)"
            aria-label="Close diff panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <DiffViewer
          original={original}
          modified={modified}
          language={language}
          originalLabel={originalLabel}
          modifiedLabel={modifiedLabel}
          settings={settings}
          viewMode={viewMode}
          onAcceptAll={onAcceptAll}
          onRejectAll={onRejectAll}
          height="100%"
        />
      </div>

      {/* Footer hints - refined pill styling */}
      <div className="flex items-center justify-end gap-2.5 px-3 py-2 border-t border-[var(--color-border-subtle)]/20 bg-gradient-to-r from-[var(--color-surface-1)]/30 to-[var(--color-surface-1)]/20">
        <span className="text-[9px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-[var(--color-surface-2)]/40 text-[var(--color-text-dim)]/80 ring-1 ring-inset ring-[var(--color-border-subtle)]/15">
          Esc to close
        </span>
        {onAcceptAll && hasChanges && (
          <span className="text-[9px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-[#98c379]/10 text-[#98c379]/80 ring-1 ring-inset ring-[#98c379]/15">
            Ctrl+Enter to accept
          </span>
        )}
      </div>
    </div>
  );
});

DiffPanel.displayName = 'DiffPanel';
