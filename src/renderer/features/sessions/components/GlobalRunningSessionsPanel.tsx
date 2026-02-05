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
import { Loader2, ChevronDown, ChevronRight, ExternalLink, Square } from 'lucide-react';
import { cn } from '../../../utils/cn';
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
  onNavigateToSession?: (sessionId: string, workspaceId: string) => void;
}

interface RunningSessionInfo {
  sessionId: string;
  workspaceId: string;
  workspaceName: string;
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
  isCurrentWorkspace: boolean;
}

const RunningSessionItem = memo<RunningSessionItemProps>(({
  session,
  onCancel,
  onNavigate,
  isCurrentWorkspace,
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
      "hover:bg-[var(--color-bg-subtle)]",
      isCurrentWorkspace ? "bg-[var(--color-bg-subtle)]" : ""
    )}>
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {session.status === 'awaiting-confirmation' ? (
          <div className="w-2 h-2 rounded-full bg-[var(--color-warning)] animate-pulse" />
        ) : (
          <Loader2 size={12} className="text-[var(--color-success)] animate-spin" />
        )}
      </div>

      {/* Session info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-[var(--color-text-primary)] truncate">
          <span className="truncate">{session.sessionTitle}</span>
          {!isCurrentWorkspace && (
            <span className="flex-shrink-0 text-[9px] text-[var(--color-text-muted)] px-1 bg-[var(--color-bg-elevated)] rounded">
              {session.workspaceName}
            </span>
          )}
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
        {!isCurrentWorkspace && onNavigate && (
          <button
            onClick={onNavigate}
            className={cn(
              "p-1 rounded hover:bg-[var(--color-bg-elevated)]",
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
            "p-1 rounded hover:bg-[var(--color-bg-elevated)]",
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

  // Get workspaces for name mapping
  const workspaces = useAgentSelector(
    (s) => s.workspaces ?? [],
    (a, b) => a === b
  );

  // Get active workspace
  const activeWorkspaceId = useAgentSelector(
    (s) => s.workspaces?.find(w => w.isActive)?.id,
    (a, b) => a === b
  );

  // Get agent status for iteration info
  const agentStatus = useAgentSelector(
    (s) => s.agentStatus ?? {},
    (a, b) => a === b
  );

  // Filter running sessions and enrich with workspace info
  const runningSessions: RunningSessionInfo[] = React.useMemo(() => {
    return sessions
      .filter(s => s.status === 'running' || s.status === 'awaiting-confirmation')
      .map(session => {
        const workspace = workspaces.find(w => w.id === session.workspaceId);
        const workspaceName = workspace?.label || 
          workspace?.path?.split(/[/\\]/).pop() || 
          'Unknown';
        const status = agentStatus[session.id];
        
        return {
          sessionId: session.id,
          workspaceId: session.workspaceId ?? 'default',
          workspaceName,
          sessionTitle: session.title || 'Untitled Session',
          status: session.status,
          startedAt: status?.runStartedAt ?? session.updatedAt,
          iteration: status?.currentIteration,
          maxIterations: status?.maxIterations ?? session.config.maxIterations,
          provider: status?.provider ?? session.config.preferredProvider,
        };
      });
  }, [sessions, workspaces, agentStatus]);

  // Separate by workspace
  const { currentWorkspaceSessions, otherWorkspaceSessions } = React.useMemo(() => {
    const current: RunningSessionInfo[] = [];
    const other: RunningSessionInfo[] = [];
    
    for (const session of runningSessions) {
      if (session.workspaceId === activeWorkspaceId) {
        current.push(session);
      } else {
        other.push(session);
      }
    }
    
    return { currentWorkspaceSessions: current, otherWorkspaceSessions: other };
  }, [runningSessions, activeWorkspaceId]);

  const totalRunning = runningSessions.length;

  const handleCancel = useCallback((sessionId: string) => {
    cancelRun(sessionId);
  }, [cancelRun]);

  const handleNavigate = useCallback((sessionId: string, workspaceId: string) => {
    if (onNavigateToSession) {
      onNavigateToSession(sessionId, workspaceId);
    } else if (workspaceId === activeWorkspaceId) {
      setActiveSession(sessionId);
    }
  }, [onNavigateToSession, activeWorkspaceId, setActiveSession]);

  // Show empty state message when no running sessions
  if (totalRunning === 0) {
    return (
      <div className={cn(
        "border-b border-[var(--color-border-subtle)]",
        "bg-[var(--color-bg-primary)]",
        "px-3 py-2 text-[10px] font-mono text-[var(--color-text-muted)]",
        className
      )}>
        No sessions currently running across workspaces.
      </div>
    );
  }

  return (
    <div className={cn(
      "border-b border-[var(--color-border-subtle)]",
      "bg-[var(--color-bg-primary)]",
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(prev => !prev)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-1.5",
          "text-[10px] font-mono text-[var(--color-text-secondary)]",
          "hover:bg-[var(--color-bg-subtle)]",
          "transition-colors"
        )}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <Loader2 size={10} className="text-[var(--color-success)] animate-spin" />
        <span className="flex-1 text-left">
          {totalRunning} {totalRunning === 1 ? 'session' : 'sessions'} running
          {otherWorkspaceSessions.length > 0 && (
            <span className="text-[var(--color-text-muted)] ml-1">
              ({otherWorkspaceSessions.length} in other {otherWorkspaceSessions.length === 1 ? 'workspace' : 'workspaces'})
            </span>
          )}
        </span>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="max-h-[200px] overflow-y-auto">
          {/* Current workspace sessions */}
          {currentWorkspaceSessions.length > 0 && (
            <div>
              {otherWorkspaceSessions.length > 0 && (
                <div className="px-3 py-1 text-[9px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)]">
                  Current Workspace
                </div>
              )}
              {currentWorkspaceSessions.map(session => (
                <RunningSessionItem
                  key={session.sessionId}
                  session={session}
                  onCancel={() => handleCancel(session.sessionId)}
                  isCurrentWorkspace={true}
                />
              ))}
            </div>
          )}

          {/* Other workspace sessions */}
          {otherWorkspaceSessions.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[9px] font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-subtle)]">
                Other Workspaces
              </div>
              {otherWorkspaceSessions.map(session => (
                <RunningSessionItem
                  key={session.sessionId}
                  session={session}
                  onCancel={() => handleCancel(session.sessionId)}
                  onNavigate={() => handleNavigate(session.sessionId, session.workspaceId)}
                  isCurrentWorkspace={false}
                />
              ))}
            </div>
          )}
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
      <Loader2 size={10} className="animate-spin" />
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
