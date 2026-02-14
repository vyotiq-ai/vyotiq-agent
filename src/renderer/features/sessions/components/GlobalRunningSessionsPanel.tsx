/**
 * Global Running Sessions Panel
 * 
 * Shows all running sessions across all workspaces to provide visibility
 * into concurrent agent executions. This component allows users to see and
 * manage sessions running in background workspaces without switching to them.
 * 
 * Features:
 * - Lists all running sessions with workspace context
 * - Shows progress/iteration info for each session
 * - Allows canceling sessions directly
 * - Provides quick navigation to running sessions
 */
import React, { memo, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Square } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Spinner } from '../../../components/ui/LoadingState';
import { useAgentSelector, useAgentActions } from '../../../state/AgentProvider';
import type { AgentSessionState } from '../../../../shared/types';

// =============================================================================
// Types
// =============================================================================

interface GlobalRunningSessionsPanelProps {
  className?: string;
  /** Whether to show as collapsed by default */
  defaultCollapsed?: boolean;
  /** Called when user clicks to navigate to a session */
  onNavigateToSession?: (sessionId: string) => void;
}

interface RunningSessionInfo {
  sessionId: string;
  sessionTitle: string;
  status: AgentSessionState['status'];
  startedAt: number;
  iteration?: number;
  maxIterations?: number;
  provider?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatDuration(startTime: number): string {
  const elapsed = Date.now() - startTime;
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// =============================================================================
// Running Session Item Component
// =============================================================================

interface RunningSessionItemProps {
  session: RunningSessionInfo;
  onCancel: () => void;
  onNavigate?: () => void;
}

const RunningSessionItem = memo<RunningSessionItemProps>(({
  session,
  onCancel,
  onNavigate,
}) => {
  const [elapsed, setElapsed] = useState(formatDuration(session.startedAt));

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(formatDuration(session.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.startedAt]);

  return (
    <div className={cn(
      "flex items-center gap-2 px-2 py-1.5 text-[11px] font-mono",
      "border-b border-[var(--color-border-subtle)]",
      "hover:bg-[var(--color-surface-2)]",
    )}>
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {session.status === 'awaiting-confirmation' ? (
          <div className="w-2 h-2 rounded-full bg-[var(--color-warning)] animate-pulse" />
        ) : (
          <Spinner size="sm" colorVariant="success" className="w-3 h-3" />
        )}
      </div>

      {/* Session info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[var(--color-text-primary)] truncate">
          <span className="truncate">{session.sessionTitle}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)]">
          <span>{elapsed}</span>
          {session.iteration !== undefined && session.maxIterations !== undefined && (
            <span>iter {session.iteration}/{session.maxIterations}</span>
          )}
          {session.provider && (
            <span className="truncate">{session.provider}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onNavigate && (
          <button
            onClick={onNavigate}
            className={cn(
              "p-1 rounded hover:bg-[var(--color-surface-2)]",
              "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              "transition-colors"
            )}
            title="Navigate to session"
          >
            <ExternalLink size={12} />
          </button>
        )}
        <button
          onClick={onCancel}
          className={cn(
            "p-1 rounded hover:bg-[var(--color-surface-2)]",
            "text-[var(--color-text-muted)] hover:text-[var(--color-error)]",
            "transition-colors"
          )}
          title="Cancel session"
        >
          <Square size={12} />
        </button>
      </div>
    </div>
  );
});
RunningSessionItem.displayName = 'RunningSessionItem';

// =============================================================================
// Main Component
// =============================================================================

export const GlobalRunningSessionsPanel = memo<GlobalRunningSessionsPanelProps>(({
  className,
  defaultCollapsed = true,
  onNavigateToSession,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const { cancelRun, setActiveSession } = useAgentActions();

  // Get all sessions from state
  const sessions = useAgentSelector(
    (s) => s.sessions ?? [],
    (a, b) => a === b
  );

  // Get agent status for iteration info
  const agentStatus = useAgentSelector(
    (s) => s.agentStatus ?? {},
    (a, b) => a === b
  );

  // Filter running sessions and enrich with info
  const runningSessions: RunningSessionInfo[] = React.useMemo(() => {
    return sessions
      .filter(s => s.status === 'running' || s.status === 'awaiting-confirmation')
      .map(session => {
        const status = agentStatus[session.id];
        
        return {
          sessionId: session.id,
          sessionTitle: session.title || 'Untitled Session',
          status: session.status,
          startedAt: status?.runStartedAt ?? session.updatedAt,
          iteration: status?.currentIteration,
          maxIterations: status?.maxIterations ?? session.config.maxIterations,
          provider: status?.provider ?? session.config.preferredProvider,
        };
      });
  }, [sessions, agentStatus]);

  const totalRunning = runningSessions.length;

  const handleCancel = useCallback((sessionId: string) => {
    cancelRun(sessionId);
  }, [cancelRun]);

  const handleNavigate = useCallback((sessionId: string) => {
    setActiveSession(sessionId);
    onNavigateToSession?.(sessionId);
  }, [setActiveSession, onNavigateToSession]);

  // Show empty state message when no running sessions
  if (totalRunning === 0) {
    return (
      <div className={cn(
        "border-b border-[var(--color-border-subtle)]",
        "bg-[var(--color-surface-base)]",
        "px-3 py-2 text-[10px] font-mono text-[var(--color-text-muted)]",
        className
      )}>
        No sessions currently running.
      </div>
    );
  }

  return (
    <div className={cn(
      "border-b border-[var(--color-border-subtle)]",
      "bg-[var(--color-surface-base)]",
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(prev => !prev)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5",
          "text-[10px] font-mono text-[var(--color-text-secondary)]",
          "hover:bg-[var(--color-surface-2)]",
          "transition-colors"
        )}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <Spinner size="sm" colorVariant="success" className="w-2.5 h-2.5" />
        <span className="flex-1 text-left">
          {totalRunning} {totalRunning === 1 ? 'session' : 'sessions'} running
        </span>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="max-h-[200px] overflow-y-auto">
          {runningSessions.map(session => (
            <RunningSessionItem
              key={session.sessionId}
              session={session}
              onCancel={() => handleCancel(session.sessionId)}
              onNavigate={() => handleNavigate(session.sessionId)}
            />
          ))}
        </div>
      )}
    </div>
  );
});
GlobalRunningSessionsPanel.displayName = 'GlobalRunningSessionsPanel';

// =============================================================================
// Compact Indicator Component (for header/footer)
// =============================================================================

interface GlobalRunningIndicatorProps {
  className?: string;
  showCount?: boolean;
  onClick?: () => void;
}

export const GlobalRunningIndicator = memo<GlobalRunningIndicatorProps>(({
  className,
  showCount = true,
  onClick,
}) => {
  // Get running count across all workspaces
  const totalRunning = useAgentSelector(
    (s) => (s.sessions ?? []).filter(
      session => session.status === 'running' || session.status === 'awaiting-confirmation'
    ).length,
    (a, b) => a === b
  );

  if (totalRunning === 0) return null;

  const content = (
    <div className={cn(
      "flex items-center gap-1 text-[10px] font-mono",
      "text-[var(--color-success)]",
      className
    )}>
      <Spinner size="sm" className="w-2.5 h-2.5" colorVariant="success" />
      {showCount && <span>{totalRunning}</span>}
    </div>
  );

  if (onClick) {
    return (
      <button 
        onClick={onClick}
        className="hover:opacity-80 transition-opacity"
        title={`${totalRunning} running session${totalRunning === 1 ? '' : 's'}`}
      >
        {content}
      </button>
    );
  }

  return content;
});
GlobalRunningIndicator.displayName = 'GlobalRunningIndicator';

export default GlobalRunningSessionsPanel;
