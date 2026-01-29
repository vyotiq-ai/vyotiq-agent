/**
 * Tool Execution Logger
 * Provides structured logging for all tool execution events with consistent format and metadata.
 * 
 * Log Format:
 * [TOOL] {timestamp} {level} {sessionId}/{runId} {toolName}
 *   args: {sanitized_args}
 *   result: {success|error}
 *   duration: {ms}
 *   cache: {hit|miss}
 *   tokens_saved: {count}
 */

import type { Logger } from '../../logger';
import { createLogger } from '../../logger';
import type { RecoverySuggestion } from '../recovery/ErrorRecoveryManager';

/**
 * Context for tool execution logging
 */
export interface ToolLogContext {
  /** Session ID for the current session */
  sessionId: string;
  /** Run ID for the current agent run */
  runId: string;
  /** Name of the tool being executed */
  toolName: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Current iteration number (optional) */
  iteration?: number;
}

/**
 * Result of tool execution for logging
 */
export interface ToolExecutionResult {
  /** Whether the tool execution was successful */
  success: boolean;
  /** Output from the tool */
  output: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Arguments that should be sanitized before logging
 */
const SENSITIVE_ARG_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /auth/i,
  /credential/i,
  /api[_-]?key/i,
];

/**
 * Maximum length for argument values in logs
 */
const MAX_ARG_VALUE_LENGTH = 500;

/**
 * Maximum length for output in logs
 */
const MAX_OUTPUT_LENGTH = 1000;

/**
 * Sanitize sensitive arguments before logging
 */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(args)) {
    // Check if key matches sensitive patterns
    const isSensitive = SENSITIVE_ARG_PATTERNS.some(pattern => pattern.test(key));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      // Truncate long string values
      sanitized[key] = value.length > MAX_ARG_VALUE_LENGTH 
        ? `${value.slice(0, MAX_ARG_VALUE_LENGTH)}... [truncated ${value.length - MAX_ARG_VALUE_LENGTH} chars]`
        : value;
    } else if (Array.isArray(value)) {
      // Summarize arrays
      sanitized[key] = value.length > 10 
        ? `[Array(${value.length})]`
        : value;
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeArgs(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Truncate output for logging
 */
function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return output;
  }
  return `${output.slice(0, MAX_OUTPUT_LENGTH)}... [truncated ${output.length - MAX_OUTPUT_LENGTH} chars]`;
}

/**
 * Tool Execution Logger class
 * Provides structured logging for tool execution events
 */
export class ToolExecutionLogger {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger('ToolExecution');
  }

  /**
   * Log tool execution start
   * Logs the tool name, sanitized arguments, and execution context
   */
  logStart(context: ToolLogContext): void {
    const sanitizedArgs = sanitizeArgs(context.args);
    
    this.logger.info(`[TOOL] Starting execution: ${context.toolName}`, {
      sessionId: context.sessionId,
      runId: context.runId,
      toolName: context.toolName,
      args: sanitizedArgs,
      iteration: context.iteration,
      timestamp: Date.now(),
    });
  }

  /**
   * Log tool execution completion
   * Logs success status, duration, and output summary
   */
  logComplete(context: ToolLogContext, result: ToolExecutionResult, duration: number): void {
    const outputSummary = truncateOutput(result.output);
    
    this.logger.info(`[TOOL] Completed: ${context.toolName}`, {
      sessionId: context.sessionId,
      runId: context.runId,
      toolName: context.toolName,
      success: result.success,
      duration,
      outputSummary,
      metadata: result.metadata,
      timestamp: Date.now(),
    });
  }

  /**
   * Log tool execution error
   * Logs error message, stack trace, and recovery suggestions
   */
  logError(
    context: ToolLogContext,
    error: Error,
    duration: number,
    recoverySuggestion?: RecoverySuggestion
  ): void {
    const logData: Record<string, unknown> = {
      sessionId: context.sessionId,
      runId: context.runId,
      toolName: context.toolName,
      error: error.message,
      stack: error.stack,
      duration,
      args: sanitizeArgs(context.args),
      timestamp: Date.now(),
    };

    // Include recovery suggestions if available
    if (recoverySuggestion) {
      logData.recovery = {
        errorPattern: recoverySuggestion.errorPattern,
        suggestedTools: recoverySuggestion.suggestedTools,
        suggestedAction: recoverySuggestion.suggestedAction,
        confidence: recoverySuggestion.confidence,
        category: recoverySuggestion.category,
        isAlternative: recoverySuggestion.isAlternative ?? false,
      };
    }

    this.logger.error(`[TOOL] Error: ${context.toolName}`, logData);
  }

  /**
   * Log argument normalization
   * Logs original and normalized values at debug level
   */
  logNormalization(toolName: string, original: Record<string, unknown>, normalized: Record<string, unknown>): void {
    // Only log if there were actual changes
    const originalStr = JSON.stringify(original);
    const normalizedStr = JSON.stringify(normalized);
    
    if (originalStr !== normalizedStr) {
      this.logger.debug(`[TOOL] Arguments normalized: ${toolName}`, {
        toolName,
        original: sanitizeArgs(original),
        normalized: sanitizeArgs(normalized),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Log cache hit/miss events
   */
  logCacheEvent(toolName: string, hit: boolean, tokensSaved?: number): void {
    if (hit) {
      this.logger.debug(`[TOOL] Cache hit: ${toolName}`, {
        toolName,
        cacheHit: true,
        tokensSaved,
        timestamp: Date.now(),
      });
    } else {
      this.logger.debug(`[TOOL] Cache miss: ${toolName}`, {
        toolName,
        cacheHit: false,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Log context-aware tool selection
   */
  logToolSelection(
    sessionId: string,
    selectedTools: string[],
    criteria: {
      taskIntent?: string;
      workspaceType?: string;
      recentErrors?: string[];
      boostedTools?: string[];
    }
  ): void {
    this.logger.info('[TOOL] Context-aware selection', {
      sessionId,
      selectedTools,
      criteria,
      toolCount: selectedTools.length,
      timestamp: Date.now(),
    });
  }

  /**
   * Log parallel execution results with time savings
   * Reports the time saved by executing tools in parallel vs sequentially
   */
  logParallelExecution(
    sessionId: string,
    runId: string,
    result: {
      toolCount: number;
      tools: string[];
      totalDurationMs: number;
      timeSavedMs: number;
      wasParallel: boolean;
      succeeded: number;
      failed: number;
    }
  ): void {
    const { toolCount, tools, totalDurationMs, timeSavedMs, wasParallel, succeeded, failed } = result;
    
    if (wasParallel && timeSavedMs > 0) {
      const timeSavedSeconds = (timeSavedMs / 1000).toFixed(2);
      const percentageSaved = totalDurationMs > 0 
        ? ((timeSavedMs / (totalDurationMs + timeSavedMs)) * 100).toFixed(1)
        : '0';
      
      this.logger.info(`[TOOL] Parallel execution completed - saved ${timeSavedSeconds}s (${percentageSaved}% faster)`, {
        sessionId,
        runId,
        toolCount,
        tools,
        totalDurationMs,
        timeSavedMs,
        timeSavedSeconds: parseFloat(timeSavedSeconds),
        percentageSaved: parseFloat(percentageSaved),
        wasParallel,
        succeeded,
        failed,
        timestamp: Date.now(),
      });
    } else {
      this.logger.debug('[TOOL] Sequential execution completed', {
        sessionId,
        runId,
        toolCount,
        tools,
        totalDurationMs,
        wasParallel,
        succeeded,
        failed,
        timestamp: Date.now(),
      });
    }
  }
}

// Singleton instance
let toolExecutionLoggerInstance: ToolExecutionLogger | null = null;

/**
 * Get the singleton ToolExecutionLogger instance
 */
export function getToolExecutionLogger(): ToolExecutionLogger {
  if (!toolExecutionLoggerInstance) {
    toolExecutionLoggerInstance = new ToolExecutionLogger();
  }
  return toolExecutionLoggerInstance;
}

/**
 * Create a new ToolExecutionLogger with a custom logger
 */
export function createToolExecutionLogger(logger: Logger): ToolExecutionLogger {
  return new ToolExecutionLogger(logger);
}

/**
 * Tool-specific logger interface that matches ToolLogger from toolTypes.ts
 * but includes additional context about the tool being executed
 */
export interface ToolSpecificLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  /** The name of the tool this logger is associated with */
  readonly toolName: string;
  /** The session ID for context */
  readonly sessionId: string;
  /** The run ID for context */
  readonly runId: string;
}

/**
 * Create a tool-specific logger that automatically includes tool context in all log messages.
 * This logger wraps the base logger and adds tool name, session ID, and run ID to all log entries.
 * 
 * @param baseLogger - The base logger to wrap
 * @param toolName - The name of the tool being executed
 * @param sessionId - The current session ID
 * @param runId - The current run ID
 * @returns A tool-specific logger with context automatically included
 */
export function createToolSpecificLogger(
  baseLogger: Logger,
  toolName: string,
  sessionId: string,
  runId: string
): ToolSpecificLogger {
  const contextMeta = {
    toolName,
    sessionId,
    runId,
  };

  return {
    toolName,
    sessionId,
    runId,
    
    info(message: string, meta?: Record<string, unknown>): void {
      baseLogger.info(`[tool:${toolName}] ${message}`, { ...contextMeta, ...meta });
    },
    
    warn(message: string, meta?: Record<string, unknown>): void {
      baseLogger.warn(`[tool:${toolName}] ${message}`, { ...contextMeta, ...meta });
    },
    
    error(message: string, meta?: Record<string, unknown>): void {
      baseLogger.error(`[tool:${toolName}] ${message}`, { ...contextMeta, ...meta });
    },
    
    debug(message: string, meta?: Record<string, unknown>): void {
      baseLogger.debug(`[tool:${toolName}] ${message}`, { ...contextMeta, ...meta });
    },
  };
}
