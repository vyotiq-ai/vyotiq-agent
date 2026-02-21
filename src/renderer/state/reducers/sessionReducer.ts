/**
 * Session Reducer
 * 
 * Handles session-related state updates.
 */

import type { AgentSessionState } from '../../../shared/types';
import type { AgentUIState } from '../agentReducer';
import { computeSessionCostSnapshot } from '../agentReducer';
import { safeCreateSet, hasSessionChanged } from '../agentReducerUtils';
import { computeSessionDelta, applySessionDelta, type SessionDelta } from '../sessionDelta';
import { createLogger } from '../../utils/logger';

const logger = createLogger('SessionReducer');

export type SessionAction =
  | { type: 'SESSION_UPSERT'; payload: AgentSessionState }
  | { type: 'SESSIONS_BULK_UPSERT'; payload: { sessions: AgentSessionState[]; activeSessionId?: string } }
  | { type: 'SESSIONS_REPLACE'; payload: { sessions: AgentSessionState[]; activeSessionId?: string } }
  | { type: 'SESSION_SET_ACTIVE'; payload: string }
  | { type: 'SESSION_RENAME'; payload: { sessionId: string; title: string } }
  | { type: 'SESSION_PATCH'; payload: { sessionId: string; patch: Partial<AgentSessionState>; messagePatch?: { messageId: string; changes: Record<string, unknown> } } }
  | { type: 'SESSION_APPLY_DELTA'; payload: SessionDelta }
  | { type: 'SESSION_DELETE'; payload: string }
  | { type: 'SESSIONS_CLEAR' };

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

  // OPTIMIZATION: When session exists, try delta-based update first to minimize object creation.
  // computeSessionDelta produces a compact diff; if it finds differences, we can use
  // the delta path which is cheaper than a full merge for large sessions.
  if (existingSession) {
    const delta = computeSessionDelta(existingSession, incomingSession);
    if (delta) {
      try {
        const { session: deltaUpdated, messagesChanged, propertiesChanged } = applySessionDelta(
          existingSession,
          delta,
        );
        if (messagesChanged > 0 || propertiesChanged.length > 0) {
          const deltaSessions = state.sessions.slice();
          deltaSessions[existingSessionIndex] = deltaUpdated;
          let nextCost = state.sessionCost;
          if (messagesChanged > 0 && deltaUpdated.messages.some(m => m.usage)) {
            try {
              nextCost = { ...nextCost, [deltaUpdated.id]: computeSessionCostSnapshot(deltaUpdated.messages) };
            } catch {
              // Fall through to full merge on cost computation failure
            }
          }
          // Handle idle-status clearing of pending confirmations
          let updatedPendingConfirmations = state.pendingConfirmations;
          if (incomingSession.status === 'idle') {
            const hasConfs = Object.values(state.pendingConfirmations).some(c => c.sessionId === incomingSession.id);
            if (hasConfs) {
              updatedPendingConfirmations = Object.fromEntries(
                Object.entries(state.pendingConfirmations).filter(([, c]) => c.sessionId !== incomingSession.id),
              );
            }
          }
          return { ...state, sessions: deltaSessions, sessionCost: nextCost, pendingConfirmations: updatedPendingConfirmations };
        }
      } catch {
        // Delta application failed — fall through to full merge below
        logger.debug('Delta-based upsert failed, falling back to full merge', { sessionId: incomingSession.id });
      }
    }
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
  const { [sessionId]: _deletedCost, ...remainingCost } = state.sessionCost ?? {};
  const { [sessionId]: _deletedErrors, ...remainingErrors } = state.runErrors ?? {};
  
  // Clean up pendingConfirmations belonging to the deleted session
  const remainingConfirmations = Object.fromEntries(
    Object.entries(state.pendingConfirmations).filter(([, c]) => c.sessionId !== sessionId),
  );
  
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
  
  // Clean up run-keyed state (toolResults, inlineArtifacts, executingTools, queuedTools, fileDiffStreams)
  let remainingExecutingTools = state.executingTools;
  let remainingQueuedTools = state.queuedTools;
  let remainingFileDiffStreams = state.fileDiffStreams;

  if (runIdsToClean.size > 0) {
    remainingToolResults = Object.fromEntries(
      Object.entries(state.toolResults).filter(([runId]) => !runIdsToClean.has(runId))
    );
    remainingInlineArtifacts = Object.fromEntries(
      Object.entries(state.inlineArtifacts).filter(([runId]) => !runIdsToClean.has(runId))
    );
    remainingExecutingTools = Object.fromEntries(
      Object.entries(state.executingTools).filter(([runId]) => !runIdsToClean.has(runId))
    );
    remainingQueuedTools = Object.fromEntries(
      Object.entries(state.queuedTools).filter(([runId]) => !runIdsToClean.has(runId))
    );
    remainingFileDiffStreams = Object.fromEntries(
      Object.entries(state.fileDiffStreams).filter(([runId]) => !runIdsToClean.has(runId))
    );
  }
  
  // Suppress unused variable warnings - these are intentionally destructured to remove from state
  void _deletedProgress;
  void _deletedArtifacts;
  void _deletedStatus;
  void _deletedRouting;
  void _deletedMetrics;
  void _deletedTodos;
  void _deletedCost;
  void _deletedErrors;
  
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
    sessionCost: remainingCost,
    runErrors: remainingErrors,
    executingTools: remainingExecutingTools,
    queuedTools: remainingQueuedTools,
    fileDiffStreams: remainingFileDiffStreams,
    pendingConfirmations: remainingConfirmations,
    streamingSessions,
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

    case 'SESSIONS_BULK_UPSERT': {
      // PERFORMANCE: Load all sessions in a single dispatch to avoid N individual dispatches
      // Each individual dispatch triggers all subscribers & React re-renders.
      // Bulk loading reduces this from N dispatches to 1.
      const { sessions: incomingSessions, activeSessionId: bulkActiveId } = action.payload;
      if (incomingSessions.length === 0) return state;

      // Build a map of existing sessions for O(1) lookups
      const existingMap = new Map(state.sessions.map(s => [s.id, s]));
      const mergedSessions = [...state.sessions];
      let nextSessionCost = state.sessionCost;

      for (const incoming of incomingSessions) {
        const existing = existingMap.get(incoming.id);
        const existingIdx = existing ? mergedSessions.findIndex(s => s.id === incoming.id) : -1;
        if (existing && existingIdx >= 0) {
          // Update existing — only if it actually changed
          if (!hasSessionChanged(existing, incoming)) continue;
          mergedSessions[existingIdx] = incoming;
          existingMap.set(incoming.id, incoming);
        } else {
          // New session
          mergedSessions.push(incoming);
          existingMap.set(incoming.id, incoming);
        }

        // Compute cost once per session (not per dispatch)
        if (incoming.messages.some(m => m.usage)) {
          try {
            nextSessionCost = {
              ...nextSessionCost,
              [incoming.id]: computeSessionCostSnapshot(incoming.messages),
            };
          } catch (err) {
            logger.warn('Cost computation failed for session', { sessionId: incoming.id, error: err instanceof Error ? err.message : String(err) });
          }
        }
      }

      const nextActiveId = bulkActiveId ?? state.activeSessionId ?? mergedSessions[0]?.id;
      return {
        ...state,
        sessions: mergedSessions,
        activeSessionId: nextActiveId,
        sessionCost: nextSessionCost,
      };
    }

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
    
    case 'SESSION_PATCH': {
      // Lightweight patch — O(1) update for trivial field changes (rename, config, reaction)
      // Avoids the full O(n) SESSION_UPSERT merge with all its message copying
      const { sessionId, patch, messagePatch } = action.payload;
      const patchIndex = state.sessions.findIndex(s => s.id === sessionId);
      if (patchIndex === -1) return state;

      const existing = state.sessions[patchIndex];
      let updated = { ...existing, ...patch };

      // Apply message-level patch (e.g., reaction change) without copying all messages
      if (messagePatch) {
        const msgIndex = updated.messages.findIndex(m => m.id === messagePatch.messageId);
        if (msgIndex !== -1) {
          const messages = updated.messages.slice();
          messages[msgIndex] = { ...messages[msgIndex], ...messagePatch.changes };
          updated = { ...updated, messages };
        }
      }

      const patchedSessions = state.sessions.slice();
      patchedSessions[patchIndex] = updated;
      return { ...state, sessions: patchedSessions };
    }

    case 'SESSION_APPLY_DELTA': {
      // Apply a computed delta to an existing session for efficient incremental updates.
      // Uses sessionDelta.ts applySessionDelta for minimal object creation.
      const delta = action.payload;
      const deltaIndex = state.sessions.findIndex(s => s.id === delta.sessionId);
      if (deltaIndex === -1) {
        logger.warn('SESSION_APPLY_DELTA: session not found', { sessionId: delta.sessionId });
        return state;
      }

      try {
        const { session: updatedSession, messagesChanged, propertiesChanged } = applySessionDelta(
          state.sessions[deltaIndex],
          delta,
        );

        if (messagesChanged === 0 && propertiesChanged.length === 0) {
          return state; // No-op delta
        }

        const deltaSessions = state.sessions.slice();
        deltaSessions[deltaIndex] = updatedSession;

        // Recompute cost only when messages changed and have usage data
        let nextCost = state.sessionCost;
        if (messagesChanged > 0 && updatedSession.messages.some(m => m.usage)) {
          try {
            nextCost = {
              ...nextCost,
              [updatedSession.id]: computeSessionCostSnapshot(updatedSession.messages),
            };
          } catch (err) {
            logger.warn('Cost computation failed for session delta', { sessionId: updatedSession.id, error: err instanceof Error ? err.message : String(err) });
          }
        }

        return { ...state, sessions: deltaSessions, sessionCost: nextCost };
      } catch (err) {
        logger.error('SESSION_APPLY_DELTA failed, falling back to full upsert', { error: err });
        return state;
      }
    }

    case 'SESSION_DELETE':
      return handleSessionDelete(state, action.payload);

    case 'SESSIONS_REPLACE': {
      // Atomic replace: clears all sessions and replaces with new ones in a single dispatch.
      // This prevents the brief empty-state flash that occurs with separate SESSIONS_CLEAR + SESSIONS_BULK_UPSERT.
      const { sessions: replaceSessions, activeSessionId: replaceActiveId } = action.payload;
      const sortedReplace = [...replaceSessions].sort((a, b) => b.updatedAt - a.updatedAt);
      let nextCostReplace = {} as typeof state.sessionCost;
      for (const s of sortedReplace) {
        if (s.messages.some(m => m.usage)) {
          try {
            nextCostReplace = { ...nextCostReplace, [s.id]: computeSessionCostSnapshot(s.messages) };
          } catch {
            // Cost computation is non-critical
          }
        }
      }
      return {
        ...state,
        sessions: sortedReplace,
        activeSessionId: replaceActiveId || (sortedReplace.length > 0 ? sortedReplace[0].id : undefined),
        sessionCost: nextCostReplace,
        // Reset session-scoped state for clean slate
        progressGroups: {},
        artifacts: {},
        pendingConfirmations: {},
        agentStatus: {},
        streamingSessions: new Set(),
        routingDecisions: {},
        contextMetrics: {},
        todos: {},
        toolResults: {},
        inlineArtifacts: {},
        terminalStreams: {},
        runErrors: {},
        executingTools: {},
        queuedTools: {},
        fileDiffStreams: {},
        pendingQuestions: [] as typeof state.pendingQuestions,
        pendingDecisions: [] as typeof state.pendingDecisions,
        communicationProgress: [] as typeof state.communicationProgress,
      };
    }
      
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
        // Clear run/communication state to prevent orphaned references
        runErrors: {},
        executingTools: {},
        queuedTools: {},
        fileDiffStreams: {},
        pendingQuestions: [] as typeof state.pendingQuestions,
        pendingDecisions: [] as typeof state.pendingDecisions,
        communicationProgress: [] as typeof state.communicationProgress,
      };
      
    default:
      return state;
  }
}
