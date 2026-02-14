import { useMemo, useCallback, useRef } from 'react';
import { useAgentActions, useAgentSelector } from '../../../state/AgentProvider';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('SessionList');

// Module-level cache for sessionsMeta to avoid O(n) object allocation per snapshot
let lastSessionsRef: unknown = null;
let lastSessionsMeta: Array<{ id: string; title: string; updatedAt: number; status: string; messageCount: number; workspacePath?: string | null }> = [];

/**
 * Hook to manage session list.
 * 
 * When filterByWorkspace is true and workspacePath is provided,
 * only sessions associated with the current workspace are shown.
 * Sessions with no workspace (global) are always included.
 * 
 * Session switching while agent is running:
 * - When user switches to a different session while agent is running,
 *   the previous session's run is automatically cancelled for clean state transition.
 * 
 * @returns Session list management utilities
 */
export const useSessionList = (_options?: { 
  filterByWorkspace?: boolean;
  showLegacySessions?: boolean;
  workspacePath?: string | null;
}) => {
  const actions = useAgentActions();
  const workspacePath = _options?.workspacePath ?? null;
  const filterByWorkspace = _options?.filterByWorkspace ?? false;

  const snapshot = useAgentSelector(
    (state) => {
      // Cache the .map() — only recompute when sessions array reference changes
      if (state.sessions !== lastSessionsRef) {
        lastSessionsRef = state.sessions;
        lastSessionsMeta = (state.sessions ?? []).map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          status: s.status,
          messageCount: s.messages?.length ?? 0,
          workspacePath: s.workspacePath ?? null,
        }));
      }
      return {
        activeSessionId: state.activeSessionId,
        sessionsMeta: lastSessionsMeta,
      };
    },
    (a, b) => {
      if (a.activeSessionId !== b.activeSessionId) return false;
      if (a.sessionsMeta.length !== b.sessionsMeta.length) return false;
      for (let i = 0; i < a.sessionsMeta.length; i++) {
        const x = a.sessionsMeta[i];
        const y = b.sessionsMeta[i];
        if (
          x.id !== y.id ||
          x.title !== y.title ||
          x.updatedAt !== y.updatedAt ||
          x.status !== y.status ||
          x.messageCount !== y.messageCount
        ) {
          return false;
        }
      }
      return true;
    },
  );
  
  // Ref to track if we're already handling selection to prevent loops
  const isSelectingRef = useRef(false);

  // Show sessions sorted by most recent, optionally filtered by workspace
  const sessions = useMemo(() => {
    const sorted = [...snapshot.sessionsMeta].sort((a, b) => b.updatedAt - a.updatedAt);

    // If filtering by workspace is enabled and a workspace is active,
    // only show sessions for this workspace + global (null) sessions
    if (filterByWorkspace && workspacePath) {
      const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      const normalizedWs = normPath(workspacePath);
      return sorted.filter((s) => {
        if (!s.workspacePath) return true; // global sessions always shown
        return normPath(s.workspacePath) === normalizedWs;
      });
    }

    return sorted;
  }, [snapshot.sessionsMeta, filterByWorkspace, workspacePath]);
  
  const activeSessionId = snapshot.activeSessionId;
  
  // Check if the active session belongs to the current workspace
  const activeSessionBelongsToWorkspace = useMemo(() => {
    if (!activeSessionId) return false;
    return sessions.some((s) => s.id === activeSessionId);
  }, [activeSessionId, sessions]);

  const handleStartSession = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    return actions.startSession(undefined, workspacePath);
  }, [actions, workspacePath]);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    // Prevent re-entry during selection
    if (isSelectingRef.current) return;
    
    // Don't select if already selected
    if (sessionId === activeSessionId) return;
    
    // If selecting empty string, just clear
    if (!sessionId) {
      actions.setActiveSession('');
      return;
    }

    isSelectingRef.current = true;
    try {
      // Check if current session is running and cancel it before switching
      const currentSession = snapshot.sessionsMeta.find(s => s.id === activeSessionId);
      if (currentSession && activeSessionId && 
          (currentSession.status === 'running' || currentSession.status === 'awaiting-confirmation')) {
        logger.info('Cancelling running session before switching', {
          fromSession: activeSessionId,
          toSession: sessionId,
        });
        try {
          await actions.cancelRun(activeSessionId);
        } catch (cancelError) {
          logger.warn('Failed to cancel previous session run', { error: cancelError });
          // Continue with session switch even if cancel fails
        }
      }
      
      actions.setActiveSession(sessionId);
    } finally {
      // Reset after a small delay to allow state to settle
      setTimeout(() => {
        isSelectingRef.current = false;
      }, 50);
    }
  }, [actions, activeSessionId, snapshot.sessionsMeta]);

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    actions.deleteSession(sessionId);
  }, [actions]);

  return {
    sessions,
    activeSessionId,
    activeSessionBelongsToWorkspace,
    handleStartSession,
    handleSelectSession,
    handleDeleteSession
  };
};
