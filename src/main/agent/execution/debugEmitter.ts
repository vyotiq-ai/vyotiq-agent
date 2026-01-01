/**
 * Debug Emitter
 * Handles debug event emission for agent tracing and debugging
 */

import type {
  AgentEvent,
  RendererEvent,
  LLMProviderName,
  DebugLLMCallEvent,
  DebugToolCallEvent,
  DebugToolResultEvent,
  DebugErrorEvent,
  DebugTraceStartEvent,
  DebugTraceCompleteEvent,
} from '../../../shared/types';
import type { AgentDebugger, AgentTrace } from '../debugging';

export class DebugEmitter {
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly debugger: AgentDebugger;
  private debugEnabled: boolean;

  constructor(
    emitEvent: (event: RendererEvent | AgentEvent) => void,
    debugger_: AgentDebugger,
    debugEnabled: boolean
  ) {
    this.emitEvent = emitEvent;
    this.debugger = debugger_;
    this.debugEnabled = debugEnabled;
  }

  /**
   * Toggle debug mode
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Check if debug is enabled
   */
  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * Emit debug trace start event
   */
  emitTraceStart(trace: AgentTrace, sessionId: string, runId: string): void {
    if (!this.debugEnabled) return;

    const event: DebugTraceStartEvent = {
      type: 'debug:trace-start',
      traceId: trace.traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
    };
    this.emitEvent(event);
  }

  /**
   * Emit debug trace complete event
   */
  emitTraceComplete(
    trace: AgentTrace,
    sessionId: string,
    runId: string,
    status: 'completed' | 'failed'
  ): void {
    if (!this.debugEnabled) return;

    const event: DebugTraceCompleteEvent = {
      type: 'debug:trace-complete',
      traceId: trace.traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      status,
      durationMs: trace.durationMs ?? 0,
      metrics: {
        totalSteps: trace.metrics.totalSteps,
        llmCalls: trace.metrics.llmCalls,
        toolCalls: trace.metrics.toolCalls,
        successfulToolCalls: trace.metrics.successfulToolCalls,
        failedToolCalls: trace.metrics.failedToolCalls,
        totalInputTokens: trace.metrics.totalInputTokens,
        totalOutputTokens: trace.metrics.totalOutputTokens,
        avgLLMDurationMs: trace.metrics.avgLLMDurationMs,
        avgToolDurationMs: trace.metrics.avgToolDurationMs,
        toolUsage: trace.metrics.toolUsage,
      },
    };
    this.emitEvent(event);
  }

  /**
   * Emit debug LLM call event
   */
  emitLLMCall(
    traceId: string,
    sessionId: string,
    runId: string,
    stepNumber: number,
    provider: LLMProviderName,
    model: string,
    promptTokens: number,
    outputTokens: number,
    durationMs: number,
    messageCount: number,
    toolCount: number,
    finishReason: string | undefined,
    hasToolCalls: boolean,
    contentPreview: string
  ): void {
    if (!this.debugEnabled) return;

    // Record in the debugger trace for metrics tracking
    this.debugger.recordLLMCall(
      traceId,
      {
        provider,
        model,
        messageCount,
        toolCount,
        promptTokens,
        systemPromptHash: '',
      },
      {
        outputTokens,
        hasToolCalls,
        finishReason: finishReason || 'unknown',
        contentPreview: contentPreview.slice(0, 200),
      },
      durationMs
    );

    const event: DebugLLMCallEvent = {
      type: 'debug:llm-call',
      traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      stepNumber,
      provider,
      model,
      promptTokens,
      outputTokens,
      durationMs,
      messageCount,
      toolCount,
      finishReason,
      hasToolCalls,
      contentPreview: contentPreview.slice(0, 200),
    };
    this.emitEvent(event);
  }

  /**
   * Emit debug tool call event
   */
  emitToolCall(
    traceId: string,
    sessionId: string,
    runId: string,
    stepNumber: number,
    toolName: string,
    callId: string,
    argumentsPreview: string,
    requiresApproval: boolean
  ): void {
    if (!this.debugEnabled) return;

    // Record in the debugger trace for metrics tracking
    this.debugger.recordToolCall(traceId, {
      name: toolName,
      callId,
      arguments: {},
      argumentsPreview: argumentsPreview.slice(0, 300),
      requiresApproval,
    });

    const event: DebugToolCallEvent = {
      type: 'debug:tool-call',
      traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      stepNumber,
      toolName,
      callId,
      argumentsPreview: argumentsPreview.slice(0, 300),
      requiresApproval,
    };
    this.emitEvent(event);
  }

  /**
   * Emit debug tool result event
   */
  emitToolResult(
    traceId: string,
    sessionId: string,
    runId: string,
    stepNumber: number,
    toolName: string,
    callId: string,
    success: boolean,
    durationMs: number,
    outputPreview: string,
    outputSize: number,
    errorMessage?: string
  ): void {
    if (!this.debugEnabled) return;

    // Find the matching tool call step ID to associate the result
    const trace = this.debugger.getTrace(traceId);
    const toolCallStep = trace?.steps.find(
      s => s.type === 'tool-call' && s.toolCall?.callId === callId
    );

    // Record in the debugger trace for metrics tracking
    this.debugger.recordToolResult(
      traceId,
      toolCallStep?.stepId || '',
      {
        success,
        outputPreview: outputPreview.slice(0, 500),
        outputSize,
        errorMessage,
      },
      durationMs
    );

    const event: DebugToolResultEvent = {
      type: 'debug:tool-result',
      traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      stepNumber,
      toolName,
      callId,
      success,
      durationMs,
      outputPreview: outputPreview.slice(0, 300),
      outputSize,
      errorMessage,
    };
    this.emitEvent(event);
  }

  /**
   * Emit debug error event
   */
  emitError(traceId: string, sessionId: string, runId: string, error: Error): void {
    if (!this.debugEnabled) return;

    const activeTrace = this.debugger.getTrace(traceId);
    const event: DebugErrorEvent = {
      type: 'debug:error',
      traceId,
      sessionId,
      runId,
      timestamp: Date.now(),
      stepNumber: activeTrace?.metrics.totalSteps ?? 0,
      message: error.message,
      stack: error.stack,
      recovered: false,
    };
    this.emitEvent(event);
  }
}
