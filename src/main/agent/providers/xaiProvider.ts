/**
 * xAI (Grok) Provider
 * 
 * Uses OpenAI-compatible API format.
 * Supports Grok 3, Grok 4, and Grok-Code models.
 * 
 * Features: streaming, function calling, vision (for supported models)
 * 
 * @see https://docs.x.ai/docs/overview
 * @see https://docs.x.ai/api/endpoints#chat-completions
 */

import { BaseLLMProvider, type ProviderRequest, type ProviderMessage, APIError, withRetry, fetchStreamWithRetry } from './baseProvider';
import type { ProviderResponse, ToolCallPayload, ProviderResponseChunk } from '../../../shared/types';
import { createLogger } from '../../logger';
import { parseToolArguments } from '../../utils';
import { DEFAULT_MODELS } from './registry';

const logger = createLogger('XAIProvider');

/** xAI model from /v1/models endpoint */
export interface XAIModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

/** Model-specific output token limits */
const MODEL_OUTPUT_LIMITS: Record<string, number> = {
  // Grok 4 family (2025-2026)
  'grok-4': 131072,
  'grok-4-0709': 131072,
  'grok-4-vision': 131072,
  // Grok 3 family
  'grok-3': 131072,
  'grok-3-fast': 131072,
  'grok-3-mini': 65536,
  // Grok 2 family (legacy)
  'grok-2': 32768,
  'grok-2-vision': 32768,
  'grok-beta': 32768,
  'default': 32768,
};

/** xAI API maximum token limit */
const API_MAX_TOKENS_LIMIT = 131072;

export class XAIProvider extends BaseLLMProvider {
  readonly name = 'xai' as const;
  readonly supportsCaching = false;
  
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private cachedModels: XAIModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly modelsCacheTTL = 5 * 60 * 1000;
  
  private static readonly VALID_MODEL_PATTERNS = [
    /^grok-/,
  ];

  constructor(apiKey?: string, baseUrl = 'https://api.x.ai/v1', defaultModel?: string) {
    super(apiKey);
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel || DEFAULT_MODELS.xai;
  }

  async fetchModels(signal?: AbortSignal): Promise<XAIModel[]> {
    if (this.cachedModels && Date.now() - this.modelsCacheTime < this.modelsCacheTTL) {
      return this.cachedModels;
    }

    const apiKey = this.assertApiKey();
    
    const response = await fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw APIError.fromResponse(response, errorText);
    }

    const data = await response.json();
    this.cachedModels = data.data || [];
    this.modelsCacheTime = Date.now();
    
    logger.debug('Fetched xAI models', { count: this.cachedModels?.length });
    return this.cachedModels || [];
  }

  clearModelsCache(): void {
    this.cachedModels = null;
    this.modelsCacheTime = 0;
  }
  
  private isValidXAIModel(modelId: string): boolean {
    return XAIProvider.VALID_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
  }
  
  private getValidatedModel(requestedModel?: string): string {
    if (requestedModel && this.isValidXAIModel(requestedModel)) {
      return requestedModel;
    }
    if (requestedModel) {
      logger.warn('Received invalid model, falling back to default', { requestedModel, defaultModel: this.defaultModel });
    }
    return this.defaultModel;
  }
  
  private clampMaxTokens(maxTokens: number, model: string): number {
    let modelLimit = MODEL_OUTPUT_LIMITS[model];
    if (!modelLimit) {
      for (const [key, limit] of Object.entries(MODEL_OUTPUT_LIMITS)) {
        if (model.startsWith(key)) {
          modelLimit = limit;
          break;
        }
      }
    }
    modelLimit = modelLimit || MODEL_OUTPUT_LIMITS['default'];
    return Math.min(Math.max(1, maxTokens), modelLimit, API_MAX_TOKENS_LIMIT);
  }
  
  private validateMessages(messages: ProviderMessage[]): ProviderMessage[] {
    return messages.filter(msg => {
      if (msg.role === 'assistant') {
        const hasContent = msg.content !== null && msg.content !== undefined && 
                           (typeof msg.content !== 'string' || msg.content.trim().length > 0);
        const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
        if (!hasContent && !hasToolCalls) {
          logger.warn('Filtering out invalid assistant message');
          return false;
        }
      }
      return true;
    });
  }
  
  private ensureCompleteToolCallSequences(messages: ProviderMessage[]): ProviderMessage[] {
    const result: ProviderMessage[] = [];
    let currentToolCallIds: Set<string> | null = null;
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        currentToolCallIds = new Set(msg.toolCalls.map(tc => tc.callId).filter(Boolean) as string[]);
        result.push(msg);
        
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
          const toolMsg = messages[j];
          if (toolMsg.toolCallId) currentToolCallIds.delete(toolMsg.toolCallId);
          j++;
        }
        
        if (currentToolCallIds.size > 0) {
          for (const toolCallId of currentToolCallIds) {
            result.push({
              role: 'tool',
              content: 'Tool execution was cancelled or failed.',
              toolCallId,
            });
          }
        }
        currentToolCallIds = new Set(msg.toolCalls.map(tc => tc.callId).filter(Boolean) as string[]);
      } else if (msg.role === 'tool') {
        const toolCallId = msg.toolCallId;
        if (currentToolCallIds && toolCallId && currentToolCallIds.has(toolCallId)) {
          currentToolCallIds.delete(toolCallId);
          result.push(msg);
          if (currentToolCallIds.size === 0) currentToolCallIds = null;
        } else if (!currentToolCallIds) {
          logger.warn('Skipping orphan tool message', { toolCallId });
        }
      } else {
        currentToolCallIds = null;
        result.push(msg);
      }
    }
    return result;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = this.assertApiKey();
    
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
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
      const choice = payload.choices?.[0];
      if (!choice) throw new Error('xAI returned no choices.');

      const message = choice.message;
      const toolCalls: ToolCallPayload[] = message.tool_calls?.map((call: { function?: { name: string; arguments: string }; id: string }) => ({
        name: call.function?.name ?? 'unknown_tool',
        arguments: call.function?.arguments ? parseToolArguments(call.function.arguments, call.function?.name ?? 'unknown_tool') : {},
        callId: call.id,
      })) ?? [];

      return {
        content: message.content ?? '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: choice.finish_reason,
        usage: payload.usage ? {
          input: payload.usage.prompt_tokens,
          output: payload.usage.completion_tokens,
          total: payload.usage.total_tokens,
        } : undefined,
      };
    }, {}, request.signal);
  }

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk> {
    const apiKey = this.assertApiKey();
    
    // Use fetchStreamWithRetry for automatic retry on network errors
    const response = await fetchStreamWithRetry(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
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
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            const choice = event.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;
            
            if (delta?.content) {
              yield { delta: delta.content };
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                yield {
                  toolCall: {
                    index: tc.index ?? 0,
                    callId: tc.id,
                    name: tc.function?.name,
                    argsJson: tc.function?.arguments,
                  }
                };
              }
            }

            if (choice.finish_reason) {
              yield { finishReason: choice.finish_reason };
            }

            if (event.usage) {
              yield {
                usage: {
                  input: event.usage.prompt_tokens ?? 0,
                  output: event.usage.completion_tokens ?? 0,
                  total: event.usage.total_tokens ?? 0,
                }
              };
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

  private buildBody(request: ProviderRequest, stream: boolean): Record<string, unknown> {
    let toolCallCounter = 0;
    const model = this.getValidatedModel(request.config.model);
    
    let validatedMessages = this.validateMessages(request.messages);
    validatedMessages = this.ensureCompleteToolCallSequences(validatedMessages);

    const messages: Array<Record<string, unknown>> = [];
    
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of validatedMessages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          content: msg.content || '(no output)',
          tool_call_id: msg.toolCallId || `call_fallback_${toolCallCounter++}`,
        });
        continue;
      }

      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        const toolCalls = msg.toolCalls.map((tc) => ({
          id: tc.callId || `call_fallback_${toolCallCounter++}`,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments || {}),
          },
        }));
        messages.push({
          role: 'assistant',
          content: msg.content || null,
          tool_calls: toolCalls,
        });
        continue;
      }

      // User message with attachments (vision support for grok-2-vision, grok-4)
      if (msg.role === 'user' && msg.attachments?.length) {
        const contentParts: Array<Record<string, unknown>> = [];
        
        if (msg.content) {
          contentParts.push({ type: 'text', text: msg.content });
        }
        
        for (const attachment of msg.attachments) {
          if (attachment.mimeType?.startsWith('image/')) {
            const imageData = attachment.content || '';
            const imageUrl = imageData.startsWith('http') 
              ? imageData 
              : `data:${attachment.mimeType};base64,${imageData}`;
            
            contentParts.push({
              type: 'image_url',
              image_url: { url: imageUrl },
            });
          }
        }
        
        messages.push({
          role: 'user',
          content: contentParts.length > 0 ? contentParts : msg.content || '',
        });
        continue;
      }

      messages.push({
        role: msg.role,
        content: msg.content || '',
      });
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      stream,
      temperature: request.config.temperature,
      max_tokens: this.clampMaxTokens(request.config.maxOutputTokens, model),
    };

    if (request.tools.length > 0) {
      body.tools = request.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.jsonSchema,
        },
      }));
      body.tool_choice = 'auto';
    }

    if (stream) {
      body.stream_options = { include_usage: true };
    }

    return body;
  }
}
