/**
 * Streaming Reducer Tests
 */
import { describe, it, expect } from 'vitest';
import { streamingReducer, type StreamingAction } from './streamingReducer';
import type { AgentUIState } from '../agentReducer';
import type { AgentSessionState, ChatMessage } from '../../../shared/types';

// Helper to create a mock session
function createMockSession(overrides: Partial<AgentSessionState> = {}): AgentSessionState {
  return {
    id: 'session-1',
    title: 'Test Session',
    status: 'idle',
    messages: [],
    config: {
      preferredProvider: 'auto',
      fallbackProvider: 'anthropic',
      allowAutoSwitch: true,
      enableProviderFallback: true,
      enableAutoModelSelection: true,
      yoloMode: false,
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// Helper to create initial state
function createInitialState(overrides: Partial<AgentUIState> = {}): AgentUIState {
  return {
    sessions: [],
    activeSessionId: undefined,
    sessionCost: {},
    streamingSessions: new Set(),
    progressGroups: {},
    artifacts: {},
    toolResults: {},
    inlineArtifacts: {},
    pendingConfirmations: {},
    agentStatus: {},
    contextMetrics: {},
    routingDecisions: {},
    terminalStreams: {},
    todos: {},
    executingTools: {},
    queuedTools: {},
    // Phase 4: Communication
    pendingQuestions: [],
    pendingDecisions: [],
    communicationProgress: [],
    runErrors: {},
    settings: {
      apiKeys: {},
      rateLimits: {},
      providerSettings: {},
      defaultConfig: {
        preferredProvider: 'auto',
        fallbackProvider: 'anthropic',
        allowAutoSwitch: true,
        yoloMode: false,
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    },
    ...overrides,
  };
}

// Helper to create a mock message
function createMockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Test message',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('streamingReducer', () => {
  describe('STREAM_DELTA', () => {
    it('should append delta to the assistant message by messageId', () => {
      const assistantMessage = createMockMessage({
        id: 'msg-2',
        role: 'assistant',
        content: 'Hello',
      });
      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'user', content: 'Hi' }),
          assistantMessage,
        ],
      });
      const state = createInitialState({
        sessions: [session],
        activeSessionId: session.id,
      });

      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'session-1', messageId: 'msg-2', delta: ' world!' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].messages[1].content).toBe('Hello world!');
    });

    it('should still append when the last message is not assistant (tool interleaving)', () => {
      const assistantMessage = createMockMessage({
        id: 'msg-2',
        role: 'assistant',
        content: 'Answer:',
      });
      const toolMessage = createMockMessage({
        id: 'msg-3',
        role: 'tool',
        content: 'tool output',
      });

      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'user', content: 'Hi' }),
          assistantMessage,
          toolMessage,
        ],
      });
      const state = createInitialState({ sessions: [session] });

      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'session-1', messageId: 'msg-2', delta: ' more' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].messages[1].content).toBe('Answer: more');
      expect(newState.sessions[0].messages[2].content).toBe('tool output');
    });

    it('should track streaming sessions', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'assistant', content: '' }),
        ],
      });
      const state = createInitialState({
        sessions: [session],
        streamingSessions: new Set(),
      });

      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'session-1', messageId: 'msg-1', delta: 'Hello' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.streamingSessions.has('session-1')).toBe(true);
    });

    it('should not modify state if session not found', () => {
      const state = createInitialState({ sessions: [] });

      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'non-existent', messageId: 'msg-1', delta: 'Hello' },
      };
      const newState = streamingReducer(state, action);

      expect(newState).toBe(state);
    });

    it('should not modify state if messageId is not found', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'user', content: 'Hi' }),
        ],
      });
      const state = createInitialState({ sessions: [session] });

      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'session-1', messageId: 'missing', delta: 'Hello' },
      };
      const newState = streamingReducer(state, action);

      expect(newState).toBe(state);
    });

    it('should preserve other sessions unchanged', () => {
      const session1 = createMockSession({
        id: 'session-1',
        messages: [
          createMockMessage({ id: 'msg-1', role: 'assistant', content: 'A' }),
        ],
      });
      const session2 = createMockSession({
        id: 'session-2',
        messages: [
          createMockMessage({ id: 'msg-2', role: 'assistant', content: 'B' }),
        ],
      });
      const state = createInitialState({ sessions: [session1, session2] });

      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'session-1', messageId: 'msg-1', delta: 'AA' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].messages[0].content).toBe('AAA');
      expect(newState.sessions[1].messages[0].content).toBe('B');
    });

    it('should not concatenate "undefined" when delta is undefined', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'assistant', content: 'Hello' }),
        ],
      });
      const state = createInitialState({ sessions: [session] });

      // Simulate undefined delta being passed (type assertion to bypass TypeScript)
      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'session-1', messageId: 'msg-1', delta: undefined as unknown as string },
      };
      const newState = streamingReducer(state, action);

      // Content should remain unchanged, not become "Helloundefined"
      expect(newState.sessions[0].messages[0].content).toBe('Hello');
      expect(newState.sessions[0].messages[0].content).not.toContain('undefined');
    });

    it('should handle undefined content in message gracefully', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'assistant', content: undefined as unknown as string }),
        ],
      });
      const state = createInitialState({ sessions: [session] });

      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'session-1', messageId: 'msg-1', delta: 'Hello' },
      };
      const newState = streamingReducer(state, action);

      // Content should be "Hello", not "undefinedHello"
      expect(newState.sessions[0].messages[0].content).toBe('Hello');
      expect(newState.sessions[0].messages[0].content).not.toContain('undefined');
    });
  });

  describe('STREAM_DELTA_BATCH', () => {
    it('should work the same as STREAM_DELTA', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'assistant', content: 'Start' }),
        ],
      });
      const state = createInitialState({ sessions: [session] });

      const action: StreamingAction = {
        type: 'STREAM_DELTA_BATCH',
        payload: { sessionId: 'session-1', messageId: 'msg-1', delta: ' batch content' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].messages[0].content).toBe('Start batch content');
      expect(newState.streamingSessions.has('session-1')).toBe(true);
    });
  });

  describe('STREAM_THINKING_DELTA', () => {
    it('should append thinking to the assistant message and set isThinkingStreaming', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'assistant', content: '', thinking: '' }),
        ],
      });
      const state = createInitialState({ sessions: [session] });

      const action: StreamingAction = {
        type: 'STREAM_THINKING_DELTA',
        payload: { sessionId: 'session-1', messageId: 'msg-1', delta: 'Reasoning...' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].messages[0].thinking).toBe('Reasoning...');
      expect(newState.sessions[0].messages[0].isThinkingStreaming).toBe(true);
    });

    it('should clear isThinkingStreaming when regular content arrives', () => {
      const session = createMockSession({
        messages: [
          createMockMessage({ id: 'msg-1', role: 'assistant', content: '', thinking: 'x', isThinkingStreaming: true }),
        ],
      });
      const state = createInitialState({ sessions: [session] });

      const action: StreamingAction = {
        type: 'STREAM_DELTA',
        payload: { sessionId: 'session-1', messageId: 'msg-1', delta: 'Final answer' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].messages[0].content).toBe('Final answer');
      expect(newState.sessions[0].messages[0].isThinkingStreaming).toBe(false);
    });
  });

  describe('RUN_STATUS', () => {
    it('should update session status', () => {
      const session = createMockSession({ status: 'idle' });
      const state = createInitialState({ sessions: [session] });

      const action: StreamingAction = {
        type: 'RUN_STATUS',
        payload: { sessionId: 'session-1', status: 'running', runId: 'run-1' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].status).toBe('running');
    });

    it('should clear streaming state when status is idle', () => {
      const session = createMockSession({ status: 'running' });
      const state = createInitialState({
        sessions: [session],
        streamingSessions: new Set(['session-1']),
      });

      const action: StreamingAction = {
        type: 'RUN_STATUS',
        payload: { sessionId: 'session-1', status: 'idle', runId: 'run-1' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].status).toBe('idle');
      expect(newState.streamingSessions.has('session-1')).toBe(false);
    });

    it('should clear streaming state when status is error', () => {
      const session = createMockSession({ status: 'running' });
      const state = createInitialState({
        sessions: [session],
        streamingSessions: new Set(['session-1']),
      });

      const action: StreamingAction = {
        type: 'RUN_STATUS',
        payload: { sessionId: 'session-1', status: 'error', runId: 'run-1' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].status).toBe('error');
      expect(newState.streamingSessions.has('session-1')).toBe(false);
    });

    it('should keep streaming state when status is running', () => {
      const session = createMockSession({ status: 'idle' });
      const state = createInitialState({
        sessions: [session],
        streamingSessions: new Set(['session-1']),
      });

      const action: StreamingAction = {
        type: 'RUN_STATUS',
        payload: { sessionId: 'session-1', status: 'running', runId: 'run-1' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.streamingSessions.has('session-1')).toBe(true);
    });

    it('should not affect other sessions', () => {
      const session1 = createMockSession({ id: 'session-1', status: 'idle' });
      const session2 = createMockSession({ id: 'session-2', status: 'running' });
      const state = createInitialState({
        sessions: [session1, session2],
        streamingSessions: new Set(['session-2']),
      });

      const action: StreamingAction = {
        type: 'RUN_STATUS',
        payload: { sessionId: 'session-1', status: 'running', runId: 'run-1' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].status).toBe('running');
      expect(newState.sessions[1].status).toBe('running');
      expect(newState.streamingSessions.has('session-2')).toBe(true);
    });

    it('should clear streaming state when status is awaiting-confirmation', () => {
      const session = createMockSession({ status: 'running' });
      const state = createInitialState({
        sessions: [session],
        streamingSessions: new Set(['session-1']),
      });

      const action: StreamingAction = {
        type: 'RUN_STATUS',
        payload: { sessionId: 'session-1', status: 'awaiting-confirmation', runId: 'run-1' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].status).toBe('awaiting-confirmation');
      expect(newState.streamingSessions.has('session-1')).toBe(false);
    });

    it('should clear isThinkingStreaming when status is awaiting-confirmation', () => {
      const session = createMockSession({
        status: 'running',
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'thinking...',
            createdAt: Date.now(),
            isThinkingStreaming: true,
            thinking: 'some thinking content',
          },
        ],
      });
      const state = createInitialState({
        sessions: [session],
        streamingSessions: new Set(['session-1']),
      });

      const action: StreamingAction = {
        type: 'RUN_STATUS',
        payload: { sessionId: 'session-1', status: 'awaiting-confirmation', runId: 'run-1' },
      };
      const newState = streamingReducer(state, action);

      expect(newState.sessions[0].status).toBe('awaiting-confirmation');
      expect(newState.sessions[0].messages[0].isThinkingStreaming).toBe(false);
    });
  });
});
