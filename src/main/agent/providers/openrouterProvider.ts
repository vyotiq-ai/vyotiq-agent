/**
 * OpenRouter Provider
 * 
 * Unified API gateway for multiple LLM providers.
 * Uses OpenAI-compatible API format with additional OpenRouter-specific features.
 * 
 * @see https://openrouter.ai/docs/api-reference/overview
 */

import { BaseLLMProvider, type ProviderRequest, type ProviderMessage, APIError, withRetry, fetchStreamWithRetry } from './baseProvider';
import type { ProviderResponse, ToolCallPayload, ProviderResponseChunk } from '../../../shared/types';
import { createLogger } from '../../logger';
import { DEFAULT_MODELS } from './registry';
import { registerOpenRouterPricing, clearDynamicPricingCache } from './CostManager';
import { parseToolArguments } from '../../utils';

const logger = createLogger('OpenRouterProvider');

const BASE_URL = 'https://openrouter.ai/api/v1';

/** OpenRouter model from /api/v1/models endpoint */
export interface OpenRouterModel {
  id: string;
  name: string;
  created: number;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
  };
  context_length: number;
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type: string;
  };
  top_provider: {
    is_moderated: boolean;
    context_length: number;
    max_completion_tokens: number;
  };
  supported_parameters?: string[];
  description?: string;
  /** Provider organization (e.g., 'openai', 'anthropic', 'google') */
  provider?: string;
}

/** OpenRouter model category based on architecture modality */
export type OpenRouterModelCategory = 'text' | 'multimodal' | 'image' | 'audio' | 'video';

/**
 * Determine model category from architecture modality
 */
export function getModelCategory(model: OpenRouterModel): OpenRouterModelCategory {
  const inputModalities = model.architecture?.input_modalities || [];
  const outputModalities = model.architecture?.output_modalities || [];
  
  // Check for specialized output types first
  if (outputModalities.includes('image')) return 'image';
  if (outputModalities.includes('audio')) return 'audio';
  
  // Check input modalities for multimodal
  const hasVision = inputModalities.includes('image') || inputModalities.includes('vision');
  const hasAudio = inputModalities.includes('audio');
  const hasVideo = inputModalities.includes('video');
  
  if (hasVideo) return 'video';
  if (hasVision || hasAudio) return 'multimodal';
  
  return 'text';
}

/**
 * Check if model supports tool/function calling
 */
export function modelSupportsTools(model: OpenRouterModel): boolean {
  return model.supported_parameters?.includes('tools') || 
         model.supported_parameters?.includes('tool_choice') || false;
}

/**
 * Check if model supports vision/image input
 */
export function modelSupportsVision(model: OpenRouterModel): boolean {
  const inputModalities = model.architecture?.input_modalities || [];
  return inputModalities.includes('image') || inputModalities.includes('vision');
}

/**
 * Check if model supports streaming
 */
export function modelSupportsStreaming(model: OpenRouterModel): boolean {
  // Most OpenRouter models support streaming, check for explicit support
  return model.supported_parameters?.includes('stream') !== false;
}

/**
 * Get the underlying provider from model ID (e.g., 'openai/gpt-4o' -> 'openai')
 */
export function getModelProvider(model: OpenRouterModel): string {
  const parts = model.id.split('/');
  return parts.length > 1 ? parts[0] : 'unknown';
}

export class OpenRouterProvider extends BaseLLMProvider {
  readonly name = 'openrouter' as const;
  override readonly supportsCaching: boolean = false;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private cachedModels: OpenRouterModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly modelsCacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey?: string, baseUrl?: string, defaultModel?: string) {
    super(apiKey);
    this.baseUrl = baseUrl || BASE_URL;
    this.defaultModel = defaultModel || DEFAULT_MODELS.openrouter;
  }

  /**
   * Fetch available models from OpenRouter API
   * Also registers dynamic pricing for cost calculations
   */
  async fetchModels(signal?: AbortSignal): Promise<OpenRouterModel[]> {
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
    
    // Register dynamic pricing for all fetched models
    for (const model of this.cachedModels) {
      if (model.pricing) {
        registerOpenRouterPricing(model.id, model.pricing);
      }
    }
    
    logger.debug('Fetched OpenRouter models', { count: this.cachedModels?.length });
    return this.cachedModels || [];
  }

  /**
   * Get models that support tool calling
   */
  async getToolCapableModels(signal?: AbortSignal): Promise<OpenRouterModel[]> {
    const models = await this.fetchModels(signal);
    return models.filter(m => 
      m.supported_parameters?.includes('tools') || 
      m.supported_parameters?.includes('tool_choice')
    );
  }

  /**
   * Get a specific model by ID from the cache
   */
  async getModelById(modelId: string, signal?: AbortSignal): Promise<OpenRouterModel | undefined> {
    const models = await this.fetchModels(signal);
    return models.find(m => m.id === modelId);
  }

  /**
   * Check if a specific model supports tool calling
   */
  async checkModelToolSupport(modelId: string, signal?: AbortSignal): Promise<boolean> {
    const model = await this.getModelById(modelId, signal);
    if (!model) return true; // Unknown models default to true (let API decide)
    return modelSupportsTools(model);
  }

  /**
   * Clear the models cache to force a refresh
   */
  clearModelsCache(): void {
    this.cachedModels = null;
    this.modelsCacheTime = 0;
    clearDynamicPricingCache();
  }

  /**
   * Validate messages - filter out invalid assistant messages.
   * Assistant messages must have either content or tool calls.
   */
  private validateMessages(messages: ProviderMessage[]): ProviderMessage[] {
    return messages.filter(msg => {
      if (msg.role === 'assistant') {
        const hasContent = msg.content !== null && msg.content !== undefined && 
                           (typeof msg.content !== 'string' || msg.content.trim().length > 0);
        const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
        if (!hasContent && !hasToolCalls) {
          logger.warn('Filtering out invalid assistant message without content or tool calls');
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Ensure tool call sequences are complete.
   * For each assistant message with tool calls, ensure there's a corresponding tool response.
   */
  private ensureCompleteToolCallSequences(messages: ProviderMessage[]): ProviderMessage[] {
    const result: ProviderMessage[] = [];
    let pendingToolCallIds: Set<string> | null = null;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        // Collect tool call IDs from this assistant message
        pendingToolCallIds = new Set(
          msg.toolCalls.map(tc => tc.callId).filter(Boolean) as string[]
        );
        result.push(msg);

        // Look ahead for tool responses
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
          const toolMsg = messages[j];
          if (toolMsg.toolCallId) {
            pendingToolCallIds.delete(toolMsg.toolCallId);
          }
          j++;
        }

        // Add placeholder responses for any missing tool calls
        if (pendingToolCallIds.size > 0) {
          for (const toolCallId of pendingToolCallIds) {
            result.push({
              role: 'tool',
              content: 'Tool execution was cancelled or failed.',
              toolCallId,
            });
          }
        }
        // Reset for next iteration
        pendingToolCallIds = new Set(
          msg.toolCalls.map(tc => tc.callId).filter(Boolean) as string[]
        );
      } else if (msg.role === 'tool') {
        const toolCallId = msg.toolCallId;
        if (pendingToolCallIds && toolCallId && pendingToolCallIds.has(toolCallId)) {
          pendingToolCallIds.delete(toolCallId);
          result.push(msg);
          if (pendingToolCallIds.size === 0) {
            pendingToolCallIds = null;
          }
        } else if (!pendingToolCallIds) {
          logger.warn('Skipping orphan tool message without matching assistant tool call', { toolCallId });
        }
      } else {
        pendingToolCallIds = null;
        result.push(msg);
      }
    }

    return result;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildBody(request, false)),
        signal: request.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw APIError.fromResponse(response, errorText);
      }

      const payload = await response.json();
      return this.parseResponse(payload);
    }, {}, request.signal);
  }

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk> {
    // Use fetchStreamWithRetry for automatic retry on network errors
    const response = await fetchStreamWithRetry(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: this.buildHeaders(),
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
          // Skip SSE comments (used by OpenRouter to prevent timeouts)
          if (line.startsWith(':')) continue;
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(data);
            } catch {
              // Skip non-JSON lines (like SSE comments)
              if (data && !data.startsWith(':')) {
                logger.debug('Skipping non-JSON SSE data', { data: data.substring(0, 100) });
              }
              continue;
            }
            
            // Check for errors in the chunk - throw to trigger proper error handling
            if (event.error) {
              const errorObj = event.error as Record<string, unknown>;
              const errorMessage = typeof event.error === 'object' 
                ? (errorObj.message || errorObj.code || JSON.stringify(event.error)) as string
                : String(event.error);
              logger.error('Stream error from OpenRouter', { error: event.error });
              throw new APIError(
                errorMessage,
                (errorObj.code as number) || 500,
                undefined,
                false, // Not retryable by default - let error handling decide
                false,
                false
              );
            }

            const choice = (event.choices as Array<Record<string, unknown>>)?.[0];
            if (!choice) continue;

            const delta = choice.delta as Record<string, unknown> | undefined;
            
            // Handle content delta
            if (delta?.content) {
              yield { delta: delta.content as string };
            }

            // Handle tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
                const fn = tc.function as Record<string, unknown> | undefined;
                yield {
                  toolCall: {
                    index: (tc.index as number) ?? 0,
                    callId: tc.id as string | undefined,
                    name: fn?.name as string | undefined,
                    argsJson: fn?.arguments as string | undefined,
                  }
                };
              }
            }

            // Handle finish reason
            if (choice.finish_reason) {
              yield { finishReason: choice.finish_reason as string };
            }

            // Handle usage (typically in final chunk)
            if (event.usage) {
              const usage = event.usage as Record<string, number>;
              yield {
                usage: {
                  input: usage.prompt_tokens ?? 0,
                  output: usage.completion_tokens ?? 0,
                  total: usage.total_tokens ?? 0,
                }
              };
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildHeaders(): Record<string, string> {
    const apiKey = this.assertApiKey();
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://vyotiq.app',
      'X-Title': 'Vyotiq AI Coding Agent',
    };
  }

  private buildBody(request: ProviderRequest, stream: boolean): Record<string, unknown> {
    const model = request.config.model || this.defaultModel;
    
    // Validate and sanitize messages before building
    let validatedMessages = this.validateMessages(request.messages);
    validatedMessages = this.ensureCompleteToolCallSequences(validatedMessages);
    
    // Build messages array
    const messages = this.buildMessages(request.systemPrompt, validatedMessages);
    
    // Build tools array if present
    const tools = request.tools.length > 0 ? request.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.jsonSchema,
      },
    })) : undefined;

    const body: Record<string, unknown> = {
      model,
      messages,
      stream,
      temperature: request.config.temperature,
      max_tokens: request.config.maxOutputTokens,
    };

    if (tools) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    if (stream) {
      body.stream_options = { include_usage: true };
    }

    // Add structured output support if configured
    if (request.config.responseFormat) {
      if (request.config.responseFormat.type === 'json_object') {
        body.response_format = { type: 'json_object' };
      } else if (request.config.responseFormat.type === 'json_schema' && request.config.responseFormat.schema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: request.config.responseFormat.schema,
        };
      }
    }

    return body;
  }

  private buildMessages(systemPrompt: string, messages: ProviderMessage[]): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    // Add system message
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    // Convert provider messages to OpenAI format
    for (const msg of messages) {
      if (msg.role === 'system') continue; // Already handled

      if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          content: msg.content || '',
          tool_call_id: msg.toolCallId || '',
        });
      } else if (msg.role === 'assistant' && msg.toolCalls?.length) {
        // Assistant message with tool calls
        const toolCalls = msg.toolCalls.map((tc, i) => ({
          id: tc.callId || `call_${i}`,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments || {}),
          },
        }));
        
        result.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: toolCalls,
        });
      } else if (msg.role === 'user' && msg.attachments?.length) {
        // User message with attachments (vision support)
        const contentParts: Array<Record<string, unknown>> = [];
        
        // Add text content first
        if (msg.content) {
          contentParts.push({ type: 'text', text: msg.content });
        }
        
        // Add image attachments
        for (const attachment of msg.attachments) {
          if (attachment.mimeType?.startsWith('image/')) {
            const imageData = attachment.content || '';
            // Support both base64 data and URLs
            const imageUrl = imageData.startsWith('http') 
              ? imageData 
              : `data:${attachment.mimeType};base64,${imageData}`;
            
            contentParts.push({
              type: 'image_url',
              image_url: { url: imageUrl },
            });
          }
        }
        
        result.push({
          role: 'user',
          content: contentParts.length > 0 ? contentParts : msg.content || '',
        });
      } else {
        result.push({
          role: msg.role,
          content: msg.content || '',
        });
      }
    }

    return result;
  }

  private parseResponse(payload: Record<string, unknown>): ProviderResponse {
    const choice = (payload.choices as Array<Record<string, unknown>>)?.[0];
    const message = choice?.message as Record<string, unknown> | undefined;
    
    const content = (message?.content as string) ?? '';
    
    // Parse tool calls using safe argument parsing
    let toolCalls: ToolCallPayload[] | undefined;
    const rawToolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
    if (rawToolCalls?.length) {
      toolCalls = rawToolCalls.map(tc => {
        const fn = tc.function as Record<string, unknown>;
        const toolName = (fn?.name as string) || 'unknown_tool';
        return {
          name: toolName,
          arguments: parseToolArguments(fn?.arguments as string, toolName),
          callId: (tc.id as string) || '',
        };
      });
    }

    // Parse usage
    const usage = payload.usage as Record<string, number> | undefined;

    return {
      content,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      finishReason: (choice?.finish_reason as string) || undefined,
      usage: usage ? {
        input: usage.prompt_tokens ?? 0,
        output: usage.completion_tokens ?? 0,
        total: usage.total_tokens ?? 0,
      } : undefined,
    };
  }
}
