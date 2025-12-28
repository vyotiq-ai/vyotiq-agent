import type {
  ConfirmToolPayload,
  RendererEvent,
  AgentEvent,
  ChatMessage,
} from '../../shared/types';
import type { Logger } from '../logger';
import type { SessionManager } from './sessionManager';
import type { RunExecutor } from './runExecutor';
import type { InternalSession } from './types';
import { randomUUID } from 'node:crypto';

/**
 * Handles tool confirmation logic - user approval/denial/feedback of tool execution
 * Decoupled from main orchestrator for better testability and clarity
 */
export class ToolConfirmationHandler {
  constructor(
    private sessionManager: SessionManager,
    private runExecutor: RunExecutor,
    private logger: Logger,
    private emitEvent: (event: RendererEvent | AgentEvent) => void,
  ) {}

  async confirmTool(payload: ConfirmToolPayload): Promise<void> {
    const session = this.sessionManager.getSession(payload.sessionId);
    
    // Enhanced validation: Check session exists
    if (!session) {
      this.logger.debug('confirmTool: Session not found', { 
        sessionId: payload.sessionId 
      });
      return;
    }
    
    // Check if there's a pending tool to confirm
    if (!session.pendingTool) {
      // This is not necessarily an error - can happen in these scenarios:
      // 1. User clicked approve/deny multiple times
      // 2. Run was cancelled or timed out before user responded  
      // 3. Race condition where tool was already processed
      const isExpectedNoOp = session.state.status === 'idle' || 
                            session.state.status === 'running' ||
                            session.state.status === 'error';
      
      if (isExpectedNoOp) {
        this.logger.debug('confirmTool: No pending tool (already processed or run ended)', { 
          sessionId: payload.sessionId,
          currentStatus: session.state.status,
          runId: payload.runId,
        });
      } else {
        this.logger.warn('confirmTool: No pending tool in unexpected state', { 
          sessionId: payload.sessionId,
          currentStatus: session.state.status,
          runId: payload.runId,
        });
      }
      return;
    }

    // Validate that the runId matches - prevents stale confirmations from old runs
    if (session.pendingTool.runId !== payload.runId) {
      this.logger.debug('confirmTool: RunId mismatch - confirmation is for a different run', {
        sessionId: payload.sessionId,
        expectedRunId: session.pendingTool.runId,
        receivedRunId: payload.runId,
      });
      return;
    }

    const pending = session.pendingTool;

    // Handle feedback action - user wants to suggest an alternative
    if (payload.action === 'feedback' && payload.feedback) {
      await this.handleFeedback(session, pending, payload);
      return;
    }

    if (!payload.approved) {
      await this.rejectTool(session, pending, payload);
      return;
    }

    await this.approveTool(session, pending, payload);
  }

  /**
   * Handle user feedback - inject feedback into conversation and continue with LLM
   */
  private async handleFeedback(
    session: InternalSession,
    pending: InternalSession['pendingTool'],
    payload: ConfirmToolPayload,
  ): Promise<void> {
    if (!pending || !payload.feedback) return;
    
    this.logger.info('User provided feedback for tool', { 
      tool: pending.tool.name,
      sessionId: payload.sessionId,
      feedbackLength: payload.feedback.length,
    });

    // Mark the tool as skipped with user feedback
    this.runExecutor.markToolAborted(session, pending.runId, pending.tool);
    
    // Clear pending tool and queue
    session.pendingTool = undefined;
    session.toolQueue = undefined;
    
    // Create a tool result message indicating the user provided alternative instructions
    const toolResultMessage: ChatMessage = {
      id: randomUUID(),
      role: 'tool',
      content: `[Tool execution skipped by user]\n\nThe user declined to execute "${pending.tool.name}" and provided the following instructions instead:\n\n${payload.feedback}`,
      toolCallId: pending.tool.callId,
      toolName: pending.tool.name,
      createdAt: Date.now(),
      runId: pending.runId,
    };
    
    session.state.messages.push(toolResultMessage);
    
    // Update session state
    session.state.status = 'running';
    session.state.activeRunId = pending.runId;
    
    this.sessionManager.updateSessionState(session.state.id, {
      messages: session.state.messages,
      status: session.state.status,
      activeRunId: session.state.activeRunId,
      updatedAt: Date.now(),
    });
    
    this.emitEvent({ type: 'session-state', session: session.state });
    this.emitEvent({
      type: 'run-status',
      sessionId: session.state.id,
      runId: pending.runId,
      status: 'running',
      timestamp: Date.now(),
    });
    
    // Continue the run - the LLM will see the feedback and adjust its approach
    try {
      await this.runExecutor.continueAfterToolConfirmation(session);
    } catch (error) {
      this.logger.error('Error continuing run after feedback', {
        sessionId: payload.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      session.state.status = 'error';
      this.sessionManager.updateSessionState(session.state.id, {
        status: session.state.status,
        updatedAt: Date.now(),
      });
      
      this.emitEvent({ type: 'session-state', session: session.state });
      this.emitEvent({
        type: 'run-status',
        sessionId: session.state.id,
        runId: pending.runId,
        status: 'error',
        timestamp: Date.now(),
      });
    }
  }

  private async rejectTool(
    session: InternalSession,
    pending: InternalSession['pendingTool'],
    payload: ConfirmToolPayload,
  ): Promise<void> {
    if (!pending) return;
    
    this.logger.info('Tool execution denied by user', { 
      tool: pending.tool.name,
      sessionId: payload.sessionId 
    });

    this.runExecutor.markToolAborted(session, pending.runId, pending.tool);
    session.pendingTool = undefined;
    session.toolQueue = undefined;
    session.agenticContext = undefined; // Clear agentic context - run is cancelled
    session.state.status = 'idle';
    session.state.activeRunId = undefined;
    
    // Persist the cancelled state
    this.sessionManager.updateSessionState(session.state.id, {
      status: session.state.status,
      activeRunId: session.state.activeRunId,
      updatedAt: Date.now(),
    });
    
    this.emitEvent({
      type: 'run-status',
      sessionId: session.state.id,
      runId: payload.runId,
      status: 'idle',
      timestamp: Date.now(),
    });
    this.emitEvent({ type: 'session-state', session: session.state });
  }


  private async approveTool(
    session: InternalSession,
    pending: InternalSession['pendingTool'],
    payload: ConfirmToolPayload,
  ): Promise<void> {
    if (!pending) return;
    
    this.logger.info('Tool execution approved by user', { 
      tool: pending.tool.name,
      sessionId: payload.sessionId 
    });

    session.pendingTool = undefined;
    
    // Set status to running while executing the tool
    session.state.status = 'running';
    session.state.activeRunId = pending.runId;
    this.emitEvent({ type: 'session-state', session: session.state });
    
    try {
      // Execute the approved tool
      await this.runExecutor.executeTool(session, pending.tool, pending.runId);
      
      // Process any remaining tools in the queue
      const queueResult = await this.runExecutor.processToolQueue(session);
      
      // If queue processing returned awaiting-confirmation, another tool needs approval
      // In that case, we don't continue the run - we wait for another confirmation
      if (queueResult === 'awaiting-confirmation') {
        this.logger.debug('Another tool needs confirmation', {
          sessionId: payload.sessionId,
          runId: pending.runId,
        });
        return;
      }
      
      // Queue is done - continue the run to get next LLM response
      // This is async but we fire and forget since the run will handle its own lifecycle
      this.runExecutor.continueAfterToolConfirmation(session).catch(error => {
        this.logger.error('Error continuing run after tool confirmation', {
          sessionId: payload.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      
    } catch (error) {
      this.logger.error('Error executing confirmed tool', { 
        tool: pending.tool.name,
        sessionId: payload.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      
      session.state.status = 'error';
      this.sessionManager.updateSessionState(session.state.id, {
        status: session.state.status,
        updatedAt: Date.now(),
      });
      
      this.emitEvent({ type: 'session-state', session: session.state });
      this.emitEvent({
        type: 'run-status',
        sessionId: session.state.id,
        runId: pending.runId,
        status: 'error',
        timestamp: Date.now(),
      });
    }
  }
}
