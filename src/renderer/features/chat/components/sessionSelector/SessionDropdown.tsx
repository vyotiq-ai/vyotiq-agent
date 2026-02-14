/**
 * Session Dropdown Component
 * 
 * Dropdown panel for the session selector showing grouped sessions,
 * search input, and session management actions.
 */
import React, { memo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, MessageSquare, RefreshCw, Search, Filter } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Spinner } from '../../../../components/ui/LoadingState';
import { SessionOption } from './SessionOption';
import type { SessionDropdownProps, SessionViewMode } from './types';
import { getSessionStats } from './utils';

// =============================================================================
// Sub-Components
// =============================================================================

/** Search input for filtering sessions */
const SearchInput = memo<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}>(function SearchInput({ value, onChange, placeholder = 'search sessions...' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Focus input when mounted
  useEffect(() => {
    // Small delay to allow dropdown animation
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <div className="relative">
      <Search 
        size={10} 
        className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" 
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full pl-6 pr-2 py-1 text-[9px] font-mono",
          "bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)]",
          "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]",
          "focus:outline-none focus:border-[var(--color-accent-primary)]/40",
          "transition-colors duration-75"
        )}
        aria-label="Search sessions"
      />
    </div>
  );
});

/** View mode toggle buttons */
const ViewModeToggle = memo<{
  mode: SessionViewMode;
  onChange: (mode: SessionViewMode) => void;
  runningCount: number;
}>(function ViewModeToggle({ mode, onChange, runningCount }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-[var(--color-surface-base)] rounded-sm">
      <button
        type="button"
        onClick={() => onChange('workspace')}
        className={cn(
          "px-1.5 py-0.5 text-[8px] font-mono rounded-sm transition-colors",
          mode === 'workspace'
            ? "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
            : "text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]"
        )}
        title="Show sessions for current workspace"
      >
        current
      </button>
      {runningCount > 0 && (
        <button
          type="button"
          onClick={() => onChange('running')}
          className={cn(
            "px-1.5 py-0.5 text-[8px] font-mono rounded-sm transition-colors flex items-center gap-1",
            mode === 'running'
              ? "bg-[var(--color-success)]/10 text-[var(--color-success)]"
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]"
          )}
          title="Show running sessions"
        >
          {mode === 'running' ? (
            <Spinner size="sm" colorVariant="success" className="w-2 h-2" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-[var(--color-text-dim)]/30" />
          )}
          {runningCount}
        </button>
      )}
    </div>
  );
});

/** Session group header */
const GroupHeader = memo<{
  label: string;
  count: number;
}>(function GroupHeader({ label, count }) {
  return (
    <div className={cn(
      "px-2 py-0.5 text-[8px] uppercase tracking-wide select-none",
      "sticky top-0 z-10",
      "bg-[var(--color-surface-editor)]/95 backdrop-blur-sm",
      "text-[var(--color-text-dim)] border-b border-[var(--color-border-subtle)]/30",
      "flex items-center justify-between"
    )}>
      <span>{label}</span>
      <span className="text-[var(--color-text-placeholder)]">{count}</span>
    </div>
  );
});

/** Empty state when no sessions */
const EmptyState = memo<{
  hasWorkspace: boolean;
  isCreating: boolean;
  hasSearchQuery: boolean;
  onNewSession: (e: React.MouseEvent) => void;
}>(function EmptyState({ hasWorkspace, isCreating, hasSearchQuery, onNewSession }) {
  if (!hasWorkspace) {
    return (
      <div className="px-3 py-4 text-center">
        <span className="text-[10px] text-[var(--color-text-muted)]">
          select a workspace first
        </span>
      </div>
    );
  }
  
  if (hasSearchQuery) {
    return (
      <div className="px-3 py-4 text-center">
        <Filter size={14} className="mx-auto mb-1.5 text-[var(--color-text-muted)] opacity-60" />
        <span className="text-[10px] text-[var(--color-text-muted)] block">
          no matching sessions
        </span>
      </div>
    );
  }
  
  return (
    <div className="px-3 py-4 text-center">
      <MessageSquare size={14} className="mx-auto mb-1.5 text-[var(--color-text-muted)] opacity-60" />
      <span className="text-[10px] text-[var(--color-text-muted)] block">
        no sessions yet
      </span>
      <button
        type="button"
        onClick={onNewSession}
        disabled={isCreating}
        className={cn(
          "mt-2 px-2 py-1 text-[9px]",
          "text-[var(--color-accent-primary)]",
          "hover:bg-[var(--color-accent-primary)]/8 transition-colors",
          "focus-visible:outline-none"
        )}
        tabIndex={-1}
      >
        {isCreating ? 'creating...' : 'start first session'}
      </button>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const SessionDropdown = memo<SessionDropdownProps & {
  dropdownRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<HTMLDivElement>;
}>(function SessionDropdown({
  isOpen,
  position,
  sessionGroups,
  flatSessionList,
  activeSessionId,
  focusedIndex,
  sessionCount,
  hasWorkspace,
  isCreating,
  searchQuery,
  viewMode,
  onSelect,
  onDelete,
  onNewSession,
  onFocusItem,
  onKeyDown,
  onSearchChange,
  onViewModeChange,
  dropdownRef,
  listRef,
}) {
  if (!isOpen) return null;
  
  const stats = getSessionStats(flatSessionList);
  const showSearch = sessionCount > 5;
  
  // Calculate global index for a session within a group
  const getSessionGlobalIndex = (groupIndex: number, sessionIndex: number) => {
    let index = 0;
    for (let i = 0; i < groupIndex; i++) {
      index += sessionGroups[i].sessions.length;
    }
    return index + sessionIndex;
  };

  const dropdownContent = (
    <div
      ref={dropdownRef}
      role="listbox"
      aria-label="Sessions"
      aria-activedescendant={
        focusedIndex >= 0 && focusedIndex < flatSessionList.length
          ? `session-option-${flatSessionList[focusedIndex].id}`
          : undefined
      }
      className={cn(
        "fixed",
        "bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)]",
        "shadow-lg shadow-black/20",
        "overflow-hidden z-[9999] font-mono",
        "animate-in fade-in duration-100",
        position.placement === 'above' ? "slide-in-from-bottom-1" : "slide-in-from-top-1"
      )}
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        maxWidth: 'calc(100vw - 16px)',
        transform: position.placement === 'above' ? 'translateY(-100%)' : 'translateY(0)',
        borderRadius: '3px',
      }}
      onKeyDown={onKeyDown}
    >
      {/* Header */}
      <div className={cn(
        "px-2 py-1 border-b border-[var(--color-border-subtle)]/60",
        "flex items-center justify-between gap-2"
      )}>
        <span className="text-[9px] text-[var(--color-text-dim)] select-none">
          sessions ({sessionCount}){stats.running > 0 && <span className="text-[var(--color-success)]"> · {stats.running} running</span>}
        </span>
        
        {/* New session button */}
        <button
          type="button"
          onClick={onNewSession}
          disabled={!hasWorkspace || isCreating}
          className={cn(
            "flex items-center gap-1 text-[9px]",
            "text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)]/80",
            "transition-colors duration-75",
            "focus-visible:outline-none",
            (!hasWorkspace || isCreating) && "opacity-40 cursor-not-allowed"
          )}
          title={hasWorkspace ? 'New session' : 'Select a workspace first'}
          tabIndex={-1}
        >
          {isCreating ? (
            <RefreshCw size={9} className="animate-spin" />
          ) : (
            <Plus size={9} />
          )}
          <span>new</span>
        </button>
      </div>
      
      {/* Search and filters */}
      {showSearch && hasWorkspace && (
        <div className="px-2 py-1.5 border-b border-[var(--color-border-subtle)]/50 space-y-1.5">
          <SearchInput
            value={searchQuery}
            onChange={onSearchChange}
          />
          <ViewModeToggle
            mode={viewMode}
            onChange={onViewModeChange}
            runningCount={stats.running}
          />
        </div>
      )}

      {/* Session list */}
      <div
        ref={listRef}
        className="max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]"
      >
        {!hasWorkspace || sessionGroups.length === 0 ? (
          <EmptyState
            hasWorkspace={hasWorkspace}
            isCreating={isCreating}
            hasSearchQuery={!!searchQuery.trim()}
            onNewSession={onNewSession}
          />
        ) : (
          sessionGroups.map((group, groupIndex) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <GroupHeader label={group.label} count={group.sessions.length} />
              {group.sessions.map((session, sessionIndex) => {
                const globalIndex = getSessionGlobalIndex(groupIndex, sessionIndex);
                return (
                  <SessionOption
                    key={session.id}
                    session={session}
                    isSelected={session.id === activeSessionId}
                    isFocused={globalIndex === focusedIndex}
                    onSelect={() => onSelect(session.id)}
                    onDelete={(e) => onDelete(e, session.id)}
                    onFocus={() => onFocusItem(globalIndex)}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
      
      {/* Footer with stats */}
      {hasWorkspace && sessionCount > 0 && (
        <div className={cn(
          "px-2 py-0.5 border-t border-[var(--color-border-subtle)]/40",
          "text-[8px] text-[var(--color-text-placeholder)]"
        )}>
          {searchQuery && flatSessionList.length !== sessionCount
            ? `${flatSessionList.length} of ${sessionCount}`
            : `${sessionCount} total`
          }
        </div>
      )}
    </div>
  );

  // Render in portal
  return typeof document !== 'undefined' ? createPortal(dropdownContent, document.body) : null;
});

export default SessionDropdown;
