/**
 * Iteration Runner
 * Handles individual iteration execution within a run
 */

import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  ToolCallPayload,
  RendererEvent,
  AgentEvent,
  TokenUsage,
  ProviderResponseChunk,
  LLMProviderName,
  RoutingDecision,
} from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { LLMProvider, ProviderRequest } from '../providers/baseProvider';
import type { IterationResult, RetryResult, IterationSettings } from './types';
import type { ProgressTracker } from './progressTracker';
import type { DebugEmitter } from './debugEmitter';
import { createStreamState, trackChunk, detectRepetition } from '../utils/streamUtils';
import { parseToolArguments } from '../../utils';
import {
  isContextOverflowError,
  isRateLimitError,
  isMaxOutputTokensError,
  isTransientError,
  isNetworkError,
  extractRetryAfter,
} from '../utils/errorUtils';
import { agentMetrics } from '../metrics';
import type { ProviderHealthCallback } from './types';

export class IterationRunner {
  private readonly logger: Logger;
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly progressTracker: ProgressTracker;
  private readonly debugEmitter: DebugEmitter;
  private readonly updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void;
  private readonly getProviderHealthCallback?: () => ProviderHealthCallback | undefined;

  constructor(
    logger: Logger,
    emitEvent: (event: RendererEvent | AgentEvent) => void,
    progressTracker: ProgressTracker,
    debugEmitter: DebugEmitter,
    updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void,
    getProviderHealthCallback?: () => ProviderHealthCallback | undefined
  ) {
    this.logger = logger;
    this.emitEvent = emitEvent;
    this.progressTracker = progressTracker;
    this.debugEmitter = debugEmitter;
    this.updateSessionState = updateSessionState;
    this.getProviderHealthCallback = getProviderHealthCallback;
  }

  /**
   * Run a single iteration
   */
  async runIteration(
    session: InternalSession,
    provider: LLMProvider,
    controller: AbortController,
    runId: string,
    iteration: number,
    buildProviderRequest: () => Promise<ProviderRequest>,
    processToolQueue: () => Promise<'completed' | 'tool-continue' | 'awaiting-confirmation'>,
    getEffectiveModelId: (session: InternalSession, provider: LLMProvider, runId?: string, routingDecision?: RoutingDecision) => string | undefined
  ): Promise<IterationResult> {
    if (controller.signal.aborted) {
      return 'cancelled';
    }

    // Track iteration timing using progressTracker
    const iterationStartTime = this.progressTracker.getIterationStartTime(runId, iteration);
    if (iterationStartTime) {
      this.logger.debug('Iteration already tracked', { runId, iteration, startTime: iterationStartTime });
    }

    if (session.agenticContext) {
      session.agenticContext.currentProvider = provider.name;
    }

    const modelId = getEffectiveModelId(session, provider, runId, session.agenticContext?.routingDecision);

    // Determine if this message was auto-routed (provider=auto with intelligent routing)
    const isAutoRouted = session.state.config.preferredProvider === 'auto' && !!session.agenticContext?.routingDecision;

    let assistantMessage: ChatMessage;

    const existingRunMessage = session.state.messages.find(
      (m) => m.role === 'assistant' && m.runId === runId && (!m.toolCalls || m.toolCalls.length === 0)
    );

    if (existingRunMessage && iteration > 1) {
      assistantMessage = existingRunMessage;
      if (assistantMessage.content && assistantMessage.content.trim()) {
        assistantMessage.content += '\n\n';
      }
      if (modelId) {
        assistantMessage.modelId = modelId;
      }
      assistantMessage.isAutoRouted = isAutoRouted;
    } else {
      assistantMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        provider: provider.name,
        modelId,
        runId,
        thinking: undefined,
        isAutoRouted,
      };
    }

    const toolCalls: ToolCallPayload[] = [];
    let initialSessionStateSent = false;
    let isReceivingThinking = false;
    const streamState = createStreamState();
    let streamedContentLength = 0;

    const onStreamOutput = (chunk: string, isThinking = false, storeAsReasoningContent = false) => {
      if (typeof chunk !== 'string') return;
      if (streamState.repetitionDetected) return;

      if (!isThinking) {
        trackChunk(streamState, chunk);
      }

      const contentBeforeAppend = assistantMessage.content;
      const thinkingBeforeAppend = assistantMessage.thinking;

      if (isThinking) {
        assistantMessage.thinking = (assistantMessage.thinking || '') + chunk;
        assistantMessage.isThinkingStreaming = true;
        isReceivingThinking = true;

        if (storeAsReasoningContent) {
          assistantMessage.reasoningContent = (assistantMessage.reasoningContent || '') + chunk;
        }
      } else {
        if (isReceivingThinking) {
          assistantMessage.isThinkingStreaming = false;
          isReceivingThinking = false;
        }
        assistantMessage.content = (assistantMessage.content || '') + chunk;
        streamedContentLength += chunk.length;

        if (streamedContentLength > 200) {
          if (detectRepetition(assistantMessage.content || '', streamState)) {
            streamState.repetitionDetected = true;
            this.logger.warn('Repetition detected in LLM output, truncating response', {
              sessionId: session.state.id,
              runId,
              contentLength: streamedContentLength,
            });
            assistantMessage.content += '\n\n[Response truncated due to repetitive content. Please try rephrasing your request.]';
          }
        }
      }

      if (!session.state.messages.includes(assistantMessage)) {
        session.state.messages.push(assistantMessage);
      }

      if (!initialSessionStateSent) {
        initialSessionStateSent = true;

        // Emit session state with the assistant message's content before this chunk.
        // OPTIMIZATION: Instead of mapping ALL messages (O(n) allocation), we temporarily
        // patch the assistant message in-place and restore after emit.
        const savedContent = assistantMessage.content;
        const savedThinking = assistantMessage.thinking;
        assistantMessage.content = contentBeforeAppend;
        assistantMessage.thinking = thinkingBeforeAppend;

        this.updateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        this.emitEvent({ type: 'session-state', session: session.state });

        // Restore current content
        assistantMessage.content = savedContent;
        assistantMessage.thinking = savedThinking;
      }

      if (isThinking) {
        this.emitEvent({
          type: 'stream-delta',
          sessionId: session.state.id,
          runId,
          delta: chunk,
          provider: provider.name,
          modelId: assistantMessage.modelId,
          messageId: assistantMessage.id,
          timestamp: Date.now(),
          isThinking: true,
        });
      } else {
        this.emitEvent({
          type: 'stream-delta',
          sessionId: session.state.id,
          runId,
          delta: chunk,
          provider: provider.name,
          modelId: assistantMessage.modelId,
          messageId: assistantMessage.id,
          timestamp: Date.now(),
        });
      }
    };

    const onToolCall = (toolCall: ToolCallPayload) => {
      toolCalls.push(toolCall);
    };

    const onToolCallDelta = (toolCall: NonNullable<ProviderResponseChunk['toolCall']>) => {
      this.emitEvent({
        type: 'stream-delta',
        sessionId: session.state.id,
        runId,
        provider: provider.name,
        modelId: assistantMessage.modelId,
        messageId: assistantMessage.id,
        timestamp: Date.now(),
        toolCall,
      });
    };

    const onMediaOutput = (mediaType: 'image' | 'audio', data: string, mimeType: string) => {
      if (!session.state.messages.includes(assistantMessage)) {
        session.state.messages.push(assistantMessage);
      }

      if (mediaType === 'image') {
        if (!assistantMessage.generatedImages) {
          assistantMessage.generatedImages = [];
        }
        assistantMessage.generatedImages.push({ data, mimeType });
      } else if (mediaType === 'audio') {
        assistantMessage.generatedAudio = { data, mimeType };
      }

      if (!initialSessionStateSent) {
        initialSessionStateSent = true;
        this.updateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        this.emitEvent({ type: 'session-state', session: session.state });
      }

      this.emitEvent({
        type: 'media-output',
        sessionId: session.state.id,
        runId,
        mediaType,
        data,
        mimeType,
        messageId: assistantMessage.id,
        provider: provider.name,
        timestamp: Date.now(),
      });
    };

    const result = await this.runWithRetry(
      provider,
      session,
      controller,
      runId,
      iteration,
      buildProviderRequest,
      onStreamOutput,
      onToolCall,
      onToolCallDelta,
      onMediaOutput,
      (internal) => {
        if (provider.name !== 'openai') return;
        const items = internal.openai?.reasoningItems;
        if (!items || items.length === 0) return;

        const existing = assistantMessage.providerInternal?.openai?.reasoningItems ?? [];
        const byId = new Map<string, Record<string, unknown>>();

        for (const it of existing) {
          const id = typeof (it as { id?: unknown }).id === 'string' ? (it as { id: string }).id : JSON.stringify(it);
          byId.set(id, it);
        }
        for (const it of items) {
          const id = typeof (it as { id?: unknown }).id === 'string' ? (it as { id: string }).id : JSON.stringify(it);
          byId.set(id, it);
        }

        assistantMessage.providerInternal = {
          ...(assistantMessage.providerInternal ?? {}),
          openai: {
            ...(assistantMessage.providerInternal?.openai ?? {}),
            reasoningItems: Array.from(byId.values()),
          },
        };
      }
    );

    if (result.usage && (result.usage.input > 0 || result.usage.output > 0)) {
      assistantMessage.usage = result.usage;
      // Record token usage in agent metrics for aggregate tracking
      agentMetrics.recordTokenUsage(runId, result.usage.input + result.usage.output);
    }

    const hasContent = assistantMessage.content && assistantMessage.content.trim().length > 0;
    const hasToolCalls = toolCalls.length > 0;
    const hasGeneratedMedia = (assistantMessage.generatedImages && assistantMessage.generatedImages.length > 0) ||
      !!assistantMessage.generatedAudio;

    if (hasContent || hasToolCalls || hasGeneratedMedia) {
      assistantMessage.isThinkingStreaming = false;

      if (!session.state.messages.includes(assistantMessage)) {
        session.state.messages.push(assistantMessage);
      }

      if (hasToolCalls) {
        assistantMessage.toolCalls = toolCalls;
        assistantMessage.isThinkingStreaming = false;
      }
    } else {
      const emptyMsgIndex = session.state.messages.indexOf(assistantMessage);
      if (emptyMsgIndex !== -1) {
        session.state.messages.splice(emptyMsgIndex, 1);
      }
    }

    this.updateSessionState(session.state.id, {
      messages: session.state.messages,
      updatedAt: Date.now(),
    });

    this.emitEvent({ type: 'session-state', session: session.state });

    if (result.result === 'completed') {
      return 'completed';
    }

    if (result.result === 'tool-continue' && toolCalls.length > 0) {
      session.toolQueue = [...toolCalls];
      return await processToolQueue();
    }

    return 'completed';
  }

  /**
   * Run with retry logic
   */
  private async runWithRetry(
    provider: LLMProvider,
    session: InternalSession,
    controller: AbortController,
    runId: string,
    iteration: number,
    buildProviderRequest: () => Promise<ProviderRequest>,
    onStreamOutput: (chunk: string, isThinking?: boolean, alsoStoreAsThinking?: boolean) => void,
    onToolCall: (toolCall: ToolCallPayload) => void,
    onToolCallDelta?: (toolCall: NonNullable<ProviderResponseChunk['toolCall']>) => void,
    onMediaOutput?: (mediaType: 'image' | 'audio', data: string, mimeType: string) => void,
    onProviderInternal?: (internal: NonNullable<ProviderResponseChunk['providerInternal']>) => void
  ): Promise<RetryResult> {
    let lastError: Error | null = null;
    let attempt = 0;
    const iterationSettings: IterationSettings = {
      maxIterations: session.state.config.maxIterations ?? 20,
      maxRetries: session.state.config.maxRetries ?? 2,
      retryDelayMs: session.state.config.retryDelayMs ?? 1500,
    };
    const { maxRetries, retryDelayMs } = iterationSettings;

    // Log iteration start using debug emitter for tracing
    if (this.debugEmitter.isDebugEnabled()) {
      this.logger.debug('Starting iteration with retry', {
        provider: provider.name as LLMProviderName,
        sessionId: session.state.id,
        runId,
        iteration,
        maxRetries,
      });
    }

    while (attempt < maxRetries) {
      attempt++;

      if (controller.signal.aborted) {
        return { result: 'completed' };
      }

      const requestStartTime = Date.now();

      try {
        const request = await buildProviderRequest();
        request.signal = controller.signal;

        const toolCalls: ToolCallPayload[] = [];
        const pendingToolCalls = new Map<number, ToolCallPayload>();
        let streamedContent = '';
        let streamedThinking = '';
        let lastThoughtSignature: string | undefined;
        let streamInputTokens = 0;
        let streamOutputTokens = 0;

        const stream = provider.stream(request);

        for await (const chunk of stream) {
          if (controller.signal.aborted) break;

          if (chunk.providerInternal && onProviderInternal) {
            onProviderInternal(chunk.providerInternal);
          }

          if (chunk.thinkingDelta) {
            streamedThinking += chunk.thinkingDelta;
            onStreamOutput(chunk.thinkingDelta, true, chunk.storeAsThinking);
          }

          if (chunk.thoughtSignature) {
            lastThoughtSignature = chunk.thoughtSignature;
          }

          if (chunk.delta) {
            streamedContent += chunk.delta;
            onStreamOutput(chunk.delta, false, chunk.storeAsThinking);

            if (chunk.storeAsThinking) {
              streamedThinking += chunk.delta;
            }
          }

          if (chunk.usage) {
            if (chunk.usage.input > 0) streamInputTokens = chunk.usage.input;
            if (chunk.usage.output > 0) streamOutputTokens = chunk.usage.output;
          }

          if (chunk.image && onMediaOutput) {
            onMediaOutput('image', chunk.image.data, chunk.image.mimeType);
          }

          if (chunk.audio && onMediaOutput) {
            onMediaOutput('audio', chunk.audio.data, chunk.audio.mimeType);
          }

          if (chunk.toolCall) {
            const { index, callId, name, argsJson, argsComplete, thoughtSignature } = chunk.toolCall;

            if (!pendingToolCalls.has(index)) {
              pendingToolCalls.set(index, {
                name: name || '',
                arguments: {},
                callId: callId,
              });
            }

            const pending = pendingToolCalls.get(index)!;

            if (name) pending.name = name;
            if (callId) pending.callId = callId;
            if (argsJson) {
              const pendingWithJson = pending as { _argsJson?: string; _argsIsComplete?: boolean };

              if (argsComplete) {
                pendingWithJson._argsJson = argsJson;
                pendingWithJson._argsIsComplete = true;
              } else {
                const existingJson = pendingWithJson._argsJson || '';
                const wasComplete = pendingWithJson._argsIsComplete;

                if (!wasComplete || !existingJson) {
                  pendingWithJson._argsJson = existingJson + argsJson;
                }
              }
            }
            if (thoughtSignature) {
              pending.thoughtSignature = thoughtSignature;
            }

            if (onToolCallDelta) {
              onToolCallDelta(chunk.toolCall);
            }
          }
        }

        for (const [_toolIndex, pending] of pendingToolCalls) {
          if (pending.name) {
            const pendingWithJson = pending as { _argsJson?: string; _argsIsComplete?: boolean };
            const argsJson = pendingWithJson._argsJson;
            if (argsJson) {
              pending.arguments = parseToolArguments(argsJson, pending.name);
            }
            delete pendingWithJson._argsJson;
            delete pendingWithJson._argsIsComplete;

            if (!pending.callId || pending.callId.trim() === '') {
              pending.callId = `call_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
            }

            toolCalls.push(pending);
            onToolCall(pending);
          }
        }

        // Log streaming metrics for debugging
        if (streamedContent.length > 0 || streamedThinking.length > 0) {
          this.logger.debug('Stream completed', {
            contentLength: streamedContent.length,
            thinkingLength: streamedThinking.length,
            hasThoughtSignature: !!lastThoughtSignature,
            toolCallCount: toolCalls.length,
            inputTokens: streamInputTokens,
            outputTokens: streamOutputTokens,
          });
        }

        // Store thinking content and signature on the assistant message for tool use preservation
        // This is critical for Anthropic extended thinking and Gemini thought signatures
        // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#preserving-thinking-blocks
        if (streamedThinking && lastThoughtSignature) {
          // Store the Anthropic thinking signature for multi-turn tool use
          // Find the message from onStreamOutput callback and update it
          const lastAssistantMsg = session.state.messages.findLast(
            (m) => m.role === 'assistant' && m.runId === runId
          );
          if (lastAssistantMsg) {
            lastAssistantMsg.anthropicThinkingSignature = lastThoughtSignature;
            lastAssistantMsg.thoughtSignature = lastThoughtSignature;
          }
        }

        // Build token usage with proper typing
        const tokenUsage: TokenUsage = {
          input: streamInputTokens,
          output: streamOutputTokens,
          total: streamInputTokens + streamOutputTokens,
        };

        // Track provider health on success
        const latencyMs = Date.now() - requestStartTime;
        const healthCallback = this.getProviderHealthCallback?.();
        if (healthCallback) {
          healthCallback(provider.name as LLMProviderName, true, latencyMs);
        }

        if (toolCalls.length > 0) {
          agentMetrics.recordProviderCall(runId, true, attempt > 1);
          return {
            result: 'tool-continue',
            usage: tokenUsage,
          };
        }

        agentMetrics.recordProviderCall(runId, true, attempt > 1);
        return {
          result: 'completed',
          usage: tokenUsage,
        };

      } catch (error) {
        lastError = error as Error;

        if (controller.signal.aborted) {
          return { result: 'completed' };
        }

        if (isContextOverflowError(error) && attempt <= 2) {
          this.logger.warn('Context overflow detected, pruning context before retry', { provider: provider.name, runId, attempt });
          
          // Prune older messages from the middle of the conversation to reduce context size.
          // Keep the system prompt (first message) and the most recent messages intact.
          const msgs = session.state.messages;
          const keepRecent = Math.max(6, Math.floor(msgs.length * 0.3));
          if (msgs.length > keepRecent + 2) {
            const pruneCount = Math.ceil((msgs.length - keepRecent - 1) * (0.3 * attempt));
            if (pruneCount > 0) {
              // Remove messages from just after the system message
              msgs.splice(1, pruneCount);
              this.logger.info('Pruned messages for context overflow retry', {
                prunedCount: pruneCount,
                remainingMessages: msgs.length,
                attempt,
              });
            }
          }
          
          await this.delay(500);
          continue;
        }

        if (isMaxOutputTokensError(error) && attempt <= 2) {
          this.logger.warn('MaxOutputTokens too high', { provider: provider.name, runId, attempt });
          await this.delay(500);
          continue;
        }

        if (isRateLimitError(error)) {
          const retryAfter = extractRetryAfter(error);
          const baseDelay = retryDelayMs * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 1000;
          const delay = retryAfter ? retryAfter * 1000 : baseDelay + jitter;

          this.logger.warn('Rate limited, retrying', { provider: provider.name, runId, attempt, delay: Math.round(delay) });
          await this.delay(delay);
          continue;
        }

        // Handle network connectivity errors with longer delays
        // These errors (fetch failed, DNS, connection refused) need more time to recover
        if (isNetworkError(error) && attempt < maxRetries) {
          const baseDelay = 5000; // Start with 5 seconds for network issues
          const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 2000;
          const delay = Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds

          this.logger.warn('Network connectivity error, retrying with extended delay', { 
            provider: provider.name, 
            runId, 
            attempt,
            error: lastError?.message,
            delay: Math.round(delay) 
          });
          await this.delay(delay);
          continue;
        }

        if (isTransientError(error) && attempt < maxRetries) {
          const baseDelay = retryDelayMs * Math.pow(1.5, attempt - 1);
          const jitter = Math.random() * 500;
          const delay = baseDelay + jitter;

          this.logger.warn('Transient error, retrying', { provider: provider.name, runId, attempt, delay: Math.round(delay) });
          await this.delay(delay);
          continue;
        }

        // Track provider health on failure (non-retryable or exhausted retries)
        const failureLatencyMs = Date.now() - requestStartTime;
        const failureHealthCallback = this.getProviderHealthCallback?.();
        if (failureHealthCallback) {
          failureHealthCallback(provider.name as LLMProviderName, false, failureLatencyMs);
        }

        agentMetrics.recordProviderCall(runId, false, attempt > 1);
        throw error;
      }
    }

    throw lastError ?? new Error('All retry attempts failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
