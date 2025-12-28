import type {
    AgentSessionState,
    ChatMessage,
    StreamDeltaEvent,
} from '../../shared/types';
import type { AgentUIState } from './agentReducer';

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

// Helper function to update message content efficiently
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

    // Fallback to last assistant message
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

/**
 * Find the original content of a file from previous tool results in the session
 */
export const findOriginalContent = (messages: ChatMessage[], filePath: string): string | undefined => {
    // Search backwards for the most recent read tool result for this file
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'tool' && msg.toolName?.includes('read')) {
            // Check if the path matches
            const msgPath = (msg.resultMetadata?.path || msg.resultMetadata?.file_path) as string | undefined;
            // Also try to match filename if full path doesn't match exactly (e.g. relative vs absolute)
            if (msgPath === filePath || (msgPath && filePath.endsWith(msgPath.replace(/\\/g, '/')))) {
                return msg.content;
            }
        }
    }
    return undefined;
};

// Helper function to update tool calls on an assistant message
export const updateAssistantMessageToolCall = (
    state: AgentUIState,
    sessionId: string,
    messageId: string | undefined,
    toolCallDelta: NonNullable<StreamDeltaEvent['toolCall']>
): { sessions: AgentSessionState[]; streamingDiff?: AgentUIState['streamingDiff'] } => {
    const sessions = state.sessions;
    let streamingDiff = state.streamingDiff;

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

            // Update streaming diff if it's an edit/write tool
            const tool = toolCalls[index];
            if (tool.name === 'edit' || tool.name === 'write' || tool.name === 'create_file') {
                const json = tool._argsJson || '';
                const pathMatch = json.match(/"(?:path|file_path|file|filePath)"\s*:\s*"([^"]*)"/);
                const path = pathMatch ? pathMatch[1] : undefined;

                if (path) {
                    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
                    if (sessionIndex !== -1) {
                        const originalContent = findOriginalContent(sessions[sessionIndex].messages, path);
                        if (originalContent !== undefined) {
                            let modifiedContent = originalContent;
                            if (tool.name === 'write' || tool.name === 'create_file') {
                                const contentMatch = json.match(/"content"\s*:\s*"([^"]*)"/);
                                if (contentMatch) {
                                    modifiedContent = contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                                }
                            } else if (tool.name === 'edit') {
                                const oldMatch = json.match(/"old_string"\s*:\s*"([^"]*)"/);
                                const newMatch = json.match(/"new_string"\s*:\s*"([^"]*)"/);
                                if (oldMatch && newMatch) {
                                    const oldStr = oldMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                                    const newStr = newMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                                    modifiedContent = originalContent.replace(oldStr, newStr);
                                }
                            }

                            streamingDiff = {
                                path,
                                originalContent,
                                modifiedContent,
                                toolCallId: tool.callId || `stream-${index}`,
                            };
                        }
                    }
                }
            }
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

    // If updateAssistantMessageById didn't find the message, try fallback to last message
    if (updatedSessions === sessions && !messageId) {
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            const session = sessions[sessionIndex];
            const lastIndex = session.messages.length - 1;
            const lastMessage = session.messages[lastIndex];
            if (lastMessage && lastMessage.role === 'assistant') {
                return {
                    sessions: updateAssistantMessageById(sessions, sessionId, lastMessage.id || '', (m) => {
                        // Re-use logic above (simplified for brevity here, should ideally be shared)
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
                            // (Redundant streamingDiff logic omitted for brevity as it's a fallback)
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
                    }),
                    streamingDiff
                };
            }
        }
    }

    return { sessions: updatedSessions, streamingDiff };
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

    // Create new references only for what changed
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

    // Fallback to last assistant message
    return updateLastAssistantThinking(sessions, sessionId, delta);
};
