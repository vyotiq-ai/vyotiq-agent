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
   * Models that support extended thinking
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#supported-models
   */
  private static readonly EXTENDED_THINKING_MODELS = [
    /^claude-sonnet-4-5/,      // Claude Sonnet 4.5
    /^claude-haiku-4-5/,       // Claude Haiku 4.5
    /^claude-opus-4-5/,        // Claude Opus 4.5
    /^claude-opus-4-1/,        // Claude Opus 4.1
    /^claude-opus-4/,          // Claude Opus 4
    /^claude-sonnet-4/,        // Claude Sonnet 4
    /^claude-3-7-sonnet/,      // Claude 3.7 Sonnet (deprecated)
  ];

  /**
   * Check if a model supports extended thinking
   */
  private supportsExtendedThinking(model: string): boolean {
    return AnthropicProvider.EXTENDED_THINKING_MODELS.some(pattern => pattern.test(model));
  }

  /**
   * Check if extended thinking should be enabled for this request
   */
  private isExtendedThinkingEnabled(request: import('./baseProvider').ProviderRequest): boolean {
    const model = this.getValidatedModel(request.config.model);
    
    // Extended thinking requires explicit opt-in and model support
    if (!request.config.enableAnthropicThinking) {
      return false;
    }
    
    if (!this.supportsExtendedThinking(model)) {
      logger.debug('Extended thinking not supported for model', { model });
      return false;
    }
    
    return true;
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
    
    // Build beta headers array
    const betaHeaders: string[] = [];
    
    // Add prompt caching beta header if needed
    if (request.cache?.cacheSystemPrompt || request.cache?.cacheFileContexts || request.cache?.cacheTools) {
      betaHeaders.push('prompt-caching-2024-07-31');
    }
    
    // Add interleaved thinking beta header for Claude 4 models with tool use
    // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#interleaved-thinking
    if (request.config.enableInterleavedThinking && this.isExtendedThinkingEnabled(request)) {
      betaHeaders.push('interleaved-thinking-2025-05-14');
    }
    
    if (betaHeaders.length > 0) {
      headers['anthropic-beta'] = betaHeaders.join(',');
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
    
    // Track current content block state
    let currentBlockType: 'text' | 'tool_use' | 'thinking' | 'redacted_thinking' | null = null;
    let currentToolUseIndex = -1;
    const validToolIndices = new Set<number>();
    
    // Extended thinking state
    // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking
    let isThinkingStarted = false;
    let isThinkingEnded = false;
    let currentThinkingSignature: string | undefined;

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
                  
                  // Handle thinking content block start (extended thinking)
                  // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#streaming-thinking
                  if (event.content_block?.type === 'thinking') {
                    if (!isThinkingStarted) {
                      isThinkingStarted = true;
                      yield { thinkingStart: true };
                      logger.debug('Extended thinking started', { index: event.index });
                    }
                  }
                  
                  // Handle redacted thinking blocks (encrypted for safety)
                  // These must be passed back to the API but not displayed to users
                  // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#thinking-redaction
                  if (event.content_block?.type === 'redacted_thinking') {
                    logger.debug('Redacted thinking block received', { 
                      index: event.index,
                      hasData: !!event.content_block.data,
                    });
                  }
                  
                  if (event.content_block?.type === 'tool_use') {
                    // If we were in thinking mode, signal end before tool use
                    if (isThinkingStarted && !isThinkingEnded) {
                      isThinkingEnded = true;
                      yield { thinkingEnd: true };
                    }
                    
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
                  
                  // Handle text block start - signal thinking end if we were thinking
                  if (event.content_block?.type === 'text') {
                    if (isThinkingStarted && !isThinkingEnded) {
                      isThinkingEnded = true;
                      yield { thinkingEnd: true };
                    }
                  }
                  break;
                  
                case 'content_block_delta':
                  // Handle thinking_delta events (extended thinking content)
                  // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#streaming-thinking
                  if (event.delta?.type === 'thinking_delta') {
                    const thinkingText = event.delta.thinking;
                    if (typeof thinkingText === 'string' && thinkingText.length > 0) {
                      yield { thinkingDelta: thinkingText };
                    }
                  }
                  // Handle signature_delta events (thinking block signature)
                  // The signature is used to verify thinking blocks when passed back to the API
                  else if (event.delta?.type === 'signature_delta') {
                    const signature = event.delta.signature;
                    if (typeof signature === 'string') {
                      currentThinkingSignature = (currentThinkingSignature || '') + signature;
                    }
                  }
                  // Handle regular text deltas
                  else if (event.delta?.type === 'text_delta') {
                    yield { delta: event.delta.text };
                  }
                  // Handle tool argument deltas  
                  else if (event.delta?.type === 'input_json_delta') {
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
                  // Emit thought signature when thinking block stops
                  if (currentBlockType === 'thinking' && currentThinkingSignature) {
                    yield { thoughtSignature: currentThinkingSignature };
                    currentThinkingSignature = undefined;
                  }
                  
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
    
    // Check if extended thinking is enabled
    const isThinkingEnabled = this.isExtendedThinkingEnabled(request);
    const thinkingBudget = request.config.anthropicThinkingBudget ?? 10000;
    
    // Build thinking configuration if enabled
    // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#how-to-use-extended-thinking
    const thinkingConfig = isThinkingEnabled ? {
      type: 'enabled',
      budget_tokens: Math.max(1024, Math.min(thinkingBudget, maxTokens - 1)), // Must be < max_tokens
    } : undefined;
    
    // Log thinking configuration for debugging
    if (isThinkingEnabled) {
      logger.debug('Extended thinking enabled', {
        model,
        budgetTokens: thinkingConfig?.budget_tokens,
        maxTokens,
        interleavedThinking: request.config.enableInterleavedThinking,
      });
    }
    
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
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
            // Extended content block types for assistant messages
            // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#preserving-thinking-blocks
            type AssistantContentBlock = 
              | { type: 'text'; text: string } 
              | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
              | { type: 'thinking'; thinking: string; signature: string }
              | { type: 'redacted_thinking'; data: string };
            
            const content: AssistantContentBlock[] = [];
            
            // CRITICAL: Preserve thinking blocks for tool use loops
            // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#preserving-thinking-blocks
            // When Claude invokes tools, thinking blocks must be passed back to maintain reasoning continuity
            if (isThinkingEnabled && message.thinking && message.anthropicThinkingSignature) {
              content.push({
                type: 'thinking',
                thinking: message.thinking,
                signature: message.anthropicThinkingSignature,
              });
            }
            
            // Preserve redacted thinking blocks (encrypted content)
            // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#thinking-redaction
            if (isThinkingEnabled && message.redactedThinking) {
              content.push({
                type: 'redacted_thinking',
                data: message.redactedThinking,
              });
            }
            
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
          // Handle user messages with potential attachments (vision support)
          // @see https://docs.anthropic.com/en/docs/build-with-claude/vision
          if (message.role === 'user' && message.attachments && message.attachments.length > 0) {
            type UserContentBlock = 
              | { type: 'text'; text: string }
              | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
            
            const userContent: UserContentBlock[] = [];
            
            // Add image attachments first (Claude processes images before text)
            for (const attachment of message.attachments) {
              const isImage = attachment.mimeType?.startsWith('image/');
              if (isImage && attachment.content) {
                // Supported formats: image/jpeg, image/png, image/gif, image/webp
                const mediaType = attachment.mimeType || 'image/png';
                userContent.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: attachment.content,
                  },
                });
                logger.debug('Added image attachment to Anthropic request', {
                  name: attachment.name,
                  mimeType: mediaType,
                  sizeBytes: attachment.content.length,
                });
              }
            }
            
            // Add text content
            if (message.content) {
              userContent.push({ type: 'text', text: message.content });
            }
            
            // If we have structured content, use it; otherwise fall back to simple text
            if (userContent.length > 0) {
              return {
                role: 'user',
                content: userContent,
              };
            }
          }
          
          return {
            role: message.role,
            content: message.content || '(empty message)'
          };
        }),
    };
    
    // Add thinking configuration if enabled
    // NOTE: Temperature is not compatible with extended thinking
    if (thinkingConfig) {
      body.thinking = thinkingConfig;
      // Temperature must not be set when thinking is enabled
      // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#feature-compatibility
    } else {
      // Only set temperature when thinking is disabled
      body.temperature = request.config.temperature;
    }
    
    return body;
  }
}
