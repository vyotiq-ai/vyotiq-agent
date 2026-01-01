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
} from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { ToolRegistry, TerminalManager, ToolExecutionContext } from '../../tools';
import type { WorkspaceManager } from '../../workspaces/workspaceManager';
import type { ProgressTracker } from './progressTracker';
import type { DebugEmitter } from './debugEmitter';
import type { AnnotatedToolCall } from './types';
import { SafetyManager } from '../safety';
import { ComplianceValidator } from '../compliance';
import { getAccessLevelCategory, checkAccessLevelPermission } from '../utils/accessLevelUtils';
import { getLoopDetector } from '../loopDetection';
import { getSessionHealthMonitor } from '../sessionHealth';
import { agentMetrics } from '../metrics';
import { executeToolsParallel, canBenefitFromParallel, DEFAULT_PARALLEL_CONFIG } from '../../tools/executor';
import type { EnhancedToolResult } from '../../tools/types';

export class ToolQueueProcessor {
  private readonly toolRegistry: ToolRegistry;
  private readonly terminalManager: TerminalManager;
  private readonly workspaceManager: WorkspaceManager;
  private readonly logger: Logger;
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly progressTracker: ProgressTracker;
  private readonly debugEmitter: DebugEmitter;
  private readonly complianceValidator: ComplianceValidator;
  private readonly updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void;
  private readonly getAccessLevelSettings: () => AccessLevelSettings | undefined;
  private readonly activeControllers: Map<string, AbortController>;
  private readonly safetyManagers = new Map<string, SafetyManager>();

  constructor(
    toolRegistry: ToolRegistry,
    terminalManager: TerminalManager,
    workspaceManager: WorkspaceManager,
    logger: Logger,
    emitEvent: (event: RendererEvent | AgentEvent) => void,
    progressTracker: ProgressTracker,
    debugEmitter: DebugEmitter,
    complianceValidator: ComplianceValidator,
    updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void,
    getAccessLevelSettings: () => AccessLevelSettings | undefined,
    activeControllers: Map<string, AbortController>
  ) {
    this.toolRegistry = toolRegistry;
    this.terminalManager = terminalManager;
    this.workspaceManager = workspaceManager;
    this.logger = logger;
    this.emitEvent = emitEvent;
    this.progressTracker = progressTracker;
    this.debugEmitter = debugEmitter;
    this.complianceValidator = complianceValidator;
    this.updateSessionState = updateSessionState;
    this.getAccessLevelSettings = getAccessLevelSettings;
    this.activeControllers = activeControllers;
  }

  /**
   * Process the tool queue for a session
   */
  async processToolQueue(session: InternalSession): Promise<'completed' | 'tool-continue' | 'awaiting-confirmation'> {
    const runId = session.state.activeRunId;
    if (!runId) {
      this.logger.warn('No active run for tool queue processing', { sessionId: session.state.id });
      return 'completed';
    }

    const controller = this.activeControllers.get(session.state.id);

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

      while (session.toolQueue.length > 0) {
        const tool = session.toolQueue[0];
        const toolRequiresApproval = this.toolRegistry.requiresApproval(tool.name);
        const requiresApproval = !session.state.config.yoloMode && toolRequiresApproval;

        if (requiresApproval) {
          toolsNeedingApproval.push(session.toolQueue.shift()!);
          break;
        }

        executableTools.push(session.toolQueue.shift()!);
      }

      if (toolsNeedingApproval.length > 0) {
        const tool = toolsNeedingApproval[0];
        const progressId = this.ensureToolProgressId(tool);

        this.progressTracker.emitRunProgressItem(session, runId, {
          id: progressId,
          type: 'tool-call',
          label: tool.name,
          detail: this.describeToolTarget(tool),
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

    this.logger.info('Starting parallel tool execution', {
      sessionId: session.state.id,
      runId,
      toolCount: tools.length,
      tools: tools.map(t => t.name),
    });

    for (const tool of tools) {
      const progressId = this.ensureToolProgressId(tool);
      this.progressTracker.emitRunProgressItem(session, runId, {
        id: progressId,
        type: 'tool-call',
        label: tool.name,
        detail: this.describeToolTarget(tool),
        status: 'running',
        timestamp: Date.now(),
        metadata: { callId: tool.callId, parallel: true },
      });
    }

    const result = await executeToolsParallel(
      tools,
      async (tool) => {
        const toolResult = await this.executeToolAndGetResult(session, tool, runId);
        return toolResult;
      },
      DEFAULT_PARALLEL_CONFIG,
      signal
    );

    const duration = Date.now() - startTime;

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

    if (result.wasParallel && result.timeSavedMs > 0) {
      this.emitEvent({
        type: 'agent-status',
        sessionId: session.state.id,
        status: 'executing',
        message: `Parallel execution saved ${Math.round(result.timeSavedMs / 1000)}s`,
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

      const toolMessage = session.state.messages
        .filter(m => m.role === 'tool' && m.toolCallId === tool.callId)
        .pop();

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

    // Loop detection
    const loopDetector = getLoopDetector();
    const iteration = session.agenticContext?.iteration || 1;
    const loopResult = loopDetector.recordToolCall(runId, tool, iteration);

    if (loopResult.loopDetected) {
      const healthMonitor = getSessionHealthMonitor();
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
          content: `⚠️ Loop detected: ${loopResult.description}\n\nSuggestion: ${loopResult.suggestion}`,
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
    const toolDetail = this.describeToolTarget(tool);
    const progressId = this.progressTracker.startToolProgress(session, runId, tool, toolDetail);

    this.emitEvent({
      type: 'agent-status',
      sessionId: session.state.id,
      status: 'executing',
      message: `Executing: ${tool.name}`,
      timestamp: Date.now(),
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
      const workspace = session.state.workspaceId
        ? this.workspaceManager.list().find(w => w.id === session.state.workspaceId)
        : this.workspaceManager.getActive();

      if (session.state.workspaceId && !workspace) {
        throw new Error(`Session workspace not found: ${session.state.workspaceId}`);
      }

      if (!workspace) {
        throw new Error('No active workspace available for tool execution');
      }

      const safetyManager = this.getOrCreateSafetyManager(runId);
      const accessSettings = this.getAccessLevelSettings();

      const context: ToolExecutionContext = {
        workspacePath: workspace.path,
        cwd: workspace.path,
        terminalManager: this.terminalManager,
        logger: {
          info: (msg: string, meta?: Record<string, unknown>) => this.logger.info(`[tool] ${msg}`, meta),
          warn: (msg: string, meta?: Record<string, unknown>) => this.logger.warn(`[tool] ${msg}`, meta),
          error: (msg: string, meta?: Record<string, unknown>) => this.logger.error(`[tool] ${msg}`, meta),
        },
        safetyManager,
        runId,
        sessionId: session.state.id,
        yoloMode: session.state.config.yoloMode,
        allowOutsideWorkspace: accessSettings?.allowOutsideWorkspace ?? false,
        signal,
      };

      const args = tool.arguments && typeof tool.arguments === 'object' ? tool.arguments : {};

      // Compliance validation
      const complianceResult = this.complianceValidator.validateToolCall(runId, tool.name, args, tool.callId);

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
          this.updateSessionState(session.state.id, {
            messages: session.state.messages,
            updatedAt: Date.now(),
          });
          return;
        }
      }

      // Access level validation
      const toolDef = this.toolRegistry.getDefinition(tool.name);
      const filePath = (args as Record<string, unknown>).path as string
        ?? (args as Record<string, unknown>).filePath as string
        ?? (args as Record<string, unknown>).file as string
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

      const result = await this.toolRegistry.execute(tool.name, args, context);
      const duration = Date.now() - startTime;

      const toolResultMessage: ChatMessage = {
        id: randomUUID(),
        role: 'tool',
        content: result.output,
        toolCallId: tool.callId,
        toolName: tool.name,
        toolSuccess: result.success,
        resultMetadata: result.metadata,
        createdAt: Date.now(),
        runId,
      };
      session.state.messages.push(toolResultMessage);

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

      this.logger.debug(result.success ? 'Tool executed successfully' : 'Tool executed with failure', {
        tool: tool.name,
        duration,
        success: result.success,
      });

      agentMetrics.recordToolExecution(runId, result.success, false, tool.name);
      this.progressTracker.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, result.success ? 'success' : 'error');
      this.updateSessionState(session.state.id, {
        messages: session.state.messages,
        updatedAt: Date.now(),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logger.error('Tool execution failed', {
        tool: tool.name,
        error: errorMsg,
        duration,
      });

      agentMetrics.recordToolExecution(runId, false, false, tool.name);
      this.progressTracker.finishToolProgress(session, runId, progressId, toolLabel, toolDetail, 'error');

      const errorMessage: ChatMessage = {
        id: randomUUID(),
        role: 'tool',
        content: `Error: ${errorMsg}`,
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
   */
  getOrCreateSafetyManager(runId: string): SafetyManager {
    let manager = this.safetyManagers.get(runId);
    if (!manager) {
      manager = new SafetyManager();
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

  private ensureToolProgressId(tool: ToolCallPayload): string {
    const annotated = tool as AnnotatedToolCall;
    if (!annotated.__progressId) {
      annotated.__progressId = tool.callId ? `tool-${tool.callId}` : `tool-${randomUUID()}`;
    }
    return annotated.__progressId;
  }

  private describeToolTarget(tool: ToolCallPayload): string | undefined {
    const args = tool.arguments || {};
    const path = (args.path || args.filePath) as string | undefined;
    const command = args.command as string | undefined;
    const query = (args.pattern || args.query) as string | undefined;
    return path || command || query;
  }
}
