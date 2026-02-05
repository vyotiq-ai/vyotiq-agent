/**
 * Tool Context Manager
 *
 * Intelligently selects relevant tools for LLM context based on:
 * - Workspace type (detected from project files)
 * - Conversation context (recent messages and tool usage)
 * - Task type (coding, research, debugging, etc.)
 * - Tool usage statistics (success rate, frequency)
 * - Tool chaining (output → input compatibility)
 * - Agent-requested tools (explicit tool requests via request_tools)
 * - Error recovery (tools that help fix recent errors)
 * 
 * The agent has full control over tool loading through:
 * 1. Automatic context-aware selection based on task intent
 * 2. Explicit tool requests via the request_tools tool
 * 3. Session-scoped tool persistence (requested tools stay loaded)
 * 4. Error-aware tool suggestions (tools to help recover from errors)
 */

import type { ToolDefinition } from '../../tools/types';
import type { ChatMessage } from '../../../shared/types';
import { getToolUsageTracker } from '../../tools/discovery/ToolUsageTracker';
import { getCapabilityMatcher } from '../../tools/discovery/CapabilityMatcher';
import { createLogger } from '../../logger';
import { getToolExecutionLogger } from '../logging/ToolExecutionLogger';
import { getToolResultCache } from '../cache/ToolResultCache';

const logger = createLogger('ToolContextManager');

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
  /** Session ID for tracking agent-requested tools */
  sessionId?: string;
  /** Tools explicitly requested by the agent */
  agentRequestedTools?: string[];
  /** Recent tool errors for error-aware tool selection */
  recentToolErrors?: Array<{ toolName: string; error: string }>;
  /** Whether to include error recovery tools */
  includeErrorRecoveryTools?: boolean;
}

// =============================================================================
// Session Tool State (Agent-Controlled)
// =============================================================================

/**
 * Tracks tools that the agent has explicitly requested for a session
 */
export interface SessionToolState {
  /** Tools explicitly requested by the agent via request_tools */
  requestedTools: Set<string>;
  /** Tools discovered via tool_search */
  discoveredTools: Set<string>;
  /** Timestamp of last tool request */
  lastRequestAt: number;
  /** Request history for debugging */
  requestHistory: Array<{ tools: string[]; reason: string; timestamp: number }>;
  /** Recent tool errors for error-aware selection */
  recentErrors: Array<{ toolName: string; error: string; timestamp: number }>;
  /** Tools that have been successful recently (for boosting) */
  successfulTools: Set<string>;
}

/** Session tool states - keyed by session ID */
const sessionToolStates = new Map<string, SessionToolState>();

/** Tool selection cache - avoid recalculating on rapid successive calls */
interface ToolSelectionCache {
  sessionId: string;
  workspaceType: string;
  messageCount: number;
  toolUsageHash: string;
  selectedToolNames: string[];
  timestamp: number;
}
let toolSelectionCache: ToolSelectionCache | null = null;
const TOOL_SELECTION_CACHE_TTL = 2000; // 2 seconds - recompute after this

/**
 * Invalidate tool selection cache for a specific session
 */
function invalidateToolSelectionCache(sessionId: string): void {
  if (toolSelectionCache && toolSelectionCache.sessionId === sessionId) {
    toolSelectionCache = null;
  }
}

/**
 * Clear all tool selection caches (for testing)
 */
export function clearToolSelectionCache(): void {
  toolSelectionCache = null;
}

/**
 * Get or create session tool state
 */
export function getSessionToolState(sessionId: string): SessionToolState {
  let state = sessionToolStates.get(sessionId);
  if (!state) {
    state = {
      requestedTools: new Set(),
      discoveredTools: new Set(),
      lastRequestAt: 0,
      requestHistory: [],
      recentErrors: [],
      successfulTools: new Set(),
    };
    sessionToolStates.set(sessionId, state);
  }
  return state;
}

/**
 * Add tools requested by the agent
 */
export function addAgentRequestedTools(
  sessionId: string,
  toolNames: string[],
  reason: string
): void {
  const state = getSessionToolState(sessionId);
  for (const name of toolNames) {
    state.requestedTools.add(name);
  }
  state.lastRequestAt = Date.now();
  state.requestHistory.push({
    tools: toolNames,
    reason,
    timestamp: Date.now(),
  });
  // Invalidate cache since tools changed
  invalidateToolSelectionCache(sessionId);
  logger.debug('Agent requested tools', { sessionId, toolNames, reason });
}

/**
 * Add tools discovered via search
 */
export function addDiscoveredTools(sessionId: string, toolNames: string[]): void {
  const state = getSessionToolState(sessionId);
  for (const name of toolNames) {
    state.discoveredTools.add(name);
  }
  // Invalidate cache since tools changed
  invalidateToolSelectionCache(sessionId);
  logger.debug('Tools discovered', { sessionId, toolNames });
}

/**
 * Record a tool error for error-aware selection
 */
export function recordToolError(sessionId: string, toolName: string, error: string): void {
  const state = getSessionToolState(sessionId);
  state.recentErrors.push({
    toolName,
    error,
    timestamp: Date.now(),
  });
  // Keep only last 10 errors
  if (state.recentErrors.length > 10) {
    state.recentErrors = state.recentErrors.slice(-10);
  }
  logger.debug('Tool error recorded', { sessionId, toolName, error: error.slice(0, 100) });
}

/**
 * Record a successful tool execution
 */
export function recordToolSuccess(sessionId: string, toolName: string): void {
  const state = getSessionToolState(sessionId);
  state.successfulTools.add(toolName);
  logger.debug('Tool success recorded', { sessionId, toolName });
}

/**
 * Get recent tool errors for a session
 */
export function getRecentToolErrors(sessionId: string): Array<{ toolName: string; error: string }> {
  const state = sessionToolStates.get(sessionId);
  if (!state) return [];
  // Return errors from last 5 minutes
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return state.recentErrors
    .filter(e => e.timestamp > fiveMinutesAgo)
    .map(e => ({ toolName: e.toolName, error: e.error }));
}

/**
 * Get all agent-controlled tools for a session
 */
export function getAgentControlledTools(sessionId: string): string[] {
  const state = sessionToolStates.get(sessionId);
  if (!state) return [];
  return [
    ...Array.from(state.requestedTools),
    ...Array.from(state.discoveredTools),
  ];
}

/**
 * Get all loaded tools for a session, categorized by type
 * This includes core tools, agent-requested tools, discovered tools, and successful tools
 */
export interface LoadedToolsInfo {
  /** Core tools that are always available */
  coreTools: string[];
  /** Tools explicitly requested by the agent */
  requestedTools: string[];
  /** Tools discovered via search */
  discoveredTools: string[];
  /** Tools that have been successful recently */
  successfulTools: string[];
  /** All unique tools combined */
  allTools: string[];
  /** Total count of unique tools */
  totalCount: number;
}

export function getLoadedToolsInfo(sessionId: string): LoadedToolsInfo {
  const state = sessionToolStates.get(sessionId);
  
  // Core tools are always available
  const coreTools = [...CORE_TOOLS];
  
  // Get session-specific tools
  const requestedTools = state ? Array.from(state.requestedTools) : [];
  const discoveredTools = state ? Array.from(state.discoveredTools) : [];
  const successfulTools = state ? Array.from(state.successfulTools) : [];
  
  // Combine all tools into a unique set
  const allToolsSet = new Set<string>([
    ...coreTools,
    ...requestedTools,
    ...discoveredTools,
    ...successfulTools,
  ]);
  
  const allTools = Array.from(allToolsSet).sort();
  
  return {
    coreTools,
    requestedTools,
    discoveredTools,
    successfulTools,
    allTools,
    totalCount: allTools.length,
  };
}

/**
 * Clear session tool state
 */
export function clearSessionToolState(sessionId: string): void {
  sessionToolStates.delete(sessionId);
}

/**
 * Clear all session tool states
 */
export function clearAllSessionToolStates(): void {
  sessionToolStates.clear();
}

/**
 * Session cleanup statistics
 */
export interface SessionCleanupStats {
  /** Session ID that was cleaned up */
  sessionId: string;
  /** Number of requested tools cleared */
  requestedToolsCleared: number;
  /** Number of discovered tools cleared */
  discoveredToolsCleared: number;
  /** Number of errors cleared */
  errorsCleared: number;
  /** Number of successful tools cleared */
  successfulToolsCleared: number;
  /** Number of request history entries cleared */
  requestHistoryCleared: number;
  /** Timestamp of cleanup */
  timestamp: number;
  /** Number of cache entries cleared */
  cacheEntriesCleared: number;
  /** Bytes freed from cache */
  cacheBytesFreed: number;
}

/**
 * Cleanup session and free memory with detailed statistics
 * This is the primary cleanup function that should be called when a session ends
 * 
 * @param sessionId - The session ID to clean up
 * @returns Cleanup statistics or null if session didn't exist
 */
export function cleanupSession(sessionId: string): SessionCleanupStats | null {
  const cleanupStartTime = Date.now();
  const state = sessionToolStates.get(sessionId);
  
  if (!state) {
    logger.debug('Session cleanup: no state found', { sessionId });
    return null;
  }
  
  // Log detailed debug information before cleanup
  const memoryBefore = getSessionMemoryEstimate();
  logger.debug('Session cleanup starting', {
    sessionId,
    memoryEstimateBefore: memoryBefore,
    activeSessionsBefore: sessionToolStates.size,
    stateDetails: {
      requestedTools: Array.from(state.requestedTools),
      discoveredTools: Array.from(state.discoveredTools),
      successfulTools: Array.from(state.successfulTools),
      recentErrorCount: state.recentErrors.length,
      requestHistoryCount: state.requestHistory.length,
      lastRequestAt: state.lastRequestAt ? new Date(state.lastRequestAt).toISOString() : null,
    },
  });
  
  // Clear session-specific cache entries to free memory
  const cache = getToolResultCache();
  const cacheCleanup = cache.clearSession(sessionId);
  
  // Collect statistics before clearing
  const stats: SessionCleanupStats = {
    sessionId,
    requestedToolsCleared: state.requestedTools.size,
    discoveredToolsCleared: state.discoveredTools.size,
    errorsCleared: state.recentErrors.length,
    successfulToolsCleared: state.successfulTools.size,
    requestHistoryCleared: state.requestHistory.length,
    timestamp: Date.now(),
    cacheEntriesCleared: cacheCleanup.entriesCleared,
    cacheBytesFreed: cacheCleanup.bytesFreed,
  };
  
  // Clear the session state
  sessionToolStates.delete(sessionId);
  
  // Calculate cleanup duration and memory freed
  const cleanupDuration = Date.now() - cleanupStartTime;
  const memoryAfter = getSessionMemoryEstimate();
  const memoryFreed = memoryBefore - memoryAfter;
  
  // Log cleanup with statistics at info level
  logger.info('Session cleanup completed', {
    sessionId,
    stats: {
      requestedTools: stats.requestedToolsCleared,
      discoveredTools: stats.discoveredToolsCleared,
      errors: stats.errorsCleared,
      successfulTools: stats.successfulToolsCleared,
      requestHistory: stats.requestHistoryCleared,
      cacheEntries: stats.cacheEntriesCleared,
      cacheBytesFreed: stats.cacheBytesFreed,
    },
    performance: {
      durationMs: cleanupDuration,
      memoryFreedBytes: memoryFreed + stats.cacheBytesFreed,
      activeSessionsAfter: sessionToolStates.size,
    },
  });
  
  // Log detailed debug information after cleanup
  logger.debug('Session cleanup details', {
    sessionId,
    memoryEstimateAfter: memoryAfter,
    totalItemsCleared: stats.requestedToolsCleared + stats.discoveredToolsCleared + 
      stats.errorsCleared + stats.successfulToolsCleared + stats.requestHistoryCleared +
      stats.cacheEntriesCleared,
  });
  
  return stats;
}

/**
 * Cleanup all sessions and free memory
 * Useful for application shutdown or memory pressure situations
 * 
 * @returns Array of cleanup statistics for each session
 */
export function cleanupAllSessions(): SessionCleanupStats[] {
  const cleanupStartTime = Date.now();
  const sessionCount = sessionToolStates.size;
  const memoryBefore = getSessionMemoryEstimate();
  
  logger.debug('Cleaning up all sessions', {
    sessionCount,
    memoryEstimateBefore: memoryBefore,
    sessionIds: Array.from(sessionToolStates.keys()),
  });
  
  const allStats: SessionCleanupStats[] = [];
  
  for (const sessionId of sessionToolStates.keys()) {
    const stats = cleanupSession(sessionId);
    if (stats) {
      allStats.push(stats);
    }
  }
  
  const cleanupDuration = Date.now() - cleanupStartTime;
  const memoryAfter = getSessionMemoryEstimate();
  
  logger.info('All sessions cleaned up', {
    sessionCount: allStats.length,
    totalRequestedTools: allStats.reduce((sum, s) => sum + s.requestedToolsCleared, 0),
    totalDiscoveredTools: allStats.reduce((sum, s) => sum + s.discoveredToolsCleared, 0),
    totalErrors: allStats.reduce((sum, s) => sum + s.errorsCleared, 0),
    totalSuccessfulTools: allStats.reduce((sum, s) => sum + s.successfulToolsCleared, 0),
    totalRequestHistory: allStats.reduce((sum, s) => sum + s.requestHistoryCleared, 0),
    performance: {
      durationMs: cleanupDuration,
      memoryFreedBytes: memoryBefore - memoryAfter,
    },
  });
  
  return allStats;
}

/**
 * Get the number of active session states
 * Useful for monitoring memory usage
 */
export function getActiveSessionCount(): number {
  return sessionToolStates.size;
}

/**
 * Get memory usage estimate for session tool states
 * Returns an estimate in bytes
 */
export function getSessionMemoryEstimate(): number {
  let estimate = 0;
  
  for (const state of sessionToolStates.values()) {
    // Estimate Set sizes (roughly 50 bytes per entry for tool names)
    estimate += state.requestedTools.size * 50;
    estimate += state.discoveredTools.size * 50;
    estimate += state.successfulTools.size * 50;
    
    // Estimate error array (roughly 200 bytes per error entry)
    estimate += state.recentErrors.length * 200;
    
    // Estimate request history (roughly 150 bytes per entry)
    estimate += state.requestHistory.length * 150;
    
    // Base object overhead
    estimate += 100;
  }
  
  return estimate;
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
 * MINIMAL set to reduce token consumption
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
 * Task management tools - loaded when planning/task tracking is needed
 */
const TASK_MANAGEMENT_TOOLS = [
  'TodoWrite',
  'CreatePlan',
  'VerifyTasks',
  'GetActivePlan',
  'ListPlans',
  'DeletePlan',
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

/**
 * Error recovery tool mappings - tools that help recover from specific errors
 * These patterns are matched against error messages (case-insensitive)
 * ANSI escape codes are stripped before matching
 */
const ERROR_RECOVERY_TOOLS: Record<string, string[]> = {
  // File not found errors
  'ENOENT': ['ls', 'glob', 'grep'],
  'file not found': ['ls', 'glob', 'grep'],
  'no such file': ['ls', 'glob', 'grep'],
  'does not exist': ['ls', 'glob', 'grep'],
  // Permission errors
  'EACCES': ['ls', 'run'],
  'permission denied': ['ls', 'run'],
  // Syntax/parse errors
  'syntax error': ['read', 'lsp_diagnostics', 'read_lints'],
  'parse error': ['read', 'lsp_diagnostics', 'read_lints'],
  'unexpected token': ['read', 'lsp_diagnostics', 'read_lints'],
  // Type errors
  'type error': ['lsp_hover', 'lsp_diagnostics', 'read_lints'],
  'cannot find name': ['lsp_definition', 'lsp_references', 'grep'],
  // Import/module errors
  'cannot find module': ['ls', 'glob', 'run'],
  'module not found': ['ls', 'glob', 'run'],
  // Edit tool errors - IMPORTANT: these help the agent recover from edit failures
  'old_string not found': ['read', 'grep'],
  'string not found': ['read', 'grep'],
  'no match': ['read', 'grep'],
  'identical': ['read'],  // old_string and new_string are IDENTICAL
  'matches multiple': ['read', 'grep'],  // old_string matches multiple locations
  'whitespace mismatch': ['read'],
  'partial match': ['read', 'grep'],
  // Terminal/command errors
  'command not found': ['run', 'check_terminal'],
  'process exited': ['check_terminal', 'kill_terminal'],
  'not a valid statement': ['run'],  // PowerShell syntax error
  'invalid end of line': ['run'],  // PowerShell && error
  'timed out': ['check_terminal', 'kill_terminal'],
  'timeout': ['check_terminal', 'kill_terminal'],
  // Browser errors
  'navigation failed': ['browser_state', 'browser_screenshot'],
  'element not found': ['browser_snapshot', 'browser_screenshot'],
};

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
 * 
 * IMPORTANT: This function is conservative to avoid loading too many tools.
 * It only returns the TOP 2 intents with the highest scores to minimize
 * token consumption while still supporting compound tasks.
 */
function detectCompoundIntents(content: string): TaskIntent[] {
  const lowerContent = content.toLowerCase();

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

  // Sort intents by score (descending) and filter out general
  const sortedIntents = Object.entries(scores)
    .filter(([intent]) => intent !== 'general')
    .sort((a, b) => b[1] - a[1]);

  // Only include TOP 2 intents with score >= 3 (strong signal)
  // This prevents loading tools for every possible intent
  const strongIntents: TaskIntent[] = [];
  for (const [intent, score] of sortedIntents) {
    if (score >= 3 && strongIntents.length < 2) {
      strongIntents.push(intent as TaskIntent);
    }
  }

  // If no strong intents, use only the primary one
  if (strongIntents.length === 0) {
    const primary = detectTaskIntent(content);
    if (primary !== 'general') {
      return [primary];
    }
  }

  return strongIntents.length > 0 ? strongIntents : ['general'];
}

// =============================================================================
// Tool Selection Logic
// =============================================================================

/**
 * Essential browser tools for research and web content retrieval
 * Only loaded when explicitly needed for browser/research tasks
 */
const ESSENTIAL_BROWSER_TOOLS = [
  'browser_fetch',      // Primary tool for fetching web content
  'browser_navigate',   // Navigate to URLs
];

/**
 * Get tools relevant for a specific task intent
 * 
 * IMPORTANT: This function is optimized for minimal token consumption.
 * Browser tools are ONLY loaded for browser-automation and research tasks.
 * Task management tools are loaded separately based on context.
 */
function getToolsForIntent(intent: TaskIntent): string[] {
  switch (intent) {
    case 'coding':
      // Coding: core + LSP diagnostics only (no browser tools)
      return [...CORE_TOOLS, ...DIAGNOSTICS_TOOLS];

    case 'debugging':
      // Debugging: core + diagnostics + terminal check (no browser tools)
      return [...CORE_TOOLS, ...DIAGNOSTICS_TOOLS, 'check_terminal'];

    case 'research':
      // Research: minimal core + essential browser tools
      return ['read', 'ls', 'grep', 'glob', ...ESSENTIAL_BROWSER_TOOLS, 'browser_extract'];

    case 'file-exploration':
      // File exploration: minimal set for understanding codebase
      return ['read', 'ls', 'glob', 'grep'];

    case 'terminal-operations':
      // Terminal: minimal core + terminal tools
      return ['read', 'write', 'ls', ...TERMINAL_TOOLS];

    case 'browser-automation':
      // Browser automation: minimal core + browser tools
      return ['read', 'write', ...BROWSER_TOOLS.slice(0, 10)];

    case 'documentation':
      // Documentation: minimal core only (no browser tools)
      return ['read', 'write', 'edit', 'ls', 'grep'];

    case 'testing':
      // Testing: core + terminal + diagnostics
      return [...CORE_TOOLS, ...TERMINAL_TOOLS, ...DIAGNOSTICS_TOOLS];

    case 'general':
    default:
      // General: ONLY core tools (no browser tools to save tokens)
      return [...CORE_TOOLS];
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
 * This function implements TRUE dynamic tool loading:
 * - Core tools are ALWAYS included (essential for any task)
 * - Agent-requested tools (via request_tools) are ALWAYS included
 * - Deferred tools are ONLY included if explicitly requested or discovered
 * - Task-relevant tools are added based on intent detection
 * - Recently used tools are included for continuity
 *
 * @param allTools - All available tools from the registry
 * @param context - The selection context
 * @returns Filtered array of relevant tools
 */
export function selectToolsForContext(
  allTools: ToolDefinition[],
  context: ToolSelectionContext
): ToolDefinition[] {
  // Check cache first to avoid expensive recalculation on rapid calls
  const now = Date.now();
  const toolUsageHash = context.recentToolUsage.join(',');
  const messageCount = context.recentMessages.length;
  
  if (
    toolSelectionCache &&
    toolSelectionCache.sessionId === context.sessionId &&
    toolSelectionCache.workspaceType === context.workspaceType &&
    toolSelectionCache.messageCount === messageCount &&
    toolSelectionCache.toolUsageHash === toolUsageHash &&
    now - toolSelectionCache.timestamp < TOOL_SELECTION_CACHE_TTL
  ) {
    // Return cached tools from allTools based on cached names
    const cachedSet = new Set(toolSelectionCache.selectedToolNames);
    return allTools.filter(t => cachedSet.has(t.name));
  }

  const selectedToolNames = new Set<string>();
  const maxTools = context.maxTools ?? 18; // Reduced from 25 to minimize token usage

  // 1. Always include core tools (essential for any task)
  for (const tool of CORE_TOOLS) {
    selectedToolNames.add(tool);
  }

  // 2. Include agent-requested tools (highest priority after core)
  // These are tools explicitly requested by the agent via request_tools
  // They MUST persist for the entire session
  if (context.sessionId) {
    const agentTools = getAgentControlledTools(context.sessionId);
    for (const tool of agentTools) {
      selectedToolNames.add(tool);
    }
    
    // Log agent-controlled tools for debugging
    if (agentTools.length > 0) {
      logger.debug('Including agent-controlled tools', {
        sessionId: context.sessionId,
        agentToolCount: agentTools.length,
        agentTools,
      });
    }
  }
  
  // Also include explicitly passed agent-requested tools
  if (context.agentRequestedTools) {
    for (const tool of context.agentRequestedTools) {
      selectedToolNames.add(tool);
    }
  }

  // 3. Include error recovery tools if there are recent errors
  if (context.includeErrorRecoveryTools !== false) {
    const recentErrors = context.recentToolErrors || 
      (context.sessionId ? getRecentToolErrors(context.sessionId) : []);
    
    if (recentErrors.length > 0) {
      const recoveryTools = getErrorRecoveryTools(recentErrors);
      for (const tool of recoveryTools) {
        selectedToolNames.add(tool);
      }
      logger.debug('Added error recovery tools', {
        sessionId: context.sessionId,
        errorCount: recentErrors.length,
        recoveryTools,
      });
    }
  }

  // 4. Add tools based on task intent (support compound intents - max 2)
  const intents = context.taskIntent 
    ? [context.taskIntent]
    : detectCompoundIntentsFromMessages(context.recentMessages);
  
  for (const intent of intents) {
    const intentTools = getToolsForIntent(intent);
    for (const tool of intentTools) {
      selectedToolNames.add(tool);
    }
  }

  // 5. Add task management tools only if planning/task keywords detected
  if (shouldIncludeTaskManagementTools(context.recentMessages)) {
    for (const tool of TASK_MANAGEMENT_TOOLS) {
      selectedToolNames.add(tool);
    }
  }

  // 6. Add tools based on workspace type
  const workspaceTools = getToolsForWorkspace(context.workspaceType);
  for (const tool of workspaceTools) {
    selectedToolNames.add(tool);
  }

  // 7. Include recently used tools (they're likely still relevant) - limit to 3
  for (const tool of context.recentToolUsage.slice(0, 3)) {
    selectedToolNames.add(tool);
  }

  // 8. Add chainable tools based on last tool used - limit to 2
  if (context.recentToolUsage.length > 0) {
    const lastTool = context.recentToolUsage[context.recentToolUsage.length - 1];
    const chainableTools = getChainableTools(lastTool);
    for (const tool of chainableTools.slice(0, 2)) {
      selectedToolNames.add(tool);
    }
  }

  // 9. Add advanced tools only if explicitly needed
  if (shouldIncludeAdvancedTools(context)) {
    for (const tool of ADVANCED_TOOLS) {
      selectedToolNames.add(tool);
    }
  }

  // 10. Always include the request_tools tool so agent can request more
  selectedToolNames.add('request_tools');

  // 10. Filter tools with STRICT deferred loading enforcement
  // Deferred tools are ONLY included if:
  // - They are in selectedToolNames (explicitly selected above)
  // - They were requested by the agent
  // - They were discovered via search
  let selectedTools = allTools.filter(tool => {
    // Always include if explicitly selected by name
    if (selectedToolNames.has(tool.name)) {
      return true;
    }
    
    // STRICT: Do NOT include deferred tools unless explicitly selected
    // This is the key to dynamic loading - deferred tools stay deferred
    // until the agent explicitly requests them
    if (tool.deferLoading) {
      return false;
    }
    
    // Non-deferred tools that weren't selected are also excluded
    // to keep the context focused
    return false;
  });

  // 11. Boost tools by success rate if enabled
  if (context.useSuccessRateBoost !== false) {
    selectedTools = boostBySuccessRate(selectedTools);
  }

  // 12. Limit total tools
  if (selectedTools.length > maxTools) {
    selectedTools = selectedTools.slice(0, maxTools);
  }

  // Ensure we have at least the core tools
  if (selectedTools.length < CORE_TOOLS.length) {
    return allTools.filter(tool => CORE_TOOLS.includes(tool.name));
  }

  // Calculate dynamic loading metrics
  const deferredToolsTotal = allTools.filter(t => t.deferLoading).length;
  const deferredToolsLoaded = selectedTools.filter(t => t.deferLoading).length;
  const estimatedTokensSaved = (deferredToolsTotal - deferredToolsLoaded) * 150;

  // Log context-aware selection with detailed criteria
  const toolExecutionLogger = getToolExecutionLogger();
  const agentControlledTools = context.sessionId 
    ? getAgentControlledTools(context.sessionId) 
    : [];
  const recentErrors = context.recentToolErrors || 
    (context.sessionId ? getRecentToolErrors(context.sessionId) : []);
  
  // Get boosted tools (tools with high success rate that were prioritized)
  const boostedToolNames: string[] = [];
  if (context.useSuccessRateBoost !== false) {
    try {
      const tracker = getToolUsageTracker();
      for (const tool of selectedTools.slice(0, 10)) {
        const stats = tracker.getStats(tool.name);
        if (stats.successRate > 0.8 && stats.totalInvocations > 5) {
          boostedToolNames.push(tool.name);
        }
      }
    } catch {
      // ToolUsageTracker may not be initialized
    }
  }

  // Log selection with comprehensive criteria including dynamic loading metrics
  toolExecutionLogger.logToolSelection(
    context.sessionId || 'unknown',
    selectedTools.map(t => t.name),
    {
      taskIntent: intents.join(', '),
      workspaceType: context.workspaceType,
      recentErrors: recentErrors.map(e => `${e.toolName}: ${e.error.slice(0, 50)}`),
      boostedTools: boostedToolNames,
    }
  );

  // Log detailed debug information with dynamic loading metrics
  logger.debug('Dynamic tool selection complete', {
    sessionId: context.sessionId,
    selectedCount: selectedTools.length,
    totalAvailable: allTools.length,
    intents,
    workspaceType: context.workspaceType,
    agentRequestedCount: agentControlledTools.length,
    agentRequestedTools: agentControlledTools,
    hasRecentErrors: recentErrors.length > 0,
    errorCount: recentErrors.length,
    boostedToolCount: boostedToolNames.length,
    recentToolUsage: context.recentToolUsage.slice(0, 5),
    dynamicLoading: {
      deferredToolsTotal,
      deferredToolsLoaded,
      estimatedTokensSaved,
      loadingEfficiency: deferredToolsTotal > 0 
        ? `${Math.round((1 - deferredToolsLoaded / deferredToolsTotal) * 100)}%`
        : 'N/A',
    },
  });

  // Update cache for subsequent rapid calls
  toolSelectionCache = {
    sessionId: context.sessionId ?? '',
    workspaceType: context.workspaceType,
    messageCount: context.recentMessages.length,
    toolUsageHash: context.recentToolUsage.join(','),
    selectedToolNames: selectedTools.map(t => t.name),
    timestamp: Date.now(),
  };

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

/**
 * Check if task management tools should be included
 * Only include when user explicitly mentions planning, tasks, or todos
 */
function shouldIncludeTaskManagementTools(messages: ChatMessage[]): boolean {
  const recentContent = messages
    .slice(-3)
    .map(m => m.content.toLowerCase())
    .join(' ');

  const taskKeywords = [
    // Planning keywords
    'plan', 'task', 'todo', 'checklist', 'step by step',
    'break down', 'requirements', 'milestone', 'progress',
    'track', 'verify', 'complete', 'status',
    // Creation keywords
    'create', 'build', 'make', 'develop', 'implement',
    'design', 'architect', 'scaffold', 'setup', 'initialize',
    'generate', 'construct', 'establish', 'compose',
    // Project keywords
    'project', 'feature', 'module', 'component', 'system',
    'application', 'app', 'service', 'api', 'backend', 'frontend',
    // Workflow keywords
    'workflow', 'pipeline', 'process', 'roadmap', 'sprint',
    'phase', 'stage', 'iteration', 'cycle',
  ];

  return taskKeywords.some(keyword => recentContent.includes(keyword));
}

/**
 * Strip ANSI escape codes from a string
 * This is important because terminal output often contains color codes
 */
function stripAnsiCodes(str: string): string {
  /* eslint-disable no-control-regex */
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1b\][^\x07]*\x07/g, '')  // OSC sequences
            .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '');  // Private sequences
  /* eslint-enable no-control-regex */
}

/**
 * Get tools that can help recover from recent errors
 * Strips ANSI codes and matches against known error patterns
 */
function getErrorRecoveryTools(errors: Array<{ toolName: string; error: string }>): string[] {
  const recoveryTools = new Set<string>();
  
  for (const { toolName, error } of errors) {
    // Strip ANSI codes and convert to lowercase for matching
    const cleanError = stripAnsiCodes(error).toLowerCase();
    
    // Match against known error patterns
    for (const [pattern, tools] of Object.entries(ERROR_RECOVERY_TOOLS)) {
      if (cleanError.includes(pattern.toLowerCase())) {
        for (const tool of tools) {
          recoveryTools.add(tool);
        }
      }
    }
    
    // Add tool-specific recovery suggestions
    // If the edit tool failed, always suggest read to re-examine the file
    if (toolName === 'edit' && recoveryTools.size === 0) {
      recoveryTools.add('read');
    }
    
    // If run tool failed, suggest check_terminal
    if (toolName === 'run' && recoveryTools.size === 0) {
      recoveryTools.add('check_terminal');
    }
  }
  
  return Array.from(recoveryTools);
}

// =============================================================================
// Workspace Detection
// =============================================================================

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Detect workspace type from workspace path by checking for common project files
 * Uses caching to avoid redundant filesystem operations
 * 
 * SYNC version - kept for backward compatibility with synchronous contexts
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
 * Async version of workspace type detection
 * Uses non-blocking file operations to avoid blocking the main process
 * Preferred for use in async contexts (IPC handlers, agent execution, etc.)
 */
export async function detectWorkspaceTypeAsync(workspacePath: string | null): Promise<WorkspaceType> {
  if (!workspacePath) {
    return 'unknown';
  }

  // Check cache first (sync cache read is acceptable - it's just memory)
  const now = Date.now();
  if (
    workspaceTypeCache &&
    workspaceTypeCache.path === workspacePath &&
    now - workspaceTypeCache.timestamp < WORKSPACE_CACHE_TTL
  ) {
    return workspaceTypeCache.type;
  }

  try {
    const exists = async (filename: string): Promise<boolean> => {
      try {
        await fsPromises.access(path.join(workspacePath, filename));
        return true;
      } catch {
        return false;
      }
    };

    let detectedType: WorkspaceType = 'unknown';

    // Check for TypeScript projects (run checks in parallel where possible)
    const [
      hasTsconfig,
      hasForgeTs,
      hasForgeJs,
      hasNextJs,
      hasNextTs,
      hasNextMjs,
      hasViteTs,
      hasViteJs,
      hasPackageJson,
      hasRequirements,
      hasSetupPy,
      hasPyproject,
      hasIndexHtml,
    ] = await Promise.all([
      exists('tsconfig.json'),
      exists('forge.config.ts'),
      exists('forge.config.js'),
      exists('next.config.js'),
      exists('next.config.ts'),
      exists('next.config.mjs'),
      exists('vite.config.ts'),
      exists('vite.config.js'),
      exists('package.json'),
      exists('requirements.txt'),
      exists('setup.py'),
      exists('pyproject.toml'),
      exists('index.html'),
    ]);

    if (hasTsconfig) {
      if (hasForgeTs || hasForgeJs) {
        detectedType = 'electron';
      } else if (hasNextJs || hasNextTs || hasNextMjs) {
        detectedType = 'react';
      } else if (hasViteTs || hasViteJs) {
        // Check if it's a React project
        try {
          const pkgPath = path.join(workspacePath, 'package.json');
          const pkgContent = await fsPromises.readFile(pkgPath, 'utf-8');
          const pkg = JSON.parse(pkgContent);
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
    } else if (hasPackageJson) {
      // Check for Node.js projects
      try {
        const pkgPath = path.join(workspacePath, 'package.json');
        const pkgContent = await fsPromises.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          detectedType = 'react';
        } else {
          detectedType = 'node';
        }
      } catch {
        detectedType = 'node';
      }
    } else if (hasRequirements || hasSetupPy || hasPyproject) {
      // Python project
      detectedType = 'python';
    } else if (hasIndexHtml) {
      // Web project
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
    task: 0,
    lsp: 0,
    browser: 0,
    terminal: 0,
    advanced: 0,
    other: 0,
  };

  for (const tool of selectedTools) {
    if (CORE_TOOLS.includes(tool.name)) {
      categories.core++;
    } else if (TASK_MANAGEMENT_TOOLS.includes(tool.name)) {
      categories.task++;
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
    `core=${categories.core}, task=${categories.task}, lsp=${categories.lsp}, browser=${categories.browser}, ` +
    `terminal=${categories.terminal}, advanced=${categories.advanced}, other=${categories.other}`;
}
