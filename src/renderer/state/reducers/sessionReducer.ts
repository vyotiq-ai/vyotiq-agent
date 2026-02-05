/**
 * Session Reducer
 * 
 * Handles session-related state updates.
 */

import type { AgentSessionState } from '../../../shared/types';
import type { AgentUIState } from '../agentReducer';
import { computeSessionCostSnapshot } from '../agentReducer';
import { safeCreateSet, hasSessionChanged } from '../agentReducerUtils';
import { createLogger } from '../../utils/logger';

const logger = createLogger('SessionReducer');

export type SessionAction =
  | { type: 'SESSION_UPSERT'; payload: AgentSessionState }
  | { type: 'SESSION_SET_ACTIVE'; payload: string }
  | { type: 'SESSION_RENAME'; payload: { sessionId: string; title: string } }
  | { type: 'SESSION_DELETE'; payload: string }
  | { type: 'SESSIONS_CLEAR' }
  | { type: 'SESSIONS_CLEAR_FOR_WORKSPACE'; payload: string }
  | { type: 'SESSIONS_CLEAR_FOR_WORKSPACE_PRESERVE_RUNNING'; payload: string };

/**
 * Handle session upsert (create or update)
 * 
 * OPTIMIZATIONS:
 * - Early exit for reference-equal sessions
 * - Uses hasSessionChanged for fast change detection
 * - Only builds content map for assistant messages with content
 * - Only computes cost when messages have usage data
 */
function handleSessionUpsert(
  state: AgentUIState, 
  incomingSession: AgentSessionState
): AgentUIState {
  const existingSessionIndex = state.sessions.findIndex((session) => session.id === incomingSession.id);
  const existingSession = existingSessionIndex >= 0 ? state.sessions[existingSessionIndex] : undefined;
  
  // OPTIMIZATION: Early exit if session is reference-equal (no change)
  if (existingSession === incomingSession) {
    return state;
  }

  // OPTIMIZATION: Use fast change detection to skip expensive merge
  if (existingSession && !hasSessionChanged(existingSession, incomingSession)) {
    return state;
  }
  
  // If session status changed to 'idle', clear any pending confirmations
  let updatedPendingConfirmations = state.pendingConfirmations;
  if (incomingSession.status === 'idle') {
    const sessionId = incomingSession.id;
    const hasConfirmationsForSession = Object.values(state.pendingConfirmations)
      .some(conf => conf.sessionId === sessionId);
    if (hasConfirmationsForSession) {
      updatedPendingConfirmations = Object.fromEntries(
        Object.entries(state.pendingConfirmations)
          .filter(([, conf]) => conf.sessionId !== sessionId)
      );
    }
  }
  
  if (existingSession) {
    // Merge session state - preserve streamed content, thinking, and generated media
    let nextSessionCost = state.sessionCost;
    
    // OPTIMIZATION: Build lookup map only for assistant messages with content (reverse iteration)
    const existingContentMap = new Map<string, {
      content: string;
      thinking?: string;
      isThinkingStreaming?: boolean;
      generatedImages?: Array<{ data: string; mimeType: string }>;
      generatedAudio?: { data: string; mimeType: string };
    }>();
    
    for (let i = existingSession.messages.length - 1; i >= 0; i--) {
      const msg = existingSession.messages[i];
      if (msg.role === 'assistant' && (msg.content || msg.thinking || msg.isThinkingStreaming || msg.generatedImages || msg.generatedAudio)) {
        existingContentMap.set(msg.id, {
          content: msg.content || '',
          thinking: msg.thinking,
          isThinkingStreaming: msg.isThinkingStreaming,
          generatedImages: msg.generatedImages,
          generatedAudio: msg.generatedAudio,
        });
      }
    }
    
    // OPTIMIZATION: Only map messages if we have content to preserve
    let mergedMessages: typeof incomingSession.messages;
    if (existingContentMap.size === 0) {
      mergedMessages = incomingSession.messages;
    } else {
      mergedMessages = incomingSession.messages.map(incomingMsg => {
        if (incomingMsg.role !== 'assistant') return incomingMsg;
        
        const existing = existingContentMap.get(incomingMsg.id);
        if (!existing) return incomingMsg;
        
        const preserveContent = existing.content.length > (incomingMsg.content?.length ?? 0);
        const preserveThinking = existing.thinking &&
          existing.thinking.length > (incomingMsg.thinking?.length ?? 0);

        const hasIncomingImages = incomingMsg.generatedImages && incomingMsg.generatedImages.length > 0;
        const hasIncomingAudio = !!incomingMsg.generatedAudio;

        const hasToolCalls = incomingMsg.toolCalls && incomingMsg.toolCalls.length > 0;
        const hasContent = incomingMsg.content && incomingMsg.content.trim().length > 0;
        const thinkingIsDone = hasToolCalls || hasContent || incomingMsg.isThinkingStreaming === false;

        // OPTIMIZATION: Return same object if nothing changed
        if (!preserveContent && !preserveThinking && 
            hasIncomingImages === !!existing.generatedImages &&
            hasIncomingAudio === !!existing.generatedAudio) {
          return incomingMsg;
        }

        return {
          ...incomingMsg,
          content: preserveContent ? existing.content : incomingMsg.content,
          thinking: preserveThinking ? existing.thinking : incomingMsg.thinking,
          isThinkingStreaming: thinkingIsDone ? false : incomingMsg.isThinkingStreaming,
          generatedImages: hasIncomingImages ? incomingMsg.generatedImages : existing.generatedImages,
          generatedAudio: hasIncomingAudio ? incomingMsg.generatedAudio : existing.generatedAudio,
        };
      });
    }

    // OPTIMIZATION: Only compute cost if messages have usage data
    const hasUsageData = mergedMessages.some(m => m.usage);
    if (hasUsageData) {
      try {
        const costSnapshot = computeSessionCostSnapshot(mergedMessages);
        nextSessionCost = {
          ...nextSessionCost,
          [incomingSession.id]: costSnapshot,
        };
      } catch (error) {
        logger.warn('Failed to compute session cost snapshot', {
          sessionId: incomingSession.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    // OPTIMIZATION: Use slice() instead of map for array copy
    const sessions = state.sessions.slice();
    sessions[existingSessionIndex] = {
      ...incomingSession,
      messages: mergedMessages,
    };
    
    return { ...state, sessions, pendingConfirmations: updatedPendingConfirmations, sessionCost: nextSessionCost };
  } else {
    // New session - add it
    const sessions = [...state.sessions, incomingSession];
    const activeSessionId = state.activeSessionId ?? incomingSession.id;
    let nextSessionCost = state.sessionCost;
    
    // Only compute cost if there are messages with usage
    if (incomingSession.messages.some(m => m.usage)) {
      try {
        nextSessionCost = {
          ...state.sessionCost,
          [incomingSession.id]: computeSessionCostSnapshot(incomingSession.messages),
        };
      } catch (error) {
        logger.warn('Failed to compute session cost snapshot', {
          sessionId: incomingSession.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { ...state, sessions, activeSessionId, pendingConfirmations: updatedPendingConfirmations, sessionCost: nextSessionCost };
  }
}

/**
 * Handle session deletion
 */
function handleSessionDelete(state: AgentUIState, sessionId: string): AgentUIState {
  // Find the session to extract runIds before filtering
  const deletedSession = state.sessions.find((session) => session.id === sessionId);
  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  const activeSessionId =
    state.activeSessionId === sessionId
      ? sessions[0]?.id
      : state.activeSessionId;
  
  // Clean up task state for deleted session (keyed by sessionId)
  const { [sessionId]: _deletedProgress, ...remainingProgress } = state.progressGroups;
  const { [sessionId]: _deletedArtifacts, ...remainingArtifacts } = state.artifacts;
  const { [sessionId]: _deletedStatus, ...remainingStatus } = state.agentStatus;
  const { [sessionId]: _deletedRouting, ...remainingRouting } = state.routingDecisions ?? {};
  const { [sessionId]: _deletedMetrics, ...remainingMetrics } = state.contextMetrics ?? {};
  const { [sessionId]: _deletedTodos, ...remainingTodos } = state.todos ?? {};
  
  // Extract unique runIds from deleted session's messages to clean up run-keyed state
  const runIdsToClean = new Set<string>();
  if (deletedSession?.messages) {
    for (const message of deletedSession.messages) {
      if (message.runId) {
        runIdsToClean.add(message.runId);
      }
    }
  }
  
  // Clean up toolResults and inlineArtifacts (keyed by runId)
  let remainingToolResults = state.toolResults;
  let remainingInlineArtifacts = state.inlineArtifacts;
  
  if (runIdsToClean.size > 0) {
    remainingToolResults = Object.fromEntries(
      Object.entries(state.toolResults).filter(([runId]) => !runIdsToClean.has(runId))
    );
    remainingInlineArtifacts = Object.fromEntries(
      Object.entries(state.inlineArtifacts).filter(([runId]) => !runIdsToClean.has(runId))
    );
  }
  
  // Suppress unused variable warnings - these are intentionally destructured to remove from state
  void _deletedProgress;
  void _deletedArtifacts;
  void _deletedStatus;
  void _deletedRouting;
  void _deletedMetrics;
  void _deletedTodos;
  
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
    routingDecisions: remainingRouting,
    contextMetrics: remainingMetrics,
    todos: remainingTodos,
    toolResults: remainingToolResults,
    inlineArtifacts: remainingInlineArtifacts,
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
  
  // Get removed sessions and their runIds
  const removedSessions = state.sessions.filter(s => s.workspaceId !== workspaceId);
  const removedSessionIds = new Set(removedSessions.map(s => s.id));
  
  // Extract runIds from removed sessions for cleanup of run-keyed state
  const runIdsToClean = new Set<string>();
  for (const session of removedSessions) {
    if (session.messages) {
      for (const message of session.messages) {
        if (message.runId) {
          runIdsToClean.add(message.runId);
        }
      }
    }
  }
  
  // Clean up session-keyed state
  const progressGroups = Object.fromEntries(
    Object.entries(state.progressGroups).filter(([id]) => !removedSessionIds.has(id))
  );
  const artifacts = Object.fromEntries(
    Object.entries(state.artifacts).filter(([id]) => !removedSessionIds.has(id))
  );
  const agentStatus = Object.fromEntries(
    Object.entries(state.agentStatus).filter(([id]) => !removedSessionIds.has(id))
  );
  const routingDecisions = Object.fromEntries(
    Object.entries(state.routingDecisions ?? {}).filter(([id]) => !removedSessionIds.has(id))
  );
  const contextMetrics = Object.fromEntries(
    Object.entries(state.contextMetrics ?? {}).filter(([id]) => !removedSessionIds.has(id))
  );
  const todos = Object.fromEntries(
    Object.entries(state.todos ?? {}).filter(([id]) => !removedSessionIds.has(id))
  );
  
  // Clean up run-keyed state
  const toolResults = runIdsToClean.size > 0
    ? Object.fromEntries(Object.entries(state.toolResults).filter(([runId]) => !runIdsToClean.has(runId)))
    : state.toolResults;
  const inlineArtifacts = runIdsToClean.size > 0
    ? Object.fromEntries(Object.entries(state.inlineArtifacts).filter(([runId]) => !runIdsToClean.has(runId)))
    : state.inlineArtifacts;
  
  return {
    ...state,
    sessions,
    activeSessionId,
    progressGroups,
    artifacts,
    agentStatus,
    routingDecisions,
    contextMetrics,
    todos,
    toolResults,
    inlineArtifacts,
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
      const sessionIndex = state.sessions.findIndex(s => s.id === sessionId);
      
      // Early return if session not found or title unchanged
      if (sessionIndex === -1) return state;
      if (state.sessions[sessionIndex].title === title) return state;
      
      // Only create new array when actually changing
      const sessions = state.sessions.slice();
      sessions[sessionIndex] = { ...sessions[sessionIndex], title };
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
        // Also clear all other session-related state for complete cleanup
        routingDecisions: {},
        contextMetrics: {},
        todos: {},
        toolResults: {},
        inlineArtifacts: {},
        sessionCost: {},
        terminalStreams: {},
      };
      
    case 'SESSIONS_CLEAR_FOR_WORKSPACE':
      return handleSessionsClearForWorkspace(state, action.payload);
      
    default:
      return state;
  }
}
