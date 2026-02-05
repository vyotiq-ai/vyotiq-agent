/**
 * Workspace Sessions Hook
 * 
 * Provides workspace-scoped session management with React 19 concurrent features
 * for smooth multi-workspace operation without UI blocking.
 */
import { useCallback, useMemo, useTransition, useDeferredValue } from 'react';
import { useAgentSelector, useAgentActions } from '../state/AgentProvider';
import { useFocusedWorkspace } from '../state/WorkspaceTabsProvider';
import type { AgentSessionState } from '../../shared/types';

// =============================================================================
// Types
// =============================================================================

export interface WorkspaceSessionsState {
  /** Sessions belonging to the focused workspace */
  sessions: AgentSessionState[];
  /** Active session in the focused workspace */
  activeSession: AgentSessionState | null;
  /** Whether any session is currently running */
  hasRunningSession: boolean;
  /** Total session count in focused workspace */
  sessionCount: number;
  /** Running session count */
  runningCount: number;
  /** Whether workspace switch is pending (for transition feedback) */
  isPending: boolean;
}

export interface WorkspaceSessionsActions {
  /** Create a new session in the focused workspace */
  createSession: () => Promise<string | undefined>;
  /** Switch to a specific session */
  setActiveSession: (sessionId: string) => void;
  /** Delete a session from the focused workspace */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Send a message to the active session */
  sendMessage: (content: string, attachments?: Parameters<ReturnType<typeof useAgentActions>['sendMessage']>[1]) => Promise<void>;
  /** Cancel the current run */
  cancelRun: () => Promise<void>;
  /** Get sessions for a specific workspace (for cross-workspace operations) */
  getSessionsForWorkspace: (workspaceId: string) => AgentSessionState[];
}

// =============================================================================
// Hook
// =============================================================================

export function useWorkspaceSessions(): {
  state: WorkspaceSessionsState;
  actions: WorkspaceSessionsActions;
} {
  const [isPending, startTransition] = useTransition();
  
  // Get focused workspace from tabs
  const focusedWorkspace = useFocusedWorkspace();
  const focusedWorkspaceId = focusedWorkspace?.id;
  
  // Get all sessions and active session ID from agent state
  const allSessions = useAgentSelector(
    s => s.sessions,
    (a, b) => a === b
  );
  
  const activeSessionId = useAgentSelector(
    s => s.activeSessionId,
    (a, b) => a === b
  );
  
  // Defer session filtering for smoother workspace switches
  const deferredWorkspaceId = useDeferredValue(focusedWorkspaceId);
  
  // Filter sessions for the focused workspace
  const workspaceSessions = useMemo(() => {
    if (!deferredWorkspaceId) return [];
    return allSessions.filter(s => s.workspaceId === deferredWorkspaceId);
  }, [allSessions, deferredWorkspaceId]);
  
  // Find active session within the workspace
  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return workspaceSessions.find(s => s.id === activeSessionId) ?? null;
  }, [workspaceSessions, activeSessionId]);
  
  // Calculate running sessions
  const runningCount = useMemo(() => {
    return workspaceSessions.filter(
      s => s.status === 'running' || s.status === 'awaiting-confirmation'
    ).length;
  }, [workspaceSessions]);
  
  // Build state object
  const state = useMemo<WorkspaceSessionsState>(() => ({
    sessions: workspaceSessions,
    activeSession,
    hasRunningSession: runningCount > 0,
    sessionCount: workspaceSessions.length,
    runningCount,
    isPending,
  }), [workspaceSessions, activeSession, runningCount, isPending]);
  
  // Get agent actions
  const agentActions = useAgentActions();
  
  // Create workspace-scoped actions
  const createSession = useCallback(async (): Promise<string | undefined> => {
    return agentActions.createSession();
  }, [agentActions]);
  
  const setActiveSession = useCallback((sessionId: string) => {
    // Use transition for smooth switching
    startTransition(() => {
      agentActions.setActiveSession(sessionId);
    });
  }, [agentActions]);
  
  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    await agentActions.deleteSession(sessionId);
  }, [agentActions]);
  
  const sendMessage = useCallback(async (
    content: string,
    attachments?: Parameters<ReturnType<typeof useAgentActions>['sendMessage']>[1]
  ): Promise<void> => {
    await agentActions.sendMessage(content, attachments);
  }, [agentActions]);
  
  const cancelRun = useCallback(async (): Promise<void> => {
    if (activeSession?.id) {
      await agentActions.cancelRun(activeSession.id);
    }
  }, [agentActions, activeSession?.id]);
  
  const getSessionsForWorkspace = useCallback((workspaceId: string): AgentSessionState[] => {
    return allSessions.filter(s => s.workspaceId === workspaceId);
  }, [allSessions]);
  
  // Build actions object
  const actions = useMemo<WorkspaceSessionsActions>(() => ({
    createSession,
    setActiveSession,
    deleteSession,
    sendMessage,
    cancelRun,
    getSessionsForWorkspace,
  }), [createSession, setActiveSession, deleteSession, sendMessage, cancelRun, getSessionsForWorkspace]);
  
  return { state, actions };
}

/**
 * Hook to get running sessions across all workspaces
 * Useful for showing global activity indicator
 */
export function useAllRunningSessions(): {
  runningSessions: AgentSessionState[];
  runningByWorkspace: Map<string, AgentSessionState[]>;
  totalRunning: number;
} {
  const allSessions = useAgentSelector(
    s => s.sessions,
    (a, b) => a === b
  );
  
  const runningSessions = useMemo(() => {
    return allSessions.filter(
      s => s.status === 'running' || s.status === 'awaiting-confirmation'
    );
  }, [allSessions]);
  
  const runningByWorkspace = useMemo(() => {
    const map = new Map<string, AgentSessionState[]>();
    for (const session of runningSessions) {
      const workspaceId = session.workspaceId ?? 'unknown';
      const existing = map.get(workspaceId) ?? [];
      map.set(workspaceId, [...existing, session]);
    }
    return map;
  }, [runningSessions]);
  
  return {
    runningSessions,
    runningByWorkspace,
    totalRunning: runningSessions.length,
  };
}

/**
 * Hook to check if a specific workspace has activity
 */
export function useWorkspaceActivity(workspaceId: string | null | undefined): {
  isActive: boolean;
  sessionCount: number;
  runningCount: number;
} {
  const allSessions = useAgentSelector(
    s => s.sessions,
    (a, b) => a === b
  );
  
  return useMemo(() => {
    if (!workspaceId) {
      return { isActive: false, sessionCount: 0, runningCount: 0 };
    }
    
    const workspaceSessions = allSessions.filter(s => s.workspaceId === workspaceId);
    const runningCount = workspaceSessions.filter(
      s => s.status === 'running' || s.status === 'awaiting-confirmation'
    ).length;
    
    return {
      isActive: runningCount > 0,
      sessionCount: workspaceSessions.length,
      runningCount,
    };
  }, [allSessions, workspaceId]);
}

export default useWorkspaceSessions;
