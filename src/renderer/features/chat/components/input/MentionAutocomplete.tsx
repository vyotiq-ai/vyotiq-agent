/**
 * Mention Autocomplete Component
 * 
 * Dropdown UI for @file mention suggestions with keyboard navigation.
 * Displays file suggestions from the workspace with loading and empty states.
 * 
 * @example
 * <MentionAutocomplete
 *   suggestions={suggestions}
 *   selectedIndex={0}
 *   onSelect={handleSelect}
 *   visible={true}
 * />
 */
import React, { memo, useRef, useEffect } from 'react';
import { File, FolderOpen, Code2, Loader2, SearchX } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { MentionItem } from '../../hooks/useMentions';

// =============================================================================
// Types
// =============================================================================

export interface MentionAutocompleteProps {
  /** List of suggestions to display */
  suggestions: MentionItem[];
  /** Currently selected index */
  selectedIndex: number;
  /** Callback when a suggestion is selected */
  onSelect: (item: MentionItem) => void;
  /** Callback when selection index changes */
  onSelectionChange?: (index: number) => void;
  /** Whether the autocomplete is visible */
  visible: boolean;
  /** Position relative to input */
  position?: { top: number; left: number };
  /** Additional className */
  className?: string;
  /** Whether files are still loading */
  isLoading?: boolean;
  /** Whether search returned no results */
  noResults?: boolean;
}

// =============================================================================
// Icon Component
// =============================================================================

const MentionIcon: React.FC<{ type: MentionItem['icon'] }> = memo(({ type }) => {
  const iconProps = { size: 12, className: 'flex-shrink-0' };
  
  switch (type) {
    case 'file':
      return <File {...iconProps} className={cn(iconProps.className, 'text-[var(--color-accent-primary)]')} />;
    case 'folder':
      return <FolderOpen {...iconProps} className={cn(iconProps.className, 'text-[var(--color-warning)]')} />;
    case 'code':
      return <Code2 {...iconProps} className={cn(iconProps.className, 'text-[var(--color-success)]')} />;
    default:
      return <File {...iconProps} className={cn(iconProps.className, 'text-[var(--color-text-muted)]')} />;
  }
});
MentionIcon.displayName = 'MentionIcon';

// =============================================================================
// Suggestion Item Component
// =============================================================================

interface SuggestionItemProps {
  item: MentionItem;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

const SuggestionItem: React.FC<SuggestionItemProps> = memo(({
  item,
  isSelected,
  onClick,
  onMouseEnter,
}) => {
  const itemRef = useRef<HTMLButtonElement>(null);

  // Scroll into view when selected
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  return (
    <button
      ref={itemRef}
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 text-left',
        'font-mono text-[11px]',
        'transition-colors duration-100',
        'focus:outline-none',
        isSelected
          ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]'
      )}
      role="option"
      aria-selected={isSelected}
    >
      <MentionIcon type={item.icon} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className={cn(
            'font-medium',
            isSelected ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-primary)]'
          )}>
            {item.label}
          </span>
          
          {item.type === 'file' && item.filePath && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
              file
            </span>
          )}
        </div>
        
        {item.description && (
          <div className="text-[9px] text-[var(--color-text-muted)] truncate">
            {item.description}
          </div>
        )}
      </div>

      {isSelected && (
        <span className="text-[9px] text-[var(--color-text-muted)] flex-shrink-0">
          ↵
        </span>
      )}
    </button>
  );
});
SuggestionItem.displayName = 'SuggestionItem';

// =============================================================================
// Main Component
// =============================================================================

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = memo(({
  suggestions,
  selectedIndex,
  onSelect,
  onSelectionChange,
  visible,
  position,
  className,
  isLoading = false,
  noResults = false,
}) => {
  // Show if visible AND (has suggestions OR is loading OR has no results)
  const shouldShow = visible && (suggestions.length > 0 || isLoading || noResults);
  if (!shouldShow) return null;

  return (
    <div
      className={cn(
        'absolute z-[100]',
        'min-w-[280px] max-w-[400px] max-h-[240px]',
        'overflow-y-auto overflow-x-hidden',
        'bg-[var(--color-surface-editor)] border border-[var(--color-border)]',
        'rounded-md shadow-xl',
        'font-mono',
        'animate-in fade-in slide-in-from-bottom-2 duration-150',
        className
      )}
      style={{
        bottom: 'calc(100% + 8px)',
        left: position?.left ?? 0,
      }}
      role="listbox"
      aria-label="File suggestions"
    >
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex items-center justify-between">
        <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">
          @file - search workspace
        </span>
        {isLoading && (
          <Loader2 size={10} className="text-[var(--color-accent-primary)] animate-spin" />
        )}
      </div>

      {/* Loading state */}
      {isLoading && suggestions.length === 0 && (
        <div className="px-3 py-4 flex items-center justify-center gap-2 text-[var(--color-text-muted)]">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[10px]">Loading workspace files...</span>
        </div>
      )}

      {/* No results state */}
      {noResults && !isLoading && (
        <div className="px-3 py-4 flex flex-col items-center justify-center gap-1 text-[var(--color-text-muted)]">
          <SearchX size={18} className="opacity-50" />
          <span className="text-[10px]">No matching files found</span>
          <span className="text-[9px] opacity-70">Try a different search term</span>
        </div>
      )}

      {/* Suggestions list */}
      {suggestions.length > 0 && (
        <div className="py-1">
          {suggestions.map((item, index) => (
            <SuggestionItem
              key={item.id}
              item={item}
              isSelected={index === selectedIndex}
              onClick={() => onSelect(item)}
              onMouseEnter={() => onSelectionChange?.(index)}
            />
          ))}
        </div>
      )}

      {/* Footer hint */}
      {suggestions.length > 0 && (
        <div className="px-2 py-1 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
          <div className="flex items-center justify-between text-[8px] text-[var(--color-text-muted)]">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc dismiss</span>
          </div>
        </div>
      )}
    </div>
  );
});

MentionAutocomplete.displayName = 'MentionAutocomplete';
