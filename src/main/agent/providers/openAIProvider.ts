import { createHash } from 'node:crypto';
import { BaseLLMProvider, type ProviderRequest, type ProviderMessage, APIError, withRetry, fetchStreamWithRetry } from './baseProvider';
import type { ProviderResponse, ToolCallPayload, ProviderResponseChunk } from '../../../shared/types';
import { createLogger } from '../../logger';
import { parseToolArguments } from '../../utils';
import { DEFAULT_MODELS } from './registry';

const logger = createLogger('OpenAIProvider');

/** OpenAI model from /v1/models endpoint */
export interface OpenAIModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

/**
 * OpenAI Provider
 * 
 * Supports GPT-5.x, GPT-4.x, GPT-4o, and o-series reasoning models via the Responses API.
 * Features: streaming (semantic events), function calling, vision (for supported models), 
 *           reasoning with configurable effort, structured outputs, prompt caching
 * 
 * CRITICAL: Reasoning Models (GPT-5.x, o-series)
 * @see https://platform.openai.com/docs/guides/reasoning
 * 
 * Reasoning models have different parameters:
 * - Use `reasoning.effort` instead of temperature ("none", "low", "medium", "high", "xhigh")
 * - GPT-5.2 supports "xhigh" effort level for maximum reasoning depth
 * - Temperature/top_p/logprobs only supported when reasoning effort is "none"
 * - Use `max_output_tokens` (renamed from `max_tokens`) - reserve 25k+ for reasoning
 * - GPT-5.2: Defaults to `reasoning.effort: "none"` for lowest latency
 * 
 * Verbosity Control (GPT-5.2):
 * - Use `text.verbosity` to control response length: "low", "medium", "high"
 * - Affects both reasoning and output generation
 * 
 * Prompt Caching:
 * - Enabled automatically for prompts with 1024+ tokens
 * - Use `prompt_cache_key` for explicit cache keying
 * - Use `prompt_cache_retention`: "in_memory" (default) or "24h" for extended retention
 * - Up to 90% cost reduction for cached prompts
 * @see https://platform.openai.com/docs/guides/prompt-caching
 */

/**
 * Model-specific output token limits
 * 
 * GPT-5.2 family: 100K output
 * GPT-5.1-Codex-Max: 200K output (sustained for long-context coding)
 * GPT-5.1/GPT-5 family: 100K output
 * GPT-5-mini: 65K output
 * GPT-5-nano: 32K output
 * GPT-4.1 family: 32K output
 * o-series: 100K output
 * GPT-4o: 16K output
 * 
 * @see https://platform.openai.com/docs/models
 */
const MODEL_OUTPUT_LIMITS: Record<string, number> = {
  // GPT-5.2 family (Latest 2025)
  'gpt-5.2': 100000,
  'gpt-5.2-chat-latest': 100000,
  'gpt-5.2-pro': 100000,
  
  // GPT-5.1 Codex family (Specialized for coding)
  'gpt-5.1-codex-max': 200000,  // Sustained 200K for long-context coding
  'gpt-5.1-codex': 100000,
  
  // GPT-5.1 family
  'gpt-5.1': 100000,
  
  // GPT-5 family
  'gpt-5': 100000,
  'gpt-5-pro': 100000,
  'gpt-5-mini': 65536,
  'gpt-5-nano': 32768,
  
  // GPT-4.1 family
  'gpt-4.1': 32768,
  'gpt-4.1-mini': 32768,
  'gpt-4.1-nano': 32768,
  
  // o-series reasoning models (legacy)
  'o3-pro': 100000,
  'o3': 100000,
  'o3-mini': 100000,
  'o4-mini': 100000,
  'o1': 100000,
  'o1-pro': 100000,
  
  // GPT-4o family (legacy)
  'gpt-4o': 16384,
  'gpt-4o-mini': 16384,
  
  // Default fallback
  'default': 16384,
};

/** OpenAI API maximum token limit for most models */
const API_MAX_TOKENS_LIMIT = 200000;  // Increased for gpt-5.1-codex-max

// Note: We do NOT force a minimum max_output_tokens for reasoning models.
// If a caller wants higher outputs, it should request them explicitly.

/**
 * Verbosity levels for GPT-5.2 text output control
 */
type VerbosityLevel = 'low' | 'medium' | 'high';

/**
 * Reasoning effort levels
 * - none: No reasoning, fastest (temperature allowed)
 * - low: Minimal reasoning
 * - medium: Balanced reasoning (default)
 * - high: Deep reasoning
 * - xhigh: Maximum reasoning depth (GPT-5.2 only)
 */
type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export class OpenAIProvider extends BaseLLMProvider {
  readonly name = 'openai' as const;
  /** OpenAI supports prompt caching controls in the Responses API */
  readonly supportsCaching = true;
  
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  /** Cached models from API */
  private cachedModels: OpenAIModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly modelsCacheTTL = 5 * 60 * 1000; // 5 minutes
  
  /** Valid OpenAI model ID patterns */
  private static readonly VALID_MODEL_PATTERNS = [
    /^gpt-/,      // GPT models: gpt-4, gpt-4o, gpt-3.5-turbo, gpt-5, etc.
    /^o\d+/,      // Reasoning models: o1, o3, o3-mini, o4, o4-mini, etc.
    /^chatgpt-/,  // ChatGPT models
    /^text-/,     // Text models (legacy)
    /^davinci/,   // Davinci models (legacy)
    /^codex/,     // Codex models
  ];
  
  /** Reasoning model patterns - these use reasoning.effort instead of temperature */
  private static readonly REASONING_MODEL_PATTERNS = [
    /^o\d+/,      // o1, o3, o3-mini, o4, o4-mini, etc.
    /^gpt-5/,     // GPT-5 family uses reasoning parameters
  ];
  
  /** Models that support xhigh reasoning effort */
  private static readonly XHIGH_EFFORT_MODELS = [
    /^gpt-5\.2/,        // GPT-5.2 family
    /^gpt-5\.1-codex-max/,  // Codex-Max also supports xhigh
  ];
  
  /** Models that support verbosity control */
  private static readonly VERBOSITY_MODELS = [
    /^gpt-5\.2/,        // GPT-5.2 family
  ];

  constructor(apiKey?: string, baseUrl = 'https://api.openai.com/v1', defaultModel?: string) {
    super(apiKey);
    this.baseUrl = baseUrl;
    // Default to current flagship (can be overridden by settings)
    this.defaultModel = defaultModel || DEFAULT_MODELS.openai;
  }

  /**
   * Fetch available models from OpenAI API
   * @see https://platform.openai.com/docs/api-reference/models/list
   */
  async fetchModels(signal?: AbortSignal): Promise<OpenAIModel[]> {
    // Return cached models if still valid
    if (this.cachedModels && Date.now() - this.modelsCacheTime < this.modelsCacheTTL) {
      return this.cachedModels;
    }

    const apiKey = this.assertApiKey();
    
    const response = await fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw APIError.fromResponse(response, errorText);
    }

    const data = await response.json();
    this.cachedModels = data.data || [];
    this.modelsCacheTime = Date.now();
    
    logger.debug('Fetched OpenAI models', { count: this.cachedModels?.length });
    return this.cachedModels || [];
  }

  /**
   * Clear the models cache to force a refresh
   */
  clearModelsCache(): void {
    this.cachedModels = null;
    this.modelsCacheTime = 0;
  }
  
  /**
   * Check if a model ID is a valid OpenAI model
   * Returns false for model IDs from other providers (claude-*, deepseek-*, etc.)
   */
  private isValidOpenAIModel(modelId: string): boolean {
    return OpenAIProvider.VALID_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Check if a model is a reasoning model that uses reasoning.effort instead of temperature
   */
  private isReasoningModel(modelId: string): boolean {
    return OpenAIProvider.REASONING_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Check if a model supports xhigh reasoning effort level
   */
  private supportsXHighEffort(modelId: string): boolean {
    return OpenAIProvider.XHIGH_EFFORT_MODELS.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Check if a model supports verbosity control
   */
  private supportsVerbosity(modelId: string): boolean {
    return OpenAIProvider.VERBOSITY_MODELS.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Get validated model ID - falls back to default if invalid
   */
  private getValidatedModel(requestedModel?: string): string {
    if (requestedModel && this.isValidOpenAIModel(requestedModel)) {
      return requestedModel;
    }
    if (requestedModel) {
      logger.warn('Received invalid model, falling back to default', { requestedModel, defaultModel: this.defaultModel });
    }
    return this.defaultModel;
  }
  
  /**
   * Clamp max_tokens/max_output_tokens to valid range for the model and API
   * 
   * For reasoning models, ensure minimum reservation of 25k tokens
   * 
   * @param maxTokens - Requested max tokens
   * @param model - Model ID to check limits for
   * @param isReasoning - Whether this is a reasoning model
   * @returns Clamped value within valid range
   */
  private clampMaxTokens(maxTokens: number, model: string, isReasoning: boolean): number {
    // Find the model limit by checking exact match first
    let modelLimit = MODEL_OUTPUT_LIMITS[model];
    
    if (!modelLimit) {
      // Try to match by prefix for versioned models
      for (const [key, limit] of Object.entries(MODEL_OUTPUT_LIMITS)) {
        if (model.startsWith(key)) {
          modelLimit = limit;
          break;
        }
      }
    }
    
    modelLimit = modelLimit || MODEL_OUTPUT_LIMITS['default'];
    
    // Never increase the requested limit; only clamp down to API/model maxima
    // and ensure a minimum of 1.
    const clamped = Math.min(
      Math.max(1, maxTokens),
      modelLimit,
      API_MAX_TOKENS_LIMIT
    );
    
    if (clamped !== maxTokens) {
      logger.debug('Clamped max_tokens', { original: maxTokens, clamped, model, isReasoning });
    }
    
    return clamped;
  }
  
  /**
   * Validate that messages have required fields for the API
   * 
   * @param messages - Array of messages to validate
   * @returns Filtered array with invalid messages removed
   */
  private validateMessages(messages: ProviderMessage[]): ProviderMessage[] {
    return messages.filter((msg, _index) => {
      // For assistant messages, require either content or tool_calls
      if (msg.role === 'assistant') {
        const hasContent = msg.content !== null && msg.content !== undefined && 
                           (typeof msg.content !== 'string' || msg.content.trim().length > 0);
        const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
        
        if (!hasContent && !hasToolCalls) {
          logger.warn('Filtering out invalid assistant message (no content or tool_calls)');
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * Ensure all tool_calls in assistant messages have corresponding tool result messages
   * and remove orphan tool messages.
   * 
   * This fixes corrupted message sequences that can occur when:
   * 1. A run is cancelled mid-execution
   * 2. An error occurs during tool execution
   * 3. The session was restored from an incomplete state
   * 4. Messages are merged with incomplete sequences
   * 
   * The OpenAI API requires: "An assistant message with 'tool_calls' must be 
   * followed by tool messages responding to each 'tool_call_id'."
   * 
   * @param messages - Array of messages to validate
   * @returns Messages with synthetic tool results added for incomplete sequences
   */
  private ensureCompleteToolCallSequences(messages: ProviderMessage[]): ProviderMessage[] {
    const result: ProviderMessage[] = [];
    let currentAssistantToolCallIds: Set<string> | null = null;
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        // Track tool call IDs from this assistant message
        currentAssistantToolCallIds = new Set(msg.toolCalls.map(tc => tc.callId).filter(Boolean) as string[]);
        result.push(msg);
        
        // Look ahead to find all tool responses
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
          const toolMsg = messages[j];
          if (toolMsg.toolCallId) {
            currentAssistantToolCallIds.delete(toolMsg.toolCallId);
          }
          j++;
        }
        
        // Add synthetic responses for missing tool calls
        if (currentAssistantToolCallIds.size > 0) {
          logger.warn('Adding synthetic tool responses for incomplete tool call sequence', {
            missingToolCallIds: Array.from(currentAssistantToolCallIds),
            messageIndex: i,
          });
          
          for (const toolCallId of currentAssistantToolCallIds) {
            result.push({
              role: 'tool',
              content: 'Tool execution was cancelled or failed before completion.',
              toolCallId,
            });
          }
        }
        
        // Reset for next sequence
        currentAssistantToolCallIds = new Set(msg.toolCalls.map(tc => tc.callId).filter(Boolean) as string[]);
      } else if (msg.role === 'tool') {
        const toolCallId = msg.toolCallId;
        
        // Only include tool messages that have a valid preceding assistant with tool_calls
        if (currentAssistantToolCallIds && toolCallId && currentAssistantToolCallIds.has(toolCallId)) {
          currentAssistantToolCallIds.delete(toolCallId);
          result.push(msg);
          
          if (currentAssistantToolCallIds.size === 0) {
            currentAssistantToolCallIds = null;
          }
        } else if (!currentAssistantToolCallIds) {
          // Orphan tool message - skip it
          logger.warn('Skipping orphan tool message', {
            toolCallId,
            messageIndex: i,
          });
        } else {
          // Tool message with unknown ID - skip it
          logger.warn('Skipping tool message with unknown tool_call_id', {
            toolCallId,
            messageIndex: i,
          });
        }
      } else {
        // Non-tool message resets the tracking
        currentAssistantToolCallIds = null;
        result.push(msg);
      }
    }
    
    return result;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = this.assertApiKey();
    
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildBody(request, false)),
        signal: request.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw APIError.fromResponse(response, errorText);
      }

      const payload = await response.json();

      const toolCalls: ToolCallPayload[] = [];
      let content = '';
      const reasoningItems: Array<Record<string, unknown>> = [];

      const outputItems: Array<Record<string, unknown>> = Array.isArray(payload.output) ? payload.output : [];
      for (const item of outputItems) {
        const type = item.type;

        if (type === 'reasoning') {
          reasoningItems.push(item);
        }

        if (type === 'message' && item.role === 'assistant') {
          const parts: Array<Record<string, unknown>> = Array.isArray(item.content) ? (item.content as Array<Record<string, unknown>>) : [];
          for (const part of parts) {
            if (part.type === 'output_text' && typeof part.text === 'string') {
              content += part.text;
            }
            if (part.type === 'refusal' && typeof part.refusal === 'string') {
              // Prefer refusal text if present
              content += part.refusal;
            }
          }
        }

        if (type === 'function_call') {
          const name = typeof item.name === 'string' ? item.name : 'unknown_tool';
          const callId = typeof item.call_id === 'string' ? item.call_id : undefined;
          const argumentsJson = typeof item.arguments === 'string' ? item.arguments : '';

          // Use robust parser that handles streaming artifacts
          const args = parseToolArguments(argumentsJson, name);

          toolCalls.push({
            name,
            arguments: args,
            callId,
          });
        }
      }

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: typeof payload.status === 'string' ? payload.status : undefined,
        usage: payload.usage ? {
          input: payload.usage.input_tokens,
          output: payload.usage.output_tokens,
          total: payload.usage.total_tokens,
        } : undefined,
        providerInternal: reasoningItems.length > 0 ? { openai: { reasoningItems } } : undefined,
      };
    }, {}, request.signal);
  }

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk> {
    const apiKey = this.assertApiKey();
    // Use fetchStreamWithRetry for automatic retry on network errors
    const response = await fetchStreamWithRetry(
      `${this.baseUrl}/responses`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildBody(request, true)),
        timeout: 120000, // 2 minute timeout for streaming requests
      },
      request.signal,
      {
        maxRetries: 3,
        initialDelayMs: 3000,
        maxDelayMs: 15000,
        backoffMultiplier: 2,
      }
    );

    if (!response.body) throw new Error('No response body');

    const reader = (response.body as unknown as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          // Skip SSE comments (keep-alive signals)
          if (line.startsWith(':') || line.trim() === '') continue;
          
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (!data || data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            const eventType = event.type as string | undefined;

            // Reasoning summary streaming (for thinking models)
            // @see https://platform.openai.com/docs/guides/reasoning#reasoning-summaries
            // Event types:
            // - response.reasoning_summary_text.delta: Delta text from reasoning summary
            // - response.reasoning_summary_text.done: Complete reasoning summary text
            // - response.output_item.added with type='reasoning': Reasoning item started
            // - response.output_item.done with type='reasoning': Reasoning item complete
            if (eventType === 'response.reasoning_summary_text.delta' && typeof event.delta === 'string') {
              // Stream reasoning summary as thinking content
              yield { thinkingDelta: event.delta };
            }
            if (eventType === 'response.reasoning_summary_text.done' && typeof event.text === 'string') {
              // Final reasoning summary - emit as complete thinking (UI can use this for complete content)
              // Only emit if we haven't streamed it already (check if text differs from accumulated deltas)
              logger.debug('Reasoning summary completed', { textLength: event.text.length });
            }
            
            // Reasoning output item events - capture reasoning start/end for UI indicators
            if (eventType === 'response.output_item.added' && event.item?.type === 'reasoning') {
              // Signal that reasoning has started
              yield { thinkingStart: true };
              logger.debug('Reasoning started', { itemId: event.item?.id });
            }
            if (eventType === 'response.output_item.done' && event.item?.type === 'reasoning') {
              // Reasoning item complete - extract summary text if present
              const item = event.item as Record<string, unknown>;
              const summary = item.summary as Array<Record<string, unknown>> | undefined;
              if (Array.isArray(summary)) {
                for (const summaryItem of summary) {
                  if (summaryItem.type === 'summary_text' && typeof summaryItem.text === 'string') {
                    // Emit the summary text as thinking content (in case delta streaming wasn't available)
                    yield { thinkingDelta: summaryItem.text };
                  }
                }
              }
              // Signal that reasoning has ended
              yield { thinkingEnd: true };
              logger.debug('Reasoning completed', { itemId: item.id, hasSummary: !!summary?.length });
            }

            // Text streaming
            if (eventType === 'response.output_text.delta' && typeof event.delta === 'string') {
              yield { delta: event.delta };
            }
            if (eventType === 'response.refusal.delta' && typeof event.delta === 'string') {
              yield { delta: event.delta };
            }

            // Tool call streaming
            if (eventType === 'response.output_item.added' && event.item?.type === 'function_call') {
              yield {
                toolCall: {
                  index: typeof event.output_index === 'number' ? event.output_index : 0,
                  callId: event.item.call_id,
                  name: event.item.name,
                  argsJson: undefined,
                }
              };
            }
            if (eventType === 'response.function_call_arguments.delta' && typeof event.delta === 'string') {
              yield {
                toolCall: {
                  index: typeof event.output_index === 'number' ? event.output_index : 0,
                  callId: undefined,
                  name: undefined,
                  argsJson: event.delta,
                }
              };
            }

            // Some streams send a final "done" event for arguments.
            // It may include the full `arguments` string - mark as complete to replace deltas.
            if (eventType === 'response.function_call_arguments.done') {
              const args = typeof event.arguments === 'string'
                ? event.arguments
                : (typeof event.delta === 'string' ? event.delta : undefined);

              if (args) {
                yield {
                  toolCall: {
                    index: typeof event.output_index === 'number' ? event.output_index : 0,
                    callId: undefined,
                    name: undefined,
                    argsJson: args,
                    argsComplete: true,  // This is the complete args, replace any accumulated deltas
                  }
                };
              }
            }

            // Some streams send a "done" event for the output item itself.
            // If it's a function_call, it may contain call_id/name/arguments.
            // Skip argsJson here since we already got complete args from function_call_arguments.done
            if (eventType === 'response.output_item.done' && event.item?.type === 'function_call') {
              yield {
                toolCall: {
                  index: typeof event.output_index === 'number' ? event.output_index : 0,
                  callId: event.item.call_id,
                  name: event.item.name,
                  // Don't emit argsJson here - we already got it from function_call_arguments.done
                  // which prevents triple concatenation
                  argsJson: undefined,
                }
              };
            }

            // Completion + usage
            if (eventType === 'response.completed') {
              if (event.response?.usage) {
                yield {
                  usage: {
                    input: event.response.usage.input_tokens,
                    output: event.response.usage.output_tokens,
                    total: event.response.usage.total_tokens,
                  }
                };
              }

              // Capture reasoning items (often encrypted) so we can pass them back
              // on the next turn when tool calling with reasoning models.
              if (Array.isArray(event.response?.output)) {
                const reasoningItems = (event.response.output as Array<Record<string, unknown>>)
                  .filter((item) => item && item.type === 'reasoning');
                if (reasoningItems.length > 0) {
                  yield { providerInternal: { openai: { reasoningItems } } };
                }
              }

              yield { finishReason: event.response?.status || 'completed' };
            }

            if (eventType === 'response.failed') {
              // Extract error details from the response if available
              const errorDetails = event.response?.error || event.error;
              const errorMessage = typeof errorDetails === 'object'
                ? (errorDetails.message || errorDetails.code || JSON.stringify(errorDetails))
                : (typeof errorDetails === 'string' ? errorDetails : 'Response failed');
              logger.error('Stream response failed from OpenAI', { error: errorDetails, event });
              throw new APIError(
                errorMessage,
                500,
                undefined,
                true, // Retryable
                false,
                false
              );
            }

            if (eventType === 'error') {
              // Extract error details from the event
              const errorDetails = event.error || event;
              const errorMessage = typeof errorDetails === 'object'
                ? (errorDetails.message || errorDetails.code || JSON.stringify(errorDetails))
                : (typeof errorDetails === 'string' ? errorDetails : 'Stream error');
              logger.error('Stream error from OpenAI', { error: errorDetails, event });
              throw new APIError(
                errorMessage,
                event.error?.code || 500,
                undefined,
                false, // Not retryable by default - let error handling decide
                false,
                false
              );
            }
          } catch (e) {
            logger.error('Error parsing SSE event', { error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildBody(request: ProviderRequest, stream: boolean) {
    let toolCallCounter = 0;
    
    // Validate model ID - fall back to default if model is from another provider
    const model = this.getValidatedModel(request.config.model);
    const isReasoning = this.isReasoningModel(model);
    
    // Validate messages before sending
    let validatedMessages = this.validateMessages(request.messages);
    
    // CRITICAL FIX: Ensure tool call sequences are complete
    // If an assistant message has tool_calls, there MUST be corresponding tool messages
    validatedMessages = this.ensureCompleteToolCallSequences(validatedMessages);
    
    // Build Responses API input items.
    // We use `instructions` for the system prompt and an `input` array containing
    // message items + function_call/function_call_output items.
    const input: Array<Record<string, unknown>> = [];

    for (const message of validatedMessages) {
      if (message.role === 'system') {
        // Prefer `instructions` for system prompt; skip system messages in history
        continue;
      }

      if (message.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: message.toolCallId || `call_fallback_${toolCallCounter++}`,
          output: message.content || '(no output)',
        });
        continue;
      }

      if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
        // Preserve any assistant text (if present)
        if (message.content && message.content.trim().length > 0) {
          input.push({ role: 'assistant', content: message.content });
        }

        // For reasoning models doing tool calling, OpenAI recommends passing back
        // any reasoning items returned alongside tool calls.
        const reasoningItems = message.providerInternal?.openai?.reasoningItems;
        if (Array.isArray(reasoningItems) && reasoningItems.length > 0) {
          for (const item of reasoningItems) {
            // Only replay reasoning items. (Function calls / messages are represented elsewhere.)
            if (item && (item as { type?: unknown }).type === 'reasoning') {
              input.push(item);
            }
          }
        }

        // Represent tool calls as function_call items (Responses API shape)
        for (const tc of message.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.callId || `call_fallback_${toolCallCounter++}`,
            name: tc.name,
            arguments: JSON.stringify(tc.arguments || {}),
          });
        }
        continue;
      }

      // Handle user messages with potential attachments (vision support)
      // @see https://platform.openai.com/docs/guides/vision
      if (message.role === 'user' && message.attachments && message.attachments.length > 0) {
        type UserContentBlock = 
          | { type: 'input_text'; text: string }
          | { type: 'input_image'; image_url: string };
        
        const userContent: UserContentBlock[] = [];
        
        // Add text content first
        if (message.content) {
          userContent.push({ type: 'input_text', text: message.content });
        }
        
        // Add image attachments
        for (const attachment of message.attachments) {
          const isImage = attachment.mimeType?.startsWith('image/');
          if (isImage && attachment.content) {
            // OpenAI accepts data URLs for images
            const dataUrl = `data:${attachment.mimeType || 'image/png'};base64,${attachment.content}`;
            userContent.push({
              type: 'input_image',
              image_url: dataUrl,
            });
            logger.debug('Added image attachment to OpenAI request', {
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.content.length,
            });
          }
        }
        
        // If we have structured content, use it
        if (userContent.length > 0) {
          input.push({
            role: 'user',
            content: userContent,
          });
          continue;
        }
      }

      // Regular message
      input.push({
        role: message.role,
        content: message.content || '',
      });
    }

    // Build the base request body
    const body: Record<string, unknown> = {
      model,
      stream,
      // Privacy-first default: do not store responses server-side
      store: false,
      instructions: request.systemPrompt && request.systemPrompt.trim() ? request.systemPrompt : undefined,
      input,
    };

    // For stateless/zero-retention usage, reasoning items must be returned in an encrypted
    // form so they can be passed to subsequent requests.
    // We only request these items when tools are in play (tool-calling turns).
    if (isReasoning && request.tools.length > 0) {
      body.include = ['reasoning.encrypted_content'];
    }

    // Prompt caching controls (Responses API)
    // Note: OpenAI enables caching automatically for prompts with 1024+ tokens.
    // These fields provide explicit cache keying and extended retention behavior.
    // @see https://platform.openai.com/docs/guides/prompt-caching
    const cacheEnabled = !!(
      request.cache && (request.cache.cacheSystemPrompt || request.cache.cacheTools || request.cache.cacheFileContexts)
    );
    if (cacheEnabled) {
      // Cache key: stable for the same (model + system prompt + tool definitions)
      // This avoids accidental cache fragmentation and keeps behavior deterministic.
      const keyMaterial = JSON.stringify({
        model,
        systemPrompt: request.systemPrompt,
        tools: request.tools.map((t) => ({ name: t.name, schema: t.jsonSchema })),
      });

      const hash = createHash('sha256').update(keyMaterial).digest('hex');
      body.prompt_cache_key = `vyotiq:${hash.slice(0, 32)}`;

      // Retention mapping:
      // - "in_memory": Default, cache kept while server maintains it
      // - "24h": Extended retention for up to 24 hours (reduces cost by up to 90%)
      // We request 24h retention for common GPT families when user selected aggressive caching.
      const wantsLongRetention = request.cache?.ttl === '1h' || request.cache?.ttl === '24h';
      const modelSupportsLongRetention = /^(gpt-4\.1|gpt-4o|gpt-5)/.test(model);
      body.prompt_cache_retention = wantsLongRetention && modelSupportsLongRetention ? '24h' : 'in_memory';
    }
    
    // Handle parameters differently for reasoning vs non-reasoning models
    if (isReasoning) {
      // For reasoning-capable models (o-series, gpt-5.*):
      // - Use `reasoning.effort` to control reasoning depth
      // - For GPT-5.2: temperature only supported when effort is "none"
      // - GPT-5.2 supports "xhigh" for maximum reasoning depth

      const temp = request.config.temperature;
      const supportsXHigh = this.supportsXHighEffort(model);
      
      // Use explicit reasoning effort from config if provided, otherwise map from temperature
      let effort: ReasoningEffort;
      if (request.config.reasoningEffort) {
        // Validate xhigh is only used with supported models
        if (request.config.reasoningEffort === 'xhigh' && !supportsXHigh) {
          effort = 'high'; // Downgrade to high for models that don't support xhigh
          logger.debug('Downgrading xhigh effort to high for unsupported model', { model });
        } else {
          effort = request.config.reasoningEffort;
        }
      } else {
        // Heuristic mapping from temperature -> reasoning effort
        // Lower temperature = less reasoning needed (faster)
        // Higher temperature = more creative reasoning (deeper)
        if (temp <= 0.1) effort = 'none';
        else if (temp <= 0.3) effort = 'low';
        else if (temp <= 0.6) effort = 'medium';
        else if (temp <= 0.85) effort = 'high';
        else effort = supportsXHigh ? 'xhigh' : 'high';
      }

      const maxOutputTokens = this.clampMaxTokens(request.config.maxOutputTokens, model, true);

      // Build reasoning configuration with summary support
      // @see https://platform.openai.com/docs/guides/reasoning#reasoning-summaries
      // summary: 'auto' - Uses the most detailed summarizer available for the model
      // summary: 'detailed' - Detailed reasoning summaries (most models)
      // summary: 'concise' - Concise summaries (computer-use model)
      body.reasoning = { 
        effort,
        // Request reasoning summaries so we can display them in the UI
        // 'auto' automatically selects the best summarizer for the model
        summary: 'auto',
      };
      body.max_output_tokens = maxOutputTokens;

      // GPT-5.2 supports temperature only when effort is "none"
      if (model.startsWith('gpt-5.2') && effort === 'none') {
        body.temperature = temp;
      }
      
      // Verbosity control for GPT-5.2 models
      // Controls response length independently from reasoning effort
      if (this.supportsVerbosity(model)) {
        const verbosity: VerbosityLevel = request.config.verbosity || 'medium';
        body.text = {
          ...(body.text as Record<string, unknown> || {}),
          verbosity,
        };
      }

      logger.debug('Using Responses reasoning params', { 
        model, 
        effort, 
        maxOutputTokens, 
        originalTemperature: temp,
        supportsXHigh,
        hasVerbosity: this.supportsVerbosity(model),
        verbosity: request.config.verbosity,
      });
    } else {
      // For non-reasoning models: use temperature + max_output_tokens
      const maxOutputTokens = this.clampMaxTokens(request.config.maxOutputTokens, model, false);
      body.temperature = request.config.temperature;
      body.max_output_tokens = maxOutputTokens;
    }

    // Structured outputs (Responses API uses text.format)
    // Must be merged with existing body.text (which may contain verbosity)
    if (request.config.responseFormat) {
      const existingText = body.text as Record<string, unknown> || {};
      
      if (request.config.responseFormat.type === 'json_object') {
        body.text = {
          ...existingText,
          format: { type: 'json_object' },
        };
      } else if (request.config.responseFormat.type === 'json_schema' && request.config.responseFormat.schema) {
        body.text = {
          ...existingText,
          format: {
            type: 'json_schema',
            name: 'vyotiq_schema',
            strict: true,
            schema: request.config.responseFormat.schema,
          },
        };
      }
    }
    
    // Add tools if present
    if (request.tools.length > 0) {
      body.tools = request.tools.map((tool) => {
        // Build enhanced description with examples for improved accuracy
        let enhancedDescription = tool.description;
        
        // Append input examples to description if available
        // This technique improves tool calling accuracy significantly
        if (tool.input_examples && tool.input_examples.length > 0) {
          enhancedDescription += '\n\nExample inputs:';
          tool.input_examples.slice(0, 3).forEach((example, i) => {
            enhancedDescription += `\n${i + 1}. ${JSON.stringify(example)}`;
          });
        }
        
        return {
          type: 'function',
          name: tool.name,
          description: enhancedDescription,
          parameters: tool.jsonSchema,
          strict: true,
        };
      });
    }
    
    return body;
  }
}
