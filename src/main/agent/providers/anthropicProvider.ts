import { BaseLLMProvider, type ProviderRequest, type ProviderMessage, type CacheControl, APIError, withRetry, fetchStreamWithRetry } from './baseProvider';
import type { ProviderResponse, ToolCallPayload, ProviderResponseChunk } from '../../../shared/types';
import { createLogger } from '../../logger';
import { DEFAULT_MODELS } from './registry';

const logger = createLogger('AnthropicProvider');

/** Minimum content size in characters to consider for caching (1024 chars ~= 256 tokens) */
const MIN_CACHE_SIZE = 1024;

/** Anthropic model from /v1/models endpoint */
export interface AnthropicModel {
  id: string;
  created_at: string;
  display_name: string;
  type: 'model';
}

/**
 * Model-specific output token limits
 * 
 * Claude 4.5 family: 64K output
 * Claude 4 family: 64K output  
 * Claude 3.7: 8K output
 * Claude 3.5: 8K output
 * Claude 3: 4K output
 * 
 * @see https://docs.anthropic.com/en/docs/about-claude/models/claude-4-family
 */
const MODEL_OUTPUT_LIMITS: Record<string, number> = {
  // Claude 4.5 family (2025)
  'claude-haiku-4-5-20250929': 64000,
  'claude-haiku-4-5': 64000,
  
  // Claude 4 family (2025)
  'claude-sonnet-4-5-20250929': 64000,
  'claude-sonnet-4-5': 64000,
  'claude-opus-4-5': 64000,
  'claude-opus-4-5-20250929': 64000,
  'claude-sonnet-4-20250514': 64000,
  'claude-sonnet-4': 64000,
  'claude-opus-4-20250514': 64000,
  'claude-opus-4': 64000,
  
  // Claude 3.7 family
  'claude-3-7-sonnet-20250219': 8192,
  'claude-3-7-sonnet': 8192,
  
  // Claude 3.5 family
  'claude-3-5-sonnet-20241022': 8192,
  'claude-3-5-sonnet-20240620': 8192,
  'claude-3-5-sonnet': 8192,
  'claude-3-5-haiku-20241022': 8192,
  'claude-3-5-haiku': 8192,
  
  // Claude 3 family (legacy)
  'claude-3-opus-20240229': 4096,
  'claude-3-opus': 4096,
  'claude-3-sonnet-20240229': 4096,
  'claude-3-sonnet': 4096,
  'claude-3-haiku-20240307': 4096,
  'claude-3-haiku': 4096,
  
  // Default fallback
  'default': 8192,
};

/** 
 * Anthropic API maximum token limit
 * @see https://docs.anthropic.com/en/api/messages
 */
const API_MAX_TOKENS_LIMIT = 64000;

export class AnthropicProvider extends BaseLLMProvider {
  readonly name = 'anthropic' as const;
  override readonly supportsCaching: boolean = true;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private cachedModels: AnthropicModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly modelsCacheTTL = 5 * 60 * 1000; // 5 minutes
  private subscriptionToken?: string;
  private apiKeyFallback?: string;
  
  /** Valid Anthropic model ID patterns */
  private static readonly VALID_MODEL_PATTERNS = [
    /^claude-/,  // All Claude models start with 'claude-'
  ];

  constructor(apiKey?: string, baseUrl?: string, defaultModel?: string, subscriptionToken?: string) {
    super(apiKey);
    this.baseUrl = baseUrl || 'https://api.anthropic.com/v1';
    this.defaultModel = defaultModel || DEFAULT_MODELS.anthropic;
    this.subscriptionToken = subscriptionToken;
    this.apiKeyFallback = apiKey;
  }

  /**
   * Set subscription token for OAuth-based authentication
   */
  setSubscriptionToken(token: string | undefined): void {
    this.subscriptionToken = token;
  }

  /**
   * Check if provider has valid authentication
   */
  hasValidAuth(): boolean {
    return !!(this.subscriptionToken || this.apiKeyFallback);
  }

  /**
   * Clear subscription token (fallback to API key if available)
   */
  clearSubscriptionToken(): void {
    this.subscriptionToken = undefined;
  }

  /**
   * Fetch available models from Anthropic API
   * @see https://docs.anthropic.com/en/api/models-list
   */
  async fetchModels(signal?: AbortSignal): Promise<AnthropicModel[]> {
    // Return cached models if still valid
    if (this.cachedModels && Date.now() - this.modelsCacheTime < this.modelsCacheTTL) {
      return this.cachedModels;
    }

    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
    };
    
    // Use subscription token if available, otherwise use API key
    if (this.subscriptionToken) {
      headers['Authorization'] = `Bearer ${this.subscriptionToken}`;
    } else {
      const apiKey = this.assertApiKey();
      headers['x-api-key'] = apiKey;
    }
    
    const response = await fetch(`${this.baseUrl}/models?limit=100`, {
      method: 'GET',
      headers,
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw APIError.fromResponse(response, errorText);
    }

    const data = await response.json();
    this.cachedModels = data.data || [];
    this.modelsCacheTime = Date.now();
    
    logger.debug('Fetched Anthropic models', { count: this.cachedModels?.length });
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
   * Check if a model ID is a valid Anthropic model
   */
  private isValidAnthropicModel(modelId: string): boolean {
    return AnthropicProvider.VALID_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Get validated model ID - falls back to default if invalid
   */
  private getValidatedModel(requestedModel?: string): string {
    if (requestedModel && this.isValidAnthropicModel(requestedModel)) {
      return requestedModel;
    }
    if (requestedModel) {
      logger.warn('Received invalid model, falling back to default', { requestedModel, defaultModel: this.defaultModel });
    }
    return this.defaultModel;
  }
  
  /**
   * Clamp max_tokens to valid range for the model and API
   */
  private clampMaxTokens(maxTokens: number, model: string): number {
    let modelLimit = MODEL_OUTPUT_LIMITS[model];
    
    if (!modelLimit) {
      for (const [key, limit] of Object.entries(MODEL_OUTPUT_LIMITS)) {
        if (model.startsWith(key) || key.startsWith(model.split('-').slice(0, 3).join('-'))) {
          modelLimit = limit;
          break;
        }
      }
    }
    
    modelLimit = modelLimit || MODEL_OUTPUT_LIMITS['default'];
    
    const clamped = Math.min(
      Math.max(1, maxTokens),
      modelLimit,
      API_MAX_TOKENS_LIMIT
    );
    
    if (clamped !== maxTokens) {
      logger.debug('Clamped max_tokens', { original: maxTokens, clamped, model });
    }
    
    return clamped;
  }
  
  /**
   * Validate that messages have required fields for the API
   */
  private validateMessages(messages: ProviderMessage[]): ProviderMessage[] {
    return messages.filter((msg, index) => {
      if (msg.role === 'assistant' && index === messages.length - 1) {
        return true;
      }
      
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
   * Ensure all tool_use blocks have corresponding tool_result messages
   * and remove orphan tool messages.
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
  
  /**
   * Build headers for the API request
   */
  private buildHeaders(request: ProviderRequest): Record<string, string> {
    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
    
    // Use subscription token (OAuth) if available, otherwise use API key
    if (this.subscriptionToken) {
      headers['Authorization'] = `Bearer ${this.subscriptionToken}`;
    } else {
      const apiKey = this.assertApiKey();
      headers['x-api-key'] = apiKey;
    }
    
    if (request.cache?.cacheSystemPrompt || request.cache?.cacheFileContexts || request.cache?.cacheTools) {
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
    }
    
    return headers;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.buildHeaders(request),
        body: JSON.stringify(this.buildBody(request, false)),
        signal: request.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw APIError.fromResponse(response, errorText);
      }

      const payload = await response.json();
    
      const textContent = payload.content
        ?.filter((block: { type: string; text?: string }) => block.type === 'text')
        .map((block: { type: string; text?: string }) => block.text)
        .join('');

      const toolCalls: ToolCallPayload[] = payload.content
        ?.filter((block: { type: string }) => block.type === 'tool_use')
        .map((block: { name: string; input?: Record<string, unknown>; id: string }) => ({
          name: block.name,
          arguments: block.input ?? {},
          callId: block.id,
        })) ?? [];

      return {
        content: textContent ?? '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: payload.stop_reason,
        usage: payload.usage ? {
          input: payload.usage.input_tokens,
          output: payload.usage.output_tokens,
          total: payload.usage.input_tokens + payload.usage.output_tokens,
        } : undefined,
      };
    }, {}, request.signal);
  }

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk> {
    // Use fetchStreamWithRetry for automatic retry on network errors
    const response = await fetchStreamWithRetry(
      `${this.baseUrl}/messages`,
      {
        method: 'POST',
        headers: this.buildHeaders(request),
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
    
    let currentBlockType: 'text' | 'tool_use' | null = null;
    let currentToolUseIndex = -1;
    const validToolIndices = new Set<number>();

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
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              switch (event.type) {
                case 'message_start':
                  if (event.message?.usage) {
                    yield { usage: { input: event.message.usage.input_tokens, output: 0, total: event.message.usage.input_tokens } };
                  }
                  break;
                  
                case 'content_block_start':
                  currentBlockType = event.content_block?.type ?? null;
                  
                  if (event.content_block?.type === 'tool_use') {
                    const toolName = event.content_block.name;
                    const toolId = event.content_block.id;
                    
                    if (toolName && typeof toolName === 'string' && toolName.trim() && 
                        toolId && typeof toolId === 'string' && toolId.trim()) {
                      currentToolUseIndex = event.index;
                      validToolIndices.add(event.index);
                      yield {
                        toolCall: {
                          index: event.index,
                          callId: toolId,
                          name: toolName.trim(),
                          argsJson: '',
                        }
                      };
                    } else {
                      logger.warn('Skipping tool_use block with invalid name or id', {
                        index: event.index,
                        hasName: !!toolName,
                        hasId: !!toolId,
                      });
                    }
                  }
                  break;
                  
                case 'content_block_delta':
                  if (event.delta?.type === 'text_delta') {
                    yield { delta: event.delta.text };
                  } else if (event.delta?.type === 'input_json_delta') {
                    const deltaIndex = event.index ?? currentToolUseIndex;
                    if (deltaIndex >= 0 && validToolIndices.has(deltaIndex)) {
                      yield {
                        toolCall: {
                          index: deltaIndex,
                          argsJson: event.delta.partial_json,
                        }
                      };
                    }
                  }
                  break;
                  
                case 'content_block_stop':
                  if (currentBlockType === 'tool_use') {
                    currentToolUseIndex = -1;
                  }
                  currentBlockType = null;
                  break;
                  
                case 'message_delta':
                  if (event.usage) {
                     yield { usage: { input: 0, output: event.usage.output_tokens, total: event.usage.output_tokens } };
                  }
                  if (event.delta?.stop_reason) {
                    yield { finishReason: event.delta.stop_reason };
                  }
                  break;
              }
            } catch (e) {
              logger.error('Error parsing SSE event', { error: e instanceof Error ? e.message : String(e) });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildBody(request: ProviderRequest, stream: boolean) {
    let toolCallCounter = 0;
    
    const cacheConfig = request.cache;
    // Anthropic only supports '5m' and '1h' TTL - filter out '24h' (OpenAI-specific)
    const rawTtl = cacheConfig?.ttl ?? '5m';
    const cacheTtl: '5m' | '1h' = rawTtl === '24h' ? '1h' : rawTtl;
    const minCacheSize = cacheConfig?.minCacheSize ?? MIN_CACHE_SIZE;
    
    type CacheControlWithTtl = CacheControl & { ttl?: '5m' | '1h' };
    let systemContent: string | Array<{ type: 'text'; text: string; cache_control?: CacheControlWithTtl }>;
    
    if (cacheConfig?.cacheSystemPrompt && request.systemPrompt.length >= minCacheSize) {
      const cacheControl: CacheControlWithTtl = { type: 'ephemeral', ttl: cacheTtl };
      systemContent = [{
        type: 'text',
        text: request.systemPrompt,
        cache_control: cacheControl
      }];
    } else {
      systemContent = request.systemPrompt;
    }
    
    type ToolDefinitionWithCache = {
      name: string;
      description: string;
      input_schema: Record<string, unknown>;
      cache_control?: CacheControlWithTtl;
    };
    let toolsContent: Array<ToolDefinitionWithCache> | undefined;
    
    if (request.tools.length > 0) {
      toolsContent = request.tools.map((tool, index) => {
        let enhancedDescription = tool.description;
        
        if (tool.input_examples && tool.input_examples.length > 0) {
          enhancedDescription += '\n\nExample inputs:';
          tool.input_examples.slice(0, 3).forEach((example, i) => {
            enhancedDescription += `\n${i + 1}. ${JSON.stringify(example)}`;
          });
        }
        
        const toolDef: ToolDefinitionWithCache = {
          name: tool.name,
          description: enhancedDescription,
          input_schema: tool.jsonSchema,
        };
        
        if (cacheConfig?.cacheTools && index === request.tools.length - 1) {
          toolDef.cache_control = { type: 'ephemeral', ttl: cacheTtl };
        }
        
        return toolDef;
      });
    }
    
    const model = this.getValidatedModel(request.config.model);
    const maxTokens = this.clampMaxTokens(request.config.maxOutputTokens, model);
    
    let validatedMessages = this.validateMessages(request.messages);
    validatedMessages = this.ensureCompleteToolCallSequences(validatedMessages);
    
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature: request.config.temperature,
      system: systemContent,
      stream,
      tools: toolsContent,
      messages: validatedMessages
        .filter((message) => message.role !== 'system')
        .map((message) => {
          if (message.role === 'tool') {
            const toolUseId = message.toolCallId || `toolu_fallback_${toolCallCounter++}`;
            return {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolUseId,
                  content: message.content || '(no output)',
                }
              ]
            };
          }
          if (message.role === 'assistant') {
            type AssistantContentBlock = 
              | { type: 'text'; text: string } 
              | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
            
            const content: AssistantContentBlock[] = [];
            
            if (message.content) {
              content.push({ type: 'text', text: message.content });
            }
            
            if (message.toolCalls && message.toolCalls.length > 0) {
              message.toolCalls.forEach(tc => {
                const tcId = tc.callId || `toolu_fallback_${toolCallCounter++}`;
                content.push({
                  type: 'tool_use',
                  id: tcId,
                  name: tc.name,
                  input: tc.arguments || {}
                });
              });
            }
            
            if (content.length > 0) {
              return { role: 'assistant', content };
            }
            
            return {
              role: 'assistant',
              content: message.content || '...'
            };
          }
          return {
            role: message.role,
            content: message.content || '(empty message)'
          };
        }),
    };
    
    return body;
  }
}
