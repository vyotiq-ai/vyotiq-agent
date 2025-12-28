/**
 * Session Selector Component
 * 
 * Dropdown UI for selecting and managing sessions from the prompt input area.
 * Styled as a CLI flag to match the terminal aesthetic.
 * 
 * @example
 * <SessionSelector
 *   currentSessionTitle="My Session"
 *   onNewSession={handleNewSession}
 *   onSelectSession={handleSelect}
 *   disabled={false}
 * />
 */
import React, { useState, memo, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus, Trash2, MessageSquare, RefreshCw } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useSessionList } from '../../sessions/hooks/useSessionList';

type SessionMeta = {
  id: string;
  title: string;
  updatedAt: number;
  status: string;
  workspaceId: string;
  messageCount: number;
};

// =============================================================================
// Types
// =============================================================================

interface SessionSelectorProps {
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Reason for being disabled (tooltip) */
  disabledReason?: string;
  /** Additional className */
  className?: string;
}

// =============================================================================
// Session Grouping Helper
// =============================================================================

interface SessionGroup {
  label: string;
  sessions: SessionMeta[];
}

function groupSessionsByDate(sessions: SessionMeta[]): SessionGroup[] {
  const groups: Record<string, SessionMeta[]> = {
    'today': [],
    'yesterday': [],
    'this week': [],
    'older': []
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const lastWeek = today - 86400000 * 7;

  sessions.forEach(session => {
    const date = new Date(session.updatedAt).getTime();
    if (date >= today) {
      groups['today'].push(session);
    } else if (date >= yesterday) {
      groups['yesterday'].push(session);
    } else if (date >= lastWeek) {
      groups['this week'].push(session);
    } else {
      groups['older'].push(session);
    }
  });

  return Object.entries(groups)
    .filter(([_, groupSessions]) => groupSessions.length > 0)
    .map(([label, groupSessions]) => ({
      label,
      sessions: groupSessions
    }));
}

// =============================================================================
// Session Option Component
// =============================================================================

interface SessionOptionProps {
  session: SessionMeta;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

const SessionOption = memo<SessionOptionProps>(function SessionOption({ 
  session, 
  isSelected, 
  onSelect,
  onDelete 
}) {
  const messageCount = session.messageCount ?? 0;
  const title = session.title || 'untitled';
  
  // Format relative time for better context
  const getRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1 text-left transition-all duration-150 font-mono group cursor-pointer",
        isSelected 
          ? "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]" 
          : "hover:bg-[var(--color-surface-2)]/60 text-[var(--color-text-secondary)]",
        "active:scale-[0.98]",
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className={cn(
        "text-[8px] transition-colors flex-shrink-0",
        isSelected ? "text-[var(--color-accent-primary)]/60" : "text-[var(--color-text-placeholder)]"
      )}>›</span>
      
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <span className={cn(
          "text-[10px] truncate flex-1",
          isSelected ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-primary)]"
        )}>
          {title}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[8px] text-[var(--color-text-placeholder)] tabular-nums">
            {messageCount}
          </span>
          <span className="text-[7px] text-[var(--color-text-dim)]">·</span>
          <span className="text-[8px] text-[var(--color-text-placeholder)] tabular-nums">
            {getRelativeTime(session.updatedAt)}
          </span>
        </div>
      </div>
      
      {isSelected && (
        <Check size={9} className="text-[var(--color-accent-primary)] flex-shrink-0 animate-in zoom-in-50 duration-150" />
      )}
      
      {/* Delete button - visible on hover */}
      <button
        type="button"
        onClick={onDelete}
        className={cn(
          "p-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0",
          "text-[var(--color-text-muted)] hover:text-[var(--color-error)]",
          "hover:bg-[var(--color-error)]/10",
          "focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[var(--color-error)]/40"
        )}
        title="Delete session"
        aria-label="Delete session"
      >
        <Trash2 size={9} />
      </button>
    </div>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const SessionSelector: React.FC<SessionSelectorProps> = memo(({ 
  disabled,
  disabledReason,
  className
}) => {
  const {
    sessions,
    activeSessionId,
    activeWorkspaceId,
    handleStartSession,
    handleSelectSession,
    handleDeleteSession
  } = useSessionList();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 280,
    placement: 'above' as 'above' | 'below',
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasWorkspace = !!activeWorkspaceId;
  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId),
    [sessions, activeSessionId]
  );
  const sessionGroups = useMemo(() => groupSessionsByDate(sessions), [sessions]);
  const sessionCount = sessions.length;
  
  // Display title - longer for header placement
  const displayTitle = activeSession?.title || 'new session';
  const truncatedTitle = displayTitle.length > 20 
    ? displayTitle.slice(0, 20) + '…' 
    : displayTitle;

  // Click outside handler
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideButton = buttonRef.current?.contains(target);
      const isInsideDropdown = dropdownRef.current?.contains(target);
      
      if (!isInsideButton && !isInsideDropdown) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Calculate dropdown position
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportPadding = 8;
      const idealWidth = 280;
      const width = Math.max(220, Math.min(idealWidth, window.innerWidth - viewportPadding * 2));

      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - viewportPadding - width)
      );

      const availableAbove = rect.top - viewportPadding;
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const placement: 'above' | 'below' = availableAbove < 220 && availableBelow > availableAbove ? 'below' : 'above';

      setDropdownPosition({
        top: placement === 'above' ? rect.top - viewportPadding : rect.bottom + viewportPadding,
        left,
        width,
        placement,
      });
    }
  }, [isOpen]);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => !prev);
    }
  }, [disabled]);

  const handleNewSession = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasWorkspace || isCreating) return;
    
    setIsCreating(true);
    try {
      await handleStartSession(e);
      setIsOpen(false);
    } finally {
      setIsCreating(false);
    }
  }, [handleStartSession, hasWorkspace, isCreating]);

  const handleSelect = useCallback((sessionId: string) => {
    handleSelectSession(sessionId);
    setIsOpen(false);
  }, [handleSelectSession]);

  const handleDelete = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    handleDeleteSession(e, sessionId);
  }, [handleDeleteSession]);

  const tooltip = disabled 
    ? disabledReason ?? 'Sessions unavailable'
    : !hasWorkspace 
      ? 'Select a workspace first'
      : `${sessionCount} session${sessionCount !== 1 ? 's' : ''}`;

  // Dropdown content rendered via portal
  const dropdownContent = isOpen ? (
    <div 
      ref={dropdownRef}
      className={cn(
        "fixed",
        "bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] shadow-xl",
        "overflow-hidden z-[9999] font-mono transition-colors",
        "animate-in fade-in slide-in-from-bottom-1 duration-150"
      )}
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        maxWidth: 'calc(100vw - 16px)',
        transform: dropdownPosition.placement === 'above' ? 'translateY(-100%)' : 'translateY(0)',
      }}
    >
      {/* Header with new session button */}
      <div className="px-2.5 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)] flex items-center justify-between">
        <span className="text-[9px] text-[var(--color-text-dim)]"># sessions ({sessionCount})</span>
        <button
          type="button"
          onClick={handleNewSession}
          disabled={!hasWorkspace || isCreating}
          className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[9px]",
            "text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10",
            "transition-colors",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40",
            (!hasWorkspace || isCreating) && "opacity-50 cursor-not-allowed"
          )}
          title={hasWorkspace ? 'New session' : 'Select a workspace first'}
        >
          {isCreating ? (
            <RefreshCw size={9} className="animate-spin" />
          ) : (
            <Plus size={9} />
          )}
          <span>new</span>
        </button>
      </div>

      <div className="p-1 max-h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]">
        {!hasWorkspace ? (
          <div className="px-3 py-4 text-center">
            <span className="text-[10px] text-[var(--color-warning)]">
              select a workspace first
            </span>
          </div>
        ) : sessionGroups.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <MessageSquare size={16} className="mx-auto mb-2 text-[var(--color-text-muted)]" />
            <span className="text-[10px] text-[var(--color-text-muted)] block">
              no sessions yet
            </span>
            <button
              type="button"
              onClick={handleNewSession}
              disabled={isCreating}
              className={cn(
                "mt-2 px-2 py-1 text-[9px] rounded-sm",
                "bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]",
                "hover:bg-[var(--color-accent-primary)]/20 transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              )}
            >
              {isCreating ? 'creating...' : 'start first session'}
            </button>
          </div>
        ) : (
          sessionGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1 text-[8px] text-[var(--color-text-dim)] uppercase tracking-wider">
                {group.label}
              </div>
              {group.sessions.map((session) => (
                <SessionOption
                  key={session.id}
                  session={session}
                  isSelected={session.id === activeSessionId}
                  onSelect={() => handleSelect(session.id)}
                  onDelete={(e) => handleDelete(e, session.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1 text-[10px] font-mono transition-colors whitespace-nowrap',
          'text-[var(--color-text-placeholder)] hover:text-[var(--color-text-secondary)]',
          'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
          disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          className
        )}
        title={tooltip}
        aria-label={tooltip}
        aria-disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-[var(--color-accent-secondary)]">session=</span>
        <span className="text-[var(--color-text-secondary)] truncate max-w-[120px] sm:max-w-[180px]">{truncatedTitle}</span>
        <ChevronDown 
          size={10} 
          className={cn(
            "text-[var(--color-text-placeholder)] transition-transform",
            isOpen && "rotate-180"
          )} 
          aria-hidden="true" 
        />
      </button>
      {typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </>
  );
});

SessionSelector.displayName = 'SessionSelector';

export default SessionSelector;
