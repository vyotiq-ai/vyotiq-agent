/**
 * useAllWorkspaceSessions Hook
 * 
 * Provides access to all sessions with filtering and grouping.
 */
import { useMemo, useCallback } from 'react';
import { useAgentSelector, useAgentActions } from '../../../state/AgentProvider';
import type { AgentSessionState } from '../../../../shared/types';
import {
  isSessionRunning,
  filterAndSortSessions,
  getSessionStats,
  type SessionFilterOptions,
  type SessionStats,
} from '../utils';

// =============================================================================
// Types
// =============================================================================

export interface AllWorkspaceSessionsState {
  /** All sessions */
  sessions: AgentSessionState[];
  /** Total session count */
  totalCount: number;
  /** Running session count */
  runningCount: number;
  /** Session statistics */
  stats: SessionStats;
}

export interface AllWorkspaceSessionsActions {
  /** Filter and sort sessions */
  filterSessions: (options: SessionFilterOptions) => AgentSessionState[];
  /** Get running sessions only */
  getRunningSessions: () => AgentSessionState[];
  /** Delete a session */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Cancel a running session */
  cancelSession: (sessionId: string) => Promise<void>;
}

// =============================================================================
// Hook
// =============================================================================

export function useAllWorkspaceSessions(): {
  state: AllWorkspaceSessionsState;
  actions: AllWorkspaceSessionsActions;
} {
  const agentActions = useAgentActions();

  // Get all sessions
  const allSessions = useAgentSelector(
    s => s.sessions ?? [],
    (a, b) => a === b
  );

  // Calculate statistics
  const stats = useMemo(() => getSessionStats(allSessions), [allSessions]);

  // Build state
  const state = useMemo<AllWorkspaceSessionsState>(() => ({
    sessions: allSessions,
    totalCount: allSessions.length,
    runningCount: stats.running,
    stats,
  }), [allSessions, stats]);

  // Actions
  const filterSessions = useCallback((options: SessionFilterOptions) => {
    return filterAndSortSessions(allSessions, options);
  }, [allSessions]);

  const getRunningSessions = useCallback(() => {
    return allSessions.filter(s => isSessionRunning(s.status));
  }, [allSessions]);

  const deleteSession = useCallback(async (sessionId: string) => {
    await agentActions.deleteSession(sessionId);
  }, [agentActions]);

  const cancelSession = useCallback(async (sessionId: string) => {
    await agentActions.cancelRun(sessionId);
  }, [agentActions]);

  const actions = useMemo<AllWorkspaceSessionsActions>(() => ({
    filterSessions,
    getRunningSessions,
    deleteSession,
    cancelSession,
  }), [filterSessions, getRunningSessions, deleteSession, cancelSession]);

  return { state, actions };
}

export default useAllWorkspaceSessions;
