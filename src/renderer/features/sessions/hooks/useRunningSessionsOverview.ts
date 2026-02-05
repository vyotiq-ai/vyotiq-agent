/**
 * useRunningSessionsOverview Hook
 * 
 * Provides a summary of all running sessions across workspaces.
 * Useful for status indicators and global session monitoring.
 */
import { useMemo } from 'react';
import { useAgentSelector } from '../../../state/AgentProvider';
import type { AgentSessionState, WorkspaceEntry } from '../../../../shared/types';
import {
  isSessionRunning,
  getRunningCountByWorkspace,
  sortSessionsRunningFirst,
} from '../utils';

// =============================================================================
// Types
// =============================================================================

export interface RunningSessionInfo {
  session: AgentSessionState;
  workspaceLabel: string;
}

export interface WorkspaceRunningInfo {
  workspaceId: string;
  workspaceLabel: string;
  runningCount: number;
  sessions: AgentSessionState[];
}

export interface RunningSessionsOverviewState {
  /** All running sessions */
  runningSessions: RunningSessionInfo[];
  /** Total running count */
  totalRunning: number;
  /** Running sessions grouped by workspace */
  byWorkspace: WorkspaceRunningInfo[];
  /** Count of workspaces with running sessions */
  activeWorkspaceCount: number;
  /** Whether any sessions are awaiting confirmation */
  hasAwaitingConfirmation: boolean;
  /** Sessions awaiting confirmation */
  awaitingSessions: RunningSessionInfo[];
}

// =============================================================================
// Hook
// =============================================================================

export function useRunningSessionsOverview(): RunningSessionsOverviewState {
  // Get all sessions
  const allSessions = useAgentSelector(
    s => s.sessions ?? [],
    (a, b) => a === b
  );

  // Get workspaces for labels
  const workspaces = useAgentSelector(
    s => s.workspaces ?? [],
    (a, b) => a === b
  );

  // Build workspace labels map
  const workspaceLabels = useMemo(() => {
    const labels = new Map<string, string>();
    workspaces.forEach(w => {
      const label = w.label || w.path?.split(/[/\\]/).pop() || 'Unknown';
      labels.set(w.id, label);
    });
    return labels;
  }, [workspaces]);

  // Filter running sessions and add workspace info
  const runningSessions = useMemo<RunningSessionInfo[]>(() => {
    return allSessions
      .filter(s => isSessionRunning(s.status))
      .map(session => ({
        session,
        workspaceLabel: workspaceLabels.get(session.workspaceId || '') || 'Unknown',
      }));
  }, [allSessions, workspaceLabels]);

  // Awaiting confirmation sessions
  const awaitingSessions = useMemo<RunningSessionInfo[]>(() => {
    return runningSessions.filter(s => s.session.status === 'awaiting-confirmation');
  }, [runningSessions]);

  // Group by workspace
  const byWorkspace = useMemo<WorkspaceRunningInfo[]>(() => {
    const groups = new Map<string, AgentSessionState[]>();
    
    allSessions
      .filter(s => isSessionRunning(s.status))
      .forEach(session => {
        const wid = session.workspaceId || 'unknown';
        if (!groups.has(wid)) {
          groups.set(wid, []);
        }
        groups.get(wid)!.push(session);
      });

    return Array.from(groups.entries())
      .map(([workspaceId, sessions]) => ({
        workspaceId,
        workspaceLabel: workspaceLabels.get(workspaceId) || 'Unknown',
        runningCount: sessions.length,
        sessions: sortSessionsRunningFirst(sessions),
      }))
      .sort((a, b) => b.runningCount - a.runningCount);
  }, [allSessions, workspaceLabels]);

  // Build state
  return useMemo<RunningSessionsOverviewState>(() => ({
    runningSessions,
    totalRunning: runningSessions.length,
    byWorkspace,
    activeWorkspaceCount: byWorkspace.length,
    hasAwaitingConfirmation: awaitingSessions.length > 0,
    awaitingSessions,
  }), [runningSessions, byWorkspace, awaitingSessions]);
}

export default useRunningSessionsOverview;
