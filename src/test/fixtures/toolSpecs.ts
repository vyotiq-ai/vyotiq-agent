/**
 * Tool Specification Fixtures
 *
 * Sample tool specifications for testing dynamic tool creation.
 */
import type { ToolSpecification } from '../../shared/types';

// =============================================================================
// Template-Based Tools
// =============================================================================

export const templateToolSpec: ToolSpecification = {
  id: 'test-template-tool-1',
  name: 'format_json',
  description: 'Format JSON data with indentation',
  inputSchema: {
    type: 'object',
    properties: {
      json: { type: 'string', description: 'JSON string to format' },
      indent: { type: 'number', description: 'Indentation spaces', default: 2 },
    },
    required: ['json'],
  },
  executionType: 'template',
  templateId: 'json-formatter',
  requiredCapabilities: ['none'],
  riskLevel: 'safe',
  createdBy: {
    sessionId: 'test-session',
    runId: 'test-run',
  },
  createdAt: Date.now(),
  version: 1,
};

export const fileTemplateToolSpec: ToolSpecification = {
  id: 'test-file-template-1',
  name: 'create_component',
  description: 'Create a React component from template',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Component name' },
      type: { type: 'string', enum: ['functional', 'class'], default: 'functional' },
      withStyles: { type: 'boolean', default: false },
    },
    required: ['name'],
  },
  executionType: 'template',
  templateId: 'react-component',
  requiredCapabilities: ['file_write'],
  riskLevel: 'moderate',
  createdBy: {
    sessionId: 'test-session',
    runId: 'test-run',
  },
  createdAt: Date.now(),
  version: 1,
};

// =============================================================================
// Code-Based Tools
// =============================================================================

export const codeToolSpec: ToolSpecification = {
  id: 'test-code-tool-1',
  name: 'calculate_hash',
  description: 'Calculate hash of input string',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'String to hash' },
      algorithm: { type: 'string', enum: ['md5', 'sha256'], default: 'sha256' },
    },
    required: ['input'],
  },
  executionType: 'code',
  executionCode: `
    const crypto = require('crypto');
    const hash = crypto.createHash(params.algorithm || 'sha256');
    hash.update(params.input);
    return { hash: hash.digest('hex') };
  `,
  requiredCapabilities: ['none'],
  riskLevel: 'safe',
  createdBy: {
    sessionId: 'test-session',
    runId: 'test-run',
  },
  createdAt: Date.now(),
  version: 1,
};

export const dangerousCodeToolSpec: ToolSpecification = {
  id: 'test-dangerous-tool-1',
  name: 'execute_shell',
  description: 'Execute shell command (dangerous)',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
    },
    required: ['command'],
  },
  executionType: 'code',
  executionCode: `
    const { execSync } = require('child_process');
    return { output: execSync(params.command).toString() };
  `,
  requiredCapabilities: ['process_spawn'],
  riskLevel: 'dangerous',
  createdBy: {
    sessionId: 'test-session',
    runId: 'test-run',
  },
  createdAt: Date.now(),
  version: 1,
};

// =============================================================================
// Composite Tools
// =============================================================================

export const compositeToolSpec: ToolSpecification = {
  id: 'test-composite-tool-1',
  name: 'analyze_and_fix',
  description: 'Analyze code and apply fixes',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'File to analyze' },
      autoFix: { type: 'boolean', default: false },
    },
    required: ['filePath'],
  },
  executionType: 'composite',
  compositionSteps: [
    {
      id: 'step-1',
      toolName: 'read_file',
      arguments: { path: '$.filePath' },
      dependsOn: [],
      outputAs: 'fileContent',
    },
    {
      id: 'step-2',
      toolName: 'analyze_code',
      arguments: { content: '$.steps.step-1.output' },
      dependsOn: ['step-1'],
      outputAs: 'analysis',
    },
    {
      id: 'step-3',
      toolName: 'apply_fixes',
      arguments: {
        path: '$.filePath',
        fixes: '$.steps.step-2.output.fixes',
      },
      dependsOn: ['step-2'],
      condition: '$.autoFix === true',
      outputAs: 'result',
    },
  ],
  requiredCapabilities: ['file_read', 'file_write'],
  riskLevel: 'moderate',
  createdBy: {
    sessionId: 'test-session',
    runId: 'test-run',
  },
  createdAt: Date.now(),
  version: 1,
};

export const parallelCompositeToolSpec: ToolSpecification = {
  id: 'test-parallel-composite-1',
  name: 'multi_file_search',
  description: 'Search multiple files in parallel',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Files to search' },
    },
    required: ['pattern', 'paths'],
  },
  executionType: 'composite',
  compositionSteps: [
    {
      id: 'search-1',
      toolName: 'grep',
      arguments: { pattern: '$.pattern', path: '$.paths[0]' },
      dependsOn: [],
      outputAs: 'result1',
    },
    {
      id: 'search-2',
      toolName: 'grep',
      arguments: { pattern: '$.pattern', path: '$.paths[1]' },
      dependsOn: [],
      outputAs: 'result2',
    },
    {
      id: 'aggregate',
      toolName: 'aggregate_results',
      arguments: {
        results: ['$.steps.search-1.output', '$.steps.search-2.output'],
      },
      dependsOn: ['search-1', 'search-2'],
      outputAs: 'combined',
    },
  ],
  requiredCapabilities: ['file_read'],
  riskLevel: 'safe',
  createdBy: {
    sessionId: 'test-session',
    runId: 'test-run',
  },
  createdAt: Date.now(),
  version: 1,
};

// =============================================================================
// Invalid Tool Specs (for validation testing)
// =============================================================================

export const invalidToolSpec_NoName: Partial<ToolSpecification> = {
  id: 'invalid-1',
  description: 'Tool without name',
  inputSchema: { type: 'object', properties: {} },
  executionType: 'template',
  requiredCapabilities: ['none'],
  riskLevel: 'safe',
};

export const invalidToolSpec_BadSchema: Partial<ToolSpecification> = {
  id: 'invalid-2',
  name: 'bad_schema_tool',
  description: 'Tool with invalid schema',
  inputSchema: { type: 'invalid' as 'object' },
  executionType: 'template',
  requiredCapabilities: ['none'],
  riskLevel: 'safe',
};

export const invalidToolSpec_MissingTemplate: ToolSpecification = {
  id: 'invalid-3',
  name: 'missing_template',
  description: 'Template tool without templateId',
  inputSchema: { type: 'object', properties: {} },
  executionType: 'template',
  // Missing templateId
  requiredCapabilities: ['none'],
  riskLevel: 'safe',
  createdBy: { sessionId: 'test', runId: 'test' },
  createdAt: Date.now(),
  version: 1,
};

// =============================================================================
// Tool Spec Collections
// =============================================================================

export const allValidToolSpecs: ToolSpecification[] = [
  templateToolSpec,
  fileTemplateToolSpec,
  codeToolSpec,
  compositeToolSpec,
  parallelCompositeToolSpec,
];

export const safeToolSpecs: ToolSpecification[] = [
  templateToolSpec,
  codeToolSpec,
  parallelCompositeToolSpec,
];

export const moderateRiskToolSpecs: ToolSpecification[] = [
  fileTemplateToolSpec,
  compositeToolSpec,
];

export const dangerousToolSpecs: ToolSpecification[] = [
  dangerousCodeToolSpec,
];

// =============================================================================
// Factory Functions
// =============================================================================

export function createToolSpec(
  overrides: Partial<ToolSpecification> = {}
): ToolSpecification {
  return {
    id: `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: 'test_tool',
    description: 'Test tool',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' },
      },
      required: ['input'],
    },
    executionType: 'template',
    templateId: 'test-template',
    requiredCapabilities: ['none'],
    riskLevel: 'safe',
    createdBy: {
      sessionId: 'test-session',
      runId: 'test-run',
    },
    createdAt: Date.now(),
    version: 1,
    ...overrides,
  };
}

export function createCodeToolSpec(
  code: string,
  overrides: Partial<ToolSpecification> = {}
): ToolSpecification {
  return createToolSpec({
    executionType: 'code',
    executionCode: code,
    templateId: undefined,
    ...overrides,
  });
}

export function createCompositeToolSpec(
  steps: ToolSpecification['compositionSteps'],
  overrides: Partial<ToolSpecification> = {}
): ToolSpecification {
  return createToolSpec({
    executionType: 'composite',
    compositionSteps: steps,
    templateId: undefined,
    ...overrides,
  });
}
