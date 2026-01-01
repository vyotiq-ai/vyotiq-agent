/**
 * Mention Autocomplete Component
 * 
 * Terminal-styled dropdown for @file mention suggestions with keyboard navigation.
 * Features CLI aesthetic with monospace fonts, subtle borders, and smooth animations.
 */
import React, { memo, useRef, useEffect } from 'react';
import { File, FolderOpen, Code2, Loader2 } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { MentionItem } from '../../hooks/useMentions';

// =============================================================================
// Types
// =============================================================================

export interface MentionAutocompleteProps {
  suggestions: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
  onSelectionChange?: (index: number) => void;
  visible: boolean;
  position?: { top: number; left: number };
  className?: string;
  isLoading?: boolean;
  noResults?: boolean;
  searchQuery?: string;
  totalFiles?: number;
}

// =============================================================================
// Icon Component
// =============================================================================

const FileIcon: React.FC<{ type: MentionItem['icon']; isSelected: boolean }> = memo(({ type, isSelected }) => {
  const baseClass = cn(
    'flex-shrink-0 transition-colors duration-100',
    isSelected ? 'opacity-100' : 'opacity-70'
  );
  
  switch (type) {
    case 'folder':
      return <FolderOpen size={11} className={cn(baseClass, 'text-[var(--color-warning)]')} />;
    case 'code':
      return <Code2 size={11} className={cn(baseClass, 'text-[var(--color-info)]')} />;
    default:
      return <File size={11} className={cn(baseClass, 'text-[var(--color-accent-primary)]')} />;
  }
});
FileIcon.displayName = 'FileIcon';

// =============================================================================
// Suggestion Item Component
// =============================================================================

interface SuggestionItemProps {
  item: MentionItem;
  isSelected: boolean;
  index: number;
  onClick: () => void;
  onMouseEnter: () => void;
}

const SuggestionItem: React.FC<SuggestionItemProps> = memo(({
  item,
  isSelected,
  index,
  onClick,
  onMouseEnter,
}) => {
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  // Get file extension for badge
  const ext = item.label.includes('.') ? item.label.split('.').pop()?.toLowerCase() : null;
  const isFolder = item.icon === 'folder';

  return (
    <button
      ref={itemRef}
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'group w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left',
        'font-mono text-[10px] leading-tight',
        'transition-all duration-75',
        'focus:outline-none',
        'border-l-2',
        isSelected
          ? 'bg-[var(--color-accent-primary)]/10 border-l-[var(--color-accent-primary)]'
          : 'border-l-transparent hover:bg-[var(--color-surface-3)] hover:border-l-[var(--color-border-strong)]'
      )}
      role="option"
      aria-selected={isSelected}
    >
      {/* Index number (vim-style) */}
      <span className={cn(
        'w-4 text-[8px] tabular-nums text-right flex-shrink-0',
        isSelected ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)] opacity-50'
      )}>
        {index + 1}
      </span>

      {/* Icon */}
      <FileIcon type={item.icon} isSelected={isSelected} />
      
      {/* File info */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {/* Filename */}
        <span className={cn(
          'font-medium truncate',
          isSelected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'
        )}>
          {item.label}
        </span>
        
        {/* Extension badge */}
        {ext && !isFolder && (
          <span className={cn(
            'flex-shrink-0 px-1 py-px rounded text-[7px] uppercase tracking-wider',
            isSelected 
              ? 'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]'
              : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]'
          )}>
            {ext}
          </span>
        )}
        
        {/* Folder indicator */}
        {isFolder && (
          <span className={cn(
            'flex-shrink-0 px-1 py-px rounded text-[7px] uppercase tracking-wider',
            'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
          )}>
            dir
          </span>
        )}
      </div>

      {/* Path (truncated from left) */}
      {item.description && item.description !== item.label && (
        <span className={cn(
          'flex-shrink-0 max-w-[120px] text-[8px] truncate direction-rtl text-left',
          isSelected ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-dim)] opacity-60'
        )}>
          {item.description}
        </span>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <span className="flex-shrink-0 text-[8px] text-[var(--color-accent-primary)] opacity-70">
          ⏎
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
  searchQuery = '',
  totalFiles = 0,
}) => {
  const shouldShow = visible && (suggestions.length > 0 || isLoading || noResults);
  if (!shouldShow) return null;

  return (
    <div
      className={cn(
        'absolute z-[100]',
        'min-w-[320px] max-w-[450px] max-h-[280px]',
        'overflow-hidden',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-default)]',
        'rounded-lg shadow-lg',
        'font-mono',
        'animate-in fade-in slide-in-from-bottom-2 duration-150',
        className
      )}
      style={{
        bottom: 'calc(100% + 6px)',
        left: position?.left ?? 0,
      }}
      role="listbox"
      aria-label="File suggestions"
    >
      {/* Terminal-style header */}
      <div className="px-2.5 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Terminal dots */}
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[var(--color-error)] opacity-70" />
            <span className="w-2 h-2 rounded-full bg-[var(--color-warning)] opacity-70" />
            <span className="w-2 h-2 rounded-full bg-[var(--color-success)] opacity-70" />
          </div>
          
          {/* Title */}
          <span className="text-[9px] text-[var(--color-text-muted)] tracking-wide">
            {searchQuery ? (
              <>
                <span className="text-[var(--color-accent-primary)]">grep</span>
                <span className="opacity-50"> &quot;{searchQuery}&quot; </span>
                <span className="text-[var(--color-text-dim)]">· {suggestions.length} found</span>
              </>
            ) : (
              <>
                <span className="text-[var(--color-accent-primary)]">ls</span>
                <span className="opacity-50"> workspace </span>
                <span className="text-[var(--color-text-dim)]">· {totalFiles} files</span>
              </>
            )}
          </span>
        </div>
        
        {isLoading && (
          <Loader2 size={10} className="text-[var(--color-accent-primary)] animate-spin" />
        )}
      </div>

      {/* Loading state */}
      {isLoading && suggestions.length === 0 && (
        <div className="px-3 py-6 flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
          <Loader2 size={16} className="animate-spin text-[var(--color-accent-primary)]" />
          <span className="text-[9px]">scanning workspace...</span>
        </div>
      )}

      {/* No results state */}
      {noResults && !isLoading && (
        <div className="px-3 py-6 flex flex-col items-center justify-center gap-1.5 text-[var(--color-text-muted)]">
          <span className="text-[11px] text-[var(--color-error)]">no matches</span>
          <span className="text-[9px] opacity-60">try a different query</span>
        </div>
      )}

      {/* Suggestions list */}
      {suggestions.length > 0 && (
        <div className="overflow-y-auto max-h-[200px] py-1 scrollbar-thin">
          {suggestions.map((item, index) => (
            <SuggestionItem
              key={item.id}
              item={item}
              index={index}
              isSelected={index === selectedIndex}
              onClick={() => onSelect(item)}
              onMouseEnter={() => onSelectionChange?.(index)}
            />
          ))}
        </div>
      )}

      {/* Footer with keyboard hints */}
      {suggestions.length > 0 && (
        <div className="px-2.5 py-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
          <div className="flex items-center justify-between text-[8px] text-[var(--color-text-dim)]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">↑</kbd>
                <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">↓</kbd>
                <span className="opacity-70">nav</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">⏎</kbd>
                <span className="opacity-70">select</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">esc</kbd>
                <span className="opacity-70">close</span>
              </span>
            </div>
            <span className="tabular-nums opacity-50">
              {selectedIndex + 1}/{suggestions.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

MentionAutocomplete.displayName = 'MentionAutocomplete';
