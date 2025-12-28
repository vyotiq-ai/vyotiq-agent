/**
 * Streaming Reducer
 * 
 * Handles streaming-related state updates including deltas and run status.
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
  // Handle case where it's an array or iterable
  if (Array.isArray(streamingSessions)) {
    return new Set(streamingSessions);
  }
  // Handle case where it's an object with values
  if (streamingSessions && typeof streamingSessions === 'object') {
    const values = Object.values(streamingSessions as Record<string, string>);
    return new Set(values.filter((v): v is string => typeof v === 'string'));
  }
  return new Set();
}

export type StreamingAction =
  | { type: 'STREAM_DELTA'; payload: { sessionId: string; messageId?: string; delta: string } }
  | { type: 'STREAM_DELTA_BATCH'; payload: { sessionId: string; messageId?: string; delta: string } }
  | { type: 'STREAM_THINKING_DELTA'; payload: { sessionId: string; messageId?: string; delta: string } }
  | { type: 'RUN_STATUS'; payload: { sessionId: string; status: AgentSessionState['status']; runId: string } };

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
  const messageIndex = messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) return sessions;

  const message = messages[messageIndex];
  if (!message || message.role !== 'assistant') return sessions;

  const newMessage = updater(message);
  if (newMessage === message) return sessions;

  const newMessages = [...messages];
  newMessages[messageIndex] = newMessage;

  const newSession = { ...session, messages: newMessages };
  const newSessions = [...sessions];
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
  // Ensure content is always a string to prevent "undefined" concatenation
  const newMessage = {
    ...lastMessage,
    content: (lastMessage.content || '') + delta,
  };

  const newMessages = [...messages];
  newMessages[lastMessageIndex] = newMessage;

  const newSession = {
    ...session,
    messages: newMessages,
  };

  const newSessions = [...sessions];
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

  const newMessages = [...messages];
  newMessages[lastMessageIndex] = newMessage;

  const newSession = { ...session, messages: newMessages };
  const newSessions = [...sessions];
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
      // Optimized delta handling - only update what's needed
      const sessions = updateAssistantMessageContent(state.sessions, action.payload.sessionId, action.payload.messageId, action.payload.delta);
      
      // Track streaming state
      const streamingSessions = safeCreateSet(state.streamingSessions);
      streamingSessions.add(action.payload.sessionId);
      
      return sessions === state.sessions 
        ? state 
        : { ...state, sessions, streamingSessions };
    }

    case 'STREAM_THINKING_DELTA': {
      const sessions = updateAssistantMessageThinking(state.sessions, action.payload.sessionId, action.payload.messageId, action.payload.delta);

      const streamingSessions = safeCreateSet(state.streamingSessions);
      streamingSessions.add(action.payload.sessionId);

      return sessions === state.sessions
        ? state
        : { ...state, sessions, streamingSessions };
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
      const sessions = [
        ...state.sessions.slice(0, sessionIndex),
        updatedSession,
        ...state.sessions.slice(sessionIndex + 1),
      ];
      
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
