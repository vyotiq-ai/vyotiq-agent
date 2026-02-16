/**
 * Session Reducer Tests
 */
import { describe, it, expect } from 'vitest';
import { sessionReducer, type SessionAction } from './sessionReducer';
import type { AgentUIState, AgentStatusInfo } from '../agentReducer';
import type { AgentSessionState, ChatMessage, ToolCallEvent, ProgressGroup, ArtifactCard } from '../../../shared/types';

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

// Helper to create a mock chat message
function createMockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Test content',
    createdAt: Date.now(),
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
    fileDiffStreams: {},
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

describe('sessionReducer', () => {
  describe('SESSION_UPSERT', () => {
    it('should add a new session', () => {
      const state = createInitialState();
      const session = createMockSession();
      
      const action: SessionAction = { type: 'SESSION_UPSERT', payload: session };
      const newState = sessionReducer(state, action);
      
      expect(newState.sessions).toHaveLength(1);
      expect(newState.sessions[0]).toEqual(session);
      expect(newState.activeSessionId).toBe(session.id);
    });
    
    it('should update an existing session', () => {
      const session = createMockSession();
      const state = createInitialState({
        sessions: [session],
        activeSessionId: session.id,
      });
      
      const updatedSession = createMockSession({ 
        title: 'Updated Title',
        status: 'running',
      });
      
      const action: SessionAction = { type: 'SESSION_UPSERT', payload: updatedSession };
      const newState = sessionReducer(state, action);
      
      expect(newState.sessions).toHaveLength(1);
      expect(newState.sessions[0].title).toBe('Updated Title');
      expect(newState.sessions[0].status).toBe('running');
    });
    
    it('should preserve streamed content when merging messages', () => {
      const existingMessage = createMockMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'This is a longer streamed response that should be preserved',
      });
      
      const session = createMockSession({
        messages: [existingMessage],
      });
      
      const state = createInitialState({
        sessions: [session],
        activeSessionId: session.id,
      });
      
      // Incoming message with shorter content (from backend sync)
      const incomingMessage = createMockMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'Short',
      });
      
      const updatedSession = createMockSession({
        messages: [incomingMessage],
      });
      
      const action: SessionAction = { type: 'SESSION_UPSERT', payload: updatedSession };
      const newState = sessionReducer(state, action);
      
      // Should keep the longer content
      expect(newState.sessions[0].messages[0].content).toBe(existingMessage.content);
    });
    
    it('should clear pending confirmations when session becomes idle', () => {
      const session = createMockSession({ status: 'awaiting-confirmation' });
      const toolCallEvent: ToolCallEvent = {
        type: 'tool-call',
        toolCall: {
          name: 'write',
          arguments: { path: '/test.txt', content: 'test' },
          callId: 'tool-1',
        },
        sessionId: session.id,
        runId: 'run-1',
        requiresApproval: true,
        timestamp: Date.now(),
      };
      const state = createInitialState({
        sessions: [session],
        activeSessionId: session.id,
        pendingConfirmations: {
          'conf-1': toolCallEvent,
        },
      });
      
      const updatedSession = createMockSession({ status: 'idle' });
      
      const action: SessionAction = { type: 'SESSION_UPSERT', payload: updatedSession };
      const newState = sessionReducer(state, action);
      
      expect(Object.keys(newState.pendingConfirmations)).toHaveLength(0);
    });
  });
  
  describe('SESSION_SET_ACTIVE', () => {
    it('should set the active session', () => {
      const session1 = createMockSession({ id: 'session-1' });
      const session2 = createMockSession({ id: 'session-2' });
      
      const state = createInitialState({
        sessions: [session1, session2],
        activeSessionId: session1.id,
      });
      
      const action: SessionAction = { type: 'SESSION_SET_ACTIVE', payload: 'session-2' };
      const newState = sessionReducer(state, action);
      
      expect(newState.activeSessionId).toBe('session-2');
    });
  });
  
  describe('SESSION_RENAME', () => {
    it('should rename a session', () => {
      const session = createMockSession({ title: 'Old Title' });
      const state = createInitialState({
        sessions: [session],
        activeSessionId: session.id,
      });
      
      const action: SessionAction = { 
        type: 'SESSION_RENAME', 
        payload: { sessionId: session.id, title: 'New Title' } 
      };
      const newState = sessionReducer(state, action);
      
      expect(newState.sessions[0].title).toBe('New Title');
    });
  });
  
  describe('SESSION_DELETE', () => {
    it('should delete a session and clean up related state', () => {
      const session = createMockSession();
      const progressGroup: ProgressGroup = {
        id: 'group-1',
        title: 'Test Group',
        items: [],
        isExpanded: true,
        startedAt: Date.now(),
      };
      const artifact: ArtifactCard = {
        id: 'artifact-1',
        type: 'code',
        title: 'Test Artifact',
        createdAt: Date.now(),
      };
      const agentStatus: AgentStatusInfo = {
        status: 'completed',
        message: 'Done',
        timestamp: Date.now(),
      };
      const state = createInitialState({
        sessions: [session],
        activeSessionId: session.id,
        progressGroups: { [session.id]: [progressGroup] },
        artifacts: { [session.id]: [artifact] },
        agentStatus: { [session.id]: agentStatus },
        streamingSessions: new Set([session.id]),
      });
      
      const action: SessionAction = { type: 'SESSION_DELETE', payload: session.id };
      const newState = sessionReducer(state, action);
      
      expect(newState.sessions).toHaveLength(0);
      expect(newState.activeSessionId).toBeUndefined();
      expect(newState.progressGroups[session.id]).toBeUndefined();
      expect(newState.artifacts[session.id]).toBeUndefined();
      expect(newState.agentStatus[session.id]).toBeUndefined();
      expect(newState.streamingSessions.has(session.id)).toBe(false);
    });
    
    it('should set next session as active when deleting active session', () => {
      const session1 = createMockSession({ id: 'session-1' });
      const session2 = createMockSession({ id: 'session-2' });
      
      const state = createInitialState({
        sessions: [session1, session2],
        activeSessionId: 'session-1',
      });
      
      const action: SessionAction = { type: 'SESSION_DELETE', payload: 'session-1' };
      const newState = sessionReducer(state, action);
      
      expect(newState.activeSessionId).toBe('session-2');
    });
  });
  
  describe('SESSIONS_CLEAR', () => {
    it('should clear all sessions and related state', () => {
      const session = createMockSession();
      const toolCallEvent: ToolCallEvent = {
        type: 'tool-call',
        toolCall: { name: 'test', arguments: {}, callId: 'conf-1' },
        sessionId: session.id,
        runId: 'run-1',
        requiresApproval: true,
        timestamp: Date.now(),
      };
      const agentStatus: AgentStatusInfo = {
        status: 'completed',
        message: 'Done',
        timestamp: Date.now(),
      };
      const state = createInitialState({
        sessions: [session],
        activeSessionId: session.id,
        progressGroups: { [session.id]: [] },
        artifacts: { [session.id]: [] },
        pendingConfirmations: { 'conf-1': toolCallEvent },
        agentStatus: { [session.id]: agentStatus },
        streamingSessions: new Set([session.id]),
      });
      
      const action: SessionAction = { type: 'SESSIONS_CLEAR' };
      const newState = sessionReducer(state, action);
      
      expect(newState.sessions).toHaveLength(0);
      expect(newState.activeSessionId).toBeUndefined();
      expect(Object.keys(newState.progressGroups)).toHaveLength(0);
      expect(Object.keys(newState.artifacts)).toHaveLength(0);
      expect(Object.keys(newState.pendingConfirmations)).toHaveLength(0);
      expect(Object.keys(newState.agentStatus)).toHaveLength(0);
      expect(newState.streamingSessions.size).toBe(0);
    });
  });
});
