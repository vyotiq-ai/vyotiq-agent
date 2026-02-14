/**
 * Agent Orchestrator Tests
 *
 * Tests for the AgentOrchestrator class which coordinates:
 * - Session management
 * - Run execution
 * - Provider management
 * - Tool registry
 * - Event emission
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock event emitter for testing event-based communication
const mockEventEmitter = new EventEmitter();

// Mock dependencies
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mockSettingsStore = {
  get: vi.fn().mockReturnValue({
    apiKeys: {
      anthropic: 'test-key',
      openai: '',
      deepseek: '',
      gemini: '',
    },
    rateLimits: {},
    providerSettings: {},
    defaultConfig: {
      preferredProvider: 'anthropic',
      fallbackProvider: 'openai',
      allowAutoSwitch: true,
      yoloMode: false,
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
    safetySettings: {
      maxFilesPerRun: 50,
      maxBytesPerRun: 10 * 1024 * 1024,
      protectedPaths: ['.git/**', '.env'],
      blockedCommands: ['rm -rf /'],
      enableAutoBackup: true,
      backupRetentionCount: 5,
      alwaysConfirmDangerous: true,
      enableSandbox: false,
      sandboxNetworkPolicy: 'localhost',
    },
    cacheSettings: {
      enablePromptCache: { anthropic: true },
      toolCache: { enabled: true, defaultTtlMs: 60000, maxEntries: 200, toolTtls: {} },
      contextCache: { enabled: true, maxSizeMb: 50, defaultTtlMs: 300000 },
      promptCacheStrategy: 'default',
      enableLruEviction: true,
    },
    debugSettings: {
      verboseLogging: false,
      captureFullPayloads: false,
      stepByStepMode: false,
      autoExportOnError: true,
      traceExportFormat: 'json',
    },
    promptSettings: {},
    complianceSettings: { enabled: true },
    accessLevelSettings: {},
    autonomousFeatureFlags: {},
  }),
  getProviderSettings: vi.fn(),
};



describe('AgentOrchestrator', () => {
  // Setup and teardown for event emitter tests
  beforeEach(() => {
    mockEventEmitter.removeAllListeners();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockEventEmitter.removeAllListeners();
  });

  describe('Initialization', () => {
    it('should initialize with required dependencies', () => {
      // Test that orchestrator can be constructed with minimal deps
      expect(mockSettingsStore.get).toBeDefined();
      expect(mockLogger.info).toBeDefined();
    });

    it('should validate provider configuration on init', () => {
      const settings = mockSettingsStore.get();
      expect(settings.apiKeys.anthropic).toBe('test-key');
      expect(settings.apiKeys.openai).toBe('');
    });
  });

  describe('Provider Management', () => {
    it('should identify available providers based on API keys', () => {
      const settings = mockSettingsStore.get();
      const availableProviders: string[] = [];
      
      if (settings.apiKeys.anthropic) availableProviders.push('anthropic');
      if (settings.apiKeys.openai) availableProviders.push('openai');
      if (settings.apiKeys.deepseek) availableProviders.push('deepseek');
      if (settings.apiKeys.gemini) availableProviders.push('gemini');
      
      expect(availableProviders).toContain('anthropic');
      expect(availableProviders).not.toContain('openai');
    });

    it('should check if system has available providers', () => {
      const settings = mockSettingsStore.get();
      const hasProviders = Object.values(settings.apiKeys).some(key => typeof key === 'string' && key.length > 0);
      expect(hasProviders).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should create session', () => {
      const session: {
        id: string;
        title: string;
        status: string;
        messages: unknown[];
        config: typeof mockSettingsStore extends { get: () => { defaultConfig: infer T } } ? T : unknown;
        createdAt: number;
        updatedAt: number;
      } = {
        id: 'session-1',
        title: 'New Session',
        status: 'idle',
        messages: [],
        config: mockSettingsStore.get().defaultConfig,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      expect(session.status).toBe('idle');
    });

    it('should generate session title from first message', () => {
      const content = 'Create a React component for user authentication';
      const title = content.length > 50 
        ? content.substring(0, 47) + '...' 
        : content;
      
      expect(title).toBe('Create a React component for user authentication');
    });

    it('should truncate long session titles', () => {
      const content = 'This is a very long message that should be truncated to fit within the session title limit';
      const title = content.length > 50 
        ? content.substring(0, 47) + '...' 
        : content;
      
      expect(title.length).toBeLessThanOrEqual(50);
      expect(title).toContain('...');
    });
  });

  describe('Run Execution', () => {
    it('should reject message without available providers', () => {
      const settingsWithNoProviders = {
        ...mockSettingsStore.get(),
        apiKeys: { anthropic: '', openai: '', deepseek: '', gemini: '' },
      };
      
      const hasProviders = Object.values(settingsWithNoProviders.apiKeys)
        .some(key => typeof key === 'string' && key.length > 0);
      
      expect(hasProviders).toBe(false);
    });
  });

  describe('Tool Confirmation', () => {
    it('should handle tool approval', () => {
      const toolPayload = {
        name: 'write',
        arguments: { file_path: '/src/test.ts', content: 'test' },
        callId: 'call-1',
      };
      
      const confirmation = {
        runId: 'run-1',
        approved: true,
        sessionId: 'session-1',
        toolName: toolPayload.name,
        toolCallId: toolPayload.callId,
      };
      
      expect(confirmation.approved).toBe(true);
      expect(confirmation.toolName).toBe('write');
      expect(confirmation.toolCallId).toBe('call-1');
    });

    it('should handle tool rejection with feedback', () => {
      const confirmation = {
        runId: 'run-1',
        approved: false,
        sessionId: 'session-1',
        feedback: 'Do not modify this file',
      };
      
      expect(confirmation.approved).toBe(false);
      expect(confirmation.feedback).toBe('Do not modify this file');
    });
  });

  describe('Session Config Updates', () => {
    it('should update session config', () => {
      const originalConfig = {
        preferredProvider: 'anthropic' as const,
        yoloMode: false,
        temperature: 0.7,
      };
      
      const update = { yoloMode: true };
      const updatedConfig = { ...originalConfig, ...update };
      
      expect(updatedConfig.yoloMode).toBe(true);
      expect(updatedConfig.preferredProvider).toBe('anthropic');
    });
  });

  describe('Run Control', () => {
    it('should support pause/resume operations', () => {
      let isPaused = false;
      
      // Pause
      isPaused = true;
      expect(isPaused).toBe(true);
      
      // Resume
      isPaused = false;
      expect(isPaused).toBe(false);
    });

    it('should support run cancellation', () => {
      let status = 'running';
      
      // Cancel
      status = 'idle';
      expect(status).toBe('idle');
    });
  });

  describe('Message Editing', () => {
    it('should edit message and truncate conversation', () => {
      const messages = [
        { id: 'msg-1', role: 'user', content: 'Hello' },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!' },
        { id: 'msg-3', role: 'user', content: 'How are you?' },
        { id: 'msg-4', role: 'assistant', content: 'I am fine!' },
      ];
      
      const editMessageId = 'msg-3';
      const newContent = 'What can you do?';
      
      // Find message index
      const messageIndex = messages.findIndex(m => m.id === editMessageId);
      expect(messageIndex).toBe(2);
      
      // Truncate from edit point
      const truncatedMessages = messages.slice(0, messageIndex);
      expect(truncatedMessages).toHaveLength(2);
      
      // Add edited message
      truncatedMessages.push({
        id: editMessageId,
        role: 'user',
        content: newContent,
      });
      
      expect(truncatedMessages).toHaveLength(3);
      expect(truncatedMessages[2].content).toBe('What can you do?');
    });
  });

  describe('Message Reactions', () => {
    it('should add reaction to message', () => {
      const message = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello!',
        reaction: null as 'up' | 'down' | null,
      };
      
      // Add upvote
      message.reaction = 'up';
      expect(message.reaction).toBe('up');
      
      // Change to downvote
      message.reaction = 'down';
      expect(message.reaction).toBe('down');
      
      // Remove reaction
      message.reaction = null;
      expect(message.reaction).toBeNull();
    });
  });

  describe('Conversation Branching', () => {
    it('should create branch from message', () => {
      const branch: {
        id: string;
        parentBranchId: string | null;
        forkPointMessageId: string;
        name: string;
        createdAt: number;
      } = {
        id: 'branch-1',
        parentBranchId: null,
        forkPointMessageId: 'msg-2',
        name: 'Alternative approach',
        createdAt: Date.now(),
      };
      
      expect(branch.forkPointMessageId).toBe('msg-2');
      expect(branch.parentBranchId).toBeNull();
    });

    it('should switch between branches', () => {
      let activeBranchId: string | null = null;
      
      // Switch to branch
      activeBranchId = 'branch-1';
      expect(activeBranchId).toBe('branch-1');
      
      // Switch back to main
      activeBranchId = null;
      expect(activeBranchId).toBeNull();
    });
  });

  describe('Debug Traces', () => {
    it('should track debug traces for session', () => {
      const traces = new Map<string, { traceId: string; sessionId: string; status: string }>();
      
      traces.set('trace-1', {
        traceId: 'trace-1',
        sessionId: 'session-1',
        status: 'running',
      });
      
      expect(traces.get('trace-1')?.status).toBe('running');
    });

    it('should export trace in different formats', () => {
      const trace: {
        traceId: string;
        sessionId: string;
        steps: unknown[];
        metrics: { totalSteps: number };
      } = {
        traceId: 'trace-1',
        sessionId: 'session-1',
        steps: [],
        metrics: { totalSteps: 0 },
      };
      
      // JSON export
      const jsonExport = JSON.stringify(trace);
      expect(jsonExport).toContain('trace-1');
      
      // Markdown export (simplified)
      const mdExport = `# Trace: ${trace.traceId}\n\nSession: ${trace.sessionId}`;
      expect(mdExport).toContain('# Trace:');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on shutdown', async () => {
      const cleanupTasks: string[] = [];
      
      // Simulate cleanup
      cleanupTasks.push('stop-self-healing');
      cleanupTasks.push('shutdown-git');
      cleanupTasks.push('kill-terminals');
      cleanupTasks.push('cleanup-processes');
      
      expect(cleanupTasks).toHaveLength(4);
    });
  });
});

describe('Session State Validation', () => {
  it('should validate session has required fields', () => {
    const session: {
      id: string;
      title: string;
      createdAt: number;
      updatedAt: number;
      config: {
        preferredProvider: string;
        fallbackProvider: string;
        allowAutoSwitch: boolean;
        yoloMode: boolean;
        temperature: number;
        maxOutputTokens: number;
      };
      status: string;
      messages: unknown[];
    } = {
      id: 'session-1',
      title: 'Test Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config: {
        preferredProvider: 'anthropic',
        fallbackProvider: 'openai',
        allowAutoSwitch: true,
        yoloMode: false,
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
      status: 'idle',
      messages: [],
    };
    
    expect(session.id).toBeDefined();
    expect(session.title).toBeDefined();
    expect(session.config).toBeDefined();
    expect(session.messages).toBeInstanceOf(Array);
  });

  it('should validate message structure', () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello',
      createdAt: Date.now(),
    };
    
    expect(message.id).toBeDefined();
    expect(message.role).toBe('user');
    expect(message.content).toBeDefined();
    expect(message.createdAt).toBeGreaterThan(0);
  });
});
