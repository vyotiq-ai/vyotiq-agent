import { BaseLLMProvider, type ProviderRequest, type ProviderMessage, APIError, withRetry, fetchStreamWithRetry } from './baseProvider';
import type { ProviderResponse, ToolCallPayload, ProviderResponseChunk, TokenUsage } from '../../../shared/types';
import { createLogger } from '../../logger';
import { normalizeStrictJsonSchema, parseToolArguments } from '../../utils';
import { DEFAULT_MODELS } from './registry';

const logger = createLogger('DeepSeekProvider');

/** DeepSeek model from /models endpoint */
export interface DeepSeekModel {
  id: string;
  object: 'model';
  owned_by: string;
}

/**
 * DeepSeek Provider (V3.2 - December 2025)
 * 
 * Supports DeepSeek V3.2 models with thinking mode and tool calls.
 * 
 * KEY FEATURES:
 * - Thinking Mode: Enable via model="deepseek-reasoner" or thinking param
 * - Tool Calls in Thinking Mode: Must pass reasoning_content back during tool loops
 * - Context Caching: Automatic, tracks cache_hit/cache_miss tokens
 * - Strict Mode (Beta): Use base_url="https://api.deepseek.com/beta"
 * 
 * MODEL DETAILS:
 * - deepseek-chat: V3.2 non-thinking, max 8K output, function calling + JSON
 * - deepseek-reasoner: V3.2 thinking mode, max 64K output (includes CoT)
 * - deepseek-coder: Legacy code model, max 8K output
 * 
 * THINKING MODE BEHAVIOR:
 * - Response includes reasoning_content (CoT) and content (final answer)
 * - For tool calls: reasoning_content must be passed back until final answer
 * - On new user turn: Clear reasoning_content from history to save bandwidth
 * - Temperature/top_p/penalties are ignored in thinking mode
 * - logprobs/top_logprobs WILL cause errors in thinking mode
 * 
 * PRICING (per 1M tokens):
 * - Input (cache hit): $0.028
 * - Input (cache miss): $0.28
 * - Output: $0.42
 * 
 * ERROR CODES:
 * - 400: Invalid format - check request body
 * - 401: Authentication fails - check API key
 * - 402: Insufficient balance - top up account
 * - 422: Invalid parameters - check parameter values
 * - 429: Rate limit - pace requests (no hard limit, but server may queue)
 * - 500: Server error - retry
 * - 503: Server overloaded - retry
 * 
 * @see https://api-docs.deepseek.com/news/news251201
 * @see https://api-docs.deepseek.com/guides/thinking_mode
 * @see https://api-docs.deepseek.com/guides/tool_calls
 * @see https://api-docs.deepseek.com/guides/kv_cache
 * @see https://api-docs.deepseek.com/quick_start/error_codes
 */

/** Model-specific output token limits */
const MODEL_OUTPUT_LIMITS: Record<string, number> = {
  'deepseek-chat': 8192,           // Default 4K, Max 8K
  'deepseek-reasoner': 65536,      // Default 32K, Max 64K (includes CoT)
  'deepseek-v3.2-speciale': 131072, // Default 128K, Max 128K
  'deepseek-coder': 8192,
  'default': 8192,
};

/** DeepSeek API maximum token limit */
const API_MAX_TOKENS_LIMIT = 131072; // V3.2-Speciale supports 128K output

/** Context length for all models */
const CONTEXT_LENGTH = 131072; // 128K context for all V3.2 models

/** Models that support thinking/reasoning mode by default
 * @see https://api-docs.deepseek.com/guides/thinking_mode
 */
const THINKING_MODELS = new Set(['deepseek-reasoner']);

/** Models that can enable thinking mode via the thinking parameter */
const THINKING_CAPABLE_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner']);

/** Models that do NOT support tool calls */
const NO_TOOL_SUPPORT_MODELS = new Set<string>(); // All current models support tools

/** Models that do NOT support FIM (Fill-in-the-Middle) completion */
const NO_FIM_SUPPORT_MODELS = new Set(['deepseek-reasoner']);

// V3.2-Speciale endpoint EXPIRED Dec 15, 2025 15:59 UTC - removed

/**
 * DeepSeek-specific error codes with descriptions
 * @see https://api-docs.deepseek.com/quick_start/error_codes
 */
const DEEPSEEK_ERROR_CODES: Record<number, { cause: string; solution: string }> = {
  400: {
    cause: 'Invalid request body format',
    solution: 'Modify your request body according to the hints in the error message',
  },
  401: {
    cause: 'Authentication fails due to wrong API key',
    solution: 'Check your API key or create a new one',
  },
  402: {
    cause: 'Insufficient balance',
    solution: 'Top up your account balance',
  },
  422: {
    cause: 'Invalid parameters in request',
    solution: 'Modify your request parameters according to the error message',
  },
  429: {
    cause: 'Rate limit reached (high traffic)',
    solution: 'Pace your requests. Server will queue requests during high traffic',
  },
  500: {
    cause: 'Server error',
    solution: 'Retry your request after a brief wait',
  },
  503: {
    cause: 'Server overloaded due to high traffic',
    solution: 'Retry your request after a brief wait',
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeDeepSeekStrictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeDeepSeekStrictSchema);
  if (!isPlainObject(schema)) return schema;

  const result: Record<string, unknown> = { ...schema };

  // Recurse common JSON Schema locations
  if (isPlainObject(result.properties)) {
    const nextProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(result.properties)) {
      nextProps[k] = sanitizeDeepSeekStrictSchema(v);
    }
    result.properties = nextProps;
  }
  if ('items' in result) {
    result.items = sanitizeDeepSeekStrictSchema(result.items);
  }
  if (Array.isArray(result.anyOf)) {
    result.anyOf = result.anyOf.map(sanitizeDeepSeekStrictSchema);
  }
  if (Array.isArray(result.oneOf)) {
    result.oneOf = result.oneOf.map(sanitizeDeepSeekStrictSchema);
  }
  if (Array.isArray(result.allOf)) {
    result.allOf = result.allOf.map(sanitizeDeepSeekStrictSchema);
  }

  // DeepSeek strict mode limitations:
  // - string: does NOT support minLength/maxLength
  // - array: does NOT support minItems/maxItems
  // (pattern/format are supported)
  const type = result.type;
  const types = typeof type === 'string' ? [type] : Array.isArray(type) ? type.filter((t): t is string => typeof t === 'string') : [];
  if (types.includes('string')) {
    delete result.minLength;
    delete result.maxLength;
  }
  if (types.includes('array')) {
    delete result.minItems;
    delete result.maxItems;
  }

  // Ensure nested object constraints stay strict.
  if (types.includes('object')) {
    result.additionalProperties = false;
  }

  return result;
}

function supportsFIMCompletion(modelId: string): boolean {
  return !NO_FIM_SUPPORT_MODELS.has(modelId);
}

export class DeepSeekProvider extends BaseLLMProvider {
  readonly name = 'deepseek' as const;
  readonly supportsCaching = true; // DeepSeek has automatic context caching
  
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  /** Whether to enable thinking mode for non-thinking models (deepseek-chat) */
  private enableThinking: boolean;
  /** Cached models from API */
  private cachedModels: DeepSeekModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly modelsCacheTTL = 5 * 60 * 1000; // 5 minutes
  
  /** Valid DeepSeek model IDs per API docs
   * @see https://api-docs.deepseek.com/api/create-chat-completion
   * Possible values: [`deepseek-chat`, `deepseek-reasoner`]
   */
  private static readonly VALID_MODELS = new Set([
    'deepseek-chat',
    'deepseek-reasoner',
  ]);

  constructor(
    apiKey?: string, 
    baseUrl = 'https://api.deepseek.com', 
    defaultModel?: string,
    enableThinking = false
  ) {
    super(apiKey);
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel || DEFAULT_MODELS.deepseek;
    this.enableThinking = enableThinking;
  }

  /**
   * Fetch available models from DeepSeek API
   * @see https://api-docs.deepseek.com/api/list-models
   */
  async fetchModels(signal?: AbortSignal): Promise<DeepSeekModel[]> {
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
    
    logger.debug('Fetched DeepSeek models', { count: this.cachedModels?.length });
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
   * Set whether to enable thinking mode for capable models.
   * When enabled, deepseek-chat will use `thinking: { type: "enabled" }` parameter.
   */
  setThinkingEnabled(enabled: boolean): void {
    this.enableThinking = enabled;
  }
  
  /**
   * Check if a model ID is a valid DeepSeek model
   */
  private isValidDeepSeekModel(modelId: string): boolean {
    if (DeepSeekProvider.VALID_MODELS.has(modelId)) {
      return true;
    }
    if (modelId.startsWith('deepseek-')) {
      return true;
    }
    return false;
  }
  
  /**
   * Check if a model uses thinking/reasoning mode by default
   */
  private isThinkingModel(modelId: string): boolean {
    return THINKING_MODELS.has(modelId);
  }
  
  /**
   * Check if a model can enable thinking mode via the thinking parameter
   */
  private isThinkingCapable(modelId: string): boolean {
    return THINKING_CAPABLE_MODELS.has(modelId);
  }
  
  /**
   * Check if a model supports tool calls
   */
  private supportsTools(modelId: string): boolean {
    return !NO_TOOL_SUPPORT_MODELS.has(modelId);
  }
  
  /**
   * Check if thinking mode should be active for this request
   * - Always true for thinking models (deepseek-reasoner)
   * - True for deepseek-chat if enableThinking is set
   * @see https://api-docs.deepseek.com/guides/thinking_mode
   */
  private shouldUseThinkingMode(modelId: string): boolean {
    if (this.isThinkingModel(modelId)) {
      return true;
    }
    if (this.enableThinking && this.isThinkingCapable(modelId)) {
      return true;
    }
    return false;
  }
  
  /**
   * Clamp max_tokens to valid range for the model and API
   */
  private clampMaxTokens(maxTokens: number, model: string): number {
    const modelLimit = MODEL_OUTPUT_LIMITS[model] || MODEL_OUTPUT_LIMITS['default'];
    const effectiveMaxTokens = (maxTokens && maxTokens > 0) ? maxTokens : modelLimit;
    
    const clamped = Math.min(
      Math.max(1, effectiveMaxTokens),
      modelLimit,
      API_MAX_TOKENS_LIMIT,
      // Defensive clamp: output tokens should never exceed the model context window.
      // This is mostly redundant with API_MAX_TOKENS_LIMIT today, but keeps the intent explicit.
      CONTEXT_LENGTH
    );
    
    if (clamped !== maxTokens && maxTokens > 0) {
      logger.debug('Clamped max_tokens', { original: maxTokens, clamped, model });
    }
    
    return clamped;
  }
  
  /**
   * Prepare messages for DeepSeek API
   * 
   * THINKING MODE CRITICAL BEHAVIOR:
   * - During tool call loops within a single turn: MUST include reasoning_content
   *   - Without this, API returns 400 error
   *   - Example: User asks question → Model thinks + calls tool → User provides result → 
   *     Model MUST receive the reasoning_content from previous step to continue reasoning
   * - For new user questions (new turn): Clear reasoning_content from previous turns
   *   - This is bandwidth optimization, API ignores old reasoning_content anyway
   * 
   * The thinking field in ProviderMessage maps to DeepSeek's reasoning_content
   * 
   * @see https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
   */
  private prepareMessagesForAPI(messages: ProviderMessage[], isThinkingMode: boolean): Array<Record<string, unknown>> {
    let toolCallCounter = 0;
    let lastUserMessageIndex = -1;
    
    // Find the index of the last user message to know when to clear reasoning_content
    // All assistant messages AFTER the last user message are part of the current turn's tool loop
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }
    
    // Track reasoning_content inclusion for debugging
    let reasoningContentIncluded = 0;
    let reasoningContentCleared = 0;
    
    const result = messages.map((message, index) => {
      if (message.role === 'tool') {
        return {
          role: 'tool',
          content: message.content || '(no output)',
          tool_call_id: message.toolCallId || `call_fallback_${toolCallCounter++}`,
        };
      }
      
      if (message.role === 'assistant') {
        const baseMessage: Record<string, unknown> = {
          role: 'assistant',
          content: message.content || null,
        };
        
        // CRITICAL: In thinking mode, include reasoning_content for tool call sequences
        // but CLEAR it for messages before the last user question
        if (isThinkingMode && message.thinking) {
          // Only include reasoning_content for messages AFTER the last user message
          // (i.e., during the current turn's tool call loop)
          if (index > lastUserMessageIndex) {
            baseMessage.reasoning_content = message.thinking;
            reasoningContentIncluded++;
          } else {
            // Intentionally omit reasoning_content to save bandwidth
            // Per DeepSeek docs: "When the next user question begins, the previous 
            // reasoning_content should be removed... If reasoning_content is retained 
            // and sent to the API, the API will ignore it."
            reasoningContentCleared++;
          }
        }
        
        if (message.toolCalls && message.toolCalls.length > 0) {
          baseMessage.tool_calls = message.toolCalls.map(tc => ({
            id: tc.callId || `call_fallback_${toolCallCounter++}`,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments || {})
            }
          }));
        }
        
        return baseMessage;
      }
      
      return {
        role: message.role,
        content: message.content || ''
      };
    });
    
    // Log reasoning_content handling for debugging thinking mode issues
    if (isThinkingMode && (reasoningContentIncluded > 0 || reasoningContentCleared > 0)) {
      logger.debug('Thinking mode message preparation', {
        lastUserMessageIndex,
        totalMessages: messages.length,
        reasoningContentIncluded,
        reasoningContentCleared,
        note: reasoningContentIncluded > 0 
          ? 'reasoning_content passed back for current turn tool loop' 
          : 'No reasoning_content in current turn (normal for first request)',
      });
    }
    
    return result;
  }
  
  /**
   * Validate assistant messages
   */
  private validateAssistantMessages(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return messages.filter(msg => {
      if (msg.role !== 'assistant') return true;
      
      const hasContent = msg.content !== null && msg.content !== undefined && 
                         (typeof msg.content !== 'string' || (msg.content as string).trim().length > 0);
      const hasToolCalls = Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
      
      if (!hasContent && !hasToolCalls) {
        logger.warn('Filtering out invalid assistant message (no content or tool_calls)');
        return false;
      }
      return true;
    });
  }
  
  /**
   * Ensure tool call sequences are complete and remove orphan tool messages
   */
  private ensureCompleteToolCallSequences(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];
    let currentAssistantToolCallIds: Set<string> | null = null;
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        // Track tool call IDs from this assistant message
        const toolCalls = msg.tool_calls as Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
        currentAssistantToolCallIds = new Set(toolCalls.map(tc => tc.id));
        result.push(msg);
        
        // Look ahead to find all tool responses
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
          const toolMsg = messages[j];
          if (typeof toolMsg.tool_call_id === 'string') {
            currentAssistantToolCallIds.delete(toolMsg.tool_call_id);
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
              tool_call_id: toolCallId,
            });
          }
        }
        
        // Reset for next sequence
        currentAssistantToolCallIds = new Set(toolCalls.map(tc => tc.id));
      } else if (msg.role === 'tool') {
        const toolCallId = msg.tool_call_id as string | undefined;
        
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
   * Parse DeepSeek usage response including cache hit tracking and reasoning tokens
   * 
   * DeepSeek usage structure:
   * {
   *   prompt_tokens: number,
   *   completion_tokens: number,
   *   total_tokens: number,
   *   prompt_cache_hit_tokens: number,   // Context caching (cheaper: $0.028/M)
   *   prompt_cache_miss_tokens: number,  // No cache hit (normal price: $0.28/M)
   *   completion_tokens_details?: {
   *     reasoning_tokens: number         // Tokens used for chain-of-thought (thinking mode)
   *   }
   * }
   * 
   * @see https://api-docs.deepseek.com/guides/kv_cache
   * @see https://api-docs.deepseek.com/guides/thinking_mode
   */
  private parseUsage(usage: Record<string, unknown> | undefined): TokenUsage | undefined {
    if (!usage) return undefined;
    
    const result: TokenUsage = {
      input: (usage.prompt_tokens as number) ?? 0,
      output: (usage.completion_tokens as number) ?? 0,
      total: (usage.total_tokens as number) ?? 0,
    };
    
    // DeepSeek context caching tokens
    // Cache is automatic and uses 64 tokens as the minimum storage unit
    // Cache hit tokens are 10x cheaper ($0.028 vs $0.28 per million tokens)
    if (typeof usage.prompt_cache_hit_tokens === 'number') {
      result.cacheHit = usage.prompt_cache_hit_tokens;
    }
    if (typeof usage.prompt_cache_miss_tokens === 'number') {
      result.cacheMiss = usage.prompt_cache_miss_tokens;
    }
    
    // Reasoning tokens (for thinking mode) - can be at top level or nested
    // Top level: usage.reasoning_tokens (some API versions)
    // Nested: usage.completion_tokens_details.reasoning_tokens (newer API)
    if (typeof usage.reasoning_tokens === 'number') {
      result.reasoningTokens = usage.reasoning_tokens;
    } else if (usage.completion_tokens_details && typeof usage.completion_tokens_details === 'object') {
      const details = usage.completion_tokens_details as Record<string, unknown>;
      if (typeof details.reasoning_tokens === 'number') {
        result.reasoningTokens = details.reasoning_tokens;
      }
    }
    
    // Log cache efficiency for debugging
    if (result.cacheHit !== undefined || result.cacheMiss !== undefined) {
      const cacheHit = result.cacheHit ?? 0;
      const cacheMiss = result.cacheMiss ?? 0;
      const total = cacheHit + cacheMiss;
      const hitRate = total > 0 ? ((cacheHit / total) * 100).toFixed(1) : '0.0';
      logger.debug('DeepSeek cache stats', {
        cacheHit,
        cacheMiss,
        hitRate: `${hitRate}%`,
        estimatedSavings: `${((cacheHit * 0.252) / 1000000).toFixed(4)} USD`, // $0.28 - $0.028 = $0.252 savings per token
      });
    }
    
    return result;
  }

  /**
   * Create an enhanced error with DeepSeek-specific context
   * Adds helpful information based on error code
   */
  private createDeepSeekError(response: Response, errorText: string): APIError {
    const baseError = APIError.fromResponse(response, errorText);
    const statusCode = response.status;
    
    // Get DeepSeek-specific error info
    const errorInfo = DEEPSEEK_ERROR_CODES[statusCode];
    
    if (errorInfo) {
      // Enhance error message with DeepSeek-specific context
      const enhancedMessage = `${baseError.message}\n` +
        `[DeepSeek ${statusCode}] ${errorInfo.cause}\n` +
        `Solution: ${errorInfo.solution}`;
      
      logger.warn('DeepSeek API error', {
        statusCode,
        cause: errorInfo.cause,
        solution: errorInfo.solution,
        originalMessage: baseError.message,
      });
      
      return new APIError(
        enhancedMessage,
        baseError.statusCode,
        baseError.retryAfter,
        baseError.isRetryable,
        baseError.isRateLimited,
        baseError.isPermanentRateLimit
      );
    }
    
    return baseError;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = this.assertApiKey();
    const body = this.buildBody(request, false);
    const model = body.model as string;
    const isThinkingMode = this.shouldUseThinkingMode(model);
    
    return withRetry(async () => {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw this.createDeepSeekError(response, errorText);
      }

      const payload = await response.json();
      const choice = payload.choices?.[0];
      if (!choice) {
        throw new Error('DeepSeek returned no choices.');
      }

      const message = choice.message;
      const toolCalls: ToolCallPayload[] = message.tool_calls?.map((call: { function?: { name: string; arguments: string }; id: string }) => ({
        name: call.function?.name ?? 'unknown_tool',
        arguments: call.function?.arguments ? parseToolArguments(call.function.arguments, call.function?.name ?? 'unknown_tool') : {},
        callId: call.id,
      })) ?? [];

      const reasoningContent = isThinkingMode ? (message.reasoning_content as string | undefined) : undefined;
      
      // CORRECT BEHAVIOR per DeepSeek docs:
      // - reasoning_content = Chain-of-thought (show in Reasoning panel via thinking field)
      // - content = Final answer (show in main response area)
      // - These are SEPARATE - don't duplicate reasoning_content to content
      // @see https://api-docs.deepseek.com/guides/thinking_mode
      const content = message.content ?? '';
      const thinking = reasoningContent; // For UI display in Reasoning panel

      return {
        content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: choice.finish_reason,
        usage: this.parseUsage(payload.usage),
        thinking,
      };
    }, {}, request.signal);
  }

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk> {
    const apiKey = this.assertApiKey();
    const body = this.buildBody(request, true);
    const model = body.model as string;
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const isThinkingMode = this.shouldUseThinkingMode(model);
    
    // Debug: Log the actual request being sent
    logger.info('DeepSeek API Request', {
      url: `${this.baseUrl}/chat/completions`,
      model,
      isThinkingMode,
      hasThinkingParam: !!body.thinking,
      thinkingParamValue: body.thinking,
      hasTools,
      messageCount: (body.messages as unknown[])?.length ?? 0,
      maxTokens: body.max_tokens,
    });
    
    // Use fetchStreamWithRetry for automatic retry on network errors
    let response: Response;
    try {
      response = await fetchStreamWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
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
    } catch (error) {
      // Re-wrap with DeepSeek-specific error if it's an API error
      if (error instanceof APIError) {
        throw this.createDeepSeekError(
          { status: error.statusCode ?? 500, headers: { get: (): string | null => null } } as unknown as Response,
          error.message
        );
      }
      throw error;
    }

    if (!response.body) throw new Error('No response body');

    const reader = (response.body as unknown as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedAnyContent = false;
    let receivedAnyToolCalls = false;
    let receivedAnyThinking = false;
    let thinkingStarted = false;
    
    // Track stream metrics for summary logging (avoid per-chunk logging spam)
    let chunkCount = 0;
    let contentLength = 0;
    let reasoningLength = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          // Handle keep-alive comments during high traffic (no rate limit)
          if (line === ': keep-alive' || line.trim() === '') {
            continue;
          }
          
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            if (!data) continue;

            try {
              const chunk = JSON.parse(data);
              const choice = chunk.choices?.[0];
              if (!choice) continue;
              
              // Track metrics instead of logging every chunk
              chunkCount++;
              if (choice?.delta?.content) {
                contentLength += choice.delta.content.length;
              }
              if (choice?.delta?.reasoning_content) {
                reasoningLength += choice.delta.reasoning_content.length;
              }
              
              // Handle reasoning_content (thinking) vs content in streaming
              // DeepSeek streams reasoning_content (CoT) first, then content (final answer)
              // Per DeepSeek docs, these are MUTUALLY EXCLUSIVE in each chunk
              // @see https://api-docs.deepseek.com/guides/thinking_mode
              //
              // CRITICAL: DeepSeek API requires reasoning_content to be passed back during
              // tool call loops. We MUST store it for API passback.
              // @see https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
              //
              // CORRECT BEHAVIOR:
              // - reasoning_content = Chain-of-thought (show in Reasoning panel)
              // - content = Final answer (show in main response area)
              // - These are SEPARATE - don't duplicate reasoning_content to content
              const hasReasoningContent = isThinkingMode && choice?.delta?.reasoning_content;
              const hasContent = choice?.delta?.content;
              
              if (hasReasoningContent) {
                // Chain-of-thought reasoning - show in Reasoning panel
                // Also store for API passback (via storeAsThinking flag)
                if (!thinkingStarted) {
                  thinkingStarted = true;
                  yield { thinkingStart: true };
                }
                receivedAnyThinking = true;
                // Yield thinkingDelta for UI display AND storeAsThinking for API storage
                yield { 
                  thinkingDelta: choice.delta.reasoning_content,
                  storeAsThinking: true  // Store in reasoningContent for API passback
                };
              }
              
              if (hasContent) {
                // Final answer content
                // If we were receiving thinking, mark it as done
                if (thinkingStarted && !receivedAnyContent) {
                  yield { thinkingEnd: true };
                }
                receivedAnyContent = true;
                yield { delta: choice.delta.content };
              }

              if (choice?.delta?.tool_calls) {
                // If we were in thinking mode and now getting tool calls, thinking is done
                if (thinkingStarted && !receivedAnyToolCalls && !receivedAnyContent) {
                  yield { thinkingEnd: true };
                }
                receivedAnyToolCalls = true;
                for (const toolCall of choice.delta.tool_calls) {
                  const argsJson = toolCall.function?.arguments;
                  let argsComplete = false;

                  // DeepSeek/OpenAI-compatible streams sometimes send function arguments as:
                  // 1) deltas (must be concatenated), OR
                  // 2) cumulative full JSON strings on each event.
                  // If the payload is valid JSON with actual content, treat it as complete.
                  if (typeof argsJson === 'string') {
                    const trimmed = argsJson.trim();
                    if (
                      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                      (trimmed.startsWith('[') && trimmed.endsWith(']'))
                    ) {
                      try {
                        const parsed = JSON.parse(trimmed);
                        // Only mark as complete if the parsed result has actual content
                        // Empty objects {} or arrays [] are likely incomplete streaming artifacts
                        if (typeof parsed === 'object' && parsed !== null) {
                          const keys = Object.keys(parsed);
                          // Require at least one meaningful key to consider it complete
                          // This prevents marking incomplete streaming as done
                          argsComplete = keys.length > 0 && keys.some(k => {
                            const v = parsed[k];
                            // Key must have a non-empty value
                            return v !== undefined && v !== null && v !== '';
                          });
                        }
                      } catch {
                        // Not complete JSON yet; treat as delta
                      }
                    }
                  }

                  yield {
                    toolCall: {
                      index: toolCall.index,
                      callId: toolCall.id,
                      name: toolCall.function?.name,
                      argsJson,
                      argsComplete,
                    }
                  };
                }
              }

              if (choice?.finish_reason) {
                yield { finishReason: choice.finish_reason };
              }
              
              // Parse usage with cache hit tracking
              if (chunk.usage) {
                yield { usage: this.parseUsage(chunk.usage) };
              }
            } catch (e) {
              logger.error('Error parsing SSE event', { error: e instanceof Error ? e.message : String(e), data: data?.slice(0, 200) });
            }
          }
        }
      }
      
      // If we started thinking but never got content or tool calls, emit thinkingEnd
      // This handles edge cases where the stream ends unexpectedly during thinking
      if (thinkingStarted && !receivedAnyContent && !receivedAnyToolCalls) {
        yield { thinkingEnd: true };
      }
      
      logger.debug('Stream completed', {
        hasTools,
        isThinkingMode,
        receivedAnyContent,
        receivedAnyToolCalls,
        receivedAnyThinking,
        thinkingStarted,
        chunkCount,
        contentLength,
        reasoningLength,
      });
      
      if (!receivedAnyContent && !receivedAnyToolCalls && !receivedAnyThinking) {
        logger.warn('Stream completed without yielding any content, tool calls, or thinking');
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildBody(request: ProviderRequest, stream: boolean) {
    const hasTools = request.tools && request.tools.length > 0;
    
    let requestedModel = request.config.model;
    if (requestedModel && !this.isValidDeepSeekModel(requestedModel)) {
      logger.warn('Received invalid model, falling back to default', { requestedModel, defaultModel: this.defaultModel });
      requestedModel = undefined;
    }
    
    const model = requestedModel ?? this.defaultModel;
    const fimSupported = supportsFIMCompletion(model);
    
    // Determine if we should use thinking mode:
    // 1. Model is a thinking model by default (deepseek-reasoner, deepseek-v3.2-speciale)
    // 2. Or thinking is explicitly enabled via enableThinking for deepseek-chat
    const isThinkingMode = this.shouldUseThinkingMode(model);
    const explicitThinkingParam = this.enableThinking && !this.isThinkingModel(model) && this.isThinkingCapable(model);
    
    // Check if model supports tools
    const modelSupportsTools = this.supportsTools(model);
    if (hasTools && !modelSupportsTools) {
      logger.warn('Model does not support tools, tools will be ignored', { 
        model, 
        note: 'deepseek-v3.2-speciale does not support tool calls' 
      });
    }
    
    const requestedMaxTokens = (request.config.maxOutputTokens && request.config.maxOutputTokens > 0)
      ? request.config.maxOutputTokens
      : (MODEL_OUTPUT_LIMITS[model] || MODEL_OUTPUT_LIMITS['default']);
    
    const maxTokens = this.clampMaxTokens(requestedMaxTokens, model);
    
    let messages = this.prepareMessagesForAPI(request.messages, isThinkingMode);
    messages = this.validateAssistantMessages(messages);
    messages = this.ensureCompleteToolCallSequences(messages);
    
    // CRITICAL FIX: Prepend system prompt as the first message
    // DeepSeek API expects system message in the messages array
    const messagesWithSystem: Array<Record<string, unknown>> = [];
    if (request.systemPrompt && request.systemPrompt.trim()) {
      messagesWithSystem.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }
    messagesWithSystem.push(...messages);
    
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      stream,
      messages: messagesWithSystem,
    };
    
    // Temperature and sampling parameters
    // NOTE: In thinking mode, these parameters are IGNORED by the API
    // Setting them won't cause an error but will have no effect
    // Also: logprobs and top_logprobs WILL trigger an error in thinking mode
    if (!isThinkingMode) {
      body.temperature = request.config.temperature;
      // Only include these if explicitly set and not in thinking mode
      // top_p, presence_penalty, frequency_penalty are ignored in thinking mode
    } else {
      logger.debug('Using thinking mode', { 
        model,
        maxTokens,
        explicitThinkingParam,
        note: 'temperature/top_p/penalties ignored; logprobs/top_logprobs would error'
      });
    }

    // FIM support is a model capability note used by the completion subsystem.
    // The chat/completions API path here doesn't currently send prefix/suffix.
    // Keeping it as a structured debug hint prevents silent misconfiguration.
    if (!fimSupported) {
      logger.debug('Model does not support FIM completion', { model });
    }
    
    // Enable thinking mode explicitly for deepseek-chat when enableThinking is set
    // This allows using thinking mode without switching to deepseek-reasoner
    if (explicitThinkingParam) {
      body.thinking = { type: 'enabled' };
      logger.debug('Enabled explicit thinking mode via thinking parameter', { model });
    }
    
    // Enable streaming options for usage tracking
    if (stream) {
      body.stream_options = { include_usage: true };
    }
    
    // Only add tools if the model supports them
    if (hasTools && modelSupportsTools) {
      const isStrictBeta = this.baseUrl.includes('/beta');
      body.tools = request.tools.map((tool) => {
        let enhancedDescription = tool.description;
        
        if (tool.input_examples && tool.input_examples.length > 0) {
          enhancedDescription += '\n\nExample inputs:';
          tool.input_examples.slice(0, 3).forEach((example, i) => {
            enhancedDescription += `\n${i + 1}. ${JSON.stringify(example)}`;
          });
        }
        
        // Build the function definition
        const functionDef: Record<string, unknown> = {
          name: tool.name,
          description: enhancedDescription,
          parameters: (() => {
            if (!isStrictBeta) return tool.jsonSchema;
            const normalized = normalizeStrictJsonSchema(tool.jsonSchema);
            return sanitizeDeepSeekStrictSchema(normalized) as Record<string, unknown>;
          })(),
        };

        // DeepSeek strict mode (Beta): requires base_url="https://api.deepseek.com/beta".
        // When enabled, the server validates tool-call JSON schemas.
        if (isStrictBeta) {
          functionDef.strict = true;
        }
        
        return {
          type: 'function',
          function: functionDef,
        };
      });
    }
    
    return body;
  }
}
