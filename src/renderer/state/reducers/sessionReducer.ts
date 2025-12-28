/**
 * Session Reducer
 * 
 * Handles session-related state updates.
 */

import type { AgentSessionState } from '../../../shared/types';
import type { AgentUIState } from '../agentReducer';

/**
 * Safely create a Set from streamingSessions, handling cases where
 * it might not be a proper Set (e.g., after serialization/deserialization)
 */
function safeCreateSet(streamingSessions: Set<string> | unknown): Set<string> {
  if (streamingSessions instanceof Set) {
    return new Set(streamingSessions);
  }
  if (Array.isArray(streamingSessions)) {
    return new Set(streamingSessions);
  }
  if (streamingSessions && typeof streamingSessions === 'object') {
    const values = Object.values(streamingSessions as Record<string, string>);
    return new Set(values.filter((v): v is string => typeof v === 'string'));
  }
  return new Set();
}

export type SessionAction =
  | { type: 'SESSION_UPSERT'; payload: AgentSessionState }
  | { type: 'SESSION_SET_ACTIVE'; payload: string }
  | { type: 'SESSION_RENAME'; payload: { sessionId: string; title: string } }
  | { type: 'SESSION_DELETE'; payload: string }
  | { type: 'SESSIONS_CLEAR' }
  | { type: 'SESSIONS_CLEAR_FOR_WORKSPACE'; payload: string };

/**
 * Handle session upsert (create or update)
 */
function handleSessionUpsert(
  state: AgentUIState, 
  payload: AgentSessionState
): AgentUIState {
  const exists = state.sessions.find((session) => session.id === payload.id);
  
  // If session status changed to 'idle', clear any pending confirmations
  let updatedPendingConfirmations = state.pendingConfirmations;
  if (payload.status === 'idle') {
    const sessionId = payload.id;
    const hasConfirmationsForSession = Object.values(state.pendingConfirmations)
      .some(conf => conf.sessionId === sessionId);
    if (hasConfirmationsForSession) {
      updatedPendingConfirmations = Object.fromEntries(
        Object.entries(state.pendingConfirmations)
          .filter(([, conf]) => conf.sessionId !== sessionId)
      );
    }
  }
  
  if (exists) {
    // Merge session state - preserve streamed content
    const sessions = state.sessions.map((session) => {
      if (session.id === payload.id) {
        // Create a map of existing messages with their content
        const existingContentMap = new Map<string, string>();
        session.messages.forEach(msg => {
          if (msg.role === 'assistant' && msg.content) {
            existingContentMap.set(msg.id, msg.content);
          }
        });
        
        // Merge messages - preserve streamed content for assistant messages
        const mergedMessages = payload.messages.map(incomingMsg => {
          if (incomingMsg.role === 'assistant') {
            const existingContent = existingContentMap.get(incomingMsg.id);
            // Keep the longer content (streamed content vs backend content)
            if (existingContent && existingContent.length > (incomingMsg.content?.length ?? 0)) {
              return { ...incomingMsg, content: existingContent };
            }
          }
          return incomingMsg;
        });
        
        return {
          ...payload,
          messages: mergedMessages,
        };
      }
      return session;
    });
    return { ...state, sessions, pendingConfirmations: updatedPendingConfirmations };
  } else {
    // New session - add it
    const sessions = [...state.sessions, payload];
    const activeSessionId = state.activeSessionId ?? payload.id;
    return { ...state, sessions, activeSessionId, pendingConfirmations: updatedPendingConfirmations };
  }
}

/**
 * Handle session deletion
 */
function handleSessionDelete(state: AgentUIState, sessionId: string): AgentUIState {
  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  const activeSessionId =
    state.activeSessionId === sessionId
      ? sessions[0]?.id
      : state.activeSessionId;
  
  // Clean up task state for deleted session
  const { [sessionId]: _deletedProgress, ...remainingProgress } = state.progressGroups;
  const { [sessionId]: _deletedArtifacts, ...remainingArtifacts } = state.artifacts;
  const { [sessionId]: _deletedStatus, ...remainingStatus } = state.agentStatus;
  
  // Suppress unused variable warnings - these are intentionally destructured to remove from state
  void _deletedProgress;
  void _deletedArtifacts;
  void _deletedStatus;
  
  // Clear streaming state
  const streamingSessions = safeCreateSet(state.streamingSessions);
  streamingSessions.delete(sessionId);
  
  return { 
    ...state, 
    sessions, 
    activeSessionId,
    progressGroups: remainingProgress,
    artifacts: remainingArtifacts,
    agentStatus: remainingStatus,
    streamingSessions,
  };
}

/**
 * Handle clearing sessions for workspace
 */
function handleSessionsClearForWorkspace(
  state: AgentUIState, 
  workspaceId: string
): AgentUIState {
  const sessions = state.sessions.filter(
    (session) => session.workspaceId === workspaceId
  );
  
  // Clear active session if it doesn't belong to the workspace
  const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
  const activeSessionId = (activeSession?.workspaceId === workspaceId)
    ? state.activeSessionId
    : sessions[0]?.id;
  
  // Clean up task state for removed sessions
  const removedSessionIds = new Set(
    state.sessions
      .filter(s => s.workspaceId !== workspaceId)
      .map(s => s.id)
  );
  
  const progressGroups = Object.fromEntries(
    Object.entries(state.progressGroups).filter(([id]) => !removedSessionIds.has(id))
  );
  const artifacts = Object.fromEntries(
    Object.entries(state.artifacts).filter(([id]) => !removedSessionIds.has(id))
  );
  
  return {
    ...state,
    sessions,
    activeSessionId,
    progressGroups,
    artifacts,
  };
}

/**
 * Session reducer
 */
export function sessionReducer(
  state: AgentUIState, 
  action: SessionAction
): AgentUIState {
  switch (action.type) {
    case 'SESSION_UPSERT':
      return handleSessionUpsert(state, action.payload);
      
    case 'SESSION_SET_ACTIVE':
      return { ...state, activeSessionId: action.payload };
      
    case 'SESSION_RENAME': {
      const { sessionId, title } = action.payload;
      const sessions = state.sessions.map(session =>
        session.id === sessionId
          ? { ...session, title }
          : session
      );
      return { ...state, sessions };
    }
    
    case 'SESSION_DELETE':
      return handleSessionDelete(state, action.payload);
      
    case 'SESSIONS_CLEAR':
      return {
        ...state,
        sessions: [],
        activeSessionId: undefined,
        progressGroups: {},
        artifacts: {},
        pendingConfirmations: {},
        agentStatus: {},
        streamingSessions: new Set(),
      };
      
    case 'SESSIONS_CLEAR_FOR_WORKSPACE':
      return handleSessionsClearForWorkspace(state, action.payload);
      
    default:
      return state;
  }
}
