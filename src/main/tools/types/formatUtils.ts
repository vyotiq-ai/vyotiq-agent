/**
 * Tool Output Formatting Utilities
 * 
 * Standardized formatting functions for tool outputs.
 * Provides consistent error, success, and result formatting across all tools.
 */

import type { ToolExecutionResult } from '../../../shared/types';

// =============================================================================
// Types
// =============================================================================

export interface ToolErrorOptions {
  /** Error title/heading */
  title?: string;
  /** Error message */
  message: string;
  /** Additional context or details */
  details?: string;
  /** File path if relevant */
  filePath?: string;
  /** Line number if relevant */
  line?: number;
  /** Column number if relevant */
  column?: number;
  /** Suggested fix or next steps */
  suggestion?: string;
  /** Error code (e.g., ENOENT, EPERM) */
  code?: string;
  /** Stack trace (truncated) */
  stack?: string;
}

export interface ToolSuccessOptions {
  /** Success title/heading */
  title?: string;
  /** Success message */
  message: string;
  /** Additional details */
  details?: string;
  /** Count of items affected */
  count?: number;
  /** Duration in ms */
  durationMs?: number;
}

export interface ToolWarningOptions {
  /** Warning message */
  message: string;
  /** Suggestion to resolve */
  suggestion?: string;
}

export interface ToolOutputSection {
  /** Section heading */
  heading: string;
  /** Section content */
  content: string;
  /** Whether to use box formatting */
  boxed?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const BOX_CHARS = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║',
  headerLine: '═',
};

const SIMPLE_DIVIDER = '─'.repeat(50);
const MAX_STACK_LINES = 5;

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format an error message in a consistent style
 */
export function formatToolError(options: ToolErrorOptions): string {
  const parts: string[] = [];
  const { title, message, details, filePath, line, column, suggestion, code, stack } = options;
  
  // Header with box
  const headerText = title || 'Error';
  const headerLine = BOX_CHARS.headerLine.repeat(Math.max(headerText.length + 4, 20));
  parts.push(`╔${headerLine}╗`);
  parts.push(`║ ${headerText.padEnd(headerLine.length - 2)} ║`);
  parts.push(`╚${headerLine}╝`);
  
  // Error code if provided
  if (code) {
    parts.push(`[${code}]`);
  }
  
  // Main message
  parts.push('');
  parts.push(message);
  
  // File location if provided
  if (filePath) {
    let location = `  → ${filePath}`;
    if (line !== undefined) {
      location += `:${line}`;
      if (column !== undefined) {
        location += `:${column}`;
      }
    }
    parts.push('');
    parts.push(location);
  }
  
  // Details if provided
  if (details) {
    parts.push('');
    parts.push('Details:');
    parts.push(details.split('\n').map(l => `  ${l}`).join('\n'));
  }
  
  // Stack trace (truncated)
  if (stack) {
    const stackLines = stack.split('\n').slice(0, MAX_STACK_LINES);
    parts.push('');
    parts.push('Stack trace:');
    stackLines.forEach(line => {
      parts.push(`  ${line.trim()}`);
    });
    if (stack.split('\n').length > MAX_STACK_LINES) {
      parts.push('  ...(truncated)');
    }
  }
  
  // Suggestion if provided
  if (suggestion) {
    parts.push('');
    parts.push(`💡 ${suggestion}`);
  }
  
  return parts.join('\n');
}

/**
 * Format a simple inline error (for less severe errors)
 */
export function formatSimpleError(message: string, code?: string): string {
  const prefix = code ? `[${code}] ` : '';
  return `❌ ${prefix}${message}`;
}

// =============================================================================
// Success Formatting
// =============================================================================

/**
 * Format a success message in a consistent style
 */
export function formatToolSuccess(options: ToolSuccessOptions): string {
  const parts: string[] = [];
  const { title, message, details, count, durationMs } = options;
  
  // Header if provided
  if (title) {
    parts.push(`✓ ${title}`);
    parts.push('');
  }
  
  // Main message
  parts.push(message);
  
  // Stats line
  const stats: string[] = [];
  if (count !== undefined) {
    stats.push(`${count} item${count !== 1 ? 's' : ''}`);
  }
  if (durationMs !== undefined) {
    stats.push(`${durationMs}ms`);
  }
  if (stats.length > 0) {
    parts.push(`  [${stats.join(' | ')}]`);
  }
  
  // Details if provided
  if (details) {
    parts.push('');
    parts.push(details);
  }
  
  return parts.join('\n');
}

/**
 * Format a simple inline success
 */
export function formatSimpleSuccess(message: string): string {
  return `✓ ${message}`;
}

// =============================================================================
// Warning Formatting
// =============================================================================

/**
 * Format a warning message
 */
export function formatToolWarning(options: ToolWarningOptions): string {
  const parts: string[] = [];
  parts.push(`⚠️ Warning: ${options.message}`);
  
  if (options.suggestion) {
    parts.push(`  → ${options.suggestion}`);
  }
  
  return parts.join('\n');
}

/**
 * Format multiple warnings
 */
export function formatToolWarnings(warnings: ToolWarningOptions[]): string {
  if (warnings.length === 0) return '';
  if (warnings.length === 1) return formatToolWarning(warnings[0]);
  
  const parts: string[] = ['⚠️ Warnings:'];
  warnings.forEach(w => {
    parts.push(`  • ${w.message}`);
    if (w.suggestion) {
      parts.push(`    → ${w.suggestion}`);
    }
  });
  
  return parts.join('\n');
}

// =============================================================================
// Section Formatting
// =============================================================================

/**
 * Format a titled section with content
 */
export function formatToolSection(heading: string, content: string, boxed = true): string {
  if (boxed) {
    const line = BOX_CHARS.headerLine.repeat(Math.max(heading.length + 4, 30));
    return `╔${line}╗\n║ ${heading.padEnd(line.length - 2)} ║\n╚${line}╝\n\n${content}`;
  }
  return `# ${heading}\n${SIMPLE_DIVIDER}\n${content}`;
}

/**
 * Format multiple sections
 */
export function formatToolSections(sections: ToolOutputSection[]): string {
  return sections.map(s => formatToolSection(s.heading, s.content, s.boxed)).join('\n\n');
}

// =============================================================================
// Result Formatting
// =============================================================================

/**
 * Format a list of items
 */
export function formatItemList(items: string[], title?: string, numbered = false): string {
  const parts: string[] = [];
  
  if (title) {
    parts.push(`${title}:`);
  }
  
  items.forEach((item, index) => {
    const prefix = numbered ? `${index + 1}. ` : '  • ';
    parts.push(`${prefix}${item}`);
  });
  
  return parts.join('\n');
}

/**
 * Format key-value pairs
 */
export function formatKeyValues(pairs: Record<string, string | number | boolean | undefined | null>): string {
  const maxKeyLength = Math.max(...Object.keys(pairs).map(k => k.length));
  
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => `  ${key.padEnd(maxKeyLength)} : ${value}`)
    .join('\n');
}

/**
 * Format a file operation result
 */
export function formatFileResult(
  operation: 'read' | 'write' | 'edit' | 'delete' | 'create' | 'move' | 'copy',
  filePath: string,
  success: boolean,
  details?: string
): string {
  const operationIcons: Record<string, string> = {
    read: '📄',
    write: '💾',
    edit: '✏️',
    delete: '🗑️',
    create: '📝',
    move: '📦',
    copy: '📋',
  };
  
  const icon = operationIcons[operation] || '📁';
  const _status = success ? '✓' : '✗';
  const statusColor = success ? '' : '[FAILED] ';
  
  let result = `${icon} ${statusColor}${operation}: ${filePath}`;
  
  if (details) {
    result += `\n  ${details}`;
  }
  
  return result;
}

/**
 * Format search/grep results summary
 */
export function formatSearchSummary(
  totalMatches: number,
  filesSearched: number,
  filesWithMatches: number,
  pattern?: string
): string {
  const parts: string[] = [];
  
  if (pattern) {
    parts.push(`Pattern: "${pattern}"`);
  }
  
  parts.push(`Found ${totalMatches} match${totalMatches !== 1 ? 'es' : ''} in ${filesWithMatches} file${filesWithMatches !== 1 ? 's' : ''}`);
  parts.push(`(searched ${filesSearched} file${filesSearched !== 1 ? 's' : ''})`);
  
  return parts.join('\n');
}

/**
 * Format a code snippet with optional line numbers
 */
export function formatCodeSnippet(
  code: string,
  language?: string,
  startLine?: number,
  showLineNumbers = true
): string {
  const lines = code.split('\n');
  const maxLineNumWidth = startLine !== undefined 
    ? String(startLine + lines.length - 1).length 
    : String(lines.length).length;
  
  const formattedLines = lines.map((line, index) => {
    if (showLineNumbers && startLine !== undefined) {
      const lineNum = String(startLine + index).padStart(maxLineNumWidth, ' ');
      return `${lineNum} │ ${line}`;
    }
    return line;
  });
  
  const lang = language ? `\`\`\`${language}` : '```';
  return `${lang}\n${formattedLines.join('\n')}\n\`\`\``;
}

/**
 * Format execution time
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format byte size to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

// =============================================================================
// Cancellation Formatting
// =============================================================================

/**
 * Format a cancellation result for a tool.
 * Returns a ToolExecutionResult with success=false indicating cancellation.
 * 
 * @param toolName - The name of the tool that was cancelled
 * @param reason - Optional reason/details about the cancellation
 * @param metadata - Optional metadata to include in the result
 */
export function formatCancelled(
  toolName: string,
  reason?: string,
  metadata?: Record<string, unknown>
): ToolExecutionResult {
  let msg = `⏹️ ${toolName} cancelled`;
  if (reason) {
    msg += `: ${reason}`;
  }
  return {
    toolName,
    success: false,
    output: msg,
    metadata: {
      cancelled: true,
      ...metadata,
    },
  };
}

/**
 * Check if an AbortSignal is aborted.
 * 
 * @overload With operation string: throws if aborted
 * @overload Without operation string: returns boolean
 */
/* eslint-disable no-redeclare */
export function checkCancellation(signal: AbortSignal | undefined): boolean;
export function checkCancellation(signal: AbortSignal | undefined, operation: string): void;
export function checkCancellation(signal: AbortSignal | undefined, operation?: string): boolean | void {
/* eslint-enable no-redeclare */
  if (operation !== undefined) {
    // Throw mode: operation string provided
    if (signal?.aborted) {
      throw new Error(`⏹️ ${operation} cancelled: Operation was cancelled`);
    }
    return;
  }
  // Boolean mode: just check if aborted
  return signal?.aborted === true;
}
