/**
 * useAllWorkspaceSessions Hook
 * 
 * Provides access to sessions across all workspaces with filtering and grouping.
 * Useful for cross-workspace session management and overview displays.
 */
import { useMemo, useCallback } from 'react';
import { useAgentSelector, useAgentActions } from '../../../state/AgentProvider';
import type { AgentSessionState, WorkspaceEntry } from '../../../../shared/types';
import {
  isSessionRunning,
  sortSessions,
  filterAndSortSessions,
  getSessionStats,
  getRunningCountByWorkspace,
  groupSessionsByWorkspace,
  type SessionSortKey,
  type SessionFilterOptions,
  type SessionStats,
} from '../utils';

// =============================================================================
// Types
// =============================================================================

export interface AllWorkspaceSessionsState {
  /** All sessions across all workspaces */
  sessions: AgentSessionState[];
  /** All workspaces */
  workspaces: WorkspaceEntry[];
  /** Map of workspace ID to label */
  workspaceLabels: Map<string, string>;
  /** Total session count */
  totalCount: number;
  /** Running session count across all workspaces */
  runningCount: number;
  /** Session statistics */
  stats: SessionStats;
  /** Running count per workspace */
  runningByWorkspace: Map<string, number>;
}

export interface AllWorkspaceSessionsActions {
  /** Filter and sort sessions */
  filterSessions: (options: SessionFilterOptions) => AgentSessionState[];
  /** Group sessions by workspace */
  groupByWorkspace: () => Array<{ label: string; sessions: AgentSessionState[] }>;
  /** Get sessions for a specific workspace */
  getSessionsForWorkspace: (workspaceId: string) => AgentSessionState[];
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

  // Get all sessions and workspaces
  const allSessions = useAgentSelector(
    s => s.sessions ?? [],
    (a, b) => a === b
  );

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

  // Calculate statistics
  const stats = useMemo(() => getSessionStats(allSessions), [allSessions]);
  const runningByWorkspace = useMemo(() => getRunningCountByWorkspace(allSessions), [allSessions]);

  // Build state
  const state = useMemo<AllWorkspaceSessionsState>(() => ({
    sessions: allSessions,
    workspaces,
    workspaceLabels,
    totalCount: allSessions.length,
    runningCount: stats.running,
    stats,
    runningByWorkspace,
  }), [allSessions, workspaces, workspaceLabels, stats, runningByWorkspace]);

  // Actions
  const filterSessions = useCallback((options: SessionFilterOptions) => {
    return filterAndSortSessions(allSessions, options);
  }, [allSessions]);

  const groupByWorkspace = useCallback(() => {
    return groupSessionsByWorkspace(allSessions, workspaceLabels);
  }, [allSessions, workspaceLabels]);

  const getSessionsForWorkspace = useCallback((workspaceId: string) => {
    return allSessions.filter(s => s.workspaceId === workspaceId);
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
    groupByWorkspace,
    getSessionsForWorkspace,
    getRunningSessions,
    deleteSession,
    cancelSession,
  }), [filterSessions, groupByWorkspace, getSessionsForWorkspace, getRunningSessions, deleteSession, cancelSession]);

  return { state, actions };
}

export default useAllWorkspaceSessions;
