/**
 * Tests for ToolContextManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  selectToolsForContext,
  detectWorkspaceType,
  clearWorkspaceTypeCache,
  extractRecentToolUsage,
  getToolSelectionSummary,
  getSessionToolState,
  addAgentRequestedTools,
  addDiscoveredTools,
  getAgentControlledTools,
  getLoadedToolsInfo,
  clearSessionToolState,
  clearAllSessionToolStates,
  clearToolSelectionCache,
  cleanupSession,
  cleanupAllSessions,
  getActiveSessionCount,
  getSessionMemoryEstimate,
  recordToolError,
  recordToolSuccess,
  type ToolSelectionContext,
  type SessionCleanupStats,
} from './ToolContextManager';
import { getToolResultCache, resetToolResultCache } from '../cache/ToolResultCache';
import type { ToolDefinition } from '../../tools/types';
import type { ChatMessage, ToolExecutionResult } from '../../../shared/types';

// Mock tool definitions
const createMockTool = (name: string, description: string = '', deferLoading = false): ToolDefinition => ({
  name,
  description: description || `Mock tool: ${name}`,
  requiresApproval: false,
  schema: { type: 'object' as const, properties: {}, required: [] },
  execute: async () => ({ toolName: name, success: true, output: '' }),
  deferLoading,
});

const MOCK_TOOLS: ToolDefinition[] = [
  // Core tools
  createMockTool('read', 'Read file contents'),
  createMockTool('write', 'Write file contents'),
  createMockTool('edit', 'Edit file contents'),
  createMockTool('ls', 'List directory'),
  createMockTool('grep', 'Search in files'),
  createMockTool('glob', 'Find files by pattern'),
  createMockTool('run', 'Run terminal command'),
  // Task management tools (always available)
  createMockTool('TodoWrite', 'Update task progress'),
  createMockTool('CreatePlan', 'Create task plan'),
  createMockTool('VerifyTasks', 'Verify task completion'),
  createMockTool('GetActivePlan', 'Get active plan'),
  createMockTool('ListPlans', 'List all plans'),
  createMockTool('DeletePlan', 'Delete a plan'),
  // LSP tools
  createMockTool('lsp_hover', 'Get hover info'),
  createMockTool('lsp_definition', 'Go to definition'),
  createMockTool('lsp_references', 'Find references'),
  createMockTool('lsp_diagnostics', 'Get diagnostics'),
  // Browser tools
  createMockTool('browser_navigate', 'Navigate to URL'),
  createMockTool('browser_extract', 'Extract page content'),
  createMockTool('browser_screenshot', 'Take screenshot'),
  createMockTool('browser_click', 'Click element'),
  // Advanced tools
  createMockTool('create_tool', 'Create dynamic tool'),
  // Request tools (always available)
  createMockTool('request_tools', 'Request additional tools'),
  // Deferred tool
  createMockTool('special_tool', 'Special deferred tool', true),
];

describe('ToolContextManager', () => {
  beforeEach(() => {
    clearWorkspaceTypeCache();
    clearAllSessionToolStates();
    clearToolSelectionCache();
  });

  afterEach(() => {
    clearAllSessionToolStates();
    clearToolSelectionCache();
  });

  describe('selectToolsForContext', () => {
    it('should always include core tools', () => {
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: [],
        workspaceType: 'unknown',
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);

      expect(selectedNames).toContain('read');
      expect(selectedNames).toContain('write');
      expect(selectedNames).toContain('edit');
      expect(selectedNames).toContain('ls');
      expect(selectedNames).toContain('grep');
      expect(selectedNames).toContain('glob');
      expect(selectedNames).toContain('run');
    });

    it('should include LSP tools for TypeScript workspace', () => {
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: [],
        workspaceType: 'typescript',
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);

      expect(selectedNames).toContain('lsp_hover');
      expect(selectedNames).toContain('lsp_definition');
    });

    it('should include browser tools for research intent', () => {
      const userMessage: ChatMessage = {
        id: '1',
        role: 'user',
        content: 'Search the web for React best practices',
        createdAt: Date.now(),
      };

      const context: ToolSelectionContext = {
        recentMessages: [userMessage],
        recentToolUsage: [],
        workspaceType: 'unknown',
        taskIntent: 'research',
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);

      expect(selectedNames).toContain('browser_navigate');
      expect(selectedNames).toContain('browser_extract');
    });

    it('should include recently used tools', () => {
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: ['lsp_diagnostics', 'browser_screenshot'],
        workspaceType: 'unknown',
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);

      expect(selectedNames).toContain('lsp_diagnostics');
      expect(selectedNames).toContain('browser_screenshot');
    });

    it('should reduce total tool count', () => {
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: [],
        workspaceType: 'typescript',
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);

      // Should select fewer tools than total
      expect(selected.length).toBeLessThan(MOCK_TOOLS.length);
      // But should have at least core tools (7 core + request_tools = 8 minimum)
      expect(selected.length).toBeGreaterThanOrEqual(8);
    });

    it('should not include deferred tools unless explicitly selected', () => {
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: [],
        workspaceType: 'unknown',
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);

      expect(selectedNames).not.toContain('special_tool');
    });

    it('should include deferred tools when in recent usage', () => {
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: ['special_tool'],
        workspaceType: 'unknown',
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);

      expect(selectedNames).toContain('special_tool');
    });

    it('should respect maxTools limit', () => {
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: [],
        workspaceType: 'typescript',
        maxTools: 20, // Set a limit higher than core tools but lower than all tools
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      // Should respect the limit (but core tools are always included)
      expect(selected.length).toBeLessThanOrEqual(20);
      // Should have at least core tools (7 core + request_tools = 8 minimum)
      expect(selected.length).toBeGreaterThanOrEqual(8);
    });

    it('should detect compound intents', () => {
      const userMessage: ChatMessage = {
        id: '1',
        role: 'user',
        content: 'Debug and fix the broken test that is failing',
        createdAt: Date.now(),
      };

      const context: ToolSelectionContext = {
        recentMessages: [userMessage],
        recentToolUsage: [],
        workspaceType: 'typescript',
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);

      // Should include both debugging and coding tools
      expect(selectedNames).toContain('lsp_diagnostics');
    });
  });

  describe('detectWorkspaceType', () => {
    it('should return unknown for null path', () => {
      expect(detectWorkspaceType(null)).toBe('unknown');
    });

    it('should return unknown for non-existent path', () => {
      expect(detectWorkspaceType('/non/existent/path')).toBe('unknown');
    });

    it('should cache workspace type', () => {
      // First call
      const type1 = detectWorkspaceType('/non/existent/path');
      // Second call should use cache
      const type2 = detectWorkspaceType('/non/existent/path');
      
      expect(type1).toBe(type2);
    });

    it('should clear cache when requested', () => {
      detectWorkspaceType('/some/path');
      clearWorkspaceTypeCache();
      // After clearing, cache should be empty (no error thrown)
      expect(() => detectWorkspaceType('/some/path')).not.toThrow();
    });
  });

  describe('extractRecentToolUsage', () => {
    it('should extract tool names from messages', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          toolCalls: [{ name: 'read', arguments: { path: 'test.ts' } }],
        },
        {
          id: '2',
          role: 'tool',
          content: 'file contents',
          createdAt: Date.now(),
          toolName: 'read',
        },
        {
          id: '3',
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          toolCalls: [{ name: 'write', arguments: { path: 'test.ts', content: 'new' } }],
        },
      ];

      const toolUsage = extractRecentToolUsage(messages);

      expect(toolUsage).toContain('read');
      expect(toolUsage).toContain('write');
    });

    it('should not duplicate tool names', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          toolCalls: [{ name: 'read', arguments: {} }],
        },
        {
          id: '2',
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          toolCalls: [{ name: 'read', arguments: {} }],
        },
      ];

      const toolUsage = extractRecentToolUsage(messages);

      expect(toolUsage.filter(t => t === 'read').length).toBe(1);
    });
  });

  describe('getToolSelectionSummary', () => {
    it('should generate summary string', () => {
      const selected = MOCK_TOOLS.slice(0, 5);
      const summary = getToolSelectionSummary(selected, MOCK_TOOLS.length);

      expect(summary).toContain('Selected 5/');
      expect(summary).toContain('core=');
    });
  });

  describe('Session Tool State Persistence', () => {
    const TEST_SESSION_ID = 'test-session-123';

    beforeEach(() => {
      clearSessionToolState(TEST_SESSION_ID);
    });

    it('should create new session state when accessing for first time', () => {
      const state = getSessionToolState(TEST_SESSION_ID);
      
      expect(state).toBeDefined();
      expect(state.requestedTools.size).toBe(0);
      expect(state.discoveredTools.size).toBe(0);
      expect(state.requestHistory).toHaveLength(0);
    });

    it('should persist agent-requested tools for the session', () => {
      // Request some tools
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate', 'browser_click'], 'Need browser tools');
      
      // Verify they are stored
      const state = getSessionToolState(TEST_SESSION_ID);
      expect(state.requestedTools.has('browser_navigate')).toBe(true);
      expect(state.requestedTools.has('browser_click')).toBe(true);
      expect(state.requestedTools.size).toBe(2);
    });

    it('should persist discovered tools for the session', () => {
      // Discover some tools via search
      addDiscoveredTools(TEST_SESSION_ID, ['lsp_hover', 'lsp_definition']);
      
      // Verify they are stored
      const state = getSessionToolState(TEST_SESSION_ID);
      expect(state.discoveredTools.has('lsp_hover')).toBe(true);
      expect(state.discoveredTools.has('lsp_definition')).toBe(true);
      expect(state.discoveredTools.size).toBe(2);
    });

    it('should return all agent-controlled tools (requested + discovered)', () => {
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'Need browser');
      addDiscoveredTools(TEST_SESSION_ID, ['lsp_hover']);
      
      const allTools = getAgentControlledTools(TEST_SESSION_ID);
      
      expect(allTools).toContain('browser_navigate');
      expect(allTools).toContain('lsp_hover');
      expect(allTools).toHaveLength(2);
    });

    it('should track request history', () => {
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'First request');
      addAgentRequestedTools(TEST_SESSION_ID, ['lsp_hover'], 'Second request');
      
      const state = getSessionToolState(TEST_SESSION_ID);
      
      expect(state.requestHistory).toHaveLength(2);
      expect(state.requestHistory[0].tools).toContain('browser_navigate');
      expect(state.requestHistory[0].reason).toBe('First request');
      expect(state.requestHistory[1].tools).toContain('lsp_hover');
      expect(state.requestHistory[1].reason).toBe('Second request');
    });

    it('should not duplicate tools when requested multiple times', () => {
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'First request');
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'Second request');
      
      const state = getSessionToolState(TEST_SESSION_ID);
      
      // Tool should only appear once in the set
      expect(state.requestedTools.size).toBe(1);
      // But history should have both requests
      expect(state.requestHistory).toHaveLength(2);
    });

    it('should clear session state when session ends', () => {
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'Test');
      addDiscoveredTools(TEST_SESSION_ID, ['lsp_hover']);
      
      // Clear the session
      clearSessionToolState(TEST_SESSION_ID);
      
      // Getting state again should return empty state
      const state = getSessionToolState(TEST_SESSION_ID);
      expect(state.requestedTools.size).toBe(0);
      expect(state.discoveredTools.size).toBe(0);
      expect(state.requestHistory).toHaveLength(0);
    });

    it('should include agent-requested tools in tool selection', () => {
      // Request browser tools for the session
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate', 'browser_click'], 'Need browser automation');
      
      // Select tools with session context
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: [],
        workspaceType: 'unknown',
        sessionId: TEST_SESSION_ID,
      };
      
      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);
      
      // Agent-requested tools should be included
      expect(selectedNames).toContain('browser_navigate');
      expect(selectedNames).toContain('browser_click');
    });

    it('should include discovered tools in tool selection', () => {
      // Discover LSP tools for the session
      addDiscoveredTools(TEST_SESSION_ID, ['lsp_references']);
      
      // Select tools with session context
      const context: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: [],
        workspaceType: 'unknown',
        sessionId: TEST_SESSION_ID,
      };
      
      const selected = selectToolsForContext(MOCK_TOOLS, context);
      const selectedNames = selected.map(t => t.name);
      
      // Discovered tools should be included
      expect(selectedNames).toContain('lsp_references');
    });

    it('should persist tools across multiple tool selections in same session', () => {
      // Request tools
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'First selection');
      
      // First selection
      const context1: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: [],
        workspaceType: 'unknown',
        sessionId: TEST_SESSION_ID,
      };
      const selected1 = selectToolsForContext(MOCK_TOOLS, context1);
      expect(selected1.map(t => t.name)).toContain('browser_navigate');
      
      // Second selection (different context, same session)
      const context2: ToolSelectionContext = {
        recentMessages: [],
        recentToolUsage: ['read', 'write'],
        workspaceType: 'typescript',
        sessionId: TEST_SESSION_ID,
      };
      const selected2 = selectToolsForContext(MOCK_TOOLS, context2);
      
      // Agent-requested tools should still be included
      expect(selected2.map(t => t.name)).toContain('browser_navigate');
    });

    it('should isolate tool state between different sessions', () => {
      const SESSION_A = 'session-a';
      const SESSION_B = 'session-b';
      
      // Request different tools for different sessions
      addAgentRequestedTools(SESSION_A, ['browser_navigate'], 'Session A');
      addAgentRequestedTools(SESSION_B, ['lsp_hover'], 'Session B');
      
      // Verify isolation
      const toolsA = getAgentControlledTools(SESSION_A);
      const toolsB = getAgentControlledTools(SESSION_B);
      
      expect(toolsA).toContain('browser_navigate');
      expect(toolsA).not.toContain('lsp_hover');
      
      expect(toolsB).toContain('lsp_hover');
      expect(toolsB).not.toContain('browser_navigate');
      
      // Clean up
      clearSessionToolState(SESSION_A);
      clearSessionToolState(SESSION_B);
    });

    it('should return empty array for non-existent session', () => {
      const tools = getAgentControlledTools('non-existent-session');
      expect(tools).toEqual([]);
    });
  });

  describe('Session Cleanup on End', () => {
    const TEST_SESSION_ID = 'cleanup-test-session';

    beforeEach(() => {
      clearAllSessionToolStates();
    });

    afterEach(() => {
      clearAllSessionToolStates();
    });

    it('should return cleanup stats when cleaning up a session with data', () => {
      // Set up session with various data
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate', 'browser_click'], 'Test request');
      addDiscoveredTools(TEST_SESSION_ID, ['lsp_hover', 'lsp_definition']);
      recordToolError(TEST_SESSION_ID, 'read', 'File not found');
      recordToolSuccess(TEST_SESSION_ID, 'write');
      
      // Cleanup the session
      const stats: SessionCleanupStats | null = cleanupSession(TEST_SESSION_ID);
      
      expect(stats).not.toBeNull();
      expect(stats!.sessionId).toBe(TEST_SESSION_ID);
      expect(stats!.requestedToolsCleared).toBe(2);
      expect(stats!.discoveredToolsCleared).toBe(2);
      expect(stats!.errorsCleared).toBe(1);
      expect(stats!.successfulToolsCleared).toBe(1);
      expect(stats!.requestHistoryCleared).toBe(1);
      expect(stats!.timestamp).toBeGreaterThan(0);
      // Cache fields should be present (may be 0 if no cache entries)
      expect(stats!.cacheEntriesCleared).toBeDefined();
      expect(stats!.cacheBytesFreed).toBeDefined();
    });

    it('should return null when cleaning up non-existent session', () => {
      const stats = cleanupSession('non-existent-session');
      expect(stats).toBeNull();
    });

    it('should free memory after cleanup', () => {
      // Set up session
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'Test');
      
      // Verify session exists
      expect(getActiveSessionCount()).toBe(1);
      
      // Cleanup
      cleanupSession(TEST_SESSION_ID);
      
      // Verify session is gone
      expect(getActiveSessionCount()).toBe(0);
      expect(getAgentControlledTools(TEST_SESSION_ID)).toEqual([]);
    });

    it('should cleanup all sessions at once', () => {
      const SESSION_A = 'session-a';
      const SESSION_B = 'session-b';
      const SESSION_C = 'session-c';
      
      // Set up multiple sessions
      addAgentRequestedTools(SESSION_A, ['browser_navigate'], 'Session A');
      addAgentRequestedTools(SESSION_B, ['lsp_hover', 'lsp_definition'], 'Session B');
      addDiscoveredTools(SESSION_C, ['grep', 'glob', 'ls']);
      
      expect(getActiveSessionCount()).toBe(3);
      
      // Cleanup all
      const allStats = cleanupAllSessions();
      
      expect(allStats).toHaveLength(3);
      expect(getActiveSessionCount()).toBe(0);
      
      // Verify each session was cleaned
      const sessionIds = allStats.map(s => s.sessionId);
      expect(sessionIds).toContain(SESSION_A);
      expect(sessionIds).toContain(SESSION_B);
      expect(sessionIds).toContain(SESSION_C);
    });

    it('should track active session count correctly', () => {
      expect(getActiveSessionCount()).toBe(0);
      
      addAgentRequestedTools('session-1', ['read'], 'Test 1');
      expect(getActiveSessionCount()).toBe(1);
      
      addAgentRequestedTools('session-2', ['write'], 'Test 2');
      expect(getActiveSessionCount()).toBe(2);
      
      cleanupSession('session-1');
      expect(getActiveSessionCount()).toBe(1);
      
      cleanupSession('session-2');
      expect(getActiveSessionCount()).toBe(0);
    });

    it('should estimate memory usage', () => {
      // Empty state should have zero memory
      expect(getSessionMemoryEstimate()).toBe(0);
      
      // Add some data
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate', 'browser_click'], 'Test');
      addDiscoveredTools(TEST_SESSION_ID, ['lsp_hover']);
      recordToolError(TEST_SESSION_ID, 'read', 'Error message');
      
      const estimate = getSessionMemoryEstimate();
      
      // Should have some memory usage
      expect(estimate).toBeGreaterThan(0);
      
      // Cleanup should reduce memory
      cleanupSession(TEST_SESSION_ID);
      expect(getSessionMemoryEstimate()).toBe(0);
    });

    it('should allow new session state after cleanup', () => {
      // Set up and cleanup
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'First');
      cleanupSession(TEST_SESSION_ID);
      
      // Should be able to create new state for same session ID
      addAgentRequestedTools(TEST_SESSION_ID, ['lsp_hover'], 'Second');
      
      const tools = getAgentControlledTools(TEST_SESSION_ID);
      expect(tools).toContain('lsp_hover');
      expect(tools).not.toContain('browser_navigate');
    });

    it('should clear cache entries and free memory during cleanup', () => {
      // Reset cache to ensure clean state
      resetToolResultCache();
      const cache = getToolResultCache();
      
      // Add cache entries for the session
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'file content for testing cache cleanup',
      };
      
      cache.set('read', { path: '/file1.ts' }, result, TEST_SESSION_ID);
      cache.set('read', { path: '/file2.ts' }, result, TEST_SESSION_ID);
      
      // Verify cache entries exist
      expect(cache.getSessionEntryCount(TEST_SESSION_ID)).toBe(2);
      
      // Set up session tool state
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'Test');
      
      // Cleanup the session
      const stats = cleanupSession(TEST_SESSION_ID);
      
      // Verify cache was cleared
      expect(stats).not.toBeNull();
      expect(stats!.cacheEntriesCleared).toBe(2);
      expect(stats!.cacheBytesFreed).toBeGreaterThan(0);
      
      // Verify cache entries are gone
      expect(cache.getSessionEntryCount(TEST_SESSION_ID)).toBe(0);
      expect(cache.get('read', { path: '/file1.ts' })).toBeNull();
      expect(cache.get('read', { path: '/file2.ts' })).toBeNull();
      
      // Clean up
      resetToolResultCache();
    });

    it('should report zero cache stats when session has no cache entries', () => {
      // Set up session tool state only (no cache entries)
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate'], 'Test');
      
      // Cleanup the session
      const stats = cleanupSession(TEST_SESSION_ID);
      
      // Verify cache stats are zero
      expect(stats).not.toBeNull();
      expect(stats!.cacheEntriesCleared).toBe(0);
      expect(stats!.cacheBytesFreed).toBe(0);
    });
  });

  describe('getLoadedToolsInfo', () => {
    const TEST_SESSION_ID = 'loaded-tools-test-session';

    beforeEach(() => {
      clearAllSessionToolStates();
    });

    afterEach(() => {
      clearAllSessionToolStates();
    });

    it('should return core tools for a new session', () => {
      const info = getLoadedToolsInfo(TEST_SESSION_ID);
      
      expect(info.coreTools).toContain('read');
      expect(info.coreTools).toContain('write');
      expect(info.coreTools).toContain('edit');
      expect(info.coreTools).toContain('ls');
      expect(info.coreTools).toContain('grep');
      expect(info.coreTools).toContain('glob');
      expect(info.coreTools).toContain('run');
      expect(info.requestedTools).toHaveLength(0);
      expect(info.discoveredTools).toHaveLength(0);
      expect(info.successfulTools).toHaveLength(0);
    });

    it('should include requested tools in the info', () => {
      addAgentRequestedTools(TEST_SESSION_ID, ['browser_navigate', 'browser_click'], 'Test');
      
      const info = getLoadedToolsInfo(TEST_SESSION_ID);
      
      expect(info.requestedTools).toContain('browser_navigate');
      expect(info.requestedTools).toContain('browser_click');
      expect(info.allTools).toContain('browser_navigate');
      expect(info.allTools).toContain('browser_click');
    });

    it('should include discovered tools in the info', () => {
      addDiscoveredTools(TEST_SESSION_ID, ['lsp_hover', 'lsp_definition']);
      
      const info = getLoadedToolsInfo(TEST_SESSION_ID);
      
      expect(info.discoveredTools).toContain('lsp_hover');
      expect(info.discoveredTools).toContain('lsp_definition');
      expect(info.allTools).toContain('lsp_hover');
      expect(info.allTools).toContain('lsp_definition');
    });

    it('should include successful tools in the info', () => {
      recordToolSuccess(TEST_SESSION_ID, 'read');
      recordToolSuccess(TEST_SESSION_ID, 'write');
      
      const info = getLoadedToolsInfo(TEST_SESSION_ID);
      
      expect(info.successfulTools).toContain('read');
      expect(info.successfulTools).toContain('write');
    });

    it('should calculate total count correctly without duplicates', () => {
      // Add some tools that overlap with core tools
      addAgentRequestedTools(TEST_SESSION_ID, ['read', 'browser_navigate'], 'Test');
      addDiscoveredTools(TEST_SESSION_ID, ['write', 'lsp_hover']);
      recordToolSuccess(TEST_SESSION_ID, 'read');
      
      const info = getLoadedToolsInfo(TEST_SESSION_ID);
      
      // Total should not count duplicates
      const uniqueTools = new Set([
        ...info.coreTools,
        ...info.requestedTools,
        ...info.discoveredTools,
        ...info.successfulTools,
      ]);
      
      expect(info.totalCount).toBe(uniqueTools.size);
      expect(info.allTools.length).toBe(info.totalCount);
    });

    it('should return sorted allTools array', () => {
      addAgentRequestedTools(TEST_SESSION_ID, ['zebra_tool', 'alpha_tool'], 'Test');
      
      const info = getLoadedToolsInfo(TEST_SESSION_ID);
      
      // allTools should be sorted alphabetically
      const sortedTools = [...info.allTools].sort();
      expect(info.allTools).toEqual(sortedTools);
    });

    it('should return empty arrays for non-existent session except core tools', () => {
      const info = getLoadedToolsInfo('non-existent-session');
      
      // Core tools should still be present
      expect(info.coreTools.length).toBeGreaterThan(0);
      expect(info.requestedTools).toHaveLength(0);
      expect(info.discoveredTools).toHaveLength(0);
      expect(info.successfulTools).toHaveLength(0);
    });
  });
});
