/**
 * Tool Registry Integration Tests
 * 
 * Tests for the ToolRegistry and tool execution system.
 * Validates tool registration, lookup, schema generation, and execution.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../../main/tools/registry/ToolRegistry';
import type { ToolDefinition, ToolExecutionContext } from '../../main/tools/types';

// Mock tool definitions for testing
const mockReadFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file',
  requiresApproval: false,
  category: 'file-read',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to read' },
      startLine: { type: 'number', description: 'Start line' },
      endLine: { type: 'number', description: 'End line' },
    },
    required: ['path'],
  },
  execute: vi.fn().mockResolvedValue({ success: true, output: 'file contents' }),
};

const mockWriteFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write contents to a file',
  requiresApproval: true,
  category: 'file-write',
  riskLevel: 'moderate',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to write' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
  execute: vi.fn().mockResolvedValue({ success: true, output: 'File written' }),
  inputExamples: [
    { path: '/src/test.ts', content: 'console.log("hello")' },
  ],
};

const mockDeferredTool: ToolDefinition = {
  name: 'rare_tool',
  description: 'A rarely used tool',
  requiresApproval: false,
  category: 'other',
  deferLoading: true,
  searchKeywords: ['rare', 'special', 'uncommon'],
  schema: {
    type: 'object',
    properties: {
      input: { type: 'string' },
    },
    required: ['input'],
  },
  execute: vi.fn().mockResolvedValue({ success: true, output: 'Rare operation done' }),
};

const mockSystemTool: ToolDefinition = {
  name: 'system_info',
  description: 'Get system information',
  requiresApproval: false,
  category: 'system',
  schema: {
    type: 'object',
    properties: {
      action: { 
        type: 'string', 
        enum: ['get', 'list', 'status'],
      },
      type: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['action'],
  },
  execute: vi.fn().mockResolvedValue({ success: true, output: 'System info retrieved' }),
};

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    vi.clearAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register a tool successfully', () => {
      registry.register(mockReadFileTool);
      
      const tool = registry.getDefinition('read_file');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('read_file');
      expect(tool?.description).toBe('Read the contents of a file');
    });

    it('should register multiple tools', () => {
      registry.register(mockReadFileTool);
      registry.register(mockWriteFileTool);
      registry.register(mockSystemTool);
      
      const tools = registry.list();
      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name)).toContain('read_file');
      expect(tools.map(t => t.name)).toContain('write_file');
      expect(tools.map(t => t.name)).toContain('system_info');
    });

    it('should handle tool aliases', () => {
      registry.register(mockReadFileTool);
      registry.registerAlias('rf', 'read_file');
      
      const toolByAlias = registry.getDefinition('rf');
      const toolByName = registry.getDefinition('read_file');
      
      expect(toolByAlias).toBeDefined();
      expect(toolByAlias?.name).toBe(toolByName?.name);
    });

    it('should not register alias for non-existent tool', () => {
      registry.registerAlias('alias', 'nonexistent_tool');
      
      const tool = registry.getDefinition('alias');
      expect(tool).toBeUndefined();
    });
  });

  describe('Tool Lookup', () => {
    beforeEach(() => {
      registry.register(mockReadFileTool);
      registry.register(mockWriteFileTool);
      registry.register(mockSystemTool);
      registry.register(mockDeferredTool);
    });

    it('should get tool definition by name', () => {
      const tool = registry.getDefinition('system_info');
      
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('system_info');
      expect(tool?.category).toBe('system');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = registry.getDefinition('nonexistent');
      expect(tool).toBeUndefined();
    });

    it('should get full registry entry with metadata', () => {
      const entry = registry.getEntry('write_file');
      
      expect(entry).toBeDefined();
      expect(entry?.definition.name).toBe('write_file');
      expect(entry?.category).toBe('file-write');
      expect(entry?.metadata).toBeDefined();
    });

    it('should get UI metadata for tool', () => {
      const metadata = registry.getUIMetadata('read_file');
      
      expect(metadata).toBeDefined();
      expect(metadata.icon).toBeDefined();
    });
  });

  describe('Category Filtering', () => {
    beforeEach(() => {
      registry.register(mockReadFileTool);
      registry.register(mockWriteFileTool);
      registry.register(mockSystemTool);
      registry.register(mockDeferredTool);
    });

    it('should list tools by category', () => {
      const fileReadTools = registry.listByCategory('file-read');
      
      expect(fileReadTools).toHaveLength(1);
      expect(fileReadTools[0].name).toBe('read_file');
    });

    it('should list system tools', () => {
      const systemTools = registry.listByCategory('system');
      
      expect(systemTools).toHaveLength(1);
      expect(systemTools[0].name).toBe('system_info');
    });
  });

  describe('Schema Generation for LLM', () => {
    beforeEach(() => {
      registry.register(mockReadFileTool);
      registry.register(mockWriteFileTool);
      registry.register(mockSystemTool);
    });

    it('should generate schema for LLM', () => {
      const schemas = registry.getSchemaForLLM();
      
      expect(schemas).toHaveLength(3);
      
      const readFileSchema = schemas.find(s => s.name === 'read_file');
      expect(readFileSchema).toBeDefined();
      expect(readFileSchema?.description).toBe('Read the contents of a file');
      expect(readFileSchema?.schema).toBeDefined();
    });

    it('should include input examples when available', () => {
      const schemas = registry.getSchemaForLLM();
      
      const writeFileSchema = schemas.find(s => s.name === 'write_file');
      expect(writeFileSchema?.inputExamples).toBeDefined();
      expect(writeFileSchema?.inputExamples).toHaveLength(1);
    });

    it('should not include inputExamples when not defined', () => {
      const schemas = registry.getSchemaForLLM();
      
      const readFileSchema = schemas.find(s => s.name === 'read_file');
      expect(readFileSchema?.inputExamples).toBeUndefined();
    });
  });

  describe('Deferred Loading', () => {
    beforeEach(() => {
      registry.register(mockReadFileTool);
      registry.register(mockDeferredTool);
    });

    it('should get deferred tools', () => {
      const deferred = registry.getDeferredTools();
      
      expect(deferred).toHaveLength(1);
      expect(deferred[0].name).toBe('rare_tool');
    });

    it('should get always-loaded tools', () => {
      const alwaysLoaded = registry.getAlwaysLoadedTools();
      
      expect(alwaysLoaded).toHaveLength(1);
      expect(alwaysLoaded[0].name).toBe('read_file');
    });
  });

  describe('Tool Search', () => {
    beforeEach(() => {
      registry.register(mockReadFileTool);
      registry.register(mockWriteFileTool);
      registry.register(mockSystemTool);
      registry.register(mockDeferredTool);
    });

    it('should search tools by name', () => {
      const results = registry.searchTools('read');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('read_file');
    });

    it('should search tools by description', () => {
      const results = registry.searchTools('contents');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.name === 'read_file')).toBe(true);
    });

    it('should return empty for non-matching query', () => {
      const results = registry.searchTools('xyznonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('Allowed Callers', () => {
    it('should filter tools by allowed callers', () => {
      const directOnlyTool: ToolDefinition = {
        ...mockReadFileTool,
        name: 'direct_only',
        allowedCallers: ['direct'],
      };
      
      const codeExecTool: ToolDefinition = {
        ...mockReadFileTool,
        name: 'code_exec_allowed',
        allowedCallers: ['direct', 'code_execution'],
      };
      
      registry.register(directOnlyTool);
      registry.register(codeExecTool);
      
      const codeExecTools = registry.getToolsForCaller('code_execution');
      
      expect(codeExecTools).toHaveLength(1);
      expect(codeExecTools[0].name).toBe('code_exec_allowed');
    });

    it('should default to direct caller when not specified', () => {
      registry.register(mockReadFileTool);
      
      const directTools = registry.getToolsForCaller('direct');
      
      expect(directTools).toHaveLength(1);
      expect(directTools[0].name).toBe('read_file');
    });
  });
});

describe('Tool Execution', () => {
  let registry: ToolRegistry;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockContext = {
      workspacePath: '/test/workspace',
      cwd: '/test/workspace',
      terminalManager: {
        run: vi.fn(),
        getOutput: vi.fn(),
        kill: vi.fn(),
        list: vi.fn(),
      } as unknown as ToolExecutionContext['terminalManager'],
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      sessionId: 'test-session-123',
      runId: 'test-run-456',
    };
    
    registry.register(mockReadFileTool);
    registry.register(mockWriteFileTool);
    registry.register(mockSystemTool);
  });

  it('should execute a tool with correct arguments', async () => {
    const tool = registry.getDefinition('read_file');
    expect(tool).toBeDefined();
    
    const args = { path: '/test/file.txt', startLine: 1, endLine: 10 };
    const result = await tool!.execute(args, mockContext);
    
    expect(result.success).toBe(true);
    expect(mockReadFileTool.execute).toHaveBeenCalledWith(args, mockContext);
  });

  it('should execute system tool', async () => {
    const tool = registry.getDefinition('system_info');
    expect(tool).toBeDefined();
    
    const args = { 
      action: 'get', 
      type: 'info', 
      content: 'Test content',
    };
    const result = await tool!.execute(args, mockContext);
    
    expect(result.success).toBe(true);
    expect(mockSystemTool.execute).toHaveBeenCalledWith(args, mockContext);
  });

  it('should pass session and run IDs to context', async () => {
    const tool = registry.getDefinition('write_file');
    expect(tool).toBeDefined();
    
    const args = { path: '/test/file.txt', content: 'test content' };
    await tool!.execute(args, mockContext);
    
    expect(mockWriteFileTool.execute).toHaveBeenCalledWith(
      args,
      expect.objectContaining({
        sessionId: 'test-session-123',
        runId: 'test-run-456',
      })
    );
  });

  it('should identify tools requiring approval', () => {
    const readTool = registry.getDefinition('read_file');
    const writeTool = registry.getDefinition('write_file');
    
    expect(readTool?.requiresApproval).toBe(false);
    expect(writeTool?.requiresApproval).toBe(true);
  });

  it('should identify tool risk levels', () => {
    const writeTool = registry.getDefinition('write_file');
    expect(writeTool?.riskLevel).toBe('moderate');
  });
});

describe('Tool Registration Validation', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should handle tool with all optional fields', () => {
    const fullTool: ToolDefinition = {
      name: 'full_tool',
      description: 'A tool with all optional fields',
      requiresApproval: true,
      category: 'file-write',
      riskLevel: 'dangerous',
      deferLoading: false,
      searchKeywords: ['full', 'complete'],
      allowedCallers: ['direct', 'code_execution'],
      mustReadBeforeWrite: true,
      alwaysConfirmPatterns: [/\.env$/],
      inputExamples: [{ input: 'example' }],
      ui: {
        icon: 'file-plus',
        label: 'Full Tool',
        color: 'red',
        runningLabel: 'Creating...',
        completedLabel: 'Created',
      },
      schema: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
        required: ['input'],
      },
      execute: vi.fn(),
    };

    registry.register(fullTool);
    
    const retrieved = registry.getDefinition('full_tool');
    expect(retrieved).toBeDefined();
    expect(retrieved?.riskLevel).toBe('dangerous');
    expect(retrieved?.mustReadBeforeWrite).toBe(true);
    expect(retrieved?.alwaysConfirmPatterns).toHaveLength(1);
  });

  it('should handle tool with minimal fields', () => {
    const minimalTool: ToolDefinition = {
      name: 'minimal_tool',
      description: 'Minimal tool',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {},
      },
      execute: vi.fn(),
    };

    registry.register(minimalTool);
    
    const retrieved = registry.getDefinition('minimal_tool');
    expect(retrieved).toBeDefined();
    expect(retrieved?.category).toBeUndefined();
    expect(retrieved?.riskLevel).toBeUndefined();
  });
});
