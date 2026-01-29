/**
 * Stream Handler
 * Handles streaming output from LLM providers
 */

import type { RendererEvent, AgentEvent, ChatMessage, StreamDeltaEvent, ProviderResponseChunk, LLMProviderName } from '../../../shared/types';
import type { InternalSession } from '../types';
import type { Logger } from '../../logger';
import type { StreamOutputCallback, ToolCallCallback, MediaOutputCallback } from './types';
import { createStreamState, trackChunk, detectRepetition, type StreamState } from '../utils/streamUtils';

export class StreamHandler {
  private readonly logger: Logger;
  private readonly emitEvent: (event: RendererEvent | AgentEvent) => void;
  private readonly updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void;

  constructor(
    logger: Logger,
    emitEvent: (event: RendererEvent | AgentEvent) => void,
    updateSessionState: (sessionId: string, update: Partial<InternalSession['state']>) => void
  ) {
    this.logger = logger;
    this.emitEvent = emitEvent;
    this.updateSessionState = updateSessionState;
  }

  /**
   * Create stream callbacks for an iteration
   */
  createStreamCallbacks(
    session: InternalSession,
    assistantMessage: ChatMessage,
    runId: string,
    provider: { name: LLMProviderName }
  ): {
    onStreamOutput: StreamOutputCallback;
    onToolCall: ToolCallCallback;
    onToolCallDelta: (toolCall: NonNullable<ProviderResponseChunk['toolCall']>) => void;
    onMediaOutput: MediaOutputCallback;
    streamState: StreamState;
    getInitialStateSent: () => boolean;
    setInitialStateSent: (value: boolean) => void;
  } {
    const streamState = createStreamState();
    let initialSessionStateSent = false;
    let isReceivingThinking = false;
    let streamedContentLength = 0;

    const onStreamOutput: StreamOutputCallback = (chunk: string, isThinking = false, storeAsReasoningContent = false) => {
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
            this.logger.warn('Repetition detected in LLM output', {
              sessionId: session.state.id,
              runId,
              contentLength: streamedContentLength,
            });
            assistantMessage.content += '\n\n[Response truncated due to repetitive content.]';
          }
        }
      }

      if (!session.state.messages.includes(assistantMessage)) {
        session.state.messages.push(assistantMessage);
      }

      if (!initialSessionStateSent) {
        initialSessionStateSent = true;

        const sessionStateForEvent = {
          ...session.state,
          messages: session.state.messages.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: contentBeforeAppend, thinking: thinkingBeforeAppend }
              : m
          )
        };

        this.updateSessionState(session.state.id, {
          messages: session.state.messages,
          updatedAt: Date.now(),
        });
        this.emitEvent({ type: 'session-state', session: sessionStateForEvent });
      }

      const deltaEvent: StreamDeltaEvent = {
        type: 'stream-delta',
        sessionId: session.state.id,
        runId,
        delta: chunk,
        provider: provider.name,
        modelId: assistantMessage.modelId,
        messageId: assistantMessage.id,
        timestamp: Date.now(),
        isThinking: isThinking || undefined,
      };
      this.emitEvent(deltaEvent);
    };

    const toolCalls: import('../../../shared/types').ToolCallPayload[] = [];
    const onToolCall: ToolCallCallback = (toolCall) => {
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
      } as StreamDeltaEvent);
    };

    const onMediaOutput: MediaOutputCallback = (mediaType, data, mimeType) => {
      this.logger.debug('Processing media output', {
        mediaType,
        mimeType,
        dataLength: data.length,
        assistantMessageId: assistantMessage.id,
      });

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

    return {
      onStreamOutput,
      onToolCall,
      onToolCallDelta,
      onMediaOutput,
      streamState,
      getInitialStateSent: () => initialSessionStateSent,
      setInitialStateSent: (value: boolean) => { initialSessionStateSent = value; },
    };
  }
}
