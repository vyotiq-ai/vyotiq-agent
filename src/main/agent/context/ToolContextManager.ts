/**
 * Tool Context Manager
 *
 * Intelligently selects relevant tools for LLM context based on:
 * - Workspace type (detected from project files)
 * - Conversation context (recent messages and tool usage)
 * - Task type (coding, research, debugging, etc.)
 * - Tool usage statistics (success rate, frequency)
 * - Tool chaining (output → input compatibility)
 */

import type { ToolDefinition } from '../../tools/types';
import type { ChatMessage } from '../../../shared/types';
import { getToolUsageTracker } from '../../tools/discovery/ToolUsageTracker';
import { getCapabilityMatcher } from '../../tools/discovery/CapabilityMatcher';

// =============================================================================
// Types
// =============================================================================

export interface ToolSelectionContext {
  /** Recent conversation messages (last 5-10) */
  recentMessages: ChatMessage[];
  /** Tools used in recent messages */
  recentToolUsage: string[];
  /** Detected workspace type */
  workspaceType: WorkspaceType;
  /** Current task intent (if detected) */
  taskIntent?: TaskIntent;
  /** Maximum tools to select (default: 20) */
  maxTools?: number;
  /** Boost tools by usage success rate */
  useSuccessRateBoost?: boolean;
}

export type WorkspaceType =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'web'
  | 'node'
  | 'electron'
  | 'react'
  | 'unknown';

export type TaskIntent =
  | 'coding'
  | 'debugging'
  | 'research'
  | 'file-exploration'
  | 'terminal-operations'
  | 'browser-automation'
  | 'documentation'
  | 'testing'
  | 'general';

// =============================================================================
// Tool Categories
// =============================================================================

/**
 * Core tools that are always included (essential for any task)
 */
const CORE_TOOLS = [
  'read',
  'write',
  'edit',
  'ls',
  'grep',
  'glob',
  'run',
];

/**
 * Tools for code intelligence (LSP-based)
 */
const CODE_INTELLIGENCE_TOOLS = [
  'lsp_hover',
  'lsp_definition',
  'lsp_references',
  'lsp_diagnostics',
  'lsp_symbols',
  'lsp_completions',
  'lsp_code_actions',
  'lsp_rename',
];

/**
 * Tools for browser automation
 */
const BROWSER_TOOLS = [
  'browser_navigate',
  'browser_extract',
  'browser_screenshot',
  'browser_click',
  'browser_type',
  'browser_scroll',
  'browser_snapshot',
  'browser_fill_form',
  'browser_evaluate',
  'browser_wait',
  'browser_state',
  'browser_back',
  'browser_forward',
  'browser_reload',
  'browser_fetch',
  'browser_hover',
  'browser_security_status',
  'browser_check_url',
  'browser_console',
  'browser_network',
  'browser_tabs',
];

/**
 * Tools for terminal operations
 */
const TERMINAL_TOOLS = [
  'run',
  'check_terminal',
  'kill_terminal',
];

/**
 * Tools for advanced/autonomous operations
 */
const ADVANCED_TOOLS = [
  'create_tool',
  'bulk',
];

/**
 * Tools for diagnostics and linting
 */
const DIAGNOSTICS_TOOLS = [
  'read_lints',
  'lsp_diagnostics',
];

// Workspace type cache to avoid redundant fs operations
let workspaceTypeCache: { path: string; type: WorkspaceType; timestamp: number } | null = null;
const WORKSPACE_CACHE_TTL = 60000; // 1 minute

// =============================================================================
// Task Intent Detection
// =============================================================================

/**
 * Keywords that indicate specific task intents
 */
const TASK_INTENT_KEYWORDS: Record<TaskIntent, string[]> = {
  coding: [
    'implement', 'create', 'add', 'write', 'build', 'develop',
    'function', 'class', 'component', 'module', 'feature',
    'code', 'refactor', 'modify', 'update', 'change', 'fix',
    'debug', 'test', 'optimize', 'performance', 'security',
    'lint', 'format', 'style', 'comment', 'docstring',
    'syntax', 'error', 'bug', 'issue', 'problem', 'broken',
    'api', 'endpoint', 'route', 'handler', 'middleware', 'hook',
    'state', 'props', 'interface', 'type', 'enum', 'schema',
    'migration', 'seed', 'model', 'controller', 'service',
  ],
  debugging: [
    'fix', 'bug', 'error', 'issue', 'problem', 'broken',
    'debug', 'trace', 'investigate', 'diagnose', 'crash',
    'exception', 'failing', 'not working', 'undefined',
    'stack trace', 'call stack', 'backtrace', 'debugger',
    'logging', 'assertion', 'performance', 'optimization',
    'null', 'NaN', 'infinite loop', 'timeout', 'hang', 'freeze',
    'slow', 'regression', 'breakpoint', 'console.log', 'print',
    'memory leak', 'gc', 'out of memory',
  ],
  research: [
    'find', 'search', 'look for', 'where is', 'how does', 'online',
    'explain', 'understand', 'analyze', 'review', 'check',
    'documentation', 'docs', 'readme', 'research', 'study', 'explore',
    'what is', 'why does', 'difference between', 'compare',
    'best practice', 'alternative', 'library', 'package',
    'dependency', 'version', 'how to', 'tutorial',
  ],
  'file-exploration': [
    'list', 'show', 'what files', 'directory', 'folder',
    'structure', 'tree', 'contents', 'files in', 'find files',
    'find folders', 'find directories', 'project structure',
    'codebase', 'workspace', 'src', 'source',
  ],
  'terminal-operations': [
    'run', 'execute', 'command', 'terminal', 'shell',
    'npm', 'yarn', 'pnpm', 'node', 'python', 'pip',
    'install', 'build', 'test', 'start', 'script',
    'kill', 'stop', 'terminate', 'exit', 'quit', 'close',
    'git', 'docker', 'make', 'cargo', 'go', 'gradle', 'maven',
    'composer', 'bundle', 'deploy', 'serve', 'watch', 'migrate',
  ],
  'browser-automation': [
    'browser', 'web', 'website', 'page', 'url', 'http',
    'navigate', 'click', 'screenshot', 'scrape', 'fetch', 'extract',
    'form', 'input', 'button', 'link', 'type', 'scroll', 'snapshot',
    'fill', 'evaluate', 'wait', 'hover', 'tabs', 'tab', 'window',
    'login', 'submit', 'download', 'upload', 'cookie', 'session',
    'authentication', 'captcha', 'pdf', 'print page',
  ],
  documentation: [
    'document', 'readme', 'comment', 'jsdoc', 'explain',
    'describe', 'write docs', 'add comments',
    'changelog', 'api docs', 'usage', 'example', 'tutorial',
    'markdown', 'tsdoc', 'typedoc',
  ],
  testing: [
    'test', 'spec', 'unit test', 'integration', 'e2e',
    'coverage', 'assert', 'expect', 'mock', 'vitest', 'jest',
    'snapshot', 'fixture', 'stub', 'spy', 'describe', 'it',
    'beforeEach', 'afterEach', 'playwright', 'cypress',
  ],
  general: [],
};

/**
 * Detect task intent from message content
 * Supports compound intents (e.g., "debug and fix" → ['debugging', 'coding'])
 */
function detectTaskIntent(content: string): TaskIntent {
  const lowerContent = content.toLowerCase();

  // Check each intent's keywords
  const scores: Record<TaskIntent, number> = {
    coding: 0,
    debugging: 0,
    research: 0,
    'file-exploration': 0,
    'terminal-operations': 0,
    'browser-automation': 0,
    documentation: 0,
    testing: 0,
    general: 0,
  };

  for (const [intent, keywords] of Object.entries(TASK_INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        scores[intent as TaskIntent]++;
      }
    }
  }

  // Find the intent with highest score
  let maxScore = 0;
  let detectedIntent: TaskIntent = 'general';

  for (const [intent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedIntent = intent as TaskIntent;
    }
  }

  return detectedIntent;
}

/**
 * Detect multiple intents for compound tasks
 */
function detectCompoundIntents(content: string): TaskIntent[] {
  const lowerContent = content.toLowerCase();
  const intents: TaskIntent[] = [];

  const scores: Record<TaskIntent, number> = {
    coding: 0,
    debugging: 0,
    research: 0,
    'file-exploration': 0,
    'terminal-operations': 0,
    'browser-automation': 0,
    documentation: 0,
    testing: 0,
    general: 0,
  };

  for (const [intent, keywords] of Object.entries(TASK_INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerContent.includes(keyword)) {
        scores[intent as TaskIntent]++;
      }
    }
  }

  // Include intents with score >= 2 (multiple keyword matches)
  for (const [intent, score] of Object.entries(scores)) {
    if (score >= 2 && intent !== 'general') {
      intents.push(intent as TaskIntent);
    }
  }

  // If no strong intents, use the primary one
  if (intents.length === 0) {
    const primary = detectTaskIntent(content);
    if (primary !== 'general') {
      intents.push(primary);
    }
  }

  return intents.length > 0 ? intents : ['general'];
}

// =============================================================================
// Tool Selection Logic
// =============================================================================

/**
 * Get tools relevant for a specific task intent
 */
function getToolsForIntent(intent: TaskIntent): string[] {
  switch (intent) {
    case 'coding':
      return [...CORE_TOOLS, ...CODE_INTELLIGENCE_TOOLS.slice(0, 4), ...DIAGNOSTICS_TOOLS];

    case 'debugging':
      return [...CORE_TOOLS, ...DIAGNOSTICS_TOOLS, ...CODE_INTELLIGENCE_TOOLS.slice(0, 4), 'check_terminal'];

    case 'research':
      return [...CORE_TOOLS.slice(0, 5), ...BROWSER_TOOLS.slice(0, 5)];

    case 'file-exploration':
      return ['read', 'ls', 'glob', 'grep'];

    case 'terminal-operations':
      return [...CORE_TOOLS.slice(0, 4), ...TERMINAL_TOOLS];

    case 'browser-automation':
      return ['read', 'write', ...BROWSER_TOOLS.slice(0, 10)];

    case 'documentation':
      return [...CORE_TOOLS.slice(0, 5), 'lsp_symbols'];

    case 'testing':
      return [...CORE_TOOLS, ...TERMINAL_TOOLS, ...DIAGNOSTICS_TOOLS];

    case 'general':
    default:
      return CORE_TOOLS;
  }
}

/**
 * Get additional tools based on workspace type
 */
function getToolsForWorkspace(workspaceType: WorkspaceType): string[] {
  switch (workspaceType) {
    case 'typescript':
    case 'javascript':
    case 'react':
    case 'node':
    case 'electron':
      return CODE_INTELLIGENCE_TOOLS.slice(0, 4); // LSP tools for TS/JS

    case 'web':
      return BROWSER_TOOLS.slice(0, 5); // Basic browser tools

    case 'python':
      return ['run', 'check_terminal']; // Python uses terminal more

    default:
      return [];
  }
}

// =============================================================================
// Main Selection Function
// =============================================================================

/**
 * Select relevant tools based on context
 *
 * @param allTools - All available tools from the registry
 * @param context - The selection context
 * @returns Filtered array of relevant tools
 */
export function selectToolsForContext(
  allTools: ToolDefinition[],
  context: ToolSelectionContext
): ToolDefinition[] {
  const selectedToolNames = new Set<string>();
  const maxTools = context.maxTools ?? 25;

  // 1. Always include core tools
  for (const tool of CORE_TOOLS) {
    selectedToolNames.add(tool);
  }

  // 2. Add tools based on task intent (support compound intents)
  const intents = context.taskIntent 
    ? [context.taskIntent]
    : detectCompoundIntentsFromMessages(context.recentMessages);
  
  for (const intent of intents) {
    const intentTools = getToolsForIntent(intent);
    for (const tool of intentTools) {
      selectedToolNames.add(tool);
    }
  }

  // 3. Add tools based on workspace type
  const workspaceTools = getToolsForWorkspace(context.workspaceType);
  for (const tool of workspaceTools) {
    selectedToolNames.add(tool);
  }

  // 4. Include recently used tools (they're likely still relevant)
  for (const tool of context.recentToolUsage.slice(0, 5)) {
    selectedToolNames.add(tool);
  }

  // 5. Add chainable tools based on last tool used
  if (context.recentToolUsage.length > 0) {
    const lastTool = context.recentToolUsage[context.recentToolUsage.length - 1];
    const chainableTools = getChainableTools(lastTool);
    for (const tool of chainableTools.slice(0, 3)) {
      selectedToolNames.add(tool);
    }
  }

  // 6. Add advanced tools only if explicitly needed
  if (shouldIncludeAdvancedTools(context)) {
    for (const tool of ADVANCED_TOOLS) {
      selectedToolNames.add(tool);
    }
  }

  // Filter tools, respecting deferLoading flag
  let selectedTools = allTools.filter(tool => {
    // Always include if explicitly selected
    if (selectedToolNames.has(tool.name)) {
      return true;
    }
    // Don't include deferred tools unless explicitly selected
    if (tool.deferLoading) {
      return false;
    }
    return false;
  });

  // 7. Boost tools by success rate if enabled
  if (context.useSuccessRateBoost !== false) {
    selectedTools = boostBySuccessRate(selectedTools);
  }

  // 8. Limit total tools
  if (selectedTools.length > maxTools) {
    selectedTools = selectedTools.slice(0, maxTools);
  }

  // Ensure we have at least the core tools
  if (selectedTools.length < CORE_TOOLS.length) {
    return allTools.filter(tool => CORE_TOOLS.includes(tool.name));
  }

  return selectedTools;
}

/**
 * Get chainable tools based on last tool's output type
 */
function getChainableTools(lastToolName: string): string[] {
  try {
    const matcher = getCapabilityMatcher();
    const chains = matcher.findChain(lastToolName, 'any');
    return chains.slice(0, 5).map(c => c.toolName);
  } catch {
    // CapabilityMatcher may not be initialized
    return [];
  }
}

/**
 * Boost tools by their success rate from usage tracking
 */
function boostBySuccessRate(tools: ToolDefinition[]): ToolDefinition[] {
  try {
    const tracker = getToolUsageTracker();
    
    // Get success rates for all tools
    const toolsWithScores = tools.map(tool => {
      const stats = tracker.getStats(tool.name);
      // Score: base 0.5 + success rate bonus (0-0.5)
      const score = 0.5 + (stats.successRate * 0.5);
      return { tool, score };
    });

    // Sort by score (higher success rate first)
    toolsWithScores.sort((a, b) => b.score - a.score);
    
    return toolsWithScores.map(t => t.tool);
  } catch {
    // ToolUsageTracker may not be initialized
    return tools;
  }
}

/**
 * Detect compound intents from recent messages
 */
function detectCompoundIntentsFromMessages(messages: ChatMessage[]): TaskIntent[] {
  const userMessages = messages
    .filter(m => m.role === 'user')
    .slice(-3);

  if (userMessages.length === 0) {
    return ['general'];
  }

  const combinedContent = userMessages.map(m => m.content).join(' ');
  return detectCompoundIntents(combinedContent);
}

/**
 * Check if advanced tools should be included
 */
function shouldIncludeAdvancedTools(context: ToolSelectionContext): boolean {
  // Include if explicitly mentioned in recent messages
  const recentContent = context.recentMessages
    .slice(-3)
    .map(m => m.content.toLowerCase())
    .join(' ');

  const advancedKeywords = [
    'parallel',
    'complex task', 'decompose', 'break down',
  ];

  return advancedKeywords.some(keyword => recentContent.includes(keyword));
}

// =============================================================================
// Workspace Detection
// =============================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Detect workspace type from workspace path by checking for common project files
 * Uses caching to avoid redundant filesystem operations
 */
export function detectWorkspaceType(workspacePath: string | null): WorkspaceType {
  if (!workspacePath) {
    return 'unknown';
  }

  // Check cache first
  const now = Date.now();
  if (
    workspaceTypeCache &&
    workspaceTypeCache.path === workspacePath &&
    now - workspaceTypeCache.timestamp < WORKSPACE_CACHE_TTL
  ) {
    return workspaceTypeCache.type;
  }

  try {
    const exists = (filename: string) => {
      try {
        fs.accessSync(path.join(workspacePath, filename));
        return true;
      } catch {
        return false;
      }
    };

    let detectedType: WorkspaceType = 'unknown';

    // Check for TypeScript projects
    if (exists('tsconfig.json')) {
      if (exists('forge.config.ts') || exists('forge.config.js')) {
        detectedType = 'electron';
      } else if (exists('next.config.js') || exists('next.config.ts') || exists('next.config.mjs')) {
        detectedType = 'react';
      } else if (exists('vite.config.ts') || exists('vite.config.js')) {
        // Check if it's a React project
        try {
          const pkgPath = path.join(workspacePath, 'package.json');
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.dependencies?.react || pkg.devDependencies?.react) {
            detectedType = 'react';
          } else {
            detectedType = 'typescript';
          }
        } catch {
          detectedType = 'typescript';
        }
      } else {
        detectedType = 'typescript';
      }
    } else if (exists('package.json')) {
      // Check for Node.js projects
      try {
        const pkgPath = path.join(workspacePath, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          detectedType = 'react';
        } else {
          detectedType = 'node';
        }
      } catch {
        detectedType = 'node';
      }
    } else if (exists('requirements.txt') || exists('setup.py') || exists('pyproject.toml')) {
      // Check for Python projects
      detectedType = 'python';
    } else if (exists('index.html')) {
      // Check for web projects
      detectedType = 'web';
    }

    // Update cache
    workspaceTypeCache = {
      path: workspacePath,
      type: detectedType,
      timestamp: now,
    };

    return detectedType;
  } catch {
    return 'unknown';
  }
}

/**
 * Clear workspace type cache (useful when workspace changes)
 */
export function clearWorkspaceTypeCache(): void {
  workspaceTypeCache = null;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get tool names from recent tool calls in messages
 */
export function extractRecentToolUsage(messages: ChatMessage[]): string[] {
  const toolNames: string[] = [];

  for (const message of messages.slice(-10)) {
    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        if (call.name && !toolNames.includes(call.name)) {
          toolNames.push(call.name);
        }
      }
    }
    if (message.toolName && !toolNames.includes(message.toolName)) {
      toolNames.push(message.toolName);
    }
  }

  return toolNames;
}

/**
 * Get a summary of selected tools for logging
 */
export function getToolSelectionSummary(
  selectedTools: ToolDefinition[],
  totalTools: number
): string {
  const categories = {
    core: 0,
    lsp: 0,
    browser: 0,
    terminal: 0,
    advanced: 0,
    other: 0,
  };

  for (const tool of selectedTools) {
    if (CORE_TOOLS.includes(tool.name)) {
      categories.core++;
    } else if (tool.name.startsWith('lsp_')) {
      categories.lsp++;
    } else if (tool.name.startsWith('browser_')) {
      categories.browser++;
    } else if (TERMINAL_TOOLS.includes(tool.name)) {
      categories.terminal++;
    } else if (ADVANCED_TOOLS.includes(tool.name)) {
      categories.advanced++;
    } else {
      categories.other++;
    }
  }

  return `Selected ${selectedTools.length}/${totalTools} tools: ` +
    `core=${categories.core}, lsp=${categories.lsp}, browser=${categories.browser}, ` +
    `terminal=${categories.terminal}, advanced=${categories.advanced}, other=${categories.other}`;
}
