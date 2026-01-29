/**
 * EditorStatusBar Component
 * 
 * Status bar showing file info, cursor position, and editor settings.
 * Includes revert button for modified files.
 */

import React, { memo } from 'react';
import { FileCode, AlertCircle, CheckCircle, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getLanguageDisplayName } from '../utils/languageUtils';
import type { EditorTab, EditorSettings } from '../types';

interface EditorStatusBarProps {
  tab: EditorTab | null;
  settings: EditorSettings;
  onSettingsClick: () => void;
  onRevertClick?: () => void;
  isLoading?: boolean;
  className?: string;
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = memo(({
  tab,
  settings,
  onSettingsClick,
  onRevertClick,
  isLoading = false,
  className,
}) => {
  if (!tab) {
    return (
      <div className={cn(
        'flex items-center justify-between h-[22px] px-3 bg-[var(--color-surface-header)] border-t border-[var(--color-border-subtle)]',
        'text-[10px] font-mono text-[var(--color-text-muted)]',
        className
      )}>
        <span>No file open</span>
      </div>
    );
  }
  
  const languageName = getLanguageDisplayName(tab.language);
  const lineCount = tab.content.split('\n').length;
  const charCount = tab.content.length;
  
  return (
    <div className={cn(
      'flex items-center justify-between h-[22px] px-3 bg-[var(--color-surface-header)] border-t border-[var(--color-border-subtle)]',
      'text-[10px] font-mono',
      className
    )}>
      {/* Left side */}
      <div className="flex items-center gap-3">
        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-1 text-[var(--color-accent-primary)]">
            <Loader2 size={10} className="animate-spin" />
            <span>Loading...</span>
          </div>
        )}
        
        {/* File status */}
        <div className="flex items-center gap-1">
          {tab.isDirty ? (
            <>
              <AlertCircle size={10} className="text-[var(--color-warning)]" />
              <span className="text-[var(--color-warning)]">Modified</span>
              {/* Revert button */}
              {onRevertClick && (
                <button
                  onClick={onRevertClick}
                  className="ml-1 p-0.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  title="Revert changes (Ctrl+Shift+Z)"
                >
                  <RotateCcw size={10} />
                </button>
              )}
            </>
          ) : (
            <>
              <CheckCircle size={10} className="text-[var(--color-success)]" />
              <span className="text-[var(--color-text-muted)]">Saved</span>
            </>
          )}
        </div>
        
        {/* Cursor position */}
        {tab.cursorPosition && (
          <span className="text-[var(--color-text-muted)]">
            Ln {tab.cursorPosition.lineNumber}, Col {tab.cursorPosition.column}
          </span>
        )}
        
        {/* Line count */}
        <span className="text-[var(--color-text-muted)]">
          {lineCount} lines
        </span>
        
        {/* Character count */}
        <span className="text-[var(--color-text-muted)]">
          {charCount.toLocaleString()} chars
        </span>
      </div>
      
      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Encoding */}
        <span className="text-[var(--color-text-muted)]">UTF-8</span>
        
        {/* Line ending */}
        <span className="text-[var(--color-text-muted)]">LF</span>
        
        {/* Tab size */}
        <button
          onClick={onSettingsClick}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          title="Editor settings"
        >
          {settings.insertSpaces ? 'Spaces' : 'Tabs'}: {settings.tabSize}
        </button>
        
        {/* Language */}
        <button
          onClick={onSettingsClick}
          className="flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          title="Change language mode"
        >
          <FileCode size={10} />
          <span>{languageName}</span>
        </button>
      </div>
    </div>
  );
});

EditorStatusBar.displayName = 'EditorStatusBar';
