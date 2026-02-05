/**
 * Tab Session Dropdown Component
 * 
 * Dropdown showing sessions for a specific workspace tab.
 * Allows quick session access and creation from the tab bar.
 */
import React, { memo, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, MessageSquare, RefreshCw } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Spinner } from '../../../../components/ui/LoadingState';
import { useAgentSelector, useAgentActions } from '../../../../state/AgentProvider';
import { isSessionRunning, formatRelativeTime, truncateTitle } from '../../../sessions/utils';
import type { TabSessionDropdownProps, TabSessionItem } from './types';

// =============================================================================
// Session Item Component
// =============================================================================

const SessionItem = memo<{
  session: TabSessionItem;
  onSelect: () => void;
}>(function SessionItem({ session, onSelect }) {
  const isRunning = isSessionRunning(session.status);
  
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 text-left font-mono",
        "transition-colors duration-75",
        session.isActive
          ? "bg-[var(--color-accent-primary)]/8 text-[var(--color-accent-primary)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/40"
      )}
    >
      {/* Running indicator */}
      {isRunning && (
        <Spinner size="sm" colorVariant="success" className="w-2.5 h-2.5 flex-shrink-0" />
      )}
      
      {/* Session info */}
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className="text-[10px] truncate">
          {truncateTitle(session.title, 24)}
        </span>
        <span className="text-[8px] text-[var(--color-text-dim)] tabular-nums flex-shrink-0">
          {formatRelativeTime(session.updatedAt)}
        </span>
      </div>
      
      {/* Message count */}
      <span className="text-[8px] text-[var(--color-text-dim)] tabular-nums flex-shrink-0">
        {session.messageCount}
      </span>
    </button>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const TabSessionDropdown = memo<TabSessionDropdownProps>(({
  workspaceId,
  workspaceLabel,
  isOpen,
  anchorEl,
  onClose,
  onSelectSession,
  onNewSession,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const agentActions = useAgentActions();
  const [isCreating, setIsCreating] = React.useState(false);
  
  // Get sessions for this workspace
  const { sessions, activeSessionId } = useAgentSelector(
    (state) => {
      const sessions = (state.sessions ?? [])
        .filter(s => s.workspaceId === workspaceId)
        .map(s => ({
          id: s.id,
          title: s.title || 'untitled',
          status: s.status,
          updatedAt: s.updatedAt,
          messageCount: s.messages?.length ?? 0,
          isActive: s.id === state.activeSessionId,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      
      return {
        sessions,
        activeSessionId: state.activeSessionId,
      };
    },
    (a, b) => {
      if (a.activeSessionId !== b.activeSessionId) return false;
      if (a.sessions.length !== b.sessions.length) return false;
      for (let i = 0; i < a.sessions.length; i++) {
        if (a.sessions[i].id !== b.sessions[i].id ||
            a.sessions[i].status !== b.sessions[i].status ||
            a.sessions[i].isActive !== b.sessions[i].isActive) {
          return false;
        }
      }
      return true;
    }
  );

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          anchorEl && !anchorEl.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, anchorEl, onClose]);

  // Calculate position
  const position = useMemo(() => {
    if (!anchorEl) return { top: 0, left: 0 };
    
    const rect = anchorEl.getBoundingClientRect();
    return {
      top: rect.bottom + 4,
      left: rect.left,
    };
  }, [anchorEl]);

  // Handle new session
  const handleNewSession = useCallback(async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      await agentActions.createSession();
      onClose();
    } finally {
      setIsCreating(false);
    }
  }, [agentActions, isCreating, onClose]);

  // Handle session select
  const handleSelect = useCallback((sessionId: string) => {
    onSelectSession(sessionId);
    onClose();
  }, [onSelectSession, onClose]);

  if (!isOpen || !anchorEl) return null;

  const runningCount = sessions.filter(s => isSessionRunning(s.status)).length;

  const dropdownContent = (
    <div
      ref={dropdownRef}
      className={cn(
        "fixed z-50 w-[220px]",
        "bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)]",
        "rounded-sm shadow-lg font-mono",
        "animate-in fade-in slide-in-from-top-1 duration-100"
      )}
      style={position}
    >
      {/* Header */}
      <div className={cn(
        "px-2 py-1.5 border-b border-[var(--color-border-subtle)]",
        "bg-[var(--color-surface-header)]",
        "flex items-center justify-between"
      )}>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-[var(--color-text-dim)] truncate max-w-[100px]">
            {workspaceLabel}
          </span>
          <span className="text-[8px] text-[var(--color-text-placeholder)]">
            ({sessions.length})
          </span>
        </div>
        
        {/* New session button */}
        <button
          type="button"
          onClick={handleNewSession}
          disabled={isCreating}
          className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 text-[9px]",
            "text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/8",
            "transition-colors duration-75 rounded-sm",
            isCreating && "opacity-50 cursor-not-allowed"
          )}
        >
          {isCreating ? (
            <RefreshCw size={9} className="animate-spin" />
          ) : (
            <Plus size={9} />
          )}
          <span>new</span>
        </button>
      </div>
      
      {/* Session list */}
      <div className="max-h-[200px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]">
        {sessions.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <MessageSquare size={14} className="mx-auto mb-1.5 text-[var(--color-text-muted)] opacity-60" />
            <span className="text-[10px] text-[var(--color-text-muted)] block">
              no sessions
            </span>
          </div>
        ) : (
          sessions.map(session => (
            <SessionItem
              key={session.id}
              session={session}
              onSelect={() => handleSelect(session.id)}
            />
          ))
        )}
      </div>
      
      {/* Footer with running count */}
      {runningCount > 0 && (
        <div className={cn(
          "px-2 py-1 border-t border-[var(--color-border-subtle)]/50",
          "bg-[var(--color-surface-base)]",
          "flex items-center gap-1 text-[8px] text-[var(--color-success)]"
        )}>
          <Spinner size="sm" className="w-2 h-2" colorVariant="success" />
          <span>{runningCount} running</span>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(dropdownContent, document.body) : null;
});

TabSessionDropdown.displayName = 'TabSessionDropdown';

export default TabSessionDropdown;
