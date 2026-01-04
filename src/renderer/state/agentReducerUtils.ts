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

export const updateAssistantMessageById = (
    sessions: AgentSessionState[],
    sessionId: string,
    messageId: string,
    updater: (message: AgentSessionState['messages'][number]) => AgentSessionState['messages'][number]
): AgentSessionState[] => {
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return sessions;

    const session = sessions[sessionIndex];
    const messages = session.messages;
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return sessions;

    const message = messages[messageIndex];
    if (!message || message.role !== 'assistant') {
        return sessions;
    }

    const newMessage = updater(message);
    if (newMessage === message) return sessions;

    const newMessages = [...messages];
    newMessages[messageIndex] = newMessage;

    const newSession = {
        ...session,
        messages: newMessages,
    };

    const newSessions = [...sessions];
    newSessions[sessionIndex] = newSession;
    return newSessions;
};

export const updateAssistantMessageContent = (
    sessions: AgentSessionState[],
    sessionId: string,
    messageId: string | undefined,
    delta: string
): AgentSessionState[] => {
    if (messageId) {
        const updated = updateAssistantMessageById(sessions, sessionId, messageId, (message) => ({
            ...message,
            content: (message.content || '') + delta,
            isThinkingStreaming: false,
        }));
        if (updated !== sessions) return updated;
    }

    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) return sessions;
    const session = sessions[sessionIndex];
    const lastIndex = session.messages.length - 1;
    const lastMessage = session.messages[lastIndex];
    if (!lastMessage || lastMessage.role !== 'assistant') return sessions;

    const newMessages = [...session.messages];
    newMessages[lastIndex] = {
        ...lastMessage,
        content: (lastMessage.content || '') + delta,
        isThinkingStreaming: false,
    };

    const newSessions = [...sessions];
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
