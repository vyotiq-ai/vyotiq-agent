import { useMemo, useCallback, useRef } from 'react';
import { useAgentActions, useAgentSelector } from '../../../state/AgentProvider';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('SessionList');

/**
 * Hook to manage session list with workspace-aware filtering.
 * 
 * Sessions are STRICTLY filtered to only show those belonging to the active workspace.
 * This ensures users only see relevant sessions for their current context and
 * the agent always operates in the correct workspace.
 * 
 * Sessions without a workspaceId (legacy sessions) are NOT shown by default to prevent
 * workspace confusion. They can be shown by setting `showLegacySessions: true`.
 * 
 * @param options.filterByWorkspace - If true (default), only shows sessions for active workspace
 * @param options.showLegacySessions - If true, shows sessions without workspaceId (default: false)
 * @returns Session list management utilities
 */
export const useSessionList = (options?: { 
  filterByWorkspace?: boolean;
  showLegacySessions?: boolean;
}) => {
  const { filterByWorkspace = true, showLegacySessions = false } = options ?? {};
  const actions = useAgentActions();

  const snapshot = useAgentSelector(
    (state) => {
      const activeWorkspaceId = state.workspaces.find((w) => w.isActive)?.id;
      const sessionsMeta = (state.sessions ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
        status: s.status,
        workspaceId: s.workspaceId,
        messageCount: s.messages?.length ?? 0,
      }));
      return {
        activeWorkspaceId,
        activeSessionId: state.activeSessionId,
        sessionsMeta,
      };
    },
    (a, b) => {
      if (a.activeWorkspaceId !== b.activeWorkspaceId) return false;
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
          x.workspaceId !== y.workspaceId ||
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
  
  // Get the active workspace ID
  const activeWorkspaceId = snapshot.activeWorkspaceId;

  // STRICTLY filter sessions by active workspace
  // Sessions without a workspaceId are hidden by default to prevent workspace confusion
  const sessions = useMemo(() => {
    const allSessions = snapshot.sessionsMeta;
    
    if (!filterByWorkspace) {
      // Show all sessions when filtering is disabled (admin/debug mode)
      return [...allSessions].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    
    if (!activeWorkspaceId) {
      // No active workspace - show nothing to prevent confusion
      return [];
    }
    
    return allSessions
      .filter((session) => {
        // Only show sessions that explicitly belong to the active workspace
        if (session.workspaceId === activeWorkspaceId) {
          return true;
        }
        // Optionally show legacy sessions (without workspaceId)
        if (!session.workspaceId && showLegacySessions) {
          return true;
        }
        return false;
      })
        .sort((a, b) => b.updatedAt - a.updatedAt);
      }, [snapshot.sessionsMeta, activeWorkspaceId, filterByWorkspace, showLegacySessions]);
  
      const activeSessionId = snapshot.activeSessionId;
  
  // Check if active session belongs to current workspace
  const activeSessionBelongsToWorkspace = useMemo(() => {
    if (!activeSessionId || !activeWorkspaceId) return false;
    
    const activeSession = snapshot.sessionsMeta.find((s) => s.id === activeSessionId);
    if (!activeSession) return false;
    
    // Strict check: session must have matching workspaceId
    return activeSession.workspaceId === activeWorkspaceId;
  }, [activeSessionId, activeWorkspaceId, snapshot.sessionsMeta]);

  const handleStartSession = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    // Prevent starting session without workspace
    if (!activeWorkspaceId) {
      logger.warn('Cannot start session: no active workspace');
      return undefined;
    }
    
    return actions.startSession();
  }, [actions, activeWorkspaceId]);

  const handleSelectSession = useCallback((sessionId: string) => {
    // Prevent re-entry during selection
    if (isSelectingRef.current) return;
    
    // Don't select if already selected
    if (sessionId === activeSessionId) return;
    
    // If selecting empty string, just clear
    if (!sessionId) {
      actions.setActiveSession('');
      return;
    }
    
    // Verify session belongs to current workspace before selecting
    const session = snapshot.sessionsMeta.find(s => s.id === sessionId);
    if (session && activeWorkspaceId && session.workspaceId !== activeWorkspaceId) {
      logger.warn('Cannot select session from different workspace', {
        sessionWorkspace: session.workspaceId,
        activeWorkspace: activeWorkspaceId,
      });
      return;
    }
    
    isSelectingRef.current = true;
    try {
      actions.setActiveSession(sessionId);
    } finally {
      // Reset after a small delay to allow state to settle
      setTimeout(() => {
        isSelectingRef.current = false;
      }, 50);
    }
  }, [actions, activeSessionId, activeWorkspaceId, snapshot.sessionsMeta]);

  const handleDeleteSession = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    actions.deleteSession(sessionId);
  }, [actions]);

  return {
    sessions,
    activeSessionId,
    activeWorkspaceId,
    activeSessionBelongsToWorkspace,
    handleStartSession,
    handleSelectSession,
    handleDeleteSession
  };
};
