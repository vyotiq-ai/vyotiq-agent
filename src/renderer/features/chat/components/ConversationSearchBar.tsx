/**
 * ConversationSearchBar Component
 * 
 * A compact search bar for filtering and navigating through chat messages.
 * Shows match count and navigation controls when search is active.
 */

import React, { memo, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../../utils/cn';
import { useHotkey } from '../../../hooks/useKeyboard';

interface ConversationSearchBarProps {
  /** Current search query */
  searchQuery: string;
  /** Update search query */
  onSearchChange: (query: string) => void;
  /** Number of matches found */
  matchCount: number;
  /** Current match index (0-based) */
  currentMatchIndex: number;
  /** Whether search is active (has matches) */
  isSearchActive: boolean;
  /** Navigate to next match */
  onNextMatch: () => void;
  /** Navigate to previous match */
  onPrevMatch: () => void;
  /** Clear search and close */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
}

const ConversationSearchBarComponent: React.FC<ConversationSearchBarProps> = ({
  searchQuery,
  onSearchChange,
  matchCount,
  currentMatchIndex,
  isSearchActive,
  onNextMatch,
  onPrevMatch,
  onClose,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrevMatch();
      } else {
        onNextMatch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onNextMatch, onPrevMatch, onClose]);

  // Keyboard shortcut: Ctrl/Cmd+F to focus search
  useHotkey('ctrl+f', () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1',
        'bg-[var(--color-surface-base)] border-b border-[var(--color-border-subtle)]/40',
        className
      )}
    >
      {/* Search Icon */}
      <svg
        className="w-4 h-4 text-[var(--color-text-muted)] shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>

      {/* Search Input */}
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search messages..."
        className={cn(
          'flex-1 min-w-0 bg-transparent',
          'text-[10px] text-[var(--color-text-primary)]',
          'placeholder:text-[var(--color-text-muted)]',
          'focus:outline-none',
          'font-mono'
        )}
        aria-label="Search messages"
      />

      {/* Match Count & Navigation */}
      {searchQuery.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Match Count */}
          <span className="text-[10px] text-[var(--color-text-muted)] font-mono tabular-nums">
            {isSearchActive ? (
              matchCount > 0 ? (
                `${currentMatchIndex + 1}/${matchCount}`
              ) : (
                'No matches'
              )
            ) : (
              '...'
            )}
          </span>

          {/* Navigation Buttons */}
          {matchCount > 0 && (
            <>
              <button
                onClick={onPrevMatch}
                className={cn(
                  'p-1 rounded',
                  'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                  'hover:bg-[var(--color-surface-3)]',
                  'transition-colors'
                )}
                title="Previous match (Shift+Enter)"
                aria-label="Previous match"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={onNextMatch}
                className={cn(
                  'p-1 rounded',
                  'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                  'hover:bg-[var(--color-surface-3)]',
                  'transition-colors'
                )}
                title="Next match (Enter)"
                aria-label="Next match"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}

      {/* Close Button */}
      <button
        onClick={onClose}
        className={cn(
          'p-1 rounded shrink-0',
          'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
          'hover:bg-[var(--color-surface-3)]',
          'transition-colors'
        )}
        title="Close search (Escape)"
        aria-label="Close search"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export const ConversationSearchBar = memo(ConversationSearchBarComponent);
ConversationSearchBar.displayName = 'ConversationSearchBar';
export default ConversationSearchBar;
