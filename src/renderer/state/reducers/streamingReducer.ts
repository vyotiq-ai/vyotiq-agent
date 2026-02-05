/**
 * Streaming Reducer
 * 
 * Handles streaming-related state updates including deltas and run status.
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Uses shared helper functions from agentReducerUtils
 * - Checks last message first (most common streaming case)
 * - Early returns when no changes needed
 */

import type { AgentSessionState, StreamDeltaEvent } from '../../../shared/types';
import type { AgentUIState } from '../agentReducer';
import { safeCreateSet, updateAssistantMessageToolCall } from '../agentReducerUtils';

export type StreamingAction =
  | { type: 'STREAM_DELTA'; payload: { sessionId: string; messageId?: string; delta?: string; toolCall?: StreamDeltaEvent['toolCall'] } }
  | { type: 'STREAM_DELTA_BATCH'; payload: { sessionId: string; messageId?: string; delta?: string; toolCall?: StreamDeltaEvent['toolCall'] } }
  | { type: 'STREAM_THINKING_DELTA'; payload: { sessionId: string; messageId?: string; delta: string } }
  | { type: 'RUN_STATUS'; payload: { sessionId: string; status: AgentSessionState['status']; runId: string } };

/**
 * OPTIMIZATION: Update assistant message by ID with last-message-first check
 */
function updateAssistantMessageById(
  sessions: AgentSessionState[],
  sessionId: string,
  messageId: string,
  updater: (message: AgentSessionState['messages'][number]) => AgentSessionState['messages'][number]
): AgentSessionState[] {
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) return sessions;

  const session = sessions[sessionIndex];
  const messages = session.messages;
  
  // OPTIMIZATION: Check last message first (most common case for streaming)
  let messageIndex = -1;
  const lastIdx = messages.length - 1;
  if (lastIdx >= 0 && messages[lastIdx].id === messageId) {
    messageIndex = lastIdx;
  } else {
    messageIndex = messages.findIndex(m => m.id === messageId);
  }
  
  if (messageIndex === -1) return sessions;

  const message = messages[messageIndex];
  if (!message || message.role !== 'assistant') return sessions;

  const newMessage = updater(message);
  if (newMessage === message) return sessions;

  // Use slice() for slightly better performance
  const newMessages = messages.slice();
  newMessages[messageIndex] = newMessage;

  const newSession = { ...session, messages: newMessages };
  const newSessions = sessions.slice();
  newSessions[sessionIndex] = newSession;
  return newSessions;
}

/**
 * Update the last assistant message content efficiently
 */
function updateLastAssistantMessage(
  sessions: AgentSessionState[],
  sessionId: string,
  delta: string
): AgentSessionState[] {
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) return sessions;

  const session = sessions[sessionIndex];
  const messages = session.messages;
  const lastMessageIndex = messages.length - 1;
  const lastMessage = messages[lastMessageIndex];

  if (!lastMessage || lastMessage.role !== 'assistant') {
    return sessions;
  }

  // Guard against undefined delta - skip if delta is not a valid string
  if (typeof delta !== 'string') {
    return sessions;
  }

  // Create new references only for what changed
  const newMessage = {
    ...lastMessage,
    content: (lastMessage.content || '') + delta,
  };

  const newMessages = messages.slice();
  newMessages[lastMessageIndex] = newMessage;

  const newSession = {
    ...session,
    messages: newMessages,
  };

  const newSessions = sessions.slice();
  newSessions[sessionIndex] = newSession;

  return newSessions;
}

function updateAssistantMessageContent(
  sessions: AgentSessionState[],
  sessionId: string,
  messageId: string | undefined,
  delta: string
): AgentSessionState[] {
  // Guard against undefined/null delta - skip if delta is not a valid string
  if (typeof delta !== 'string') {
    return sessions;
  }

  if (messageId) {
    const updated = updateAssistantMessageById(sessions, sessionId, messageId, (message) => ({
      ...message,
      content: (message.content || '') + delta,
      isThinkingStreaming: false,
    }));
    if (updated !== sessions) return updated;
  }

  return updateLastAssistantMessage(sessions, sessionId, delta);
}

function updateAssistantMessageThinking(
  sessions: AgentSessionState[],
  sessionId: string,
  messageId: string | undefined,
  delta: string
): AgentSessionState[] {
  // Guard against undefined/null delta - skip if delta is not a valid string
  if (typeof delta !== 'string') {
    return sessions;
  }

  if (messageId) {
    const updated = updateAssistantMessageById(sessions, sessionId, messageId, (message) => ({
      ...message,
      thinking: (message.thinking || '') + delta,
      isThinkingStreaming: true,
    }));
    if (updated !== sessions) return updated;
  }

  // Fallback: update last assistant message's thinking
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) return sessions;

  const session = sessions[sessionIndex];
  const messages = session.messages;
  const lastMessageIndex = messages.length - 1;
  const lastMessage = messages[lastMessageIndex];

  if (!lastMessage || lastMessage.role !== 'assistant') {
    return sessions;
  }

  const newMessage = {
    ...lastMessage,
    thinking: (lastMessage.thinking || '') + delta,
    isThinkingStreaming: true,
  };

  const newMessages = messages.slice();
  newMessages[lastMessageIndex] = newMessage;

  const newSession = { ...session, messages: newMessages };
  const newSessions = sessions.slice();
  newSessions[sessionIndex] = newSession;
  return newSessions;
}

/**
 * Streaming reducer
 */
export function streamingReducer(
  state: AgentUIState,
  action: StreamingAction
): AgentUIState {
  switch (action.type) {
    case 'STREAM_DELTA':
    case 'STREAM_DELTA_BATCH': {
      const { sessionId, messageId, delta, toolCall } = action.payload;
      
      // Handle tool call streaming
      if (toolCall) {
        const sessions = updateAssistantMessageToolCall(state.sessions, sessionId, messageId, toolCall);
        
        if (sessions === state.sessions) {
          return state;
        }
        
        const streamingSessions = safeCreateSet(state.streamingSessions);
        streamingSessions.add(sessionId);
        
        return { ...state, sessions, streamingSessions };
      }
      
      // Handle text delta streaming
      if (delta) {
        const sessions = updateAssistantMessageContent(state.sessions, sessionId, messageId, delta);
        
        // Early return if no change
        if (sessions === state.sessions) {
          return state;
        }
        
        // Track streaming state
        const streamingSessions = safeCreateSet(state.streamingSessions);
        streamingSessions.add(sessionId);
        
        return { ...state, sessions, streamingSessions };
      }
      
      return state;
    }

    case 'STREAM_THINKING_DELTA': {
      const sessions = updateAssistantMessageThinking(state.sessions, action.payload.sessionId, action.payload.messageId, action.payload.delta);

      // Early return if no change
      if (sessions === state.sessions) {
        return state;
      }

      const streamingSessions = safeCreateSet(state.streamingSessions);
      streamingSessions.add(action.payload.sessionId);

      return { ...state, sessions, streamingSessions };
    }
    
    case 'RUN_STATUS': {
      const { sessionId, status } = action.payload;
      const sessionIndex = state.sessions.findIndex(s => s.id === sessionId);
      
      // Early return if session not found
      if (sessionIndex === -1) return state;
      
      const session = state.sessions[sessionIndex];
      
      // Early return if status unchanged
      if (session.status === status) return state;
      
      // Clear streaming state when run ends or pauses for confirmation
      const shouldClearStreaming = 
        status === 'idle' || 
        status === 'error' ||
        status === 'awaiting-confirmation';
      
      let updatedSession = { ...session, status };
      
      // Mark thinking as complete on all assistant messages if clearing streaming
      if (shouldClearStreaming) {
        const hasStreamingThinking = session.messages.some(
          m => m.role === 'assistant' && m.isThinkingStreaming
        );
        
        if (hasStreamingThinking) {
          updatedSession = {
            ...updatedSession,
            messages: session.messages.map(m =>
              m.role === 'assistant' && m.isThinkingStreaming
                ? { ...m, isThinkingStreaming: false }
                : m
            ),
          };
        }
      }
      
      // Create new sessions array with only the changed session updated
      const sessions = state.sessions.slice();
      sessions[sessionIndex] = updatedSession;
      
      // Update streaming sessions set if needed
      const streamingSessions = shouldClearStreaming && state.streamingSessions.has(sessionId)
        ? (() => {
            const newSet = safeCreateSet(state.streamingSessions);
            newSet.delete(sessionId);
            return newSet;
          })()
        : state.streamingSessions;
      
      return { ...state, sessions, streamingSessions };
    }
    
    default:
      return state;
  }
}
