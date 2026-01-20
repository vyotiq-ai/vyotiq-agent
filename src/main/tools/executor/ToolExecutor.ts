/**
 * Enhanced Tool Executor
 * 
 * Responsible for executing tools with proper lifecycle management:
 * - Pre-execution validation
 * - Context preparation
 * - Execution with timing
 * - Result caching for read operations
 * - Event emission
 * - Performance metrics
 */
import { randomUUID } from 'node:crypto';
import { categorizeToolName } from '../../../shared/utils/toolUtils';
import type {
  AgentEvent,
  RendererEvent,
  ToolCallPayload,
  ToolExecutionResult,
} from '../../../shared/types';
import type { InternalSession } from '../../agent/types';
import type { ToolRegistry } from '../registry/ToolRegistry';
import type { Logger } from '../../logger';
import type { TerminalManager, ToolExecutionContext, EnhancedToolResult } from '../types';
import type { WorkspaceManager } from '../../workspaces/workspaceManager';

// =============================================================================
// Types
// =============================================================================

interface ToolExecutorDeps {
  toolRegistry: ToolRegistry;
  terminalManager: TerminalManager;
  workspaceManager: WorkspaceManager;
  logger: Logger;
  emitEvent: (event: RendererEvent | AgentEvent) => void;
}

interface ToolQueueResult {
  status: 'completed' | 'awaiting-confirmation' | 'continue';
  result?: EnhancedToolResult;
}

interface LoggerWithTracking extends Logger {
  trackToolInvocation(toolName: string, duration: number, success: boolean): void;
}

/** Cache entry for tool results */
interface CacheEntry {
  result: EnhancedToolResult;
  timestamp: number;
  hitCount: number;
}

/** Cache configuration */
interface CacheConfig {
  /** Enable result caching */
  enabled: boolean;
  /** Maximum cache entries */
  maxEntries: number;
  /** TTL in milliseconds (default 5 minutes) */
  ttlMs: number;
  /** Tools that are cacheable (read-only operations) */
  cacheableTools: Set<string>;
}

/** Execution metrics for a session */
export interface ToolExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  cacheHits: number;
  cacheMisses: number;
  totalDurationMs: number;
  averageDurationMs: number;
  toolBreakdown: Map<string, {
    executions: number;
    successes: number;
    failures: number;
    avgDurationMs: number;
  }>;
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  maxEntries: 100,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  cacheableTools: new Set(['read', 'read_file', 'ls', 'list_dir', 'glob', 'grep']),
};

// Maximum output size allowed in tool results to prevent context overflow
const MAX_TOOL_OUTPUT_SIZE = 60000; // ~15K tokens max per tool result

/**
 * Truncate tool output if it exceeds safe limits
 */
function truncateToolOutput(output: string, toolName: string): string {
  if (!output || output.length <= MAX_TOOL_OUTPUT_SIZE) {
    return output;
  }
  
  // Tool-specific truncation strategies
  const structuredTools = ['ls', 'list_dir', 'grep', 'glob', 'read', 'read_file'];
  const isStructured = structuredTools.includes(toolName);
  
  // For structured outputs (ls, grep), try to keep complete lines
  if (isStructured && output.includes('\n')) {
    let truncated = output.slice(0, MAX_TOOL_OUTPUT_SIZE);
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > MAX_TOOL_OUTPUT_SIZE * 0.8) {
      truncated = truncated.slice(0, lastNewline);
    }
    return truncated + `\n\n[${toolName} output truncated to prevent context overflow. Use more specific queries or filters.]`;
  }
  
  return output.slice(0, MAX_TOOL_OUTPUT_SIZE) + `\n\n[${toolName} output truncated to prevent context overflow.]`;
}

// =============================================================================
// Enhanced Tool Executor
// =============================================================================

export class ToolExecutor {
  /** Result cache keyed by tool+args hash */
  private resultCache = new Map<string, CacheEntry>();
  /** Cache configuration */
  private cacheConfig: CacheConfig;
  /** Execution metrics per session */
  private sessionMetrics = new Map<string, ToolExecutionMetrics>();
  /** Invalidation triggers - tools that invalidate cache */
  private cacheInvalidators = new Set(['edit', 'write', 'create_file', 'run', 'kill_terminal']);

  constructor(private deps: ToolExecutorDeps, cacheConfig?: Partial<CacheConfig>) {
    this.cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...cacheConfig };
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Generate cache key from tool name and arguments
   */
  private getCacheKey(toolName: string, args: Record<string, unknown>, workspacePath?: string): string {
    const normalizedArgs = JSON.stringify(args, Object.keys(args).sort());
    return `${workspacePath ?? 'global'}:${toolName}:${normalizedArgs}`;
  }

  /**
   * Check if a tool result is cached and valid
   */
  private getCachedResult(cacheKey: string): EnhancedToolResult | undefined {
    if (!this.cacheConfig.enabled) return undefined;

    const entry = this.resultCache.get(cacheKey);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.cacheConfig.ttlMs) {
      this.resultCache.delete(cacheKey);
      return undefined;
    }

    // Update hit count
    entry.hitCount++;
    return entry.result;
  }

  /**
   * Cache a tool result
   */
  private cacheResult(cacheKey: string, result: EnhancedToolResult): void {
    if (!this.cacheConfig.enabled) return;
    if (!result.success) return; // Don't cache failures

    // Enforce max entries (LRU eviction based on hitCount and timestamp)
    if (this.resultCache.size >= this.cacheConfig.maxEntries) {
      // Find least valuable entry (lowest hitCount, oldest)
      let worstKey = '';
      let worstScore = Infinity;
      
      for (const [key, entry] of this.resultCache) {
        const age = Date.now() - entry.timestamp;
        const score = entry.hitCount - (age / this.cacheConfig.ttlMs);
        if (score < worstScore) {
          worstScore = score;
          worstKey = key;
        }
      }
      
      if (worstKey) {
        this.resultCache.delete(worstKey);
      }
    }

    this.resultCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      hitCount: 0,
    });
  }

  /**
   * Invalidate cache entries affected by a write operation
   */
  private invalidateCache(toolName: string, args: Record<string, unknown>, workspacePath?: string): void {
    if (!this.cacheInvalidators.has(toolName)) return;

    // Get the affected path from arguments
    const affectedPath = (args.path || args.filePath || args.directory) as string | undefined;
    
    // Invalidate entries that might be affected
    for (const [key] of this.resultCache) {
      // Invalidate all entries in the same workspace for simplicity
      // More sophisticated: only invalidate entries with matching paths
      if (workspacePath && key.startsWith(workspacePath)) {
        if (!affectedPath || key.includes(affectedPath)) {
          this.resultCache.delete(key);
        }
      }
    }

    this.deps.logger.info('Cache invalidated', {
      trigger: toolName,
      affectedPath,
      remainingEntries: this.resultCache.size,
    });
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.resultCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    let totalHits = 0;
    for (const entry of this.resultCache.values()) {
      totalHits += entry.hitCount;
    }
    const totalAccesses = totalHits + this.resultCache.size; // Rough approximation
    return {
      size: this.resultCache.size,
      maxSize: this.cacheConfig.maxEntries,
      hitRate: totalAccesses > 0 ? totalHits / totalAccesses : 0,
    };
  }

  // ===========================================================================
  // Metrics Management
  // ===========================================================================

  /**
   * Get or create metrics for a session
   */
  private getSessionMetrics(sessionId: string): ToolExecutionMetrics {
    let metrics = this.sessionMetrics.get(sessionId);
    if (!metrics) {
      metrics = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalDurationMs: 0,
        averageDurationMs: 0,
        toolBreakdown: new Map(),
      };
      this.sessionMetrics.set(sessionId, metrics);
    }
    return metrics;
  }

  /**
   * Update metrics after tool execution
   */
  private updateMetrics(
    sessionId: string,
    toolName: string,
    success: boolean,
    durationMs: number,
    cacheHit: boolean
  ): void {
    const metrics = this.getSessionMetrics(sessionId);
    
    metrics.totalExecutions++;
    if (success) metrics.successfulExecutions++;
    else metrics.failedExecutions++;
    
    if (cacheHit) metrics.cacheHits++;
    else metrics.cacheMisses++;
    
    metrics.totalDurationMs += durationMs;
    metrics.averageDurationMs = metrics.totalDurationMs / metrics.totalExecutions;
    
    // Update tool breakdown
    let toolMetrics = metrics.toolBreakdown.get(toolName);
    if (!toolMetrics) {
      toolMetrics = { executions: 0, successes: 0, failures: 0, avgDurationMs: 0 };
      metrics.toolBreakdown.set(toolName, toolMetrics);
    }
    
    toolMetrics.executions++;
    if (success) toolMetrics.successes++;
    else toolMetrics.failures++;
    
    const totalToolDuration = toolMetrics.avgDurationMs * (toolMetrics.executions - 1) + durationMs;
    toolMetrics.avgDurationMs = totalToolDuration / toolMetrics.executions;
  }

  /**
   * Emit file change events for file-modifying tools
   * This enables real-time file tree updates in the UI
   */
  private emitFileChangeEvent(
    toolName: string,
    args: Record<string, unknown>,
    success: boolean
  ): void {
    if (!success) return;

    const { category, action } = categorizeToolName(toolName);
    
    // Only emit for file-write category tools
    if (category !== 'file-write') return;
    
    // Extract path from tool arguments
    const filePath = (args.path ?? args.filePath ?? args.file_path ?? args.target) as string | undefined;
    if (!filePath) return;
    
    // Map tool action to file change type
    let changeType: 'create' | 'write' | 'delete' | 'rename' | 'createDir';
    switch (action) {
      case 'create':
        changeType = 'create';
        break;
      case 'edit':
        changeType = 'write';
        break;
      case 'delete':
        changeType = 'delete';
        break;
      case 'rename':
        changeType = 'rename';
        break;
      default:
        changeType = 'write';
    }
    
    // Get oldPath for rename operations
    const oldPath = (args.oldPath ?? args.old_path ?? args.source) as string | undefined;
    
    this.deps.emitEvent({
      type: 'file-changed',
      changeType,
      path: filePath,
      ...(oldPath && { oldPath }),
    } as RendererEvent);
    
    this.deps.logger.debug('File change event emitted', { 
      toolName, 
      changeType, 
      path: filePath,
      oldPath 
    });
  }

  /**
   * Get execution metrics for a session
   */
  getMetrics(sessionId: string): ToolExecutionMetrics | undefined {
    return this.sessionMetrics.get(sessionId);
  }

  /**
   * Clear metrics for a session
   */
  clearMetrics(sessionId: string): void {
    this.sessionMetrics.delete(sessionId);
  }

  /**
   * Check if logger supports tracking
   */
  private hasTrackToolInvocation(logger: Logger): logger is LoggerWithTracking {
    return (
      'trackToolInvocation' in logger &&
      typeof (logger as LoggerWithTracking).trackToolInvocation === 'function'
    );
  }

  /**
   * Build execution context for a session
   * 
   * IMPORTANT: Uses the session's explicit workspaceId to ensure tool execution
   * happens in the correct workspace. Falls back to active workspace only if
   * the session has no workspaceId (legacy sessions).
   * 
   * STRICT MODE: If session has a workspaceId but workspace is not found,
   * this will return a context WITHOUT workspacePath, causing tools to fail safely
   * with a clear "No workspace selected" error.
   * 
   * @param session - The internal session
   * @param runId - Optional run ID for tracking (Requirement 8: Tool Execution Context Enhancement)
   */
  private buildContext(session: InternalSession, runId?: string): ToolExecutionContext {
    // Log context building for debugging
    this.deps.logger.info('Building tool execution context', {
      sessionId: session.state.id,
      sessionWorkspaceId: session.state.workspaceId,
      availableWorkspaceCount: this.deps.workspaceManager.list().length,
    });
    
    // First try to find the workspace by the session's explicit workspaceId
    let workspace = session.state.workspaceId
      ? this.deps.workspaceManager.list().find((entry) => entry.id === session.state.workspaceId)
      : undefined;
    
    // If session has explicit workspaceId but workspace not found - this is a critical error
    // Return context with fallback workspacePath so tools can fail safely with clear error
    if (session.state.workspaceId && !workspace) {
      this.deps.logger.error('CRITICAL: Session workspaceId not found in workspace list', {
        sessionId: session.state.id,
        sessionWorkspaceId: session.state.workspaceId,
        availableWorkspaces: this.deps.workspaceManager.list().map(w => ({
          id: w.id,
          path: w.path,
          isActive: w.isActive
        })),
      });
      
      // Return context with fallback workspacePath - tools should check workspace validity
      const fallbackPath = process.cwd();
      return {
        sessionId: session.state.id,
        runId,
        workspacePath: fallbackPath,
        cwd: fallbackPath,
        terminalManager: this.deps.terminalManager,
        logger: {
          info: (message: string, meta?: Record<string, unknown>) =>
            this.deps.logger.info(message, meta),
          warn: (message: string, meta?: Record<string, unknown>) =>
            this.deps.logger.warn(message, meta),
          error: (message: string, meta?: Record<string, unknown>) =>
            this.deps.logger.error(message, meta),
        },
      };
    }
    
    // Fallback to active workspace only for legacy sessions without workspaceId
    if (!workspace && !session.state.workspaceId) {
      workspace = this.deps.workspaceManager.getActive();
      
      // Log a warning if we're falling back - this helps track legacy sessions
      if (workspace) {
        this.deps.logger.info('Session has no workspaceId, using active workspace (legacy mode)', {
          sessionId: session.state.id,
          activeWorkspacePath: workspace.path,
          activeWorkspaceId: workspace.id,
        });
      } else {
        this.deps.logger.error('No workspace available for session', {
          sessionId: session.state.id,
        });
      }
    }

    // Log the resolved workspace for debugging
    this.deps.logger.info('Tool execution context resolved', {
      sessionId: session.state.id,
      workspacePath: workspace?.path ?? '(none)',
      workspaceId: workspace?.id ?? '(none)',
    });

    const workspacePath = workspace?.path ?? process.cwd();
    return {
      sessionId: session.state.id,
      runId,
      workspacePath,
      cwd: workspacePath,
      terminalManager: this.deps.terminalManager,
      logger: {
        info: (message: string, meta?: Record<string, unknown>) =>
          this.deps.logger.info(message, meta),
        warn: (message: string, meta?: Record<string, unknown>) =>
          this.deps.logger.warn(message, meta),
        error: (message: string, meta?: Record<string, unknown>) =>
          this.deps.logger.error(message, meta),
      },
    };
  }

  /**
   * Process the tool queue for a session
   * Returns the result status for the caller to handle
   */
  async processToolQueue(
    session: InternalSession,
    onContinue: () => void
  ): Promise<ToolQueueResult> {
    // Empty queue - signal to continue with next LLM call
    if (!session.toolQueue || session.toolQueue.length === 0) {
      session.toolQueue = undefined;
      onContinue();
      return { status: 'continue' };
    }

    const runId = session.state.activeRunId;
    const toolCall = session.toolQueue.shift();

    if (!toolCall || !runId) {
      return { status: 'completed' };
    }

    // Check if tool exists
    if (!this.deps.toolRegistry.has(toolCall.name)) {
      // Get list of available tools to help model recover
      const allTools = this.deps.toolRegistry.list();
      const availableTools = allTools.map(t => t.name).sort().join(', ');
      
      this.deps.logger.warn('Provider requested unknown tool', { 
        tool: toolCall.name,
        availableToolCount: allTools.length,
      });
      
      // Add helpful error message so LLM can recover
      const errorMsg = `Error: Tool "${toolCall.name}" does not exist. This appears to be a hallucinated or placeholder tool name.\n\nAvailable tools: ${availableTools}\n\nPlease use one of these exact tool names.`;
      this.emitToolError(session, toolCall, runId, errorMsg);
      return this.processToolQueue(session, onContinue);
    }

    // Check if approval is required
    const requiresApproval =
      this.deps.toolRegistry.requiresApproval(toolCall.name) && !session.state.config.yoloMode;

    if (requiresApproval) {
      // Queue for approval
      session.pendingTool = { tool: toolCall, runId };
      session.state.status = 'awaiting-confirmation';
      session.state.activeRunId = undefined;

      this.deps.emitEvent({ type: 'session-state', session: session.state });
      this.deps.emitEvent({
        type: 'tool-call',
        sessionId: session.state.id,
        runId,
        toolCall,
        requiresApproval: true,
        timestamp: Date.now(),
      });
      this.deps.emitEvent({
        type: 'run-status',
        sessionId: session.state.id,
        runId,
        status: 'awaiting-confirmation',
        timestamp: Date.now(),
      });

      return { status: 'awaiting-confirmation' };
    }

    // Execute the tool
    await this.executeTool(session, toolCall, runId);

    // Continue processing queue
    return this.processToolQueue(session, onContinue);
  }

  /**
   * Execute a single tool and emit results
   */
  async executeTool(
    session: InternalSession,
    toolCall: ToolCallPayload,
    runId: string
  ): Promise<EnhancedToolResult> {
    const context = this.buildContext(session, runId);
    const startTime = performance.now();
    const isCacheable = this.cacheConfig.cacheableTools.has(toolCall.name);
    const cacheKey = isCacheable 
      ? this.getCacheKey(toolCall.name, toolCall.arguments, context.workspacePath)
      : '';

    // Check cache for cacheable tools
    if (isCacheable) {
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult) {
        const duration = Math.round(performance.now() - startTime);
        
        this.deps.logger.info('Tool result served from cache', {
          tool: toolCall.name,
          cacheKey: cacheKey.slice(0, 50),
          duration,
        });

        // Update metrics
        this.updateMetrics(session.state.id, toolCall.name, cachedResult.success, duration, true);

        // Create tool message for conversation (mark as cached)
        const toolMessage = {
          id: randomUUID(),
          role: 'tool' as const,
          content: truncateToolOutput(cachedResult.output, toolCall.name) + '\n\n_[Served from cache]_',
          toolName: toolCall.name,
          toolCallId: toolCall.callId,
          createdAt: Date.now(),
          toolSuccess: cachedResult.success,
          resultMetadata: cachedResult.metadata,
        };

        session.state.messages.push(toolMessage);
        session.state.updatedAt = Date.now();

        // Emit events
        this.deps.emitEvent({
          type: 'tool-call',
          sessionId: session.state.id,
          runId,
          toolCall,
          requiresApproval: false,
          timestamp: Date.now(),
        });
        this.deps.emitEvent({
          type: 'tool-result',
          sessionId: session.state.id,
          runId,
          result: cachedResult,
          toolCallId: toolCall.callId,
          timestamp: Date.now(),
        });
        this.deps.emitEvent({ type: 'session-state', session: session.state });

        return cachedResult;
      }
    }

    this.deps.logger.info('Executing tool', {
      tool: toolCall.name,
      args: toolCall.arguments,
      workspace: context.workspacePath,
      cacheable: isCacheable,
    });

    // Check for JSON parse errors in arguments
    const args = toolCall.arguments as Record<string, unknown>;
    if (args._parseError) {
      const duration = Math.round(performance.now() - startTime);
      const errorMsg = (args._errorMessage as string) || 'Failed to parse tool arguments';
      const rawPreview = (args._rawPreview as string) || '';
      
      this.deps.logger.warn('Tool arguments had parse error', {
        tool: toolCall.name,
        errorMessage: errorMsg,
        rawPreview,
      });

      const result: EnhancedToolResult = {
        toolName: toolCall.name,
        success: false,
        output: `═══ ARGUMENT PARSE ERROR ═══\n\n${errorMsg}\n\nRaw input preview: ${rawPreview}\n\n═══ SUGGESTIONS ═══\n• Ensure all arguments are valid JSON\n• Check for unescaped quotes or special characters\n• Verify the argument structure matches the tool schema`,
        timing: {
          startedAt: Date.now() - duration,
          completedAt: Date.now(),
          durationMs: duration,
        },
      };

      // Update metrics for failed execution
      this.updateMetrics(session.state.id, toolCall.name, false, duration, false);

      // Create tool message for conversation
      const toolMessage = {
        id: randomUUID(),
        role: 'tool' as const,
        content: result.output,
        toolName: toolCall.name,
        toolCallId: toolCall.callId,
        createdAt: Date.now(),
        toolSuccess: false,
      };

      session.state.messages.push(toolMessage);
      session.state.updatedAt = Date.now();

      // Emit events
      this.deps.emitEvent({
        type: 'tool-call',
        sessionId: session.state.id,
        runId,
        toolCall,
        requiresApproval: false,
        timestamp: Date.now(),
      });
      this.deps.emitEvent({
        type: 'tool-result',
        sessionId: session.state.id,
        runId,
        result,
        toolCallId: toolCall.callId,
        timestamp: Date.now(),
      });
      this.deps.emitEvent({ type: 'session-state', session: session.state });

      return result;
    }

    // Emit tool-call event (non-approval)
    this.deps.emitEvent({
      type: 'tool-call',
      sessionId: session.state.id,
      runId,
      toolCall,
      requiresApproval: false,
      timestamp: Date.now(),
    });

    let result: EnhancedToolResult;

    try {
      result = await this.deps.toolRegistry.execute(toolCall.name, toolCall.arguments, context);

      const duration = Math.round(performance.now() - startTime);
      this.deps.logger.info('Tool execution completed', {
        tool: toolCall.name,
        success: result.success,
        duration,
        outputLength: result.output?.length ?? 0,
        cacheable: isCacheable,
      });

      // Cache successful results for cacheable tools
      if (isCacheable && result.success) {
        this.cacheResult(cacheKey, result);
      }

      // Invalidate cache for write operations
      if (this.cacheInvalidators.has(toolCall.name)) {
        this.invalidateCache(toolCall.name, toolCall.arguments, context.workspacePath);
      }

      // Emit file change event for file-modifying tools (enables real-time file tree updates)
      this.emitFileChangeEvent(toolCall.name, toolCall.arguments, result.success);

      // Update metrics
      this.updateMetrics(session.state.id, toolCall.name, result.success, duration, false);

      // Track performance metrics in logger
      if (this.hasTrackToolInvocation(this.deps.logger)) {
        this.deps.logger.trackToolInvocation(toolCall.name, duration, result.success);
      }
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);
      result = {
        toolName: toolCall.name,
        success: false,
        output: (error as Error).message,
        timing: {
          startedAt: Date.now() - duration,
          completedAt: Date.now(),
          durationMs: duration,
        },
      };

      this.deps.logger.error('Tool execution failed', {
        tool: toolCall.name,
        error: (error as Error).message,
        duration,
      });

      // Update metrics for failed execution
      this.updateMetrics(session.state.id, toolCall.name, false, duration, false);

      if (this.hasTrackToolInvocation(this.deps.logger)) {
        this.deps.logger.trackToolInvocation(toolCall.name, duration, false);
      }
    }

    // Create tool message for conversation
    const toolContent = truncateToolOutput(result.output, toolCall.name);
    
    const toolMessage = {
      id: randomUUID(),
      role: 'tool' as const,
      content: toolContent,
      toolName: toolCall.name,
      toolCallId: toolCall.callId,
      createdAt: Date.now(),
      toolSuccess: result.success,
      resultMetadata: result.metadata,
    };

    session.state.messages.push(toolMessage);
    session.state.updatedAt = Date.now();

    // Emit result and updated state
    this.deps.emitEvent({
      type: 'tool-result',
      sessionId: session.state.id,
      runId,
      result,
      toolCallId: toolCall.callId,
      timestamp: Date.now(),
    });
    this.deps.emitEvent({ type: 'session-state', session: session.state });

    return result;
  }

  /**
   * Emit an error for an unknown tool
   */
  private emitToolError(
    session: InternalSession,
    toolCall: ToolCallPayload,
    runId: string,
    errorMessage: string
  ): void {
    const errorResult: ToolExecutionResult = {
      toolName: toolCall.name,
      success: false,
      output: errorMessage,
    };

    const toolMessage = {
      id: randomUUID(),
      role: 'tool' as const,
      content: errorMessage,
      toolName: toolCall.name,
      toolCallId: toolCall.callId,
      createdAt: Date.now(),
      toolSuccess: false,
    };

    session.state.messages.push(toolMessage);
    session.state.updatedAt = Date.now();

    this.deps.emitEvent({
      type: 'tool-result',
      sessionId: session.state.id,
      runId,
      result: errorResult,
      toolCallId: toolCall.callId,
      timestamp: Date.now(),
    });
    this.deps.emitEvent({ type: 'session-state', session: session.state });
  }

  /**
   * Cancel any pending tool execution
   */
  cancelPendingTool(session: InternalSession): void {
    if (session.pendingTool) {
      this.deps.logger.info('Cancelling pending tool', {
        tool: session.pendingTool.tool.name,
        sessionId: session.state.id,
      });
      session.pendingTool = undefined;
      session.toolQueue = undefined;
    }
  }

  // ===========================================================================
  // Composition Workflow Execution (Phase 2)
  // ===========================================================================

}
