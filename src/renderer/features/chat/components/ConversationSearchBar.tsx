/**
 * ConversationSearchBar Component
 * 
 * A compact search bar for finding messages within the current conversation.
 * Integrates with the useConversationSearch hook for debounced filtering,
 * match navigation (prev/next), and match count display.
 */
import React, { memo, useRef, useEffect, useCallback } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ConversationSearchResult } from '../../../hooks/useConversationSearch';

interface ConversationSearchBarProps {
  /** Search state from useConversationSearch hook */
  search: ConversationSearchResult;
  /** Callback when the search bar should close */
  onClose: () => void;
  /** Additional CSS class */
  className?: string;
}

const ConversationSearchBarInternal: React.FC<ConversationSearchBarProps> = ({
  search,
  onClose,
  className,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      search.clearSearch();
      onClose();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        search.goToPrevMatch();
      } else {
        search.goToNextMatch();
      }
    }
  }, [search, onClose]);

  const handleClear = useCallback(() => {
    search.clearSearch();
    inputRef.current?.focus();
  }, [search]);

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1',
        'bg-[var(--color-surface-1)] border-b border-[var(--color-border-subtle)]',
        'font-mono text-[10px]',
        className,
      )}
    >
      <Search size={11} className="shrink-0 text-[var(--color-text-muted)]" />

      <input
        ref={inputRef}
        type="text"
        value={search.searchQuery}
        onChange={e => search.setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="search messages..."
        className={cn(
          'flex-1 bg-transparent outline-none text-[10px]',
          'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
          'min-w-[100px]',
        )}
        spellCheck={false}
      />

      {/* Match counter */}
      {search.isSearchActive && (
        <span className="text-[9px] tabular-nums text-[var(--color-text-muted)] shrink-0">
          {search.matchCount > 0
            ? `${search.currentMatchIndex + 1}/${search.matchCount}`
            : 'no matches'
          }
        </span>
      )}

      {/* Navigation buttons */}
      {search.matchCount > 0 && (
        <>
          <button
            type="button"
            onClick={search.goToPrevMatch}
            className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Previous match"
          >
            <ChevronUp size={11} />
          </button>
          <button
            type="button"
            onClick={search.goToNextMatch}
            className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Next match"
          >
            <ChevronDown size={11} />
          </button>
        </>
      )}

      {/* Clear/Close */}
      {search.searchQuery ? (
        <button
          type="button"
          onClick={handleClear}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label="Clear search"
        >
          <X size={11} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label="Close search"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
};

export const ConversationSearchBar = memo(ConversationSearchBarInternal);
ConversationSearchBar.displayName = 'ConversationSearchBar';
