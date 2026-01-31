import type {
    AgentSessionState,
    StreamDeltaEvent,
} from '../../shared/types';

/**
 * Safely create a Set from streamingSessions, handling cases where
 * it might not be a proper Set (e.g., after serialization/deserialization)
 */
export function safeCreateSet(streamingSessions: Set<string> | unknown): Set<string> {
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

/**
 * PERFORMANCE OPTIMIZATION: Shallow compare two message arrays
 * Returns true if arrays are structurally equivalent (same messages by id and content length)
 */
export function areMessagesEqual(
    a: AgentSessionState['messages'],
    b: AgentSessionState['messages']
): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    
    // Quick check: compare last message (most likely to change)
    const lastA = a[a.length - 1];
    const lastB = b[b.length - 1];
    if (lastA && lastB) {
        if (lastA.id !== lastB.id) return false;
        if ((lastA.content?.length ?? 0) !== (lastB.content?.length ?? 0)) return false;
        if ((lastA.toolCalls?.length ?? 0) !== (lastB.toolCalls?.length ?? 0)) return false;
    }
    
    return true;
}

/**
 * PERFORMANCE OPTIMIZATION: Check if session has meaningful changes
 * Avoids expensive merge operations when nothing important changed
 */
export function hasSessionChanged(
    existing: AgentSessionState,
    incoming: AgentSessionState
): boolean {
    // Reference equality - no change
    if (existing === incoming) return false;
    
    // Status change is always meaningful
    if (existing.status !== incoming.status) return true;
    
    // Branch change is meaningful
    if (existing.activeBranchId !== incoming.activeBranchId) return true;
    
    // Title change is meaningful
    if (existing.title !== incoming.title) return true;
    
    // Message count change is meaningful
    if (existing.messages.length !== incoming.messages.length) return true;
    
    // Check last message for streaming updates
    const existingLast = existing.messages[existing.messages.length - 1];
    const incomingLast = incoming.messages[incoming.messages.length - 1];
    
    if (existingLast && incomingLast) {
        // Different message IDs
        if (existingLast.id !== incomingLast.id) return true;
        
        // Content length changed (streaming)
        if ((existingLast.content?.length ?? 0) !== (incomingLast.content?.length ?? 0)) return true;
        
        // Thinking content changed
        if ((existingLast.thinking?.length ?? 0) !== (incomingLast.thinking?.length ?? 0)) return true;
        
        // Tool calls changed
        if ((existingLast.toolCalls?.length ?? 0) !== (incomingLast.toolCalls?.length ?? 0)) return true;
        
        // Usage data added (important for cost tracking)
        if (!existingLast.usage && incomingLast.usage) return true;
        
        // Reaction changed
        if (existingLast.reaction !== incomingLast.reaction) return true;
    }
    
    return false;
}

/**
 * PERFORMANCE OPTIMIZATION: Update assistant message by ID with minimal array copying
 * Uses indexed access instead of findIndex where possible
 */
export const updateAssistantMessageById = (
    sessions: AgentSessionState[],
    sessionId: string,
    messageId: string,
    updater: (message: AgentSessionState['messages'][number]) => AgentSessionState['messages'][number],
    sessionIndexHint?: number
): AgentSessionState[] => {
    // Use hint if provided, otherwise search
    let sessionIndex = sessionIndexHint;
    if (sessionIndex === undefined || sessions[sessionIndex]?.id !== sessionId) {
        sessionIndex = sessions.findIndex(s => s.id === sessionId);
    }
    if (sessionIndex === -1) return sessions;

    const session = sessions[sessionIndex];
    const messages = session.messages;
    
    // Optimization: check last message first (most common case for streaming)
    let messageIndex = -1;
    const lastIdx = messages.length - 1;
    if (lastIdx >= 0 && messages[lastIdx].id === messageId) {
        messageIndex = lastIdx;
    } else {
        messageIndex = messages.findIndex(m => m.id === messageId);
    }
    
    if (messageIndex === -1) return sessions;

    const message = messages[messageIndex];
    if (!message || message.role !== 'assistant') {
        return sessions;
    }

    const newMessage = updater(message);
    if (newMessage === message) return sessions;

    // Create new arrays only when necessary
    const newMessages = messages.slice();
    newMessages[messageIndex] = newMessage;

    const newSession = {
        ...session,
        messages: newMessages,
    };

    const newSessions = sessions.slice();
    newSessions[sessionIndex] = newSession;
    return newSessions;
};

export const updateAssistantMessageContent = (
    sessions: AgentSessionState[],
    sessionId: string,
    messageId: string | undefined,
    delta: string
): AgentSessionState[] => {
    // PERFORMANCE OPTIMIZATION: Skip if delta is empty
    if (!delta) return sessions;
    
    // Fast path: find session index once
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return sessions;
    
    if (messageId) {
        const updated = updateAssistantMessageById(sessions, sessionId, messageId, (message) => ({
            ...message,
            content: (message.content || '') + delta,
            isThinkingStreaming: false,
        }), sessionIndex);
        if (updated !== sessions) return updated;
    }

    const session = sessions[sessionIndex];
    const lastIndex = session.messages.length - 1;
    const lastMessage = session.messages[lastIndex];
    if (!lastMessage || lastMessage.role !== 'assistant') return sessions;

    const newMessages = session.messages.slice();
    newMessages[lastIndex] = {
        ...lastMessage,
        content: (lastMessage.content || '') + delta,
        isThinkingStreaming: false,
    };

    const newSessions = sessions.slice();
    newSessions[sessionIndex] = { ...session, messages: newMessages };
    return newSessions;
};

export const updateAssistantMessageToolCall = (
    sessions: AgentSessionState[],
    sessionId: string,
    messageId: string | undefined,
    toolCallDelta: NonNullable<StreamDeltaEvent['toolCall']>
): AgentSessionState[] => {
    const updatedSessions = updateAssistantMessageById(sessions, sessionId, messageId || '', (message) => {
        const toolCalls = [...(message.toolCalls || [])];
        const { index, callId, name, argsJson, argsComplete, thoughtSignature } = toolCallDelta;

        if (toolCalls[index]) {
            const existing = toolCalls[index];
            toolCalls[index] = {
                ...existing,
                name: name || existing.name,
                callId: callId || existing.callId,
                thoughtSignature: thoughtSignature || existing.thoughtSignature,
                _argsJson: argsComplete ? argsJson : (existing._argsJson || '') + (argsJson || ''),
            };
        } else {
            toolCalls[index] = {
                name: name || '',
                arguments: {},
                callId: callId,
                _argsJson: argsJson || '',
                thoughtSignature: thoughtSignature,
            };
        }

        return {
            ...message,
            toolCalls,
            isThinkingStreaming: false,
        };
    });

    if (updatedSessions === sessions && !messageId) {
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            const session = sessions[sessionIndex];
            const lastIndex = session.messages.length - 1;
            const lastMessage = session.messages[lastIndex];
            if (lastMessage && lastMessage.role === 'assistant') {
                return updateAssistantMessageById(sessions, sessionId, lastMessage.id || '', (m) => {
                    const toolCalls = [...(m.toolCalls || [])];
                    const { index, callId, name, argsJson, argsComplete, thoughtSignature } = toolCallDelta;
                    if (toolCalls[index]) {
                        const existing = toolCalls[index];
                        toolCalls[index] = {
                            ...existing,
                            name: name || existing.name,
                            callId: callId || existing.callId,
                            thoughtSignature: thoughtSignature || existing.thoughtSignature,
                            _argsJson: argsComplete ? argsJson : (existing._argsJson || '') + (argsJson || ''),
                        };
                    } else {
                        toolCalls[index] = {
                            name: name || '',
                            arguments: {},
                            callId: callId,
                            _argsJson: argsJson || '',
                            thoughtSignature: thoughtSignature,
                        };
                    }
                    return { ...m, toolCalls, isThinkingStreaming: false };
                });
            }
        }
    }

    return updatedSessions;
};

export const updateLastAssistantThinking = (
    sessions: AgentSessionState[],
    sessionId: string,
    delta: string
): AgentSessionState[] => {
    // PERFORMANCE OPTIMIZATION: Skip if delta is empty
    if (!delta) return sessions;
    
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) {
        return sessions;
    }

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

    const newSession = {
        ...session,
        messages: newMessages,
    };

    const newSessions = [...sessions];
    newSessions[sessionIndex] = newSession;

    return newSessions;
};

export const updateAssistantMessageThinking = (
    sessions: AgentSessionState[],
    sessionId: string,
    messageId: string | undefined,
    delta: string
): AgentSessionState[] => {
    // PERFORMANCE OPTIMIZATION: Skip if delta is empty
    if (!delta) return sessions;
    
    if (messageId) {
        const updated = updateAssistantMessageById(sessions, sessionId, messageId, (message) => ({
            ...message,
            thinking: (message.thinking || '') + delta,
            isThinkingStreaming: true,
        }));
        if (updated !== sessions) return updated;
    }

    return updateLastAssistantThinking(sessions, sessionId, delta);
};
