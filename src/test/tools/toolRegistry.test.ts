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

describe('Argument Validation and Normalization', () => {
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
  });

  describe('String to Boolean Conversion', () => {
    const booleanTool: ToolDefinition = {
      name: 'boolean_test',
      description: 'Tool with boolean parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'Enable feature' },
          recursive: { type: 'boolean', description: 'Recursive mode' },
        },
        required: ['enabled'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(booleanTool);
    });

    it('should convert string "true" to boolean true', async () => {
      const result = await registry.execute('boolean_test', { enabled: 'true' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        mockContext
      );
    });

    it('should convert string "false" to boolean false', async () => {
      const result = await registry.execute('boolean_test', { enabled: 'false' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
        mockContext
      );
    });

    it('should convert string "TRUE" (uppercase) to boolean true', async () => {
      const result = await registry.execute('boolean_test', { enabled: 'TRUE' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        mockContext
      );
    });

    it('should convert string "FALSE" (uppercase) to boolean false', async () => {
      const result = await registry.execute('boolean_test', { enabled: 'FALSE' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
        mockContext
      );
    });

    it('should convert string "True" (mixed case) to boolean true', async () => {
      const result = await registry.execute('boolean_test', { enabled: 'True' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        mockContext
      );
    });

    it('should convert string " true " (with whitespace) to boolean true', async () => {
      const result = await registry.execute('boolean_test', { enabled: ' true ' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        mockContext
      );
    });

    it('should convert string "1" to boolean true', async () => {
      const result = await registry.execute('boolean_test', { enabled: '1' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        mockContext
      );
    });

    it('should convert string "0" to boolean false', async () => {
      const result = await registry.execute('boolean_test', { enabled: '0' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
        mockContext
      );
    });

    it('should convert string "yes" to boolean true', async () => {
      const result = await registry.execute('boolean_test', { enabled: 'yes' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        mockContext
      );
    });

    it('should convert string "no" to boolean false', async () => {
      const result = await registry.execute('boolean_test', { enabled: 'no' }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
        mockContext
      );
    });

    it('should keep actual boolean true as true', async () => {
      const result = await registry.execute('boolean_test', { enabled: true }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        mockContext
      );
    });

    it('should keep actual boolean false as false', async () => {
      const result = await registry.execute('boolean_test', { enabled: false }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
        mockContext
      );
    });

    it('should convert number 1 to boolean true', async () => {
      const result = await registry.execute('boolean_test', { enabled: 1 }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
        mockContext
      );
    });

    it('should convert number 0 to boolean false', async () => {
      const result = await registry.execute('boolean_test', { enabled: 0 }, mockContext);
      expect(result.success).toBe(true);
      expect(booleanTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
        mockContext
      );
    });
  });

  describe('String to Number Conversion', () => {
    const numberTool: ToolDefinition = {
      name: 'number_test',
      description: 'Tool with number parameters',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Count value' },
          startLine: { type: 'number', description: 'Start line number' },
          endLine: { type: 'number', description: 'End line number' },
          ratio: { type: 'number', description: 'Ratio value' },
        },
        required: ['count'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(numberTool);
    });

    it('should convert string integer "42" to number 42', async () => {
      const result = await registry.execute('number_test', { count: '42' }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ count: 42 }),
        mockContext
      );
    });

    it('should convert string "0" to number 0', async () => {
      const result = await registry.execute('number_test', { count: '0' }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ count: 0 }),
        mockContext
      );
    });

    it('should convert negative string "-10" to number -10', async () => {
      const result = await registry.execute('number_test', { count: '-10' }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ count: -10 }),
        mockContext
      );
    });

    it('should convert string float "3.14" to number 3.14', async () => {
      const result = await registry.execute('number_test', { ratio: '3.14' }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ ratio: 3.14 }),
        mockContext
      );
    });

    it('should convert string " 100 " (with whitespace) to number 100', async () => {
      const result = await registry.execute('number_test', { count: ' 100 ' }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ count: 100 }),
        mockContext
      );
    });

    it('should keep actual number as number', async () => {
      const result = await registry.execute('number_test', { count: 99 }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ count: 99 }),
        mockContext
      );
    });

    it('should handle multiple number parameters', async () => {
      const result = await registry.execute('number_test', { 
        count: '5', 
        startLine: '10', 
        endLine: '20' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ count: 5, startLine: 10, endLine: 20 }),
        mockContext
      );
    });

    it('should keep non-numeric string as string when conversion fails', async () => {
      const result = await registry.execute('number_test', { count: 'not-a-number' }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ count: 'not-a-number' }),
        mockContext
      );
    });

    it('should convert scientific notation string "1e5" to number 100000', async () => {
      const result = await registry.execute('number_test', { count: '1e5' }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ count: 100000 }),
        mockContext
      );
    });

    it('should convert negative float string "-2.5" to number -2.5', async () => {
      const result = await registry.execute('number_test', { ratio: '-2.5' }, mockContext);
      expect(result.success).toBe(true);
      expect(numberTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ ratio: -2.5 }),
        mockContext
      );
    });
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

describe('Argument Alias Mapping', () => {
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
  });

  describe('Path Argument Aliases', () => {
    // Tool that uses 'path' as canonical name (like read_file)
    const pathTool: ToolDefinition = {
      name: 'path_tool',
      description: 'Tool with path parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    // Tool that uses 'file_path' as canonical name (like edit_file)
    const filePathTool: ToolDefinition = {
      name: 'file_path_tool',
      description: 'Tool with file_path parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'File path' },
        },
        required: ['file_path'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(pathTool);
      registry.register(filePathTool);
    });

    it('should map file_path to path when schema expects path', async () => {
      const result = await registry.execute('path_tool', { file_path: '/test/file.txt' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should map filepath to path when schema expects path', async () => {
      const result = await registry.execute('path_tool', { filepath: '/test/file.txt' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should map filePath to file_path when schema expects file_path', async () => {
      const result = await registry.execute('file_path_tool', { filePath: '/test/file.txt' }, mockContext);
      expect(result.success).toBe(true);
      expect(filePathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ file_path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should keep path as path when schema expects path', async () => {
      const result = await registry.execute('path_tool', { path: '/test/file.txt' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should keep file_path as file_path when schema expects file_path', async () => {
      const result = await registry.execute('file_path_tool', { file_path: '/test/file.txt' }, mockContext);
      expect(result.success).toBe(true);
      expect(filePathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ file_path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should not overwrite canonical name with alias value', async () => {
      // When both path and file_path are provided, path should take precedence
      const result = await registry.execute('path_tool', { 
        path: '/correct/path.txt',
        file_path: '/wrong/path.txt' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/correct/path.txt' }),
        mockContext
      );
    });
  });

  describe('String Replacement Aliases', () => {
    // Tool that uses old_string/new_string (like edit_file)
    const editTool: ToolDefinition = {
      name: 'edit_tool',
      description: 'Tool with old_string/new_string parameters',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'File path' },
          old_string: { type: 'string', description: 'String to find' },
          new_string: { type: 'string', description: 'String to replace with' },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(editTool);
    });

    it('should map old_str to old_string', async () => {
      const result = await registry.execute('edit_tool', { 
        file_path: '/test/file.txt',
        old_str: 'find me',
        new_string: 'replace me'
      }, mockContext);
      expect(result.success).toBe(true);
      expect(editTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ old_string: 'find me' }),
        mockContext
      );
    });

    it('should map new_str to new_string', async () => {
      const result = await registry.execute('edit_tool', { 
        file_path: '/test/file.txt',
        old_string: 'find me',
        new_str: 'replace me'
      }, mockContext);
      expect(result.success).toBe(true);
      expect(editTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ new_string: 'replace me' }),
        mockContext
      );
    });

    it('should map oldString to old_string', async () => {
      const result = await registry.execute('edit_tool', { 
        file_path: '/test/file.txt',
        oldString: 'find me',
        new_string: 'replace me'
      }, mockContext);
      expect(result.success).toBe(true);
      expect(editTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ old_string: 'find me' }),
        mockContext
      );
    });

    it('should map newString to new_string', async () => {
      const result = await registry.execute('edit_tool', { 
        file_path: '/test/file.txt',
        old_string: 'find me',
        newString: 'replace me'
      }, mockContext);
      expect(result.success).toBe(true);
      expect(editTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ new_string: 'replace me' }),
        mockContext
      );
    });

    it('should map search to old_string when schema expects old_string', async () => {
      const result = await registry.execute('edit_tool', { 
        file_path: '/test/file.txt',
        search: 'find me',
        new_string: 'replace me'
      }, mockContext);
      expect(result.success).toBe(true);
      expect(editTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ old_string: 'find me' }),
        mockContext
      );
    });

    it('should map replace to new_string when schema expects new_string', async () => {
      const result = await registry.execute('edit_tool', { 
        file_path: '/test/file.txt',
        old_string: 'find me',
        replace: 'replace me'
      }, mockContext);
      expect(result.success).toBe(true);
      expect(editTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ new_string: 'replace me' }),
        mockContext
      );
    });
  });

  describe('Command Aliases', () => {
    const terminalTool: ToolDefinition = {
      name: 'terminal_tool',
      description: 'Tool with command parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run' },
        },
        required: ['command'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(terminalTool);
    });

    it('should map cmd to command', async () => {
      const result = await registry.execute('terminal_tool', { cmd: 'ls -la' }, mockContext);
      expect(result.success).toBe(true);
      expect(terminalTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'ls -la' }),
        mockContext
      );
    });
  });

  describe('Directory Aliases', () => {
    const dirTool: ToolDefinition = {
      name: 'dir_tool',
      description: 'Tool with directory parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory path' },
        },
        required: ['directory'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(dirTool);
    });

    it('should map dir to directory', async () => {
      const result = await registry.execute('dir_tool', { dir: '/test/dir' }, mockContext);
      expect(result.success).toBe(true);
      expect(dirTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ directory: '/test/dir' }),
        mockContext
      );
    });

    it('should map cwd to directory', async () => {
      const result = await registry.execute('dir_tool', { cwd: '/test/dir' }, mockContext);
      expect(result.success).toBe(true);
      expect(dirTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ directory: '/test/dir' }),
        mockContext
      );
    });

    it('should map working_dir to directory', async () => {
      const result = await registry.execute('dir_tool', { working_dir: '/test/dir' }, mockContext);
      expect(result.success).toBe(true);
      expect(dirTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ directory: '/test/dir' }),
        mockContext
      );
    });
  });

  describe('Boolean Option Aliases', () => {
    const optionsTool: ToolDefinition = {
      name: 'options_tool',
      description: 'Tool with boolean options',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          replace_all: { type: 'boolean', description: 'Replace all occurrences' },
        },
        required: [],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(optionsTool);
    });

    it('should map replaceAll to replace_all', async () => {
      const result = await registry.execute('options_tool', { replaceAll: true }, mockContext);
      expect(result.success).toBe(true);
      expect(optionsTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ replace_all: true }),
        mockContext
      );
    });
  });
});

describe('Path Argument Whitespace Trimming', () => {
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
  });

  describe('Whitespace Trimming for path argument', () => {
    const pathTool: ToolDefinition = {
      name: 'path_trim_tool',
      description: 'Tool with path parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(pathTool);
    });

    it('should trim leading whitespace from path', async () => {
      const result = await registry.execute('path_trim_tool', { path: '  /test/file.txt' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should trim trailing whitespace from path', async () => {
      const result = await registry.execute('path_trim_tool', { path: '/test/file.txt  ' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should trim both leading and trailing whitespace from path', async () => {
      const result = await registry.execute('path_trim_tool', { path: '  /test/file.txt  ' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should trim tabs and newlines from path', async () => {
      const result = await registry.execute('path_trim_tool', { path: '\t/test/file.txt\n' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should not modify path without whitespace', async () => {
      const result = await registry.execute('path_trim_tool', { path: '/test/file.txt' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/file.txt' }),
        mockContext
      );
    });

    it('should preserve internal spaces in path', async () => {
      const result = await registry.execute('path_trim_tool', { path: '  /test/my file.txt  ' }, mockContext);
      expect(result.success).toBe(true);
      expect(pathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/test/my file.txt' }),
        mockContext
      );
    });
  });

  describe('Whitespace Trimming for file_path argument', () => {
    const filePathTool: ToolDefinition = {
      name: 'file_path_trim_tool',
      description: 'Tool with file_path parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'File path' },
        },
        required: ['file_path'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(filePathTool);
    });

    it('should trim whitespace from file_path', async () => {
      const result = await registry.execute('file_path_trim_tool', { file_path: '  /test/file.txt  ' }, mockContext);
      expect(result.success).toBe(true);
      expect(filePathTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ file_path: '/test/file.txt' }),
        mockContext
      );
    });
  });

  describe('Whitespace Trimming for directory argument', () => {
    const dirTool: ToolDefinition = {
      name: 'dir_trim_tool',
      description: 'Tool with directory parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory path' },
        },
        required: ['directory'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(dirTool);
    });

    it('should trim whitespace from directory', async () => {
      const result = await registry.execute('dir_trim_tool', { directory: '  /test/dir  ' }, mockContext);
      expect(result.success).toBe(true);
      expect(dirTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ directory: '/test/dir' }),
        mockContext
      );
    });
  });

  describe('Whitespace Trimming for source and destination arguments', () => {
    const copyTool: ToolDefinition = {
      name: 'copy_trim_tool',
      description: 'Tool with source and destination parameters',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source path' },
          destination: { type: 'string', description: 'Destination path' },
        },
        required: ['source', 'destination'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(copyTool);
    });

    it('should trim whitespace from source', async () => {
      const result = await registry.execute('copy_trim_tool', { 
        source: '  /test/source.txt  ', 
        destination: '/test/dest.txt' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(copyTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ source: '/test/source.txt' }),
        mockContext
      );
    });

    it('should trim whitespace from destination', async () => {
      const result = await registry.execute('copy_trim_tool', { 
        source: '/test/source.txt', 
        destination: '  /test/dest.txt  ' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(copyTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ destination: '/test/dest.txt' }),
        mockContext
      );
    });

    it('should trim whitespace from both source and destination', async () => {
      const result = await registry.execute('copy_trim_tool', { 
        source: '  /test/source.txt  ', 
        destination: '  /test/dest.txt  ' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(copyTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ 
          source: '/test/source.txt',
          destination: '/test/dest.txt'
        }),
        mockContext
      );
    });
  });

  describe('Whitespace Trimming for cwd argument', () => {
    const cwdTool: ToolDefinition = {
      name: 'cwd_trim_tool',
      description: 'Tool with cwd parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Current working directory' },
        },
        required: ['cwd'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(cwdTool);
    });

    it('should trim whitespace from cwd', async () => {
      const result = await registry.execute('cwd_trim_tool', { cwd: '  /test/workspace  ' }, mockContext);
      expect(result.success).toBe(true);
      expect(cwdTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: '/test/workspace' }),
        mockContext
      );
    });
  });

  describe('Non-path string arguments should NOT be trimmed', () => {
    const contentTool: ToolDefinition = {
      name: 'content_tool',
      description: 'Tool with content parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to write' },
          description: { type: 'string', description: 'Description text' },
        },
        required: ['content'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(contentTool);
    });

    it('should NOT trim whitespace from content argument', async () => {
      const result = await registry.execute('content_tool', { content: '  some content with spaces  ' }, mockContext);
      expect(result.success).toBe(true);
      expect(contentTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ content: '  some content with spaces  ' }),
        mockContext
      );
    });

    it('should NOT trim whitespace from description argument', async () => {
      const result = await registry.execute('content_tool', { 
        content: 'test',
        description: '  description with spaces  ' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(contentTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ description: '  description with spaces  ' }),
        mockContext
      );
    });
  });
});


describe('JSON String Parsing for Array/Object Parameters', () => {
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
  });

  describe('Array Parameter JSON Parsing', () => {
    const arrayTool: ToolDefinition = {
      name: 'array_tool',
      description: 'Tool with array parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          items: { type: 'array', description: 'Array of items' },
          files: { type: 'array', description: 'Array of file paths' },
        },
        required: ['items'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(arrayTool);
    });

    it('should parse valid JSON array string', async () => {
      const result = await registry.execute('array_tool', { 
        items: '["item1", "item2", "item3"]' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: ['item1', 'item2', 'item3'] }),
        mockContext
      );
    });

    it('should parse JSON array with numbers', async () => {
      const result = await registry.execute('array_tool', { 
        items: '[1, 2, 3, 4, 5]' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: [1, 2, 3, 4, 5] }),
        mockContext
      );
    });

    it('should parse JSON array with mixed types', async () => {
      const result = await registry.execute('array_tool', { 
        items: '["string", 123, true, null]' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: ['string', 123, true, null] }),
        mockContext
      );
    });

    it('should parse JSON array with objects', async () => {
      const result = await registry.execute('array_tool', { 
        items: '[{"name": "test1"}, {"name": "test2"}]' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ name: 'test1' }, { name: 'test2' }] }),
        mockContext
      );
    });

    it('should parse JSON array with whitespace', async () => {
      const result = await registry.execute('array_tool', { 
        items: '  [ "item1" , "item2" ]  ' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: ['item1', 'item2'] }),
        mockContext
      );
    });

    it('should parse empty JSON array', async () => {
      const result = await registry.execute('array_tool', { 
        items: '[]' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: [] }),
        mockContext
      );
    });

    it('should keep actual array as-is', async () => {
      const result = await registry.execute('array_tool', { 
        items: ['already', 'an', 'array'] 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: ['already', 'an', 'array'] }),
        mockContext
      );
    });

    it('should split comma-separated string into array', async () => {
      const result = await registry.execute('array_tool', { 
        items: 'item1, item2, item3' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: ['item1', 'item2', 'item3'] }),
        mockContext
      );
    });

    it('should split semicolon-separated string into array', async () => {
      const result = await registry.execute('array_tool', { 
        items: 'item1; item2; item3' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: ['item1', 'item2', 'item3'] }),
        mockContext
      );
    });

    it('should split newline-separated string into array', async () => {
      const result = await registry.execute('array_tool', { 
        items: 'item1\nitem2\nitem3' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: ['item1', 'item2', 'item3'] }),
        mockContext
      );
    });

    it('should wrap single object in array when provided as JSON string', async () => {
      const result = await registry.execute('array_tool', { 
        items: '{"name": "single"}' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ name: 'single' }] }),
        mockContext
      );
    });

    it('should wrap single object in array when provided as object', async () => {
      const result = await registry.execute('array_tool', { 
        items: { name: 'single' } 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: [{ name: 'single' }] }),
        mockContext
      );
    });

    it('should wrap single value in array', async () => {
      const result = await registry.execute('array_tool', { 
        items: 42 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: [42] }),
        mockContext
      );
    });

    it('should extract string items from malformed JSON array', async () => {
      const result = await registry.execute('array_tool', { 
        items: '["item1", "item2", "item3"' // Missing closing bracket
      }, mockContext);
      expect(result.success).toBe(true);
      // Should extract the string items heuristically
      expect(arrayTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ items: ['item1', 'item2', 'item3'] }),
        mockContext
      );
    });
  });

  describe('Object Parameter JSON Parsing', () => {
    const objectTool: ToolDefinition = {
      name: 'object_tool',
      description: 'Tool with object parameter',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          config: { type: 'object', description: 'Configuration object' },
          options: { type: 'object', description: 'Options object' },
        },
        required: ['config'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(objectTool);
    });

    it('should parse valid JSON object string', async () => {
      const result = await registry.execute('object_tool', { 
        config: '{"key": "value", "count": 42}' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: { key: 'value', count: 42 } }),
        mockContext
      );
    });

    it('should parse nested JSON object string', async () => {
      const result = await registry.execute('object_tool', { 
        config: '{"outer": {"inner": "value"}}' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: { outer: { inner: 'value' } } }),
        mockContext
      );
    });

    it('should parse JSON object with array values', async () => {
      const result = await registry.execute('object_tool', { 
        config: '{"items": [1, 2, 3], "name": "test"}' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: { items: [1, 2, 3], name: 'test' } }),
        mockContext
      );
    });

    it('should parse JSON object with whitespace', async () => {
      const result = await registry.execute('object_tool', { 
        config: '  { "key" : "value" }  ' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: { key: 'value' } }),
        mockContext
      );
    });

    it('should parse empty JSON object', async () => {
      const result = await registry.execute('object_tool', { 
        config: '{}' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: {} }),
        mockContext
      );
    });

    it('should keep actual object as-is', async () => {
      const result = await registry.execute('object_tool', { 
        config: { already: 'an object' } 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: { already: 'an object' } }),
        mockContext
      );
    });

    it('should parse JSON array string for object parameter', async () => {
      const result = await registry.execute('object_tool', { 
        config: '[1, 2, 3]' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: [1, 2, 3] }),
        mockContext
      );
    });

    it('should keep non-JSON string as-is for object parameter', async () => {
      const result = await registry.execute('object_tool', { 
        config: 'not a json string' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: 'not a json string' }),
        mockContext
      );
    });

    it('should recover JSON with trailing comma', async () => {
      const result = await registry.execute('object_tool', { 
        config: '{"key": "value",}' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: { key: 'value' } }),
        mockContext
      );
    });

    it('should recover JSON with unquoted keys', async () => {
      const result = await registry.execute('object_tool', { 
        config: '{key: "value", count: 42}' 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: { key: 'value', count: 42 } }),
        mockContext
      );
    });

    it('should handle array provided for object parameter', async () => {
      const result = await registry.execute('object_tool', { 
        config: ['item1', 'item2'] 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(objectTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ config: ['item1', 'item2'] }),
        mockContext
      );
    });
  });

  describe('Complex Nested JSON Parsing', () => {
    const complexTool: ToolDefinition = {
      name: 'complex_tool',
      description: 'Tool with complex parameters',
      requiresApproval: false,
      schema: {
        type: 'object',
        properties: {
          operations: { type: 'array', description: 'Array of operations' },
          settings: { type: 'object', description: 'Settings object' },
        },
        required: ['operations'],
      },
      execute: vi.fn().mockImplementation((args) => {
        return { success: true, output: JSON.stringify(args) };
      }),
    };

    beforeEach(() => {
      registry.register(complexTool);
    });

    it('should parse complex nested JSON array', async () => {
      const complexArray = JSON.stringify([
        { type: 'create', path: '/test/file1.txt', content: 'hello' },
        { type: 'delete', path: '/test/file2.txt' },
      ]);
      const result = await registry.execute('complex_tool', { 
        operations: complexArray 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(complexTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ 
          operations: [
            { type: 'create', path: '/test/file1.txt', content: 'hello' },
            { type: 'delete', path: '/test/file2.txt' },
          ] 
        }),
        mockContext
      );
    });

    it('should parse complex nested JSON object', async () => {
      const complexObject = JSON.stringify({
        theme: 'dark',
        features: {
          autoSave: true,
          lineNumbers: false,
        },
        plugins: ['plugin1', 'plugin2'],
      });
      const result = await registry.execute('complex_tool', { 
        operations: ['test'],
        settings: complexObject 
      }, mockContext);
      expect(result.success).toBe(true);
      expect(complexTool.execute).toHaveBeenCalledWith(
        expect.objectContaining({ 
          settings: {
            theme: 'dark',
            features: {
              autoSave: true,
              lineNumbers: false,
            },
            plugins: ['plugin1', 'plugin2'],
          }
        }),
        mockContext
      );
    });
  });
});
