import { BaseLLMProvider, type ProviderRequest, type ProviderMessage, APIError, withRetry, fetchStreamWithRetry } from './baseProvider';
import type { ProviderResponse, ToolCallPayload, ProviderResponseChunk } from '../../../shared/types';
import { createLogger } from '../../logger';
import { DEFAULT_MODELS } from './registry';

const logger = createLogger('GeminiProvider');

// =============================================================================
// Gemini Schema Sanitization
// =============================================================================

/**
 * Check if a value is a plain object (not array, not null)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Sanitize JSON Schema for Gemini API compatibility.
 * 
 * Gemini's function calling API uses a restricted subset of JSON Schema
 * based on Protocol Buffers. It does NOT support:
 * - `additionalProperties` field
 * - `type` as an array (e.g., ["string", "null"])
 * - Complex `anyOf`/`oneOf`/`allOf` constructs
 * - `$schema`, `$ref`, `$defs` references
 * 
 * @see https://ai.google.dev/gemini-api/docs/function-calling
 */
function sanitizeGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  if (!isPlainObject(schema)) return schema;

  const result: Record<string, unknown> = { ...schema };

  // Remove unsupported top-level fields
  delete result.additionalProperties;
  delete result.$schema;
  delete result.$ref;
  delete result.$defs;
  delete result.definitions;

  // Handle type arrays - Gemini only supports single type strings
  // Convert ["string", "null"] to just "string"
  if (Array.isArray(result.type)) {
    const types = result.type.filter((t): t is string => typeof t === 'string' && t !== 'null');
    result.type = types.length > 0 ? types[0] : 'string';
  }

  // Handle anyOf/oneOf by taking the first non-null option
  // This is a simplification but works for nullable types
  if (Array.isArray(result.anyOf)) {
    const nonNullOption = result.anyOf.find(
      (opt) => isPlainObject(opt) && opt.type !== 'null'
    );
    if (nonNullOption && isPlainObject(nonNullOption)) {
      // Merge the non-null option into result, removing anyOf
      delete result.anyOf;
      Object.assign(result, sanitizeGeminiSchema(nonNullOption));
    } else {
      delete result.anyOf;
    }
  }

  if (Array.isArray(result.oneOf)) {
    const nonNullOption = result.oneOf.find(
      (opt) => isPlainObject(opt) && opt.type !== 'null'
    );
    if (nonNullOption && isPlainObject(nonNullOption)) {
      delete result.oneOf;
      Object.assign(result, sanitizeGeminiSchema(nonNullOption));
    } else {
      delete result.oneOf;
    }
  }

  // Remove allOf - Gemini doesn't support schema composition
  if (Array.isArray(result.allOf)) {
    // Try to merge allOf schemas into one
    const merged: Record<string, unknown> = {};
    for (const subSchema of result.allOf) {
      if (isPlainObject(subSchema)) {
        const sanitized = sanitizeGeminiSchema(subSchema) as Record<string, unknown>;
        Object.assign(merged, sanitized);
      }
    }
    delete result.allOf;
    Object.assign(result, merged);
  }

  // Recursively sanitize nested properties
  if (isPlainObject(result.properties)) {
    const sanitizedProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.properties)) {
      sanitizedProps[key] = sanitizeGeminiSchema(value);
    }
    result.properties = sanitizedProps;
  }

  // Recursively sanitize array items
  if ('items' in result) {
    result.items = sanitizeGeminiSchema(result.items);
  }

  return result;
}

/** Gemini model from /v1beta/models endpoint */
export interface GeminiModel {
  name: string;
  displayName: string;
  description: string;
  version: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
}

/**
 * Gemini Provider
 * 
 * Supports Gemini Pro, Gemini Flash, and Gemini Ultra models.
 * Features: streaming, function calling, multi-modal (vision), thinking/reasoning
 * 
 * THINKING SUPPORT:
 * - Gemini 2.5 and 3 series models support thinking (internal reasoning)
 * - Enable via thinkingConfig.includeThoughts = true in generationConfig
 * - Thought summaries are returned in parts with thought: true
 * - Thought signatures (thoughtSignature) must be passed back for function calling
 * 
 * @see https://ai.google.dev/gemini-api/docs/thinking
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures
 * @see https://ai.google.dev/gemini-api/docs/caching
 */

/**
 * Model-specific output token limits
 * 
 * Gemini 3 Pro: 65K output
 * Gemini 2.5 family: 65K output
 * Gemini 2.0 family: 8K output
 * Gemini 1.5 family: 8K output
 * Image/TTS models: 8K output (text), images/audio separate
 * 
 * @see https://ai.google.dev/gemini-api/docs/models/gemini
 */
const MODEL_OUTPUT_LIMITS: Record<string, number> = {
  // Gemini 3 family (2025)
  'gemini-3-pro-preview': 65536,
  'gemini-3-pro-image-preview': 8192,
  
  // Gemini 2.5 family
  'gemini-2.5-pro': 65536,
  'gemini-2.5-flash': 65536,
  'gemini-2.5-flash-lite': 65536,
  'gemini-2.5-flash-image': 8192,
  'gemini-2.5-flash-preview-tts': 8192,
  'gemini-2.5-pro-preview-tts': 8192,
  
  // Gemini 2.0 family
  'gemini-2.0-flash': 8192,
  'gemini-2.0-flash-lite': 8192,
  
  // Gemini 1.5 family (legacy)
  'gemini-1.5-pro': 8192,
  'gemini-1.5-flash': 8192,
  
  // Default fallback
  'default': 8192,
};

/** Gemini API maximum output token limit */
const API_MAX_TOKENS_LIMIT = 65536;

/**
 * Dummy thought signature for validation bypass
 * Used when we need to pass function calls without a signature (e.g., migrated history)
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures#faqs
 */
const DUMMY_THOUGHT_SIGNATURE = 'context_engineering_is_the_way_to_go';

/**
 * Thinking configuration levels for Gemini 3 Pro
 * @see https://ai.google.dev/gemini-api/docs/thinking#thinking_levels
 */
export type GeminiThinkingLevel = 'low' | 'high';

/**
 * Thinking configuration for Gemini models
 */
export interface GeminiThinkingConfig {
  /** Enable thought summaries in responses (default: true for thinking models) */
  includeThoughts?: boolean;
  /** Thinking level for Gemini 3 Pro (low or high, default: high) */
  thinkingLevel?: GeminiThinkingLevel;
  /** Thinking budget in tokens for Gemini 2.5 (0 = disable, -1 = dynamic) */
  thinkingBudget?: number;
}

/**
 * Configuration for using cached content in requests
 */
export interface CachedContentConfig {
  /** Name of the cached content resource (e.g., cachedContents/abc123) */
  cachedContentName: string;
}

export class GeminiProvider extends BaseLLMProvider {
  readonly name = 'gemini' as const;
  /** 
   * Gemini supports context caching via cachedContent API.
   * Caching requires creating cached content separately and referencing by name.
   */
  readonly supportsCaching = true;
  
  /** Gemini 2.5+ models support thinking/reasoning */
  readonly supportsThinking = true;
  
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  /** Cached models from API */
  private cachedModels: GeminiModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly modelsCacheTTL = 5 * 60 * 1000; // 5 minutes
  
  /** Active cached content name for this provider instance */
  private cachedContentName: string | null = null;
  
  /** Thinking configuration for this provider instance */
  private thinkingConfig: GeminiThinkingConfig = {
    includeThoughts: true,  // Enable by default for thinking models
    thinkingLevel: 'high',  // Use high thinking for best quality
  };
  
  /** Valid Gemini model ID patterns */
  private static readonly VALID_MODEL_PATTERNS = [
    /^gemini-/,   // All Gemini models: gemini-pro, gemini-1.5-pro, etc.
    /^models\/gemini-/,  // Full model path format for Gemini models
  ];
  
  /** Models that REQUIRE thought signatures for function calling */
  private static readonly MODELS_REQUIRING_THOUGHT_SIGNATURE = [
    /^gemini-3-(?!.*image)/,   // Gemini 3 Pro requires thought signatures (not image models)
    /^gemini-2\.5-/, // Gemini 2.5 may return them (optional)
  ];
  
  /** Models that support thinking/reasoning features */
  private static readonly MODELS_SUPPORTING_THINKING = [
    /^gemini-3-(?!.*image)/,   // Gemini 3 Pro and variants (not image models)
    /^gemini-2\.5-/,    // Gemini 2.5 family (Pro, Flash, Flash-Lite)
  ];
  
  /** Models that use thinkingLevel (vs thinkingBudget) */
  private static readonly MODELS_USING_THINKING_LEVEL = [
    /^gemini-3-(?!.*image)/,   // Gemini 3 Pro uses thinkingLevel (not image models)
  ];

  constructor(apiKey?: string, baseUrl = 'https://generativelanguage.googleapis.com/v1beta', defaultModel?: string) {
    super(apiKey);
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel || DEFAULT_MODELS.gemini;
  }

  /**
   * Fetch available models from Gemini API
   * @see https://ai.google.dev/api/models#method:-models.list
   */
  async fetchModels(signal?: AbortSignal): Promise<GeminiModel[]> {
    // Return cached models if still valid
    if (this.cachedModels && Date.now() - this.modelsCacheTime < this.modelsCacheTTL) {
      return this.cachedModels;
    }

    const apiKey = this.assertApiKey();
    
    const response = await fetch(`${this.baseUrl}/models?key=${apiKey}`, {
      method: 'GET',
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw APIError.fromResponse(response, errorText);
    }

    const data = await response.json();
    this.cachedModels = data.models || [];
    this.modelsCacheTime = Date.now();
    
    logger.debug('Fetched Gemini models', { count: this.cachedModels?.length });
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
   * Set cached content to use for subsequent requests
   * @param cachedContentName The name of the cached content resource (e.g., cachedContents/abc123)
   */
  setCachedContent(cachedContentName: string | null): void {
    this.cachedContentName = cachedContentName;
    if (cachedContentName) {
      logger.info('Cached content configured', { cachedContentName });
    } else {
      logger.info('Cached content cleared');
    }
  }
  
  /**
   * Get the currently configured cached content name
   */
  getCachedContent(): string | null {
    return this.cachedContentName;
  }
  
  /**
   * Configure thinking behavior for this provider
   */
  setThinkingConfig(config: Partial<GeminiThinkingConfig>): void {
    this.thinkingConfig = { ...this.thinkingConfig, ...config };
  }
  
  /**
   * Check if a model supports thinking features
   */
  private modelSupportsThinking(modelId: string): boolean {
    return GeminiProvider.MODELS_SUPPORTING_THINKING.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Check if a model uses thinkingLevel (vs thinkingBudget)
   */
  private modelUsesThinkingLevel(modelId: string): boolean {
    return GeminiProvider.MODELS_USING_THINKING_LEVEL.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Check if a model requires thought signatures for function calling
   * Gemini 3 Pro: REQUIRED (400 error if missing)
   * Gemini 2.5: Optional but recommended
   * Older models: Not supported
   */
  private modelRequiresThoughtSignature(modelId: string): boolean {
    return GeminiProvider.MODELS_REQUIRING_THOUGHT_SIGNATURE.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Check if a model ID is a valid Gemini model
   * Returns false for model IDs from other providers (claude-*, gpt-*, etc.)
   */
  private isValidGeminiModel(modelId: string): boolean {
    return GeminiProvider.VALID_MODEL_PATTERNS.some(pattern => pattern.test(modelId));
  }
  
  /**
   * Get validated model ID - falls back to default if invalid
   */
  private getValidatedModel(requestedModel?: string): string {
    if (requestedModel && this.isValidGeminiModel(requestedModel)) {
      return requestedModel;
    }
    if (requestedModel) {
      logger.warn('Received invalid model, falling back to default', { requestedModel, defaultModel: this.defaultModel });
    }
    return this.defaultModel;
  }
  
  /**
   * Clamp maxOutputTokens to valid range for the model and API
   * 
   * @param maxTokens - Requested max tokens
   * @param model - Model ID to check limits for
   * @returns Clamped value within valid range
   */
  private clampMaxTokens(maxTokens: number, model: string): number {
    // Find the model limit by checking exact match first
    let modelLimit = MODEL_OUTPUT_LIMITS[model];
    
    if (!modelLimit) {
      // Try to match by prefix for versioned models
      for (const [key, limit] of Object.entries(MODEL_OUTPUT_LIMITS)) {
        if (model.startsWith(key) || model.includes(key)) {
          modelLimit = limit;
          break;
        }
      }
    }
    
    modelLimit = modelLimit || MODEL_OUTPUT_LIMITS['default'];
    
    const clamped = Math.min(
      Math.max(1, maxTokens),  // Ensure minimum of 1
      modelLimit,
      API_MAX_TOKENS_LIMIT
    );
    
    if (clamped !== maxTokens) {
      logger.debug('Clamped maxOutputTokens', { original: maxTokens, clamped, model });
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
      // For assistant messages, require either content, tool_calls, or generated media
      if (msg.role === 'assistant') {
        const hasContent = msg.content !== null && msg.content !== undefined && 
                           (typeof msg.content !== 'string' || msg.content.trim().length > 0);
        const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
        // Check for generated media (images from multimodal models like Gemini image generation)
        const hasGeneratedMedia = (Array.isArray(msg.generatedImages) && msg.generatedImages.length > 0) ||
                                  (msg.generatedAudio !== undefined && msg.generatedAudio !== null);
        
        if (!hasContent && !hasToolCalls && !hasGeneratedMedia) {
          logger.warn('Filtering out invalid assistant message (no content, tool_calls, or generated media)');
          return false;
        }
      }
      
      return true;
    });
  }
  
  /**
   * Ensure all functionCall in model messages have corresponding functionResponse messages.
   * 
   * This fixes corrupted message sequences that can occur when:
   * 1. A run is cancelled mid-execution
   * 2. An error occurs during tool execution
   * 3. The session was restored from an incomplete state
   * 
   * Gemini requires: Model messages with functionCall must be followed by
   * function messages containing functionResponse for each call.
   * 
   * @param messages - Array of messages to validate
   * @returns Messages with synthetic tool results added for incomplete sequences
   */
  private ensureCompleteToolCallSequences(messages: ProviderMessage[]): ProviderMessage[] {
    const result: ProviderMessage[] = [];
    let currentAssistantToolCallIds: Set<string> | null = null;
    let toolNames: Map<string, string> | null = null;
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        // Track tool call IDs from this assistant message
        currentAssistantToolCallIds = new Set(msg.toolCalls.map(tc => tc.callId).filter(Boolean) as string[]);
        toolNames = new Map(msg.toolCalls.map(tc => [tc.callId, tc.name]));
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
              toolName: toolNames.get(toolCallId) || 'unknown_function',
            });
          }
        }
        
        // Reset for next sequence
        currentAssistantToolCallIds = new Set(msg.toolCalls.map(tc => tc.callId).filter(Boolean) as string[]);
        toolNames = new Map(msg.toolCalls.map(tc => [tc.callId, tc.name]));
      } else if (msg.role === 'tool') {
        const toolCallId = msg.toolCallId;
        
        // Only include tool messages that have a valid preceding assistant with tool_calls
        if (currentAssistantToolCallIds && toolCallId && currentAssistantToolCallIds.has(toolCallId)) {
          currentAssistantToolCallIds.delete(toolCallId);
          result.push(msg);
          
          if (currentAssistantToolCallIds.size === 0) {
            currentAssistantToolCallIds = null;
            toolNames = null;
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
        toolNames = null;
        result.push(msg);
      }
    }
    
    return result;
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = this.assertApiKey();
    const model = this.getValidatedModel(request.config.model);
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    return withRetry(async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildBody(request)),
        signal: request.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw APIError.fromResponse(response, errorText);
      }

      const payload = await response.json();
      const candidate = payload.candidates?.[0];
      if (!candidate) {
        throw new Error('Gemini returned no candidates.');
      }

      const parts = candidate.content?.parts ?? [];
      let textContent = '';
      let thinkingContent = '';
      let lastThoughtSignature: string | undefined;
      const toolCalls: ToolCallPayload[] = [];
      const images: Array<{ data: string; mimeType: string }> = [];
      let audio: { data: string; mimeType: string } | undefined;
      let isFirstFunctionCall = true;

      for (const part of parts) {
        // Handle text parts - check if it's a thought summary (part.thought === true)
        // @see https://ai.google.dev/gemini-api/docs/thinking#thought_summaries
        if (part.text !== undefined) {
          if (part.thought === true) {
            // This is thinking/reasoning content
            thinkingContent += part.text;
            logger.debug('Received thinking content in generate', { 
              length: part.text.length,
              hasSignature: !!part.thoughtSignature 
            });
          } else {
            // Regular text content
            textContent += part.text;
          }
          
          // Capture thoughtSignature from text parts (for non-function-call responses)
          // Gemini 3 Pro may have signature on the last part
          if (part.thoughtSignature) {
            lastThoughtSignature = part.thoughtSignature;
          }
        }
        
        // Handle inline data (images, audio) from multimodal generation
        // @see https://ai.google.dev/gemini-api/docs/image-generation
        // @see https://ai.google.dev/gemini-api/docs/speech-generation
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType || 'application/octet-stream';
          const data = part.inlineData.data || '';
          
          if (mimeType.startsWith('image/')) {
            images.push({ data, mimeType });
            logger.debug('Received generated image', { mimeType, dataLength: data.length });
          } else if (mimeType.startsWith('audio/')) {
            audio = { data, mimeType };
            logger.debug('Received generated audio', { mimeType, dataLength: data.length });
          }
        }
        
        // Handle function calls with thoughtSignature support
        // Gemini 3 Pro: thoughtSignature is on the FIRST functionCall part only
        // @see https://ai.google.dev/gemini-api/docs/thought-signatures
        if (part.functionCall) {
          const callId = 'gemini-call-' + Math.random().toString(36).substr(2, 9);
          const toolCall: ToolCallPayload = {
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
            callId,
          };
          
          // Capture thoughtSignature only from the first function call
          if (isFirstFunctionCall && part.thoughtSignature) {
            toolCall.thoughtSignature = part.thoughtSignature;
            lastThoughtSignature = part.thoughtSignature;
            isFirstFunctionCall = false;
          }
          
          toolCalls.push(toolCall);
        }
      }

      return {
        content: textContent,
        thinking: thinkingContent || undefined,
        thoughtSignature: lastThoughtSignature,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        images: images.length > 0 ? images : undefined,
        audio,
        finishReason: candidate.finishReason,
        usage: payload.usageMetadata ? {
          input: payload.usageMetadata.promptTokenCount,
          output: payload.usageMetadata.candidatesTokenCount,
          total: payload.usageMetadata.totalTokenCount,
        } : undefined,
      };
    }, {}, request.signal);
  }

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk> {
    const apiKey = this.assertApiKey();
    const model = this.getValidatedModel(request.config.model);
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    
    const body = this.buildBody(request);
    
    // Log the thinking config for debugging
    logger.debug('Gemini stream request', {
      model,
      hasThinkingConfig: !!(body.generationConfig as Record<string, unknown>)?.thinkingConfig,
      thinkingConfig: (body.generationConfig as Record<string, unknown>)?.thinkingConfig,
    });

    // Use fetchStreamWithRetry for automatic retry on network errors
    const response = await fetchStreamWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    let toolCallIndex = 0;
    let isFirstFunctionCall = true; // Track first function call for thoughtSignature
    let isThinkingStarted = false;  // Track if we've started receiving thinking content
    let isThinkingEnded = false;    // Track if thinking content has ended

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
            try {
              const payload = JSON.parse(data);
              const candidate = payload.candidates?.[0];
              
              // Log when we receive a response without candidates (potential error/block)
              if (!candidate) {
                logger.warn('Gemini response without candidates', {
                  hasPromptFeedback: !!payload.promptFeedback,
                  promptFeedback: payload.promptFeedback,
                  hasUsageMetadata: !!payload.usageMetadata,
                  rawPayload: JSON.stringify(payload).slice(0, 500),
                });
              }
              
              // Log finish reason to detect blocked responses
              if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
                logger.warn('Gemini non-STOP finish reason', {
                  finishReason: candidate.finishReason,
                  safetyRatings: candidate.safetyRatings,
                  hasContent: !!candidate.content,
                  partsCount: candidate.content?.parts?.length ?? 0,
                  citationMetadata: candidate.citationMetadata,
                  // Log full candidate for debugging (truncated)
                  candidatePreview: JSON.stringify(candidate).slice(0, 1000),
                });
              }
              
              if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                  // Debug log to see what parts we're receiving
                  logger.debug('Received part from Gemini', {
                    hasText: part.text !== undefined,
                    thought: part.thought,
                    hasThoughtSignature: !!part.thoughtSignature,
                    textLength: part.text?.length,
                  });
                  
                  // Handle text parts - differentiate thinking from regular content
                  // @see https://ai.google.dev/gemini-api/docs/thinking#thought_summaries
                  if (part.text !== undefined) {
                    if (part.thought === true) {
                      // This is thinking/reasoning content - stream it separately
                      if (!isThinkingStarted) {
                        isThinkingStarted = true;
                        yield { thinkingStart: true };
                      }
                      logger.debug('[THINKING] Yielding thinking delta', {
                        textLength: part.text.length,
                        preview: part.text.slice(0, 50),
                      });
                      yield { thinkingDelta: part.text };
                      
                      // Capture thoughtSignature from thinking parts
                      if (part.thoughtSignature) {
                        yield { thoughtSignature: part.thoughtSignature };
                      }
                    } else {
                      // Regular text content - if we were in thinking mode, signal end
                      if (isThinkingStarted && !isThinkingEnded) {
                        isThinkingEnded = true;
                        yield { thinkingEnd: true };
                      }
                      yield { delta: part.text };
                      
                      // Capture thoughtSignature from regular text parts too
                      if (part.thoughtSignature) {
                        yield { thoughtSignature: part.thoughtSignature };
                      }
                    }
                  }
                  
                  // Handle inline data (images, audio) from multimodal generation
                  // @see https://ai.google.dev/gemini-api/docs/image-generation
                  // @see https://ai.google.dev/gemini-api/docs/speech-generation
                  if (part.inlineData) {
                    // If we were in thinking mode, signal end before media content
                    if (isThinkingStarted && !isThinkingEnded) {
                      isThinkingEnded = true;
                      yield { thinkingEnd: true };
                    }
                    
                    const mimeType = part.inlineData.mimeType || 'application/octet-stream';
                    const data = part.inlineData.data || '';
                    
                    if (mimeType.startsWith('image/')) {
                      yield { image: { data, mimeType } };
                      logger.debug('Streaming generated image', { mimeType, dataLength: data.length });
                    } else if (mimeType.startsWith('audio/')) {
                      yield { audio: { data, mimeType } };
                      logger.debug('Streaming generated audio', { mimeType, dataLength: data.length });
                    }
                  }
                  
                  // Handle function calls with thoughtSignature support
                  // Gemini 3 Pro: thoughtSignature is on the FIRST functionCall part only
                  // @see https://ai.google.dev/gemini-api/docs/thought-signatures
                  if (part.functionCall) {
                    // If we were in thinking mode, signal end before function call
                    if (isThinkingStarted && !isThinkingEnded) {
                      isThinkingEnded = true;
                      yield { thinkingEnd: true };
                    }
                    
                    const toolCallChunk: ProviderResponseChunk['toolCall'] = {
                      index: toolCallIndex,
                      callId: 'gemini-call-' + Math.random().toString(36).substr(2, 9),
                      name: part.functionCall.name,
                      argsJson: JSON.stringify(part.functionCall.args),
                    };
                    
                    // Capture thoughtSignature only from the first function call
                    if (isFirstFunctionCall && part.thoughtSignature) {
                      toolCallChunk.thoughtSignature = part.thoughtSignature;
                      isFirstFunctionCall = false;
                    }
                    
                    yield { toolCall: toolCallChunk };
                    toolCallIndex++;
                  }
                }
              }

              if (candidate?.finishReason) {
                // Signal thinking end if it hasn't been signaled yet
                if (isThinkingStarted && !isThinkingEnded) {
                  yield { thinkingEnd: true };
                }
                yield { finishReason: candidate.finishReason };
              }

              if (payload.usageMetadata) {
                yield {
                  usage: {
                    input: payload.usageMetadata.promptTokenCount,
                    output: payload.usageMetadata.candidatesTokenCount,
                    total: payload.usageMetadata.totalTokenCount,
                  }
                };
              }

            } catch (e) {
              logger.error('Error parsing Gemini SSE event', { error: e instanceof Error ? e.message : String(e) });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  
  /**
   * Build thinking configuration for the API request
   * @see https://ai.google.dev/gemini-api/docs/thinking
   */
  private buildThinkingConfig(model: string): Record<string, unknown> | undefined {
    // Only add thinking config for models that support it
    if (!this.modelSupportsThinking(model)) {
      return undefined;
    }
    
    const config: Record<string, unknown> = {};
    
    // Always include thoughts for thinking models (enables thought summaries)
    // Note: API uses camelCase for REST endpoints
    if (this.thinkingConfig.includeThoughts !== false) {
      config.includeThoughts = true;
    }
    
    // Gemini 3 Pro uses thinkingLevel
    if (this.modelUsesThinkingLevel(model)) {
      // thinkingLevel: 'low' or 'high' (default: 'high')
      config.thinkingLevel = this.thinkingConfig.thinkingLevel || 'high';
    } else {
      // Gemini 2.5 uses thinkingBudget
      // 2.5 Pro: 128-32768, cannot disable
      // 2.5 Flash/Flash-Lite: 0-24576, can disable with 0
      // -1 = dynamic (model decides), which is the default behavior
      const budget = this.thinkingConfig.thinkingBudget;
      if (budget !== undefined) {
        config.thinkingBudget = budget;
      }
      // If no budget specified, let the model use dynamic thinking (default)
    }
    
    return Object.keys(config).length > 0 ? config : undefined;
  }
  
  private buildBody(request: ProviderRequest) {
    const model = this.getValidatedModel(request.config.model);
    
    // CRITICAL: Clamp maxOutputTokens to valid range for this model
    const maxOutputTokens = this.clampMaxTokens(request.config.maxOutputTokens, model);
    
    // Validate messages before sending
    let validatedMessages = this.validateMessages(request.messages);
    
    // CRITICAL FIX: Ensure tool call sequences are complete
    // If an assistant message has tool_calls, there MUST be corresponding tool messages
    validatedMessages = this.ensureCompleteToolCallSequences(validatedMessages);
    
    const tools = request.tools.length > 0 ? [{
      function_declarations: request.tools.map((tool) => {
        // Build enhanced description with examples for improved accuracy
        let enhancedDescription = tool.description;
        
        // Append input examples to description if available
        if (tool.input_examples && tool.input_examples.length > 0) {
          enhancedDescription += '\n\nExample inputs:';
          tool.input_examples.slice(0, 3).forEach((example, i) => {
            enhancedDescription += `\n${i + 1}. ${JSON.stringify(example)}`;
          });
        }
        
        // CRITICAL: Sanitize schema for Gemini API compatibility
        // Gemini doesn't support additionalProperties, type arrays, or complex anyOf/oneOf
        const sanitizedSchema = sanitizeGeminiSchema(tool.jsonSchema);
        
        return {
          name: tool.name,
          description: enhancedDescription,
          parameters: sanitizedSchema,
        };
      })
    }] : undefined;

    // Build a map of tool call IDs to tool names for function responses
    const toolNameMap = new Map<string, string>();
    validatedMessages.forEach(msg => {
      if (msg.role === 'assistant' && msg.toolCalls) {
        msg.toolCalls.forEach(tc => {
          if (tc.callId) {
            toolNameMap.set(tc.callId, tc.name);
          }
        });
      }
    });
    
    // Check if this model requires thought signatures
    const requiresSignature = this.modelRequiresThoughtSignature(model);
    
    // Build thinking configuration for thinking models
    const thinkingConfig = this.buildThinkingConfig(model);
    
    // Build generation config with multimodal and structured output support
    const generationConfig: Record<string, unknown> = {
      temperature: request.config.temperature,
      maxOutputTokens,
      // Add thinking config if supported
      ...(thinkingConfig && { thinkingConfig }),
    };
    
    // Add response modalities for multimodal output (image/audio generation)
    // @see https://ai.google.dev/gemini-api/docs/image-generation
    // @see https://ai.google.dev/gemini-api/docs/speech-generation
    if (request.config.responseModalities && request.config.responseModalities.length > 0) {
      generationConfig.responseModalities = request.config.responseModalities;
    }
    
    // Add structured output configuration
    // @see https://ai.google.dev/gemini-api/docs/structured-output
    if (request.config.responseFormat) {
      if (request.config.responseFormat.type === 'json_object') {
        generationConfig.responseMimeType = 'application/json';
      } else if (request.config.responseFormat.type === 'json_schema' && request.config.responseFormat.schema) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseSchema = request.config.responseFormat.schema;
      }
    }
    
    // Add media resolution for document/image processing
    // @see https://ai.google.dev/gemini-api/docs/media-resolution
    if (request.config.mediaResolution) {
      generationConfig.mediaResolution = request.config.mediaResolution;
    }
    
    // Add speech configuration for TTS models
    // @see https://ai.google.dev/gemini-api/docs/speech-generation
    if (request.config.speechConfig) {
      const speechConfig: Record<string, unknown> = {};
      
      if (request.config.speechConfig.voiceName) {
        // Single speaker TTS
        speechConfig.voiceConfig = {
          prebuiltVoiceConfig: {
            voiceName: request.config.speechConfig.voiceName,
          },
        };
      } else if (request.config.speechConfig.speakers && request.config.speechConfig.speakers.length > 0) {
        // Multi-speaker TTS
        speechConfig.multiSpeakerVoiceConfig = {
          speakerVoiceConfigs: request.config.speechConfig.speakers.map(speaker => ({
            speaker: speaker.name,
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: speaker.voiceName,
              },
            },
          })),
        };
      }
      
      if (Object.keys(speechConfig).length > 0) {
        generationConfig.speechConfig = speechConfig;
      }
    }

    // Build the request body
    const body: Record<string, unknown> = {
      generationConfig,
      systemInstruction: {
        parts: [{ text: request.systemPrompt }],
      },
      tools,
      contents: validatedMessages
        .filter((message) => message.role !== 'system')
        .map((message) => {
          if (message.role === 'tool') {
            // Get the actual tool name from the map or from the message
            const toolName = (message.toolCallId && toolNameMap.get(message.toolCallId)) || 
                            (message as { toolName?: string }).toolName || 
                            'unknown_function';
            return {
              role: 'function',
              parts: [{
                functionResponse: {
                  name: toolName,
                  response: { content: message.content || '(no output)' }
                }
              }]
            };
          }
          if (message.role === 'assistant') {
            // Type for parts with optional thoughtSignature
            // CRITICAL: Gemini 3 Pro requires thoughtSignature to be passed back
            // on the first functionCall part for each step in the current turn.
            // @see https://ai.google.dev/gemini-api/docs/thought-signatures
            const parts: Array<{
              text?: string;
              functionCall?: { name: string; args: Record<string, unknown> };
              thoughtSignature?: string;
            }> = [];
            
            // Handle regular content (text parts may also have thoughtSignature)
            if (message.content) {
              const textPart: { text: string; thoughtSignature?: string } = { text: message.content };
              // If this message has a thoughtSignature but no tool calls, attach it to text
              if (message.thoughtSignature && (!message.toolCalls || message.toolCalls.length === 0)) {
                textPart.thoughtSignature = message.thoughtSignature;
              }
              parts.push(textPart);
            }
            
            // Handle generated images - add a text placeholder describing what was generated
            // We don't send the full image data back as it would be too expensive and may cause issues
            // Instead, we just indicate that an image was generated so the model has context
            if (message.generatedImages && message.generatedImages.length > 0) {
              const imageCount = message.generatedImages.length;
              const imageDescription = imageCount === 1 
                ? '[I generated an image]' 
                : `[I generated ${imageCount} images]`;
              
              // Only add if we don't already have text content
              if (!message.content) {
                parts.push({ text: imageDescription });
              }
            }
            
            // Handle function calls with thoughtSignature support
            // thoughtSignature is only on the FIRST functionCall part
            if (message.toolCalls && message.toolCalls.length > 0) {
              message.toolCalls.forEach((tc, index) => {
                const fcPart: {
                  functionCall: { name: string; args: Record<string, unknown> };
                  thoughtSignature?: string;
                } = {
                  functionCall: {
                    name: tc.name,
                    args: tc.arguments || {}
                  }
                };
                
                // Add thoughtSignature to the first function call part
                // Priority: use tool call's thoughtSignature, or message's thoughtSignature for index 0
                // If no signature is available but model requires it, use dummy signature
                // @see https://ai.google.dev/gemini-api/docs/thought-signatures#faqs
                if (index === 0) {
                  if (tc.thoughtSignature) {
                    fcPart.thoughtSignature = tc.thoughtSignature;
                  } else if (message.thoughtSignature) {
                    fcPart.thoughtSignature = message.thoughtSignature;
                  } else if (requiresSignature) {
                    // Use dummy signature to bypass validation for migrated/synthetic history
                    fcPart.thoughtSignature = DUMMY_THOUGHT_SIGNATURE;
                    logger.debug('Using dummy thoughtSignature for function call without signature', {
                      model,
                      toolName: tc.name,
                    });
                  }
                }
                
                parts.push(fcPart);
              });
            }
            
          return {
            role: 'model',
            parts: parts.length > 0 ? parts : [{ text: '' }]
          };
          }
          
          // Handle user messages with multimodal content (images, audio, video, documents)
          // @see https://ai.google.dev/gemini-api/docs/vision
          // @see https://ai.google.dev/gemini-api/docs/audio
          // @see https://ai.google.dev/gemini-api/docs/document-processing
          return this.buildUserMessageParts(message);
        }),
    };
    
    // Add cached content reference if configured
    // This enables cost savings by reusing pre-computed tokens
    // @see https://ai.google.dev/gemini-api/docs/caching
    if (this.cachedContentName) {
      body.cachedContent = this.cachedContentName;
      logger.debug('Using cached content', { cachedContentName: this.cachedContentName });
    }
    
    return body;
  }
  
  /**
   * Build user message parts with multimodal content support
   * Handles text, images, audio, video, and document attachments
   * 
   * @see https://ai.google.dev/gemini-api/docs/vision
   * @see https://ai.google.dev/gemini-api/docs/audio  
   * @see https://ai.google.dev/gemini-api/docs/video-understanding
   * @see https://ai.google.dev/gemini-api/docs/document-processing
   */
  private buildUserMessageParts(message: ProviderMessage): {
    role: string;
    parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string }; fileData?: { mimeType: string; fileUri: string } }>;
  } {
    type MessagePart = { text?: string; inlineData?: { mimeType: string; data: string }; fileData?: { mimeType: string; fileUri: string } };
    const parts: MessagePart[] = [];
    
    // Add text content first (best practice per Gemini docs)
    if (message.content) {
      parts.push({ text: message.content });
    }
    
    // Process attachments for multimodal content
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        const mimeType = attachment.mimeType || 'application/octet-stream';
        const content = attachment.content || '';
        
        // Check if this is a file URI (from Files API) vs inline data
        if (attachment.path?.startsWith('files/')) {
          // File API reference - use fileData
          parts.push({
            fileData: {
              mimeType,
              fileUri: `https://generativelanguage.googleapis.com/v1beta/${attachment.path}`,
            }
          });
          logger.debug('Added file reference to message', {
            mimeType,
            fileUri: attachment.path,
          });
        } else if (this.isSupportedMultimodalMimeType(mimeType)) {
          // Inline data for supported types
          // Note: For files > 20MB, should use Files API instead
          parts.push({
            inlineData: {
              mimeType,
              data: content,
            }
          });
          logger.debug('Added inline multimodal content', {
            mimeType,
            name: attachment.name,
            sizeBytes: content.length,
          });
        } else {
          // Unsupported type - add as text description
          logger.warn('Unsupported attachment type, adding as text description', {
            mimeType,
            name: attachment.name,
          });
          parts.push({
            text: `[Attachment: ${attachment.name} (${mimeType})]`,
          });
        }
      }
    }
    
    // Ensure at least one part exists
    if (parts.length === 0) {
      parts.push({ text: '' });
    }
    
    return {
      role: 'user',
      parts,
    };
  }
  
  /**
   * Check if a MIME type is supported for multimodal input
   * 
   * Supported types per Gemini API docs:
   * - Images: PNG, JPEG, WEBP, HEIC, HEIF, GIF
   * - Audio: WAV, MP3, AIFF, AAC, OGG, FLAC
   * - Video: MP4, MPEG, MOV, AVI, FLV, MPG, WEBM, WMV, 3GPP
   * - Documents: PDF
   */
  private isSupportedMultimodalMimeType(mimeType: string): boolean {
    const supportedTypes = [
      // Images
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
      
      // Audio
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/aiff',
      'audio/aac',
      'audio/ogg',
      'audio/flac',
      
      // Video
      'video/mp4',
      'video/mpeg',
      'video/mov',
      'video/quicktime',
      'video/avi',
      'video/x-msvideo',
      'video/x-flv',
      'video/mpg',
      'video/webm',
      'video/x-ms-wmv',
      'video/3gpp',
      
      // Documents
      'application/pdf',
    ];
    
    return supportedTypes.includes(mimeType.toLowerCase());
  }
}