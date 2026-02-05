/**
 * Session Selector Component
 * 
 * Minimal dropdown UI for selecting and managing sessions.
 * Styled as a CLI flag to match the terminal aesthetic.
 * 
 * Features:
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Session grouping by date
 * - Session search/filtering
 * - Running session indicators
 * - Clean, minimal terminal design
 * - Accessible (ARIA attributes)
 * 
 * @example
 * <SessionSelector
 *   disabled={false}
 *   disabledReason="Loading..."
 * />
 */
import React, { memo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Spinner } from '../../../../components/ui/LoadingState';
import { cn } from '../../../../utils/cn';
import { SessionDropdown } from './SessionDropdown';
import { useSessionDropdown } from './useSessionDropdown';
import { isSessionRunning } from './utils';
import type { SessionSelectorProps } from './types';

// =============================================================================
// Main Component
// =============================================================================

export const SessionSelector: React.FC<SessionSelectorProps> = memo(function SessionSelector({
  disabled,
  disabledReason,
  className,
}) {
  const {
    buttonRef,
    dropdownRef,
    listRef,
    state,
    actions,
    activeSessionId,
    hasWorkspace,
  } = useSessionDropdown({ disabled, disabledReason });

  const {
    isOpen,
    isCreating,
    focusedIndex,
    dropdownPosition,
    searchQuery,
    viewMode,
    sessionGroups,
    flatSessionList,
    sessionCount,
    activeSession,
    truncatedTitle,
    tooltip,
  } = state;

  const {
    handleToggle,
    handleNewSession,
    handleSelect,
    handleDelete,
    handleItemFocus,
    handleKeyDown,
    handleSearchChange,
    handleViewModeChange,
  } = actions;

  // Check if active session is running
  const isActiveRunning = activeSession ? isSessionRunning(activeSession.status) : false;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          'flex items-center gap-0.5 text-[10px] font-mono whitespace-nowrap',
          'transition-colors duration-75',
          'text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)]',
          'focus-visible:outline-none',
          disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
          isOpen && 'text-[var(--color-text-secondary)]',
          className
        )}
        title={tooltip}
        aria-label={tooltip}
        aria-disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? 'session-selector-listbox' : undefined}
      >
        {/* Session label */}
        <span className="text-[var(--color-accent-secondary)]">session=</span>
        
        {/* Running indicator */}
        {isActiveRunning && (
          <Spinner 
            size="sm" 
            className="w-2 h-2 text-[var(--color-success)]" 
          />
        )}
        
        {/* Session title */}
        <span className="text-[var(--color-text-secondary)] truncate max-w-[100px] sm:max-w-[140px]">
          {truncatedTitle}
        </span>
        
        {/* Dropdown indicator */}
        <ChevronDown
          size={9}
          className={cn(
            "text-[var(--color-text-dim)] transition-transform duration-75 ml-0.5",
            isOpen && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>
      
      {/* Dropdown portal */}
      <SessionDropdown
        isOpen={isOpen}
        position={dropdownPosition}
        sessionGroups={sessionGroups}
        flatSessionList={flatSessionList}
        activeSessionId={activeSessionId}
        activeWorkspaceId={hasWorkspace ? 'active' : undefined}
        focusedIndex={focusedIndex}
        sessionCount={sessionCount}
        hasWorkspace={hasWorkspace}
        isCreating={isCreating}
        searchQuery={searchQuery}
        viewMode={viewMode}
        onSelect={handleSelect}
        onDelete={handleDelete}
        onNewSession={handleNewSession}
        onFocusItem={handleItemFocus}
        onKeyDown={handleKeyDown}
        onSearchChange={handleSearchChange}
        onViewModeChange={handleViewModeChange}
        dropdownRef={dropdownRef}
        listRef={listRef}
      />
    </>
  );
});

SessionSelector.displayName = 'SessionSelector';

export default SessionSelector;
