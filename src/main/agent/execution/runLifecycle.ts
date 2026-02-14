/**
 * Run Lifecycle Manager
 * Handles run completion, error handling, and cleanup
 */

import type { RendererEvent, AgentEvent } from '../../../shared/types';
import type { InternalSession, AgenticContext } from '../types';
import type { Logger } from '../../logger';
import type { ProgressTracker } from './progressTracker';
import type { DebugEmitter } from './debugEmitter';
import type { AgentDebugger } from '../debugging';
import { handleIncompleteToolCalls as handleIncompleteToolCallsUtil } from '../utils/messageUtils';

export class RunLifecycleManager {
  private readonly logger: Logger;
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly progressTracker: ProgressTracker;
  private readonly debugEmitter: DebugEmitter;
  private readonly debugger: AgentDebugger;
  private readonly updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void;

  constructor(
    logger: Logger,
    emitEvent: (event: RendererEvent | AgentEvent) => void,
    progressTracker: ProgressTracker,
    debugEmitter: DebugEmitter,
    debugger_: AgentDebugger,
    updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void
  ) {
    this.logger = logger;
    this.emitEvent = emitEvent;
    this.progressTracker = progressTracker;
    this.debugEmitter = debugEmitter;
    this.debugger = debugger_;
    this.updateSessionState = updateSessionState;
  }

  /**
   * Create a new agentic context for a run
   */
  createAgenticContext(runId: string): AgenticContext {
    return {
      runId,
      startedAt: Date.now(),
      iteration: 0,
      toolCallCount: 0,
      filesModified: [],
      filesRead: [],
      commandsExecuted: [],
      currentProvider: undefined,
    };
  }

  /**
   * Handle incomplete tool calls at end of run
   */
  handleIncompleteToolCalls(session: InternalSession): void {
    const addedCount = handleIncompleteToolCallsUtil(session.state.messages);
    if (addedCount > 0) {
      this.logger.info('Added placeholder responses for incomplete tool calls', {
        sessionId: session.state.id,
        addedCount,
      });
    }
  }

  /**
   * Handle max iterations reached
   */
  handleMaxIterationsReached(
    session: InternalSession,
    runId: string,
    maxIterations: number
  ): void {
    this.logger.warn('Max iterations reached', {
      sessionId: session.state.id,
      runId,
      maxIterations,
    });

    // Handle incomplete tool calls
    this.handleIncompleteToolCalls(session);

    // Check task state
    const lastMessage = session.state.messages[session.state.messages.length - 1];
    const endedMidTask = lastMessage?.role === 'tool';

    const lastAssistant = [...session.state.messages].reverse().find(m => m.role === 'assistant');
    const hasPendingTools = lastAssistant?.toolCalls && lastAssistant.toolCalls.length > 0 &&
      !session.state.messages.slice(
        session.state.messages.indexOf(lastAssistant) + 1
      ).some(m => m.role === 'tool');

    // Build error message
    let errorMessage = `Maximum iterations (${maxIterations}) reached. The agent stopped to prevent an infinite loop.`;
    if (endedMidTask) {
      errorMessage += ' The task was interrupted while a tool operation was in progress.';
    }
    if (hasPendingTools) {
      errorMessage += ' Some tool calls were not executed due to the iteration limit.';
    }
    errorMessage += ' You may continue the conversation to complete the task, or adjust the max iterations setting.';

    // Update session state
    this.updateSessionState(session.state.id, {
      messages: session.state.messages,
      updatedAt: Date.now(),
    });

    this.emitEvent({
      type: 'agent-status',
      sessionId: session.state.id,
      status: 'error',
      message: errorMessage,
      timestamp: Date.now(),
    });
  }
}
