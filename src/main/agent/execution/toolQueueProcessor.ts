/**
 * Tool Queue Processor
 * Handles tool queue processing, parallel execution, and tool confirmation flow
 */

import { randomUUID } from 'node:crypto';
import type {
  ToolCallPayload,
  ChatMessage,
  RendererEvent,
  AgentEvent,
  AccessLevelSettings,
  ToolConfigSettings,
} from '../../../shared/types';
import { DEFAULT_TOOL_CONFIG_SETTINGS } from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { ToolRegistry, TerminalManager, ToolExecutionContext } from '../../tools';
import type { ProgressTracker } from './progressTracker';
import type { DebugEmitter } from './debugEmitter';
import { SafetyManager } from '../safety';
import { ComplianceValidator } from '../compliance';
import { getAccessLevelCategory, checkAccessLevelPermission } from '../utils/accessLevelUtils';
import { getLoopDetector } from '../loopDetection';
import { getSessionHealthMonitor } from '../sessionHealth';
import { agentMetrics } from '../metrics';
import { executeToolsParallel, canBenefitFromParallel, DEFAULT_PARALLEL_CONFIG, type ParallelExecutionConfig } from '../../tools/executor';
import { recordToolError, recordToolSuccess } from '../context/ToolContextManager';
import { getToolResultCache } from '../cache/ToolResultCache';
import { getErrorRecoveryManager } from '../recovery/ErrorRecoveryManager';
import { getToolExecutionLogger, createToolSpecificLogger } from '../logging/ToolExecutionLogger';
import { getOutputTruncator } from '../output/OutputTruncator';
import { getToolUsageTracker } from '../../tools/discovery/ToolUsageTracker';
import type { EnhancedToolResult } from '../../tools/types';
import type { SafetySettings } from '../../../shared/types';
import { getAuditLogger } from '../compliance';
import type { SecurityActor } from '../security/SecurityAuditLog';

export class ToolQueueProcessor {
  private readonly toolRegistry: ToolRegistry;
  private readonly terminalManager: TerminalManager;
  private readonly logger: Logger;
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly progressTracker: ProgressTracker;
  private readonly debugEmitter: DebugEmitter;
  private readonly complianceValidator: ComplianceValidator;
  private readonly updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void;
  private readonly getAccessLevelSettings: () => AccessLevelSettings | undefined;
  private readonly getToolSettings: () => ToolConfigSettings | undefined;
  private readonly getSafetySettings: () => SafetySettings | undefined;
  private readonly activeControllers: Map<string, AbortController>;
  private readonly safetyManagers = new Map<string, SafetyManager>();

  // Cached singleton references (resolved once per processToolQueue batch)
  private _loopDetector: ReturnType<typeof getLoopDetector> | null = null;
  private _healthMonitor: ReturnType<typeof getSessionHealthMonitor> | null = null;
  private _toolExecLogger: ReturnType<typeof getToolExecutionLogger> | null = null;
  private _outputTruncator: ReturnType<typeof getOutputTruncator> | null = null;
  private _errorRecovery: ReturnType<typeof getErrorRecoveryManager> | null = null;
  private _auditLogger: ReturnType<typeof getAuditLogger> | null = null;
  private _toolResultCache: ReturnType<typeof getToolResultCache> | null = null;

  constructor(
    toolRegistry: ToolRegistry,
    terminalManager: TerminalManager,
    logger: Logger,
    emitEvent: (event: RendererEvent | AgentEvent) => void,
    progressTracker: ProgressTracker,
    debugEmitter: DebugEmitter,
    complianceValidator: ComplianceValidator,
    updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void,
    getAccessLevelSettings: () => AccessLevelSettings | undefined,
    activeControllers: Map<string, AbortController>,
    getToolSettings?: () => ToolConfigSettings | undefined,
    getSafetySettings?: () => SafetySettings | undefined
  ) {
    this.toolRegistry = toolRegistry;
    this.terminalManager = terminalManager;
    this.logger = logger;
    this.emitEvent = emitEvent;
    this.progressTracker = progressTracker;
    this.debugEmitter = debugEmitter;
    this.complianceValidator = complianceValidator;
    this.updateSessionState = updateSessionState;
    this.getAccessLevelSettings = getAccessLevelSettings;
    this.activeControllers = activeControllers;
    this.getToolSettings = getToolSettings ?? (() => undefined);
    this.getSafetySettings = getSafetySettings ?? (() => undefined);
  }

  /**
   * Get the parallel execution configuration based on current settings
   */
  private getParallelConfig(): ParallelExecutionConfig {
    const toolSettings = this.getToolSettings();
    const maxConcurrency = toolSettings?.maxConcurrentTools ?? DEFAULT_TOOL_CONFIG_SETTINGS.maxConcurrentTools;
    
    return {
      ...DEFAULT_PARALLEL_CONFIG,
      maxConcurrency,
    };
  }

  /**
   * Resolve all singletons once per processToolQueue batch to avoid
   * repeated getter calls during tool execution.
   */
  private resolveSingletons(): void {
    this._loopDetector = getLoopDetector();
    this._healthMonitor = getSessionHealthMonitor();
    this._toolExecLogger = getToolExecutionLogger();
    this._outputTruncator = getOutputTruncator();
    this._errorRecovery = getErrorRecoveryManager();
    this._auditLogger = getAuditLogger();
    this._toolResultCache = getToolResultCache();
  }

  /**
   * Process the tool queue for a session
   */
  async processToolQueue(session: InternalSession): Promise<'completed' | 'tool-continue' | 'awaiting-confirmation'> {
    // Resolve all singletons once for this batch
    this.resolveSingletons();
    const runId = session.state.activeRunId;
    if (!runId) {
      this.logger.warn('No active run for tool queue processing', { sessionId: session.state.id });
      return 'completed';
    }

    const controller = this.activeControllers.get(session.state.id);

    // Emit initial queue state so UI can show pending tools immediately
    if (session.toolQueue && session.toolQueue.length > 0) {
      this.emitToolQueuedEvent(session.state.id, runId, session.toolQueue);
    }

    while (session.toolQueue && session.toolQueue.length > 0) {
      if (controller?.signal.aborted) {
        this.logger.info('Tool queue processing cancelled', {
          sessionId: session.state.id,
          remainingTools: session.toolQueue.length
        });
        session.toolQueue = [];
        return 'completed';
      }

      const executableTools: ToolCallPayload[] = [];
      const toolsNeedingApproval: ToolCallPayload[] = [];

      // Get user-configured tool settings for disabled/confirm lists
      const toolSettings = this.getToolSettings();
      const disabledToolsSet = new Set(toolSettings?.disabledTools ?? []);
      const alwaysConfirmList = new Set(toolSettings?.alwaysConfirmTools ?? []);

      while (session.toolQueue.length > 0) {
        const tool = session.toolQueue[0];

        // Skip disabled tools entirely — return error to LLM so it knows
        if (disabledToolsSet.has(tool.name)) {
          const disabledTool = session.toolQueue.shift()!;
          const progressId = this.progressTracker.ensureToolProgressId(disabledTool);
          const errorMessage: ChatMessage = {
            id: randomUUID(),
            role: 'tool',
            content: `Tool "${disabledTool.name}" is disabled in settings. Use a different approach or request an alternative tool.`,
            toolCallId: disabledTool.callId,
            toolName: disabledTool.name,
            toolSuccess: false,
            createdAt: Date.now(),
            runId,
          };
          session.state.messages.push(errorMessage);
          this.progressTracker.finishToolProgress(session, runId, progressId, disabledTool.name, '', 'error');
          this.updateSessionState(session.state.id, {
            messages: session.state.messages,
            updatedAt: Date.now(),
          });
          this.logger.info('Skipped disabled tool', { tool: disabledTool.name, sessionId: session.state.id });
          continue;
        }

        const toolRequiresApproval = this.toolRegistry.requiresApproval(tool.name);
        // Check both the tool definition's requiresApproval AND the user's alwaysConfirmTools setting
        const isInAlwaysConfirmList = alwaysConfirmList.has(tool.name);
        const requiresApproval = !session.state.config.yoloMode && (toolRequiresApproval || isInAlwaysConfirmList);

        if (requiresApproval) {
          toolsNeedingApproval.push(session.toolQueue.shift()!);
          break;
        }

        executableTools.push(session.toolQueue.shift()!);
      }

      if (toolsNeedingApproval.length > 0) {
        const tool = toolsNeedingApproval[0];
        const progressId = this.progressTracker.ensureToolProgressId(tool);

        this.progressTracker.emitRunProgressItem(session, runId, {
          id: progressId,
          type: 'tool-call',
          label: tool.name,
          detail: this.progressTracker.describeToolTarget(tool),
          status: 'pending',
          timestamp: Date.now(),
        });

        session.pendingTool = { tool, runId };
        session.state.status = 'awaiting-confirmation';
        session.state.activeRunId = undefined;

        this.emitEvent({ type: 'session-state', session: session.state });
        this.emitEvent({
          type: 'tool-call',
          sessionId: session.state.id,
          runId,
          toolCall: tool,
          requiresApproval: true,
          timestamp: Date.now(),
        });
        this.emitEvent({
          type: 'run-status',
          sessionId: session.state.id,
          runId,
          status: 'awaiting-confirmation',
          timestamp: Date.now(),
        });

        return 'awaiting-confirmation';
      }

      if (executableTools.length > 0) {
        if (executableTools.length >= 2 && canBenefitFromParallel(executableTools)) {
          await this.executeToolsInParallel(session, executableTools, runId, controller?.signal);
        } else {
          for (const tool of executableTools) {
            if (controller?.signal.aborted) break;
            await this.executeTool(session, tool, runId);
            // Emit updated queue state after each tool completes (for remaining queue)
            if (session.toolQueue && session.toolQueue.length > 0) {
              this.emitToolQueuedEvent(session.state.id, runId, session.toolQueue);
            }
          }
        }
      }
    }

    return 'tool-continue';
  }

  /**
   * Execute multiple tools in parallel
   */
  private async executeToolsInParallel(
    session: InternalSession,
    tools: ToolCallPayload[],
    runId: string,
    signal?: AbortSignal
  ): Promise<void> {
    const startTime = Date.now();
    const parallelConfig = this.getParallelConfig();

    this.logger.info('Starting parallel tool execution', {
      sessionId: session.state.id,
      runId,
      toolCount: tools.length,
      tools: tools.map(t => t.name),
      maxConcurrency: parallelConfig.maxConcurrency,
    });

    for (const tool of tools) {
      const progressId = this.progressTracker.ensureToolProgressId(tool);
      this.progressTracker.emitRunProgressItem(session, runId, {
        id: progressId,
        type: 'tool-call',
        label: tool.name,
        detail: this.progressTracker.describeToolTarget(tool),
        status: 'running',
        timestamp: Date.now(),
        metadata: { callId: tool.callId, parallel: true },
      });

      // Emit tool-started event for each parallel tool for immediate UI feedback
      this.emitEvent({
        type: 'tool-started',
        sessionId: session.state.id,
        runId,
        timestamp: Date.now(),
        toolCall: tool,
        executionOrder: tools.indexOf(tool) + 1,
        totalInBatch: tools.length,
      });
    }

    const result = await executeToolsParallel(
      tools,
      async (tool) => {
        const toolResult = await this.executeToolAndGetResult(session, tool, runId);
        return toolResult;
      },
      parallelConfig,
      signal
    );

    const duration = Date.now() - startTime;

    // Log parallel execution results with time savings using structured logger
    const toolExecutionLogger = this._toolExecLogger!;
    toolExecutionLogger.logParallelExecution(session.state.id, runId, {
      toolCount: tools.length,
      tools: tools.map(t => t.name),
      totalDurationMs: result.totalDurationMs,
      timeSavedMs: result.timeSavedMs,
      wasParallel: result.wasParallel,
      succeeded: result.succeeded.length,
      failed: result.failed.length,
    });

    // Also log to the instance logger for backward compatibility
    this.logger.info('Parallel tool execution completed', {
      sessionId: session.state.id,
      runId,
      totalDurationMs: result.totalDurationMs,
      wallClockDurationMs: duration,
      timeSavedMs: result.timeSavedMs,
      wasParallel: result.wasParallel,
      succeeded: result.succeeded.length,
      failed: result.failed.length,
    });

    // Log individual tool failures - failed tools don't block other independent tools
    if (result.failed.length > 0) {
      this.logger.warn('Some tools failed during parallel execution (other tools continued)', {
        sessionId: session.state.id,
        runId,
        failedTools: result.failed,
        succeededTools: result.succeeded,
        message: 'Failed tools did not block execution of other independent tools',
      });
    }

    // Emit time savings notification to the UI
    if (result.wasParallel && result.timeSavedMs > 0) {
      const timeSavedSeconds = (result.timeSavedMs / 1000).toFixed(1);
      const percentageSaved = result.totalDurationMs > 0 
        ? ((result.timeSavedMs / (result.totalDurationMs + result.timeSavedMs)) * 100).toFixed(0)
        : '0';
      
      this.emitEvent({
        type: 'agent-status',
        sessionId: session.state.id,
        status: 'executing',
        message: `Parallel execution saved ${timeSavedSeconds}s (${percentageSaved}% faster)`,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Execute a single tool and return the result
   */
  private async executeToolAndGetResult(
    session: InternalSession,
    tool: ToolCallPayload,
    runId: string
  ): Promise<EnhancedToolResult> {
    const startTime = Date.now();

    try {
      await this.executeTool(session, tool, runId);

      // Find the tool result message we just pushed (search from end for O(1) best case)
      const toolMessage = session.state.messages.findLast(
        m => m.role === 'tool' && m.toolCallId === tool.callId
      );

      return {
        toolName: tool.name,
        success: toolMessage?.toolSuccess ?? true,
        output: toolMessage?.content ?? '',
        timing: {
          startedAt: startTime,
          completedAt: Date.now(),
          durationMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        toolName: tool.name,
        success: false,
        output: error instanceof Error ? error.message : String(error),
        timing: {
          startedAt: startTime,
          completedAt: Date.now(),
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Execute a single tool
   */
  async executeTool(session: InternalSession, tool: ToolCallPayload, runId: string): Promise<void> {
    const controller = this.activeControllers.get(session.state.id);
    const signal = controller?.signal;

    if (signal?.aborted) {
      this.logger.info('Tool execution skipped - run cancelled', { tool: tool.name, sessionId: session.state.id });
      return;
    }

    if (!tool.name || typeof tool.name !== 'string') {
      this.logger.error('Invalid tool call: missing or invalid tool name', {
        tool,
        sessionId: session.state.id,
        runId
      });

      const errorMessage: ChatMessage = {
        id: randomUUID(),
        role: 'tool',
        content: 'Error: Invalid tool call - missing tool name',
        toolCallId: tool.callId,
        toolName: 'unknown',
        createdAt: Date.now(),
        runId,
      };
      session.state.messages.push(errorMessage);
      this.updateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });
      return;
    }

    // Loop detection — record the tool call BEFORE execution to detect loops early.
    // On failure, we update the same record with failure info instead of double-recording.
    const loopDetector = this._loopDetector!;
    const iteration = session.agenticContext?.iteration || 1;
    const loopResult = loopDetector.recordToolCall(runId, tool, iteration);

    if (loopResult.loopDetected) {
      const healthMonitor = this._healthMonitor!;
      healthMonitor.recordLoopDetected(session.state.id, loopResult.loopType || 'unknown', loopResult.involvedTools);

      this.emitEvent({
        type: 'agent-status',
        sessionId: session.state.id,
        status: 'recovering',
        message: `Loop detected: ${loopResult.description}. ${loopResult.suggestion}`,
        timestamp: Date.now(),
      });

      if (loopDetector.shouldTriggerCircuitBreaker(runId)) {
        this.logger.warn('Circuit breaker triggered due to loop detection', {
          sessionId: session.state.id,
          runId,
          loopType: loopResult.loopType,
        });

        const loopMessage: ChatMessage = {
          id: randomUUID(),
          role: 'tool',
          content: `[WARN] Loop detected: ${loopResult.description}\n\nSuggestion: ${loopResult.suggestion}`,
          toolCallId: tool.callId,
          toolName: tool.name,
          createdAt: Date.now(),
          runId,
          toolSuccess: false,
        };
        session.state.messages.push(loopMessage);
        this.updateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        return;
      }
    }

    this.logger.info('Executing tool', { tool: tool.name, sessionId: session.state.id, runId });
    const toolLabel = tool.name;
    const toolDetail = this.progressTracker.describeToolTarget(tool);
    const progressId = this.progressTracker.startToolProgress(session, runId, tool, toolDetail);

    // Parse tool arguments once (reused below for compliance + execution)
    const toolArgs = tool.arguments && typeof tool.arguments === 'object' ? tool.arguments : {};

    // Log tool execution start with structured logging
    const toolExecutionLogger = this._toolExecLogger!;
    toolExecutionLogger.logStart({
      sessionId: session.state.id,
      runId,
      toolName: tool.name,
      args: toolArgs as Record<string, unknown>,
      iteration: session.agenticContext?.iteration,
    });

    this.emitEvent({
      type: 'agent-status',
      sessionId: session.state.id,
      status: 'executing',
      message: `Executing: ${tool.name}`,
      timestamp: Date.now(),
    });

    // Emit tool-started event BEFORE execution for immediate UI feedback
    // This enables the UI to show the tool as "running" instantly
    this.emitEvent({
      type: 'tool-started',
      sessionId: session.state.id,
      runId,
      timestamp: Date.now(),
      toolCall: tool,
      executionOrder: 1,
      totalInBatch: 1,
    });

    this.emitEvent({
      type: 'tool-call',
      sessionId: session.state.id,
      runId,
      toolCall: tool,
      requiresApproval: false,
      timestamp: Date.now(),
    });

    const startTime = Date.now();

    try {
      // Use session workspace path — never fall back to process.cwd() as it exposes the app's own codebase
      const workspacePath = session.state.workspacePath || '';
      const workspace = { path: workspacePath };

      if (!workspace.path) {
        throw new Error('No active workspace available for tool execution');
      }

      const safetyManager = this.getOrCreateSafetyManager(runId);
      const accessSettings = this.getAccessLevelSettings();

      // Create a tool-specific logger that includes tool context in all log messages
      const toolSpecificLogger = createToolSpecificLogger(
        this.logger,
        tool.name,
        session.state.id,
        runId
      );

      const context: ToolExecutionContext = {
        workspacePath: workspace.path,
        cwd: workspace.path,
        terminalManager: this.terminalManager,
        logger: toolSpecificLogger,
        safetyManager,
        runId,
        sessionId: session.state.id,
        yoloMode: session.state.config.yoloMode,
        allowOutsideWorkspace: accessSettings?.allowOutsideWorkspace ?? false,
        signal,
        emitEvent: this.emitEvent,
      };

      // Compliance validation
      const complianceResult = this.complianceValidator.validateToolCall(runId, tool.name, toolArgs, tool.callId);

      if (!complianceResult.isCompliant) {
        this.logger.warn('Compliance violations detected for tool call', {
          tool: tool.name,
          violations: complianceResult.violations.map(v => ({
            type: v.type,
            severity: v.severity,
            message: v.message,
          })),
        });

        if (complianceResult.shouldBlock) {
          const correctiveMessage: ChatMessage = {
            id: randomUUID(),
            role: 'tool',
            content: complianceResult.correctiveMessage ||
              `Tool call blocked due to compliance violation: ${complianceResult.violations[0]?.message}`,
            toolCallId: tool.callId,
            toolName: tool.name,
            toolSuccess: false,
            createdAt: Date.now(),
            runId,
          };
          session.state.messages.push(correctiveMessage);
          this.progressTracker.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, 'error');

          // Audit log: tool blocked by compliance
          const auditLogger = this._auditLogger!;
          const actor: SecurityActor = { sessionId: session.state.id, runId };
          auditLogger.log('tool_execution', 'tool_blocked', actor, {
            toolName: tool.name,
            reason: 'compliance_violation',
            violations: complianceResult.violations.map(v => v.message),
          }, { severity: 'warning', outcome: 'blocked' });

          this.updateSessionState(session.state.id, {
            messages: session.state.messages,
            updatedAt: Date.now(),
          });
          return;
        }
      }

      // Access level validation
      const toolDef = this.toolRegistry.getDefinition(tool.name);
      const filePath = (toolArgs as Record<string, unknown>).path as string
        ?? (toolArgs as Record<string, unknown>).filePath as string
        ?? (toolArgs as Record<string, unknown>).file as string
        ?? undefined;

      const accessCheck = checkAccessLevelPermission(
        accessSettings,
        tool.name,
        toolDef?.category,
        filePath
      );

      if (!accessCheck.allowed) {
        this.logger.warn('Access level restriction blocked tool call', {
          tool: tool.name,
          category: getAccessLevelCategory(tool.name, toolDef?.category),
          reason: accessCheck.reason,
        });

        const accessDeniedMessage: ChatMessage = {
          id: randomUUID(),
          role: 'tool',
          content: accessSettings?.accessDeniedMessage || accessCheck.reason || 'Access denied',
          toolCallId: tool.callId,
          toolName: tool.name,
          toolSuccess: false,
          createdAt: Date.now(),
          runId,
        };
        session.state.messages.push(accessDeniedMessage);
        this.progressTracker.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, 'error');
        this.updateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        return;
      }

      const result = await this.toolRegistry.execute(tool.name, toolArgs, context);
      const duration = Date.now() - startTime;

      // Check if result was from cache
      const fromCache = result.metadata?.fromCache === true;
      const tokensSaved = result.metadata?.estimatedTokensSaved as number | undefined;

      // Apply intelligent output truncation if output exceeds token limit
      const outputTruncator = this._outputTruncator!;
      const truncationResult = outputTruncator.truncate(result.output, tool.name);
      
      // Log truncation if it occurred
      if (truncationResult.wasTruncated) {
        this.logger.info('Tool output truncated', {
          tool: tool.name,
          sessionId: session.state.id,
          runId,
          originalTokens: truncationResult.originalTokens,
          finalTokens: truncationResult.finalTokens,
          originalLines: truncationResult.originalLines,
          linesRemoved: truncationResult.linesRemoved,
          summary: truncationResult.summary,
        });
      }

      // Build tool result content, adding recovery suggestions for failures
      let toolResultContent = truncationResult.content;
      
      // Add truncation summary if output was truncated
      if (truncationResult.wasTruncated && truncationResult.summary) {
        toolResultContent += `\n\n[STATS] ${truncationResult.summary}`;
      }
      
      if (!result.success) {
        // Get recovery suggestion with alternative approach if error is repeated
        const errorRecoveryManager = this._errorRecovery!;
        const recoverySuggestion = errorRecoveryManager.analyzeError(
          result.output,
          tool.name,
          session.state.id
        );
        
        // Add recovery suggestion if available
        if (recoverySuggestion.confidence > 0.3) {
          toolResultContent += `\n\n[TIP] Recovery suggestion: ${recoverySuggestion.suggestedAction}`;
          if (recoverySuggestion.suggestedTools.length > 0) {
            toolResultContent += `\n   Suggested tools: ${recoverySuggestion.suggestedTools.join(', ')}`;
          }
          
          // Add alternative approach warning if this is a repeated error
          if (recoverySuggestion.isAlternative) {
            toolResultContent += `\n\n[!] This error has occurred repeatedly. Consider trying a different approach.`;
          }
        }
      }

      const toolResultMessage: ChatMessage = {
        id: randomUUID(),
        role: 'tool',
        content: toolResultContent,
        toolCallId: tool.callId,
        toolName: tool.name,
        toolSuccess: result.success,
        resultMetadata: {
          ...result.metadata,
          truncated: truncationResult.wasTruncated,
          truncationInfo: truncationResult.wasTruncated ? {
            originalTokens: truncationResult.originalTokens,
            finalTokens: truncationResult.finalTokens,
            originalLines: truncationResult.originalLines,
            linesRemoved: truncationResult.linesRemoved,
          } : undefined,
        },
        createdAt: Date.now(),
        runId,
      };
      session.state.messages.push(toolResultMessage);

      // Track tool success/error for context-aware tool selection
      if (result.success) {
        recordToolSuccess(session.state.id, tool.name);
      } else {
        recordToolError(session.state.id, tool.name, result.output.slice(0, 500));
      }

      // Audit log: tool execution result
      {
        const auditLogger = this._auditLogger!;
        const actor: SecurityActor = { sessionId: session.state.id, runId };
        auditLogger.log('tool_execution', result.success ? 'tool_success' : 'tool_failure', actor, {
          toolName: tool.name,
          duration,
          fromCache,
          truncated: truncationResult.wasTruncated,
        }, {
          severity: result.success ? 'info' : 'warning',
          outcome: result.success ? 'success' : 'failure',
          duration,
        });
      }

      // Update the last recorded pattern's success status.
      // The tool call was already recorded before execution for early loop detection.
      // Instead of re-recording (which would inflate pattern counts), we update
      // the last pattern entry and consecutiveFailures counters directly.
      if (!result.success) {
        const failureReason = result.output.includes('identical') ? 'identical' : undefined;
        const state = loopDetector.getState(runId);
        if (state && state.patterns.length > 0) {
          // Update the last recorded pattern with actual result
          const lastPattern = state.patterns[state.patterns.length - 1];
          lastPattern.success = false;
          // Update consecutive failure tracking
          state.consecutiveFailures++;
          if (failureReason?.includes('identical')) {
            const isEditTool = ['write_to_file', 'replace_in_file', 'edit_file', 'apply_diff', 'insert_code_block'].includes(tool.name.toLowerCase());
            if (isEditTool) {
              state.consecutiveIdenticalEditFailures++;
            }
          }
        }
      }

      if (session.agenticContext) {
        session.agenticContext.toolCallCount++;
        if (result.fileChanges) {
          for (const change of result.fileChanges) {
            if (change.action === 'read') {
              session.agenticContext.filesRead.push(change.path);
            } else {
              session.agenticContext.filesModified.push(change.path);
            }
          }
        }
      }

      this.emitEvent({
        type: 'tool-result',
        sessionId: session.state.id,
        runId,
        result: {
          toolName: tool.name,
          success: result.success,
          output: result.output,
          metadata: result.metadata,
        },
        toolCallId: tool.callId,
        timestamp: Date.now(),
      });

      // Log tool completion with structured logging
      toolExecutionLogger.logComplete(
        {
          sessionId: session.state.id,
          runId,
          toolName: tool.name,
          args: toolArgs as Record<string, unknown>,
          iteration: session.agenticContext?.iteration,
        },
        {
          success: result.success,
          output: result.output,
          metadata: result.metadata,
        },
        duration
      );

      // Log cache event if applicable
      if (fromCache) {
        toolExecutionLogger.logCacheEvent(tool.name, true, tokensSaved);
        this.logger.debug('Tool result served from cache', {
          tool: tool.name,
          duration,
          tokensSaved,
          cacheStats: this._toolResultCache!.getStats(),
        });
      } else {
        toolExecutionLogger.logCacheEvent(tool.name, false);
        this.logger.debug(result.success ? 'Tool executed successfully' : 'Tool executed with failure', {
          tool: tool.name,
          duration,
          success: result.success,
        });
      }

      agentMetrics.recordToolExecution(runId, result.success, false, tool.name);

      // Record tool usage for discovery/recommendation tracking
      try {
        getToolUsageTracker().recordUsage(
          tool.name,
          result.success,
          duration,
          session.state.id,
          session.state.workspacePath || undefined
        );
      } catch {
        // Non-critical: usage tracking should not block tool execution
      }

      this.progressTracker.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, result.success ? 'success' : 'error');
      this.updateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Track error for context-aware tool selection
      recordToolError(session.state.id, tool.name, errorMsg);

      // Get recovery suggestion (reuse for both error content and logging)
      const errorRecoveryManager = this._errorRecovery!;
      const recoverySuggestion = errorRecoveryManager.analyzeError(
        errorMsg,
        tool.name,
        session.state.id
      );

      // Log tool error with structured logging including recovery suggestions
      const toolExecutionLoggerForError = this._toolExecLogger!;
      toolExecutionLoggerForError.logError(
        {
          sessionId: session.state.id,
          runId,
          toolName: tool.name,
          args: toolArgs as Record<string, unknown>,
          iteration: session.agenticContext?.iteration,
        },
        error instanceof Error ? error : new Error(errorMsg),
        duration,
        recoverySuggestion.confidence > 0.3 ? recoverySuggestion : undefined
      );

      this.logger.error('Tool execution failed', {
        tool: tool.name,
        error: errorMsg,
        duration,
      });

      agentMetrics.recordToolExecution(runId, false, false, tool.name);
      this.progressTracker.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, 'error');

      // Build error message with recovery suggestion
      let errorContent = `Error: ${errorMsg}`;
      
      // Add recovery suggestion if available
      if (recoverySuggestion.confidence > 0.3) {
        errorContent += `\n\n[TIP] Recovery suggestion: ${recoverySuggestion.suggestedAction}`;
        if (recoverySuggestion.suggestedTools.length > 0) {
          errorContent += `\n   Suggested tools: ${recoverySuggestion.suggestedTools.join(', ')}`;
        }
        
        // Add alternative approach warning if this is a repeated error
        if (recoverySuggestion.isAlternative) {
          errorContent += `\n\n[!] This error has occurred repeatedly. Consider trying a different approach.`;
        }
      }

      const errorMessage: ChatMessage = {
        id: randomUUID(),
        role: 'tool',
        content: errorContent,
        toolCallId: tool.callId,
        toolName: tool.name,
        toolSuccess: false,
        createdAt: Date.now(),
        runId,
      };
      session.state.messages.push(errorMessage);

      this.emitEvent({
        type: 'tool-result',
        sessionId: session.state.id,
        runId,
        result: {
          toolName: tool.name,
          success: false,
          output: `Error: ${errorMsg}`,
          metadata: undefined,
        },
        toolCallId: tool.callId,
        timestamp: Date.now(),
      });

      this.updateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Get or create a SafetyManager for a run
   * Automatically applies user's SafetySettings
   */
  getOrCreateSafetyManager(runId: string): SafetyManager {
    let manager = this.safetyManagers.get(runId);
    if (!manager) {
      manager = new SafetyManager();
      // Apply user's safety settings
      const safetySettings = this.getSafetySettings();
      if (safetySettings) {
        manager.updateUserSettings(safetySettings);
      }
      this.safetyManagers.set(runId, manager);
    }
    return manager;
  }

  /**
   * Clean up safety manager for a run
   */
  cleanupSafetyManager(runId: string): void {
    this.safetyManagers.delete(runId);
  }

  /**
   * Mark a tool as aborted
   */
  markToolAborted(session: InternalSession, runId: string, tool: ToolCallPayload): void {
    this.progressTracker.markToolAborted(session, runId, tool);
  }

  /**
   * Emit tool-queued event to notify UI about pending tools
   * This enables showing users what tools are waiting to be executed
   */
  private emitToolQueuedEvent(sessionId: string, runId: string, tools: ToolCallPayload[]): void {
    if (!tools || tools.length === 0) return;

    this.emitEvent({
      type: 'tool-queued',
      sessionId,
      runId,
      timestamp: Date.now(),
      tools: tools.map((tool, index) => ({
        callId: tool.callId,
        name: tool.name,
        arguments: tool.arguments as Record<string, unknown> | undefined,
        queuePosition: index + 1,
      })),
      totalQueued: tools.length,
    });
  }
}
