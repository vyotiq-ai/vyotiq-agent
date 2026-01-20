/**
 * ErrorRecoveryManager
 *
 * Centralized error recovery system that analyzes tool errors and suggests
 * appropriate recovery tools. Maps error patterns to recovery strategies
 * with confidence scoring based on pattern specificity.
 *
 * Features:
 * - Pattern matching with regex support
 * - Confidence scoring based on pattern specificity
 * - Session error history tracking
 * - Alternative approach suggestions for repeated failures
 */

import { createLogger } from '../../logger';

const logger = createLogger('ErrorRecoveryManager');

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for an error recovery pattern
 */
export interface ErrorRecoveryConfig {
  /** Tools that can help recover from this error */
  tools: string[];
  /** Human-readable action suggestion */
  action: string;
  /** Pattern specificity (higher = more specific, higher confidence) */
  specificity: number;
  /** Optional regex pattern for more precise matching */
  regex?: RegExp;
  /** Category of error for grouping */
  category: ErrorPatternCategory;
}

/**
 * Categories of error patterns
 */
export type ErrorPatternCategory =
  | 'filesystem'
  | 'permission'
  | 'syntax'
  | 'type'
  | 'module'
  | 'edit'
  | 'terminal'
  | 'browser'
  | 'network'
  | 'resource'
  | 'unknown';

/**
 * Recovery suggestion with confidence score
 */
export interface RecoverySuggestion {
  /** The error pattern that matched */
  errorPattern: string;
  /** Tools suggested for recovery */
  suggestedTools: string[];
  /** Human-readable action to take */
  suggestedAction: string;
  /** Confidence score (0-1) based on pattern specificity */
  confidence: number;
  /** Category of the error */
  category: ErrorPatternCategory;
  /** Whether this is an alternative approach (for repeated errors) */
  isAlternative?: boolean;
}

/**
 * Session error record
 */
export interface SessionErrorRecord {
  /** Tool that caused the error */
  toolName: string;
  /** Error message */
  error: string;
  /** Timestamp of the error */
  timestamp: number;
  /** Pattern that matched (if any) */
  matchedPattern?: string;
  /** Recovery tools suggested */
  suggestedTools?: string[];
  /** Whether recovery was attempted */
  recoveryAttempted?: boolean;
}

/**
 * Session error history
 */
interface SessionErrorHistory {
  /** All errors in this session */
  errors: SessionErrorRecord[];
  /** Count of errors by pattern */
  patternCounts: Map<string, number>;
  /** Count of errors by tool */
  toolCounts: Map<string, number>;
  /** Last error timestamp */
  lastErrorAt: number;
}

// =============================================================================
// Error Pattern Mappings
// =============================================================================

/**
 * Comprehensive error pattern mappings with specificity scores
 * Higher specificity = more specific pattern = higher confidence
 */
const ERROR_PATTERNS: Record<string, ErrorRecoveryConfig> = {
  // Filesystem errors (specificity: 8-10)
  'ENOENT: no such file or directory': {
    tools: ['ls', 'glob', 'grep'],
    action: 'Verify the file path exists using ls or glob before attempting to read/write',
    specificity: 10,
    regex: /ENOENT.*no such file or directory/i,
    category: 'filesystem',
  },
  'ENOENT': {
    tools: ['ls', 'glob', 'grep'],
    action: 'File or directory not found. Use ls to list directory contents or glob to search',
    specificity: 8,
    category: 'filesystem',
  },
  'file not found': {
    tools: ['ls', 'glob', 'grep'],
    action: 'Use ls to verify the path or glob to find files matching a pattern',
    specificity: 7,
    category: 'filesystem',
  },
  'no such file': {
    tools: ['ls', 'glob', 'grep'],
    action: 'Verify the file exists with ls or search with glob',
    specificity: 7,
    category: 'filesystem',
  },
  'path does not exist': {
    tools: ['ls', 'glob'],
    action: 'Check if the path exists using ls',
    specificity: 7,
    category: 'filesystem',
  },
  'directory not found': {
    tools: ['ls', 'glob'],
    action: 'Use ls to verify directory structure',
    specificity: 7,
    category: 'filesystem',
  },
  'EEXIST': {
    tools: ['ls', 'read'],
    action: 'File already exists. Use ls to check or read to view contents',
    specificity: 8,
    category: 'filesystem',
  },
  'EISDIR': {
    tools: ['ls'],
    action: 'Path is a directory, not a file. Use ls to explore',
    specificity: 8,
    category: 'filesystem',
  },
  'ENOTDIR': {
    tools: ['ls'],
    action: 'Path is not a directory. Use ls to verify structure',
    specificity: 8,
    category: 'filesystem',
  },

  // Permission errors (specificity: 8-9)
  'EACCES': {
    tools: ['ls', 'run'],
    action: 'Permission denied. Check file permissions with ls or use run to modify',
    specificity: 8,
    category: 'permission',
  },
  'permission denied': {
    tools: ['ls', 'run'],
    action: 'Check file permissions and ownership',
    specificity: 7,
    category: 'permission',
  },
  'EPERM': {
    tools: ['ls', 'run'],
    action: 'Operation not permitted. May need elevated permissions',
    specificity: 8,
    category: 'permission',
  },
  'access denied': {
    tools: ['ls', 'run'],
    action: 'Access denied. Verify permissions',
    specificity: 6,
    category: 'permission',
  },

  // Syntax/Parse errors (specificity: 6-9)
  'SyntaxError': {
    tools: ['read', 'lsp_diagnostics', 'read_lints'],
    action: 'Check file content and diagnostics for syntax issues',
    specificity: 8,
    regex: /SyntaxError/i,
    category: 'syntax',
  },
  'syntax error': {
    tools: ['read', 'lsp_diagnostics', 'read_lints'],
    action: 'Review the file for syntax errors using diagnostics',
    specificity: 7,
    category: 'syntax',
  },
  'parse error': {
    tools: ['read', 'lsp_diagnostics', 'read_lints'],
    action: 'Check file content for parsing issues',
    specificity: 7,
    category: 'syntax',
  },
  'unexpected token': {
    tools: ['read', 'lsp_diagnostics', 'read_lints'],
    action: 'Review code around the unexpected token',
    specificity: 8,
    category: 'syntax',
  },
  'unexpected end of input': {
    tools: ['read', 'lsp_diagnostics'],
    action: 'Check for missing closing brackets or incomplete statements',
    specificity: 8,
    category: 'syntax',
  },
  'unterminated string': {
    tools: ['read', 'lsp_diagnostics'],
    action: 'Check for missing quote marks in strings',
    specificity: 8,
    category: 'syntax',
  },
  'invalid json': {
    tools: ['read'],
    action: 'Verify JSON syntax - check for trailing commas, missing quotes',
    specificity: 7,
    category: 'syntax',
  },

  // Type errors (specificity: 7-9)
  'TypeError': {
    tools: ['lsp_hover', 'lsp_diagnostics', 'read_lints'],
    action: 'Check type information with lsp_hover or get diagnostics',
    specificity: 8,
    regex: /TypeError/i,
    category: 'type',
  },
  'type error': {
    tools: ['lsp_hover', 'lsp_diagnostics', 'read_lints'],
    action: 'Use LSP tools to understand type mismatches',
    specificity: 7,
    category: 'type',
  },
  'cannot find name': {
    tools: ['lsp_definition', 'lsp_references', 'grep'],
    action: 'Search for the symbol definition or check imports',
    specificity: 8,
    category: 'type',
  },
  'is not assignable to': {
    tools: ['lsp_hover', 'lsp_diagnostics'],
    action: 'Check type compatibility with lsp_hover',
    specificity: 8,
    category: 'type',
  },
  'property does not exist': {
    tools: ['lsp_hover', 'lsp_definition', 'read'],
    action: 'Verify the property exists on the type',
    specificity: 8,
    category: 'type',
  },
  'undefined is not': {
    tools: ['read', 'lsp_hover', 'lsp_diagnostics'],
    action: 'Check for null/undefined values before accessing properties',
    specificity: 7,
    category: 'type',
  },
  'null is not': {
    tools: ['read', 'lsp_hover', 'lsp_diagnostics'],
    action: 'Add null checks before accessing properties',
    specificity: 7,
    category: 'type',
  },

  // Module/Import errors (specificity: 7-9)
  'cannot find module': {
    tools: ['ls', 'glob', 'run'],
    action: 'Check if module exists or needs to be installed',
    specificity: 8,
    category: 'module',
  },
  'module not found': {
    tools: ['ls', 'glob', 'run'],
    action: 'Verify module path or install missing dependency',
    specificity: 8,
    category: 'module',
  },
  'cannot resolve': {
    tools: ['ls', 'glob', 'grep'],
    action: 'Check import path and file existence',
    specificity: 7,
    category: 'module',
  },
  'failed to resolve import': {
    tools: ['ls', 'glob'],
    action: 'Verify the import path is correct',
    specificity: 8,
    category: 'module',
  },
  'no exported member': {
    tools: ['read', 'lsp_symbols', 'grep'],
    action: 'Check what the module actually exports',
    specificity: 8,
    category: 'module',
  },

  // Edit/String replacement errors (specificity: 8-10)
  'old_string not found': {
    tools: ['read', 'grep'],
    action: 'Read the file to see exact content, then use the precise string',
    specificity: 10,
    category: 'edit',
  },
  'string not found': {
    tools: ['read', 'grep'],
    action: 'Verify the exact string exists in the file',
    specificity: 9,
    category: 'edit',
  },
  'no match': {
    tools: ['read', 'grep'],
    action: 'Search for the pattern to verify it exists',
    specificity: 6,
    category: 'edit',
  },
  'multiple matches': {
    tools: ['read', 'grep'],
    action: 'Make the search string more specific to match only one location',
    specificity: 8,
    category: 'edit',
  },
  'ambiguous match': {
    tools: ['read', 'grep'],
    action: 'Include more context to uniquely identify the location',
    specificity: 8,
    category: 'edit',
  },

  // Terminal/Process errors (specificity: 6-8)
  'command not found': {
    tools: ['run', 'check_terminal'],
    action: 'Verify the command is installed and in PATH',
    specificity: 8,
    category: 'terminal',
  },
  'process exited': {
    tools: ['check_terminal', 'kill_terminal'],
    action: 'Check terminal output for error details',
    specificity: 7,
    category: 'terminal',
  },
  'ENOENT spawn': {
    tools: ['run', 'check_terminal'],
    action: 'The executable was not found. Check if it is installed',
    specificity: 9,
    category: 'terminal',
  },
  'exit code': {
    tools: ['check_terminal', 'run'],
    action: 'Check terminal output for error details',
    specificity: 5,
    category: 'terminal',
  },
  'killed': {
    tools: ['check_terminal', 'run'],
    action: 'Process was killed. Check for resource limits or signals',
    specificity: 5,
    category: 'terminal',
  },

  // Browser errors (specificity: 7-9)
  'navigation failed': {
    tools: ['browser_state', 'browser_screenshot', 'browser_check_url'],
    action: 'Check browser state and verify URL is accessible',
    specificity: 8,
    category: 'browser',
  },
  'element not found': {
    tools: ['browser_snapshot', 'browser_screenshot', 'browser_wait'],
    action: 'Take a snapshot to see current DOM or wait for element',
    specificity: 8,
    category: 'browser',
  },
  'selector not found': {
    tools: ['browser_snapshot', 'browser_screenshot'],
    action: 'Verify selector with browser_snapshot',
    specificity: 8,
    category: 'browser',
  },
  'timeout': {
    tools: ['browser_wait', 'browser_state', 'browser_screenshot'],
    action: 'Increase wait time or check if page is loading correctly',
    specificity: 6,
    category: 'browser',
  },
  'page crashed': {
    tools: ['browser_state', 'browser_reload'],
    action: 'Check browser state and try reloading',
    specificity: 8,
    category: 'browser',
  },
  'net::ERR': {
    tools: ['browser_state', 'browser_check_url', 'browser_network'],
    action: 'Network error. Check URL and network status',
    specificity: 7,
    category: 'network',
  },

  // Network errors (specificity: 6-8)
  'ECONNREFUSED': {
    tools: ['run', 'check_terminal'],
    action: 'Connection refused. Check if the server is running',
    specificity: 8,
    category: 'network',
  },
  'ETIMEDOUT': {
    tools: ['run', 'check_terminal'],
    action: 'Connection timed out. Check network and server status',
    specificity: 8,
    category: 'network',
  },
  'ECONNRESET': {
    tools: ['run', 'check_terminal'],
    action: 'Connection reset. Server may have closed the connection',
    specificity: 8,
    category: 'network',
  },
  'fetch failed': {
    tools: ['browser_fetch', 'browser_network'],
    action: 'Check network connectivity and URL',
    specificity: 7,
    category: 'network',
  },

  // Resource errors (specificity: 6-8)
  'ENOMEM': {
    tools: ['run', 'check_terminal'],
    action: 'Out of memory. Try reducing operation scope',
    specificity: 8,
    category: 'resource',
  },
  'heap out of memory': {
    tools: ['run', 'check_terminal'],
    action: 'JavaScript heap exhausted. Reduce data size or increase memory',
    specificity: 9,
    category: 'resource',
  },
  'EMFILE': {
    tools: ['run'],
    action: 'Too many open files. Close unused resources',
    specificity: 8,
    category: 'resource',
  },
  'rate limit': {
    tools: ['run'],
    action: 'Rate limited. Wait before retrying',
    specificity: 7,
    category: 'resource',
  },
};

/**
 * Alternative approaches for repeated errors
 * These are suggested when the same error pattern occurs multiple times
 */
const ALTERNATIVE_APPROACHES: Record<string, { tools: string[]; action: string }[]> = {
  filesystem: [
    { tools: ['glob', 'grep'], action: 'Try searching with glob patterns or grep instead of direct path' },
    { tools: ['ls'], action: 'List parent directory to verify structure' },
    { tools: ['grep'], action: 'Search for the file content to locate the correct path' },
  ],
  permission: [
    { tools: ['run'], action: 'Try running with elevated permissions or check file ownership' },
    { tools: ['ls'], action: 'Check file permissions and ownership with ls' },
  ],
  syntax: [
    { tools: ['read'], action: 'Read the entire file to understand its structure before making changes' },
    { tools: ['lsp_diagnostics', 'read_lints'], action: 'Get detailed diagnostics to understand all syntax issues' },
  ],
  type: [
    { tools: ['lsp_hover', 'lsp_definition'], action: 'Check type definitions and hover info to understand the type system' },
    { tools: ['read', 'grep'], action: 'Search for similar patterns in the codebase to see correct usage' },
  ],
  module: [
    { tools: ['run'], action: 'Try installing dependencies with npm/yarn install' },
    { tools: ['grep', 'glob'], action: 'Search for the module in the codebase to verify its location' },
    { tools: ['ls'], action: 'Check node_modules or package.json to verify installation' },
  ],
  edit: [
    { tools: ['read'], action: 'Read the entire file first to understand its structure' },
    { tools: ['write'], action: 'Consider rewriting the entire file instead of editing' },
    { tools: ['grep'], action: 'Search for the exact string to verify it exists and find its location' },
  ],
  terminal: [
    { tools: ['check_terminal'], action: 'Check terminal output for more details about the error' },
    { tools: ['run'], action: 'Try running the command with different options or in a different directory' },
  ],
  browser: [
    { tools: ['browser_screenshot', 'browser_snapshot'], action: 'Take a screenshot and snapshot to understand page state' },
    { tools: ['browser_reload', 'browser_wait'], action: 'Try reloading the page and waiting longer' },
    { tools: ['browser_state'], action: 'Check browser state to ensure the page is fully loaded' },
  ],
  network: [
    { tools: ['run', 'check_terminal'], action: 'Check if the server is running and accessible' },
    { tools: ['browser_network'], action: 'Monitor network requests to understand the failure' },
  ],
  resource: [
    { tools: ['run'], action: 'Try reducing the scope of the operation or increasing resource limits' },
    { tools: ['check_terminal'], action: 'Check for resource usage and limits' },
  ],
  unknown: [
    { tools: ['read', 'ls', 'grep'], action: 'Gather more information about the context before retrying' },
  ],
};

// =============================================================================
// ErrorRecoveryManager Class
// =============================================================================

export class ErrorRecoveryManager {
  /** Session error histories keyed by session ID */
  private sessionHistories: Map<string, SessionErrorHistory> = new Map();

  /** Maximum errors to keep per session */
  private readonly maxErrorsPerSession: number;

  /** Time window for considering errors as "repeated" (ms) */
  private readonly repeatWindowMs: number;

  constructor(options?: { maxErrorsPerSession?: number; repeatWindowMs?: number }) {
    this.maxErrorsPerSession = options?.maxErrorsPerSession ?? 50;
    this.repeatWindowMs = options?.repeatWindowMs ?? 5 * 60 * 1000; // 5 minutes
  }

  // ===========================================================================
  // Main API
  // ===========================================================================

  /**
   * Analyze an error and suggest recovery tools
   */
  analyzeError(error: string, toolName: string, sessionId?: string): RecoverySuggestion {
    const errorLower = error.toLowerCase();
    let bestMatch: { pattern: string; config: ErrorRecoveryConfig; confidence: number } | null = null;

    // Find the best matching pattern
    for (const [pattern, config] of Object.entries(ERROR_PATTERNS)) {
      let matches = false;
      let confidence = 0;

      // Try regex match first if available
      if (config.regex) {
        matches = config.regex.test(error);
        if (matches) {
          confidence = config.specificity / 10;
        }
      } else {
        // Fall back to substring match
        matches = errorLower.includes(pattern.toLowerCase());
        if (matches) {
          // Adjust confidence based on match quality
          const matchRatio = pattern.length / error.length;
          confidence = (config.specificity / 10) * Math.min(1, matchRatio * 2);
        }
      }

      if (matches && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { pattern, config, confidence };
      }
    }

    // Record the error if we have a session
    if (sessionId) {
      this.recordError(sessionId, toolName, error, bestMatch?.pattern, bestMatch?.config.tools);
    }

    // Check for repeated errors and suggest alternatives
    if (sessionId && bestMatch) {
      const isRepeated = this.isRepeatedError(sessionId, bestMatch.pattern);
      if (isRepeated) {
        const alternative = this.getAlternativeApproach(
          bestMatch.config.category,
          sessionId,
          bestMatch.pattern
        );
        if (alternative) {
          return {
            errorPattern: bestMatch.pattern,
            suggestedTools: alternative.tools,
            suggestedAction: `Previous approach failed repeatedly. ${alternative.action}`,
            confidence: bestMatch.confidence * 0.8, // Slightly lower confidence for alternatives
            category: bestMatch.config.category,
            isAlternative: true,
          };
        }
      }
    }

    if (bestMatch) {
      return {
        errorPattern: bestMatch.pattern,
        suggestedTools: bestMatch.config.tools,
        suggestedAction: bestMatch.config.action,
        confidence: bestMatch.confidence,
        category: bestMatch.config.category,
      };
    }

    // No match found - return generic suggestion
    return {
      errorPattern: 'unknown',
      suggestedTools: ['read', 'ls', 'grep'],
      suggestedAction: 'No specific recovery pattern matched. Try reading relevant files or listing directories.',
      confidence: 0.2,
      category: 'unknown',
    };
  }

  /**
   * Get tools that can help with a specific error pattern
   */
  getRecoveryTools(errorPattern: string): string[] {
    const patternLower = errorPattern.toLowerCase();

    for (const [pattern, config] of Object.entries(ERROR_PATTERNS)) {
      if (patternLower.includes(pattern.toLowerCase())) {
        return config.tools;
      }
    }

    return ['read', 'ls', 'grep']; // Default tools
  }

  /**
   * Record an error for pattern learning
   */
  recordError(
    sessionId: string,
    toolName: string,
    error: string,
    matchedPattern?: string,
    suggestedTools?: string[]
  ): void {
    const history = this.getOrCreateHistory(sessionId);

    const record: SessionErrorRecord = {
      toolName,
      error,
      timestamp: Date.now(),
      matchedPattern,
      suggestedTools,
    };

    history.errors.push(record);
    history.lastErrorAt = record.timestamp;

    // Update pattern counts
    if (matchedPattern) {
      const count = history.patternCounts.get(matchedPattern) ?? 0;
      history.patternCounts.set(matchedPattern, count + 1);
    }

    // Update tool counts
    const toolCount = history.toolCounts.get(toolName) ?? 0;
    history.toolCounts.set(toolName, toolCount + 1);

    // Trim old errors
    if (history.errors.length > this.maxErrorsPerSession) {
      history.errors = history.errors.slice(-this.maxErrorsPerSession);
    }

    logger.debug('Error recorded', {
      sessionId,
      toolName,
      matchedPattern,
      errorCount: history.errors.length,
    });
  }

  /**
   * Get recovery suggestions for a session based on recent errors
   */
  getSessionRecovery(sessionId: string): RecoverySuggestion[] {
    const history = this.sessionHistories.get(sessionId);
    if (!history || history.errors.length === 0) {
      return [];
    }

    const suggestions: RecoverySuggestion[] = [];
    const recentErrors = this.getRecentErrors(sessionId);

    // Analyze each recent error
    for (const error of recentErrors) {
      const suggestion = this.analyzeError(error.error, error.toolName);
      if (suggestion.confidence > 0.3) {
        suggestions.push(suggestion);
      }
    }

    // Deduplicate by pattern
    const seen = new Set<string>();
    return suggestions.filter(s => {
      if (seen.has(s.errorPattern)) return false;
      seen.add(s.errorPattern);
      return true;
    });
  }

  /**
   * Get recent errors for a session
   */
  getRecentErrors(sessionId: string, windowMs?: number): SessionErrorRecord[] {
    const history = this.sessionHistories.get(sessionId);
    if (!history) return [];

    const cutoff = Date.now() - (windowMs ?? this.repeatWindowMs);
    return history.errors.filter(e => e.timestamp > cutoff);
  }

  /**
   * Check if an error pattern has occurred repeatedly
   */
  isRepeatedError(sessionId: string, pattern: string, threshold: number = 2): boolean {
    const history = this.sessionHistories.get(sessionId);
    if (!history) return false;

    const count = history.patternCounts.get(pattern) ?? 0;
    return count >= threshold;
  }

  /**
   * Get an alternative approach for a category
   * Cycles through alternatives based on how many times the error has occurred
   */
  getAlternativeApproach(
    category: ErrorPatternCategory,
    sessionId?: string,
    pattern?: string
  ): { tools: string[]; action: string } | null {
    const alternatives = ALTERNATIVE_APPROACHES[category];
    if (!alternatives || alternatives.length === 0) return null;

    // If we have session context, use the error count to cycle through alternatives
    if (sessionId && pattern) {
      const history = this.sessionHistories.get(sessionId);
      if (history) {
        const count = history.patternCounts.get(pattern) ?? 0;
        // Cycle through alternatives based on error count
        const index = (count - 1) % alternatives.length;
        return alternatives[index];
      }
    }

    // Fall back to first alternative if no session context
    return alternatives[0];
  }

  /**
   * Clear session error history
   */
  clearSession(sessionId: string): void {
    this.sessionHistories.delete(sessionId);
    logger.debug('Session error history cleared', { sessionId });
  }

  /**
   * Get statistics for a session
   */
  getSessionStats(sessionId: string): {
    totalErrors: number;
    recentErrors: number;
    topPatterns: Array<{ pattern: string; count: number }>;
    topTools: Array<{ tool: string; count: number }>;
  } | null {
    const history = this.sessionHistories.get(sessionId);
    if (!history) return null;

    const recentErrors = this.getRecentErrors(sessionId);

    const topPatterns = Array.from(history.patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));

    const topTools = Array.from(history.toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count }));

    return {
      totalErrors: history.errors.length,
      recentErrors: recentErrors.length,
      topPatterns,
      topTools,
    };
  }

  /**
   * Get all error patterns (for documentation/debugging)
   */
  getAllPatterns(): Array<{ pattern: string; category: ErrorPatternCategory; tools: string[] }> {
    return Object.entries(ERROR_PATTERNS).map(([pattern, config]) => ({
      pattern,
      category: config.category,
      tools: config.tools,
    }));
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getOrCreateHistory(sessionId: string): SessionErrorHistory {
    let history = this.sessionHistories.get(sessionId);
    if (!history) {
      history = {
        errors: [],
        patternCounts: new Map(),
        toolCounts: new Map(),
        lastErrorAt: 0,
      };
      this.sessionHistories.set(sessionId, history);
    }
    return history;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let errorRecoveryManagerInstance: ErrorRecoveryManager | null = null;

/**
 * Get the singleton ErrorRecoveryManager instance
 */
export function getErrorRecoveryManager(): ErrorRecoveryManager {
  if (!errorRecoveryManagerInstance) {
    errorRecoveryManagerInstance = new ErrorRecoveryManager();
  }
  return errorRecoveryManagerInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetErrorRecoveryManager(): void {
  errorRecoveryManagerInstance = null;
}
