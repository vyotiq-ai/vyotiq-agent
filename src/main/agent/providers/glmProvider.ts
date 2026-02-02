/**
 * Z.AI GLM Provider
 * 
 * Uses OpenAI-compatible API format with Z.AI specific extensions.
 * Supports GLM-4.7, GLM-4.6, GLM-4.5 models with thinking mode and function calling.
 * 
 * Features: streaming, function calling, vision (for V models), thinking mode
 * 
 * Endpoints:
 * - General API: https://api.z.ai/api/paas/v4
 * - Coding Plan: https://api.z.ai/api/coding/paas/v4
 * 
 * @see https://docs.z.ai
 */

import { BaseLLMProvider, type ProviderRequest, type ProviderMessage, APIError, withRetry, fetchStreamWithRetry } from './baseProvider';
import type { ProviderResponse, ToolCallPayload, ProviderResponseChunk } from '../../../shared/types';
import { createLogger } from '../../logger';
import { parseToolArguments } from '../../utils';
import { DEFAULT_MODELS } from './registry';

const logger = createLogger('GLMProvider');

/** General API endpoint */
export const GLM_GENERAL_ENDPOINT = 'https://api.z.ai/api/paas/v4';
/** Coding Plan API endpoint */
export const GLM_CODING_ENDPOINT = 'https://api.z.ai/api/coding/paas/v4';

export interface GLMModel {
  id: string;
  object: 'model';
  created?: number;
  owned_by?: string;
}

const MODEL_OUTPUT_LIMITS: Record<string, number> = {
  'glm-4.7': 16384,
  'glm-4.6': 16384,
  'glm-4.5': 8192,
  'glm-4-32b-0414-128k': 8192,
  // Vision models (2026)
  'glm-4.5v': 8192,
  'glm-4.1v-thinking': 8192,
  'glm-4v-plus-0111': 8192,
  'glm-4v-plus': 8192,
  'glm-4v-flash': 8192,
  'glm-4v': 8192,
  'default': 8192,
};

const THINKING_MODELS = new Set(['glm-4.7', 'glm-4.6', 'glm-4.1v-thinking']);

/**
 * Vision-capable GLM models (2026)
 * Only these models support image/video attachments.
 * @see https://docs.bigmodel.cn/cn/guide/models/vlm
 */
const VISION_MODELS = new Set([
  'glm-4.5v',
  'glm-4.1v-thinking',
  'glm-4v-plus-0111',
  'glm-4v-plus',
  'glm-4v-flash',
  'glm-4v',
]);

/**
 * Check if a model supports vision/image inputs
 */
function isVisionModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  // Check exact matches first
  if (VISION_MODELS.has(normalized)) return true;
  // Also check for 'v' suffix pattern (e.g., glm-4.5v, glm-4.1v-thinking)
  return normalized.includes('4v') || 
         normalized.includes('4.5v') || 
         normalized.includes('4.1v') ||
         normalized.includes('-v-');
}

export class GLMProvider extends BaseLLMProvider {
  readonly name = 'glm' as const;
  readonly supportsCaching = false;
  
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly enableThinking: boolean;
  private cachedModels: GLMModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly modelsCacheTTL = 5 * 60 * 1000;

  constructor(
    apiKey?: string, 
    baseUrl = GLM_GENERAL_ENDPOINT, 
    defaultModel?: string,
    enableThinking = true
  ) {
    super(apiKey);
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel || DEFAULT_MODELS.glm;
    this.enableThinking = enableThinking;
  }

  async fetchModels(signal?: AbortSignal): Promise<GLMModel[]> {
    if (this.cachedModels && Date.now() - this.modelsCacheTime < this.modelsCacheTTL) {
      return this.cachedModels;
    }

    const apiKey = this.assertApiKey();
    
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept-Language': 'en-US,en',
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
      
      logger.debug('Fetched GLM models', { count: this.cachedModels?.length });
      return this.cachedModels || [];
    } catch (error) {
      logger.warn('Failed to fetch GLM models, using defaults', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }

  clearModelsCache(): void {
    this.cachedModels = null;
    this.modelsCacheTime = 0;
  }
  
  private isValidGLMModel(modelId: string): boolean {
    return modelId.startsWith('glm-');
  }
  
  private getValidatedModel(requestedModel?: string): string {
    if (requestedModel && this.isValidGLMModel(requestedModel)) {
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
    return Math.min(Math.max(1, maxTokens), modelLimit);
  }

  private isThinkingModel(modelId: string): boolean {
    return THINKING_MODELS.has(modelId);
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
          'Accept-Language': 'en-US,en',
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
      if (!choice) throw new Error('GLM returned no choices.');

      const message = choice.message;
      const toolCalls: ToolCallPayload[] = message.tool_calls?.map((call: { function?: { name: string; arguments: string }; id: string }) => ({
        name: call.function?.name ?? 'unknown_tool',
        arguments: call.function?.arguments ? parseToolArguments(call.function.arguments, call.function?.name ?? 'unknown_tool') : {},
        callId: call.id,
      })) ?? [];

      const model = this.getValidatedModel(request.config.model);
      const thinking = this.isThinkingModel(model) ? (message.reasoning_content as string | undefined) : undefined;

      return {
        content: message.content ?? '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: choice.finish_reason,
        usage: payload.usage ? {
          input: payload.usage.prompt_tokens,
          output: payload.usage.completion_tokens,
          total: payload.usage.total_tokens,
        } : undefined,
        thinking,
      };
    }, {}, request.signal);
  }

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk> {
    const apiKey = this.assertApiKey();
    const body = this.buildBody(request, true);
    const model = body.model as string;
    const isThinkingModel = this.isThinkingModel(model);
    
    // Use fetchStreamWithRetry for automatic retry on network errors
    const response = await fetchStreamWithRetry(
      `${this.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept-Language': 'en-US,en',
        },
        body: JSON.stringify(body),
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
    let thinkingStarted = false;

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
            
            // Handle thinking/reasoning content for thinking models
            if (isThinkingModel && delta?.reasoning_content) {
              if (!thinkingStarted) {
                thinkingStarted = true;
                yield { thinkingStart: true };
              }
              yield { thinkingDelta: delta.reasoning_content };
            }
            
            if (delta?.content) {
              if (thinkingStarted) {
                yield { thinkingEnd: true };
                thinkingStarted = false;
              }
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
              if (thinkingStarted) {
                yield { thinkingEnd: true };
              }
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
    const isThinkingModel = this.isThinkingModel(model);
    
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

      // User message with attachments (vision support)
      // Only vision models (glm-4.5v, glm-4v-plus, etc.) support image attachments
      // @see https://docs.bigmodel.cn/cn/guide/models/vlm
      if (msg.role === 'user' && msg.attachments?.length) {
        const hasImageAttachments = msg.attachments.some(a => a.mimeType?.startsWith('image/'));
        const modelSupportsVision = isVisionModel(model);
        
        if (hasImageAttachments && !modelSupportsVision) {
          logger.warn('Model does not support vision - image attachments will be ignored', {
            model,
            attachmentCount: msg.attachments.length,
            supportedVisionModels: Array.from(VISION_MODELS).join(', '),
          });
          // Fall through to send as plain text message
          messages.push({
            role: 'user',
            content: msg.content || '',
          });
          continue;
        }
        
        const contentParts: Array<Record<string, unknown>> = [];
        
        if (msg.content) {
          contentParts.push({ type: 'text', text: msg.content });
        }
        
        // Only include images if model supports vision
        if (modelSupportsVision) {
          for (const attachment of msg.attachments) {
            if (attachment.mimeType?.startsWith('image/')) {
              const imageData = attachment.content || '';
              // Support both URL and base64 formats
              const imageUrl = imageData.startsWith('http') 
                ? imageData 
                : `data:${attachment.mimeType};base64,${imageData}`;
              
              contentParts.push({
                type: 'image_url',
                image_url: { url: imageUrl },
              });
            }
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

    // Enable thinking mode for supported models
    // @see https://docs.z.ai/guides/llm/glm-4.7
    if (isThinkingModel && this.enableThinking) {
      body.thinking = { type: 'enabled' };
    }

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
      // Enable streaming tool call output for reduced latency
      // @see https://docs.z.ai/guides/capabilities/stream-tool
      if (request.tools.length > 0) {
        body.tool_stream = true;
      }
    }

    return body;
  }
}
