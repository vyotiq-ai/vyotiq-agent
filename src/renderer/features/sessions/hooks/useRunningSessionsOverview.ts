/**
 * useRunningSessionsOverview Hook
 * 
 * Provides a summary of all running sessions.
 * Useful for status indicators and global session monitoring.
 */
import { useMemo } from 'react';
import { useAgentSelector } from '../../../state/AgentProvider';
import type { AgentSessionState } from '../../../../shared/types';
import {
  isSessionRunning,
  sortSessionsRunningFirst,
} from '../utils';

// =============================================================================
// Types
// =============================================================================

export interface RunningSessionInfo {
  session: AgentSessionState;
}

export interface WorkspaceRunningInfo {
  runningCount: number;
  sessions: AgentSessionState[];
}

export interface RunningSessionsOverviewState {
  /** All running sessions */
  runningSessions: RunningSessionInfo[];
  /** Total running count */
  totalRunning: number;
  /** Running sessions grouped by workspace (kept for API compatibility) */
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

  // Filter running sessions
  const runningSessions = useMemo<RunningSessionInfo[]>(() => {
    return allSessions
      .filter(s => isSessionRunning(s.status))
      .map(session => ({
        session,
      }));
  }, [allSessions]);

  // Awaiting confirmation sessions
  const awaitingSessions = useMemo<RunningSessionInfo[]>(() => {
    return runningSessions.filter(s => s.session.status === 'awaiting-confirmation');
  }, [runningSessions]);

  // Single group for all running sessions
  const byWorkspace = useMemo<WorkspaceRunningInfo[]>(() => {
    const running = allSessions.filter(s => isSessionRunning(s.status));
    if (running.length === 0) return [];
    return [{
      runningCount: running.length,
      sessions: sortSessionsRunningFirst(running),
    }];
  }, [allSessions]);

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
