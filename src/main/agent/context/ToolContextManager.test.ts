/**
 * Tests for ToolContextManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectToolsForContext,
  detectWorkspaceType,
  clearWorkspaceTypeCache,
  extractRecentToolUsage,
  getToolSelectionSummary,
  type ToolSelectionContext,
} from './ToolContextManager';
import type { ToolDefinition } from '../../tools/types';
import type { ChatMessage } from '../../../shared/types';

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
  createMockTool('memory', 'Memory operations'),
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
  // Deferred tool
  createMockTool('special_tool', 'Special deferred tool', true),
];

describe('ToolContextManager', () => {
  beforeEach(() => {
    clearWorkspaceTypeCache();
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
      // But should have at least core tools
      expect(selected.length).toBeGreaterThanOrEqual(7);
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
        maxTools: 10,
      };

      const selected = selectToolsForContext(MOCK_TOOLS, context);
      expect(selected.length).toBeLessThanOrEqual(10);
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
});
