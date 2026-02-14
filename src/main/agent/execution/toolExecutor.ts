/**
 * Tool Executor
 * Handles tool execution, access control, and result processing
 */

import type { ToolCallPayload, RendererEvent, AgentEvent, ChatMessage, SafetySettings } from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { ToolRegistry, TerminalManager, ToolExecutionContext } from '../../tools';
import type { AccessCheckResult } from './types';
import type { ProgressTracker } from './progressTracker';
import type { DebugEmitter } from './debugEmitter';
import { SafetyManager } from '../safety';
import { getAccessLevelCategory, checkAccessLevelPermission } from '../utils/accessLevelUtils';
import { parseToolArguments } from '../../utils';
import { getLoopDetector } from '../loopDetection';
import type { AccessLevelSettings } from '../../../shared/types';
import { randomUUID } from 'node:crypto';

export class ToolExecutor {
  private readonly toolRegistry: ToolRegistry;
  private readonly terminalManager: TerminalManager;
  private readonly logger: Logger;
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly progressTracker: ProgressTracker;
  private readonly debugEmitter: DebugEmitter;
  private readonly getAccessLevelSettings: () => AccessLevelSettings | undefined;
  private readonly getSafetySettings: () => SafetySettings | undefined;
  
  // Safety managers per run
  private readonly safetyManagers = new Map<string, SafetyManager>();

  constructor(
    toolRegistry: ToolRegistry,
    terminalManager: TerminalManager,
    logger: Logger,
    emitEvent: (event: RendererEvent | AgentEvent) => void,
    progressTracker: ProgressTracker,
    debugEmitter: DebugEmitter,
    getAccessLevelSettings: () => AccessLevelSettings | undefined,
    getSafetySettings?: () => SafetySettings | undefined
  ) {
    this.toolRegistry = toolRegistry;
    this.terminalManager = terminalManager;
    this.logger = logger;
    this.emitEvent = emitEvent;
    this.progressTracker = progressTracker;
    this.debugEmitter = debugEmitter;
    this.getAccessLevelSettings = getAccessLevelSettings;
    this.getSafetySettings = getSafetySettings ?? (() => undefined);
  }

  /**
   * Check access level permission for a tool
   */
  checkAccessLevelPermissionForTool(
    toolName: string,
    toolCategory: string | undefined,
    filePath?: string
  ): AccessCheckResult {
    const accessSettings = this.getAccessLevelSettings();
    return checkAccessLevelPermission(accessSettings, toolName, toolCategory, filePath);
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
   * Build tool execution context
   * Uses session workspace path to ensure agent operates within user's workspace,
   * NOT the application's installation directory (process.cwd()).
   */
  buildToolContext(
    session: InternalSession,
    runId: string,
    signal?: AbortSignal
  ): ToolExecutionContext {
    const workspacePath = session.state.workspacePath || '';

    return {
      sessionId: session.state.id,
      runId,
      workspacePath,
      cwd: workspacePath,
      terminalManager: this.terminalManager,
      signal,
      logger: {
        info: (msg, meta) => this.logger.info(msg, meta),
        warn: (msg, meta) => this.logger.warn(msg, meta),
        error: (msg, meta) => this.logger.error(msg, meta),
      },
    };
  }

  /**
   * Get tool implementation by name
   */
  getToolImpl(toolName: string) {
    return this.toolRegistry.list().find(t => t.name === toolName);
  }

  /**
   * Parse tool arguments with schema validation
   */
  parseArguments(
    argsJson: string | undefined,
    toolName: string
  ): Record<string, unknown> {
    return parseToolArguments(argsJson, toolName);
  }

  /**
   * Record tool call in loop detector
   */
  recordToolCallInLoopDetector(
    runId: string,
    tool: ToolCallPayload,
    iteration: number,
    success: boolean = true,
    failureReason?: string
  ): void {
    const loopDetector = getLoopDetector();
    loopDetector.recordToolCall(runId, tool, iteration, success, failureReason);
  }

  /**
   * Add a tool result message to the session
   */
  addToolResultMessage(
    session: InternalSession,
    tool: ToolCallPayload,
    result: string
  ): void {
    const message: ChatMessage = {
      id: randomUUID(),
      role: 'tool',
      content: result,
      toolCallId: tool.callId,
      toolName: tool.name,
      createdAt: Date.now(),
      runId: session.state.activeRunId,
    };
    session.state.messages.push(message);
  }

  /**
   * Mark a tool as aborted
   */
  markToolAborted(session: InternalSession, runId: string, tool: ToolCallPayload): void {
    this.progressTracker.markToolAborted(session, runId, tool);
  }

  /**
   * Get access level category for a tool
   */
  getToolCategory(toolName: string): string | undefined {
    return getAccessLevelCategory(toolName);
  }
}
