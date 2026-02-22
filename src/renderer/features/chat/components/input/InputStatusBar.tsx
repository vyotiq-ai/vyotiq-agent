/**
 * Input Status Bar Component
 * 
 * Bottom status bar with line/char count, attachment info, and keyboard hints.
 * Terminal-style vim-like status display.
 * 
 * @example
 * <InputStatusBar
 *   lineCount={3}
 *   charCount={156}
 *   attachmentCount={2}
 *   showKeyboardHints={true}
 * />
 */
import React, { memo } from 'react';
import { cn } from '../../../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export interface InputStatusBarProps {
  /** Optional DOM id (for aria-describedby) */
  id?: string;
  /** Number of lines in message */
  lineCount: number;
  /** Number of characters in message */
  charCount: number;
  /** Number of attachments */
  attachmentCount: number;
  /** Whether to show keyboard hints */
  showKeyboardHints?: boolean;
  /** Whether message has content */
  hasContent: boolean;
  /** Custom className */
  className?: string;
  /** Custom left content slot */
  leftContent?: React.ReactNode;
  /** Custom right content slot */
  rightContent?: React.ReactNode;
}

// =============================================================================
// Sub-Components
// =============================================================================

/** Attachment count badge */
const AttachmentBadge: React.FC<{ count: number }> = memo(({ count }) => {
  if (count === 0) return null;
  
  return (
    <span 
      className="text-[9px] text-[var(--color-accent-secondary)]"
      aria-label={`${count} file${count > 1 ? 's' : ''} attached`}
    >
      {count} file{count > 1 ? 's' : ''}
    </span>
  );
});
AttachmentBadge.displayName = 'AttachmentBadge';

/** Line and character count (vim-style) */
const LineCharInfo: React.FC<{ lines: number; chars: number }> = memo(({ lines, chars }) => (
  <span className="terminal-line-info hidden sm:flex" aria-label={`${lines} lines, ${chars} characters`}>
    <span>{lines}L</span>
    <span className="opacity-50">:</span>
    <span>{chars}C</span>
  </span>
));
LineCharInfo.displayName = 'LineCharInfo';

/** Keyboard shortcut hints */
const KeyboardHints: React.FC = memo(() => (
  <div 
    className="hidden md:flex items-center gap-2 text-[9px] text-[var(--color-text-secondary)] whitespace-nowrap"
    aria-label="Keyboard shortcuts"
  >
    <span title="Press Enter to run">⏎ run</span>
    <span title="Press Shift+Enter for new line">⇧⏎ newline</span>
    <span title="Paste images or files">Ctrl/⌘V paste</span>
  </div>
));
KeyboardHints.displayName = 'KeyboardHints';

// =============================================================================
// Main Component
// =============================================================================

export const InputStatusBar: React.FC<InputStatusBarProps> = memo(({
  id,
  lineCount,
  charCount,
  attachmentCount,
  showKeyboardHints = true,
  hasContent,
  className,
  leftContent,
  rightContent,
}) => {
  return (
    <div 
      id={id}
      className={cn(
        'flex items-center justify-between',
        'px-2.5 py-1',
        'bg-[var(--color-surface-1)]/30',
        'border-t border-[var(--color-border-subtle)]/30',
        'text-[9px] font-mono text-[var(--color-text-secondary)]',
        'transition-colors duration-200',
        'overflow-hidden',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Left side - custom content or toolbar */}
      <div className="flex items-center gap-3 flex-1 min-w-0 truncate">
        {leftContent}
      </div>
      
      {/* Right side - info and hints */}
      <div className="flex items-center gap-2.5 flex-shrink-0 ml-3 whitespace-nowrap">
        {rightContent}
        
        {/* Attachment count */}
        <AttachmentBadge count={attachmentCount} />
        
        {/* Line/char info when there's content */}
        {hasContent && <LineCharInfo lines={lineCount} chars={charCount} />}
        
        {/* Keyboard hints */}
        {showKeyboardHints && <KeyboardHints />}
      </div>
    </div>
  );
});

InputStatusBar.displayName = 'InputStatusBar';
