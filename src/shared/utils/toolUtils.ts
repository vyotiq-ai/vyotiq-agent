/**
 * Tool Utilities
 * 
 * Unified tool-related utilities for consistent handling across the application.
 * Consolidates functionality previously scattered across multiple files.
 */

import type { ToolCallPayload, ToolExecutionResult } from '../types';

// =============================================================================
// Tool Categorization
// =============================================================================

/**
 * Comprehensive tool categories that cover all tool types in the system.
 * This type should be kept in sync with main/tools/types/toolTypes.ts
 */
export type ToolCategory = 
  | 'file-read'           // Reading files
  | 'file-write'          // Creating/modifying files
  | 'file-search'         // Finding/searching files
  | 'terminal'            // Running commands
  | 'media'               // Video, audio, media operations
  | 'communication'       // Email, messaging
  | 'system'              // System operations
  | 'code-intelligence'   // Symbols, definitions, references, diagnostics
  | 'browser-read'        // Browser read-only operations (fetch, extract, console)
  | 'browser-write'       // Browser state-changing operations (click, type, navigate)
  | 'other';              // Uncategorized

export type ToolAction = 'create' | 'edit' | 'delete' | 'rename' | 'read' | 'run' | 'check' | 'kill' | 'search' | 'media' | 'communicate';

/**
 * Tool classification patterns
 */
const FILE_WRITE_TOOLS = ['write', 'create_file', 'createFile', 'writeFile', 'write_file'];
const FILE_EDIT_TOOLS = ['edit', 'edit_file', 'editFile', 'replace_string_in_file', 'replace'];
const FILE_DELETE_TOOLS = ['delete', 'delete_file', 'deleteFile', 'rm', 'remove'];
const FILE_RENAME_TOOLS = ['rename', 'rename_file', 'renameFile', 'move', 'mv'];
const FILE_READ_TOOLS = ['read', 'read_file', 'readFile', 'ls', 'list_dir', 'glob', 'listDir'];
const FILE_SEARCH_TOOLS = ['grep', 'search', 'find', 'ripgrep', 'ag'];

const TERMINAL_TOOLS = ['run', 'run_terminal', 'runTerminal', 'bash', 'shell', 'exec', 'run_terminal_command'];
const TERMINAL_CHECK_TOOLS = ['check_terminal', 'checkTerminal', 'check_output'];
const TERMINAL_KILL_TOOLS = ['kill_terminal', 'killTerminal', 'kill'];

const MEDIA_TOOLS = ['video', 'audio', 'media', 'record', 'capture', 'mediaInfo'];
const COMMUNICATION_TOOLS = ['email', 'compose_email', 'composeEmail', 'message', 'notify'];
const CODE_INTEL_TOOLS = ['lsp_', 'symbol', 'definition', 'reference', 'diagnostic', 'hover', 'completion', 'code_action', 'rename'];

// Browser tools - separated into read-only and state-changing
const BROWSER_READ_TOOLS = ['browser_fetch', 'browser_extract', 'browser_console', 'browser_network', 'browser_snapshot', 'browser_state', 'browser_security', 'browser_check'];
const BROWSER_WRITE_TOOLS = ['browser_click', 'browser_type', 'browser_navigate', 'browser_scroll', 'browser_fill', 'browser_hover', 'browser_evaluate', 'browser_back', 'browser_forward', 'browser_reload', 'browser_tabs'];

/**
 * Categorize a tool by name and determine its action
 */
export function categorizeToolName(toolName: string): {
  category: ToolCategory;
  action?: ToolAction;
} {
  const normalized = toolName.toLowerCase();

  // Browser operations - check first since they have specific prefixes
  if (BROWSER_READ_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'browser-read', action: 'read' };
  }
  if (BROWSER_WRITE_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'browser-write', action: 'edit' };
  }

  // File operations - write category
  if (FILE_WRITE_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'file-write', action: 'create' };
  }
  if (FILE_EDIT_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'file-write', action: 'edit' };
  }
  if (FILE_DELETE_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'file-write', action: 'delete' };
  }
  if (FILE_RENAME_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'file-write', action: 'rename' };
  }

  // File operations - search category
  if (FILE_SEARCH_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'file-search', action: 'search' };
  }

  // File operations - read category
  if (FILE_READ_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'file-read', action: 'read' };
  }

  // Terminal operations
  if (TERMINAL_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'terminal', action: 'run' };
  }
  if (TERMINAL_CHECK_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'terminal', action: 'check' };
  }
  if (TERMINAL_KILL_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'terminal', action: 'kill' };
  }

  // Media operations
  if (MEDIA_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'media', action: 'media' };
  }

  // Communication operations
  if (COMMUNICATION_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'communication', action: 'communicate' };
  }

  // Code intelligence operations
  if (CODE_INTEL_TOOLS.some(t => normalized.includes(t))) {
    return { category: 'code-intelligence', action: 'search' };
  }

  return { category: 'other' };
}

/**
 * Check if a tool is a file operation
 */
export function isFileOperation(toolName: string): boolean {
  const { category } = categorizeToolName(toolName);
  return category === 'file-write' || category === 'file-read' || category === 'file-search';
}

/**
 * Check if a tool is a terminal operation
 */
export function isTerminalOperation(toolName: string): boolean {
  const { category } = categorizeToolName(toolName);
  return category === 'terminal';
}

/**
 * Check if a tool is dangerous and requires confirmation
 */
export function isDangerousTool(toolName: string): boolean {
  const dangerousTools = ['rm', 'delete', 'remove', 'kill_process', 'killProcess'];
  const lowerName = toolName.toLowerCase();
  return dangerousTools.some(t => lowerName.includes(t));
}

// =============================================================================
// Tool Target and Arguments Extraction
// =============================================================================

/**
 * Extract arguments from tool call for display purposes
 * Handles various tool argument names across different tool implementations
 */
export function getToolTarget(toolCall: ToolCallPayload): string | undefined {
  const args = toolCall.arguments as Record<string, unknown>;

  switch (toolCall.name.toLowerCase()) {
    case 'write':
    case 'create_file':
    case 'read':
    case 'read_file':
    case 'edit':
    case 'replace_string_in_file':
      return (args.filePath || args.path) as string;
    case 'ls':
    case 'list_dir':
    case 'list_directory':
      return args.path as string;
    case 'run':
    case 'run_terminal_command':
      return (args.command as string)?.split('\n')[0]?.slice(0, 50);
    default:
      return undefined;
  }
}

/**
 * Extract target from tool execution arguments
 * More flexible than getToolTarget for various argument patterns
 */
export function extractToolTarget(
  args: Record<string, unknown>,
  toolName: string,
): string | undefined {
  // File operations - return full path for proper display
  if (args.path && typeof args.path === 'string') return args.path;
  if (args.filePath && typeof args.filePath === 'string') return args.filePath;
  if (args.file && typeof args.file === 'string') return args.file;

  // Terminal operations - return full command
  if (args.command && typeof args.command === 'string') {
    return args.command;
  }

  // Glob pattern
  if (args.pattern && typeof args.pattern === 'string') return args.pattern;

  // Search query
  if (args.query && typeof args.query === 'string') return args.query;

  // Default for list operations
  const name = toolName.toLowerCase();
  if (name === 'ls' || name.includes('list')) return '.';

  return undefined;
}

/**
 * Extract detail text from tool arguments
 * Used for displaying additional context about the tool operation
 */
export function extractToolDetail(
  args: Record<string, unknown>,
  toolName: string,
): string | undefined {
  // Line range for read operations
  if (args.startLine && args.endLine) {
    return `L${args.startLine}-${args.endLine}`;
  }

  // Search pattern
  if (toolName.includes('grep') || toolName.includes('search')) {
    const pattern = args.pattern as string | undefined;
    if (pattern) {
      return pattern.length > 20 ? `"${pattern.slice(0, 20)}..."` : `"${pattern}"`;
    }
  }

  return undefined;
}

/**
 * Extract file path from tool result metadata
 */
export function extractFilePath(metadata?: Record<string, unknown>): string | undefined {
  if (!metadata) return undefined;
  return (metadata.filePath || metadata.path || metadata.file) as string | undefined;
}

/**
 * Extract content from tool result metadata
 */
export function extractContent(metadata?: Record<string, unknown>): string | undefined {
  if (!metadata) return undefined;
  return (metadata.newContent || metadata.content || metadata.data || metadata.output) as string | undefined;
}

/**
 * Extract result from tool execution payload
 */
export function getToolExecutionResult(result: ToolExecutionResult): string {
  return result.output;
}

// =============================================================================
// Tool Formatting
// =============================================================================

/**
 * Format tool name for display
 * Converts snake_case and camelCase to readable text
 */
export function formatToolName(toolName: string): string {
  return toolName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase();
}

/**
 * Get filename from path
 * Handles both Unix and Windows paths
 */
export function getFileName(path?: string): string {
  if (!path) return 'file';
  return path.split(/[/\\]/).pop() || path;
}

/**
 * Format file path for terminal display
 * Truncates long paths intelligently showing parent directory and filename
 */
export function formatPath(path: string, maxLength = 40): string {
  if (path.length <= maxLength) return path;

  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) {
    return '...' + path.slice(-maxLength + 3);
  }

  const filename = parts[parts.length - 1];
  const parent = parts[parts.length - 2];
  const formatted = `${parent}/${filename}`;

  if (formatted.length <= maxLength) {
    return `.../${formatted}`;
  }

  return '...' + filename.slice(-maxLength + 3);
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/**
 * Format tool execution time for display
 */
export function formatToolDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Format relative time for display (e.g., "5m ago")
 * Used in terminal, sessions, and file panels
 */
export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Format elapsed time with millisecond precision
 * Used in terminal results and progress indicators
 */
export function formatElapsedTime(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m${seconds}s`;
}

// =============================================================================
// Tool Classification Helpers
// =============================================================================

/**
 * Check if tool result indicates error based on content patterns
 * This is a fallback for when toolSuccess flag is not available (legacy messages)
 */
export function isToolError(content: string): boolean {
  if (!content) return false;
  // Check for error indicators at the start of the message
  return /^(Error:|Failed:|FAILED:|Exception:|ERROR:)/i.test(content.trim());
}

/**
 * Check if a tool is considered "destructive" (writes, deletes, or modifies)
 */
export function isDestructiveTool(toolName: string): boolean {
  const destructiveTools = [
    'write',
    'create_file',
    'edit',
    'replace_string_in_file',
    'run',
    'run_terminal_command',
    'kill',
    'kill_terminal',
  ];
  const normalized = toolName.toLowerCase().trim();
  return destructiveTools.some(t => normalized.includes(t) || t.includes(normalized));
}

// =============================================================================
// Tool Result Analysis
// =============================================================================

/**
 * Represents a group of tool operations of the same category
 */
export interface ToolGroup {
  category: ToolCategory;
  startTime: number;
  endTime: number;
  tools: Array<{ id: string; toolName?: string }>;
}

/**
 * Group consecutive tool messages by category for timeline/summary views
 * Useful for showing tool execution history in a condensed format
 */
export function groupToolMessages(
  messages: Array<{ id: string; toolName?: string; createdAt: number }>,
): ToolGroup[] {
  const groups: ToolGroup[] = [];
  let currentGroup: ToolGroup | null = null;
  const TIME_THRESHOLD = 5000; // Group tools within 5 seconds

  for (const msg of messages) {
    const category = msg.toolName ? categorizeToolName(msg.toolName).category : 'other';

    if (!currentGroup || currentGroup.category !== category || msg.createdAt - currentGroup.endTime > TIME_THRESHOLD) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = {
        category,
        startTime: msg.createdAt,
        endTime: msg.createdAt,
        tools: [msg],
      };
    } else {
      currentGroup.endTime = msg.createdAt;
      currentGroup.tools.push(msg);
    }
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

// =============================================================================
// Barrel Export
// =============================================================================

export const ToolUtils = {
  // Categorization
  categorizeToolName,
  isFileOperation,
  isTerminalOperation,
  isDangerousTool,

  // Target extraction
  getToolTarget,
  extractToolTarget,
  extractToolDetail,
  extractFilePath,
  extractContent,
  getToolExecutionResult,

  // Formatting
  formatToolName,
  getFileName,
  formatPath,
  formatDuration,
  formatToolDuration,
  formatRelativeTime,
  formatElapsedTime,

  // Classification
  isToolError,
  isDestructiveTool,

  // Analysis
  groupToolMessages,
};
