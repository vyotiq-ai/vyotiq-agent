/**
 * Tab Item Component
 * 
 * Individual workspace tab with session indicators and activity status.
 * Supports running session animation, session dropdown, and workspace actions.
 */
import React, { memo, useCallback, useState, useRef } from 'react';
import { X, FolderOpen, ChevronDown, MessageSquare } from 'lucide-react';
import { Spinner } from '../../../../components/ui/LoadingState';
import { cn } from '../../../../utils/cn';
import { useWorkspaceActivity } from '../../../../hooks/useWorkspaceSessions';
import type { TabItemProps } from './types';

export const TabItem = memo<TabItemProps>(({
  tab,
  isActive,
  onFocus,
  onClose,
  onContextMenu,
}) => {
  const [showSessionHint, setShowSessionHint] = useState(false);
  const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Get activity status from workspace sessions hook
  const { 
    isActive: hasRunningSession, 
    runningCount, 
    sessionCount 
  } = useWorkspaceActivity(tab.workspaceId);
  
  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(tab.workspaceId);
  }, [onClose, tab.workspaceId]);

  const handleFocus = useCallback(() => {
    onFocus(tab.workspaceId);
  }, [onFocus, tab.workspaceId]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, tab.workspaceId);
  }, [onContextMenu, tab.workspaceId]);

  // Show session hint on hover (delayed)
  const handleMouseEnter = useCallback(() => {
    if (sessionCount > 0) {
      hintTimeoutRef.current = setTimeout(() => {
        setShowSessionHint(true);
      }, 500);
    }
  }, [sessionCount]);

  const handleMouseLeave = useCallback(() => {
    if (hintTimeoutRef.current) {
      clearTimeout(hintTimeoutRef.current);
    }
    setShowSessionHint(false);
  }, []);

  const label = tab.customLabel || tab.workspace?.label || 'Unknown';
  const path = tab.workspace?.path || '';
  
  // Determine if workspace is running (from hook or tab state)
  const isRunning = hasRunningSession || tab.isRunning;
  
  // Build tooltip
  const tooltipParts = [path];
  if (sessionCount > 0) {
    tooltipParts.push(`${sessionCount} session${sessionCount !== 1 ? 's' : ''}`);
    if (runningCount > 0) {
      tooltipParts.push(`${runningCount} running`);
    }
  }
  const tooltip = tooltipParts.join(' • ');

  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={isActive}
      className={cn(
        'group relative flex items-center gap-1.5 px-3 py-1.5 cursor-pointer select-none',
        'border-r border-[var(--color-border-subtle)]',
        'transition-all duration-150 ease-out',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50 focus-visible:ring-inset',
        isActive
          ? 'bg-[var(--color-surface-base)] text-[var(--color-text-primary)]'
          : 'bg-[var(--color-surface-sidebar)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-secondary)]',
        // Active tab bottom border
        isActive && 'border-b-2 border-b-[var(--color-accent-primary)]',
        // Subtle glow when workspace has running sessions
        isRunning && !isActive && 'ring-1 ring-inset ring-[var(--color-success)]/20',
      )}
      onClick={handleFocus}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleFocus();
        }
      }}
      title={tooltip}
    >
      {/* Running indicator glow effect */}
      {isRunning && (
        <div 
          className={cn(
            "absolute inset-0 rounded-sm opacity-20",
            "bg-gradient-to-r from-[var(--color-success)]/0 via-[var(--color-success)]/10 to-[var(--color-success)]/0",
            "animate-pulse"
          )}
          aria-hidden="true"
        />
      )}
      
      {/* Folder icon */}
      <FolderOpen
        size={13}
        className={cn(
          'shrink-0 transition-colors relative z-10',
          isActive ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)]'
        )}
      />

      {/* Label with optional active session subtitle */}
      <div className="flex flex-col min-w-0 relative z-10">
        <span className="truncate text-xs font-mono max-w-[120px]">
          {label}
        </span>
      </div>

      {/* Activity indicators */}
      <div className="flex items-center gap-1 shrink-0 relative z-10">
        {/* Running session indicator */}
        {isRunning && (
          <div className="flex items-center gap-0.5">
            <Spinner
              size="sm"
              className="w-[11px] h-[11px] text-[var(--color-success)]"
            />
            {runningCount > 1 && (
              <span className="text-[9px] text-[var(--color-success)] font-medium tabular-nums">
                {runningCount}
              </span>
            )}
          </div>
        )}
        
        {/* Session count badge when not running */}
        {!isRunning && sessionCount > 0 && (
          <span className={cn(
            "shrink-0 px-1 py-0.5 rounded text-[9px] tabular-nums",
            "bg-[var(--color-surface-active)] text-[var(--color-text-dim)]"
          )}>
            {sessionCount}
          </span>
        )}

        {/* Unsaved indicator */}
        {tab.hasUnsavedChanges && (
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-warning)]" />
        )}
      </div>

      {/* Close button */}
      <button
        type="button"
        className={cn(
          'shrink-0 p-0.5 rounded-sm transition-all relative z-10',
          'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]',
          'hover:bg-[var(--color-surface-active)]',
          'opacity-0 group-hover:opacity-100 focus:opacity-100',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
        )}
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClose(e as unknown as React.MouseEvent);
          }
        }}
        aria-label={`Close ${label}`}
        tabIndex={-1}
      >
        <X size={11} />
      </button>
      
      {/* Session hint tooltip on hover */}
      {showSessionHint && sessionCount > 0 && (
        <div className={cn(
          "absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50",
          "px-2 py-1 rounded-sm",
          "bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)]",
          "shadow-md text-[9px] font-mono whitespace-nowrap",
          "animate-in fade-in slide-in-from-top-1 duration-100"
        )}>
          <div className="flex items-center gap-1 text-[var(--color-text-secondary)]">
            <MessageSquare size={9} />
            <span>{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
            {runningCount > 0 && (
              <span className="text-[var(--color-success)]">
                ({runningCount} active)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

TabItem.displayName = 'TabItem';

export default TabItem;
