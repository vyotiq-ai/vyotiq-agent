import type { AttachmentPayload, LLMProviderName, ToolCallPayload, ProviderResponse, ProviderResponseChunk } from '../../../shared/types';
import { createLogger } from '../../logger';
import { isTransientError as isTransientErrorUtil, isNetworkError as isNetworkErrorUtil } from '../utils/errorUtils';

const logger = createLogger('BaseProvider');

/** Configuration for retry behavior */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatusCodes?: number[];
  /** Request timeout in ms (default: 120000 = 2 minutes) */
  requestTimeoutMs?: number;
}

/** Configuration for network-specific retry behavior */
export interface NetworkRetryConfig {
  /** Maximum number of retry attempts for network errors (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry for network errors (default: 3000) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries for network errors (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier for network errors (default: 2) */
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 2, // Reduced from 3 - fail faster and let the user know
  initialDelayMs: 2000, // Increased from 1000 - start with longer delay
  maxDelayMs: 60000, // Increased from 30000 - allow longer delays for rate limits
  backoffMultiplier: 2.5, // Increased from 2 - more aggressive backoff
  retryableStatusCodes: [429, 500, 502, 503, 504],
  requestTimeoutMs: 120000, // 2 minutes default timeout
};

const DEFAULT_NETWORK_RETRY_CONFIG: Required<NetworkRetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 3000, // Start with 3 seconds for network issues
  maxDelayMs: 30000, // Cap at 30 seconds
  backoffMultiplier: 2,
};

/** Error messages that indicate non-retryable errors */
const NON_RETRYABLE_ERROR_PATTERNS = [
  // Authentication/Authorization errors
  'invalid api key',
  'invalid_api_key',
  'api key is not configured',
  'unauthorized',
  'authentication failed',
  'authentication error',
  'permission denied',
  'forbidden',
  // Billing/quota errors  
  'insufficient balance',
  'insufficient_balance',
  'insufficient funds',
  'quota exceeded',
  'billing',
  'payment required',
  // Google/Gemini specific quota errors
  'resource has been exhausted',
  'resourceexhausted',
  'check quota',
  // Request validation errors
  'invalid request',
  'invalid_request',
  'bad request',
  'malformed',
  'validation error',
  'invalid model',
  // Parameter errors that won't change on retry
  'temperature',
  'max_tokens',
  'invalid parameter',
  // Model availability errors
  'model not found',
  'model is not available',
  'does not support',
  // Content policy errors
  'content policy',
  'content_policy',
  'safety',
  'blocked',
];

/** Error patterns that indicate rate limiting - these ARE retryable but need longer delays */
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  'too many requests',
  'tokens per minute',
  'requests per minute',
  'requests per day',
];

/**
 * Error patterns that indicate PERMANENT rate limit issues - request is too large
 * These are NOT retryable because the request itself exceeds the limit
 */
const PERMANENT_RATE_LIMIT_PATTERNS: Array<string | RegExp> = [
  'would exceed the rate limit',     // Request is larger than per-minute quota
  'exceeded the rate limit',         // Already over quota (but may be temporary)
  /exceeds.*token.*limit/,           // Request exceeds token limit (pre-compiled regex)
  /prompt.*too.*large/,              // Prompt is too large (pre-compiled regex)
  /context.*too.*large/,             // Context is too large (pre-compiled regex)
];

/**
 * API error with status code and retry information
 */
export class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfter?: number, // From Retry-After header (seconds)
    public readonly isRetryable: boolean = false,
    public readonly isRateLimited: boolean = false, // Flag for temporary rate limit errors
    public readonly isPermanentRateLimit: boolean = false // Flag for request-too-large errors
  ) {
    super(message);
    this.name = 'APIError';
  }
  
  static fromResponse(response: Response, body?: string): APIError {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
    
    let message = `API request failed with status ${response.status}`;
    if (body) {
      try {
        const parsed = JSON.parse(body);
        message = parsed.error?.message || parsed.message || message;
      } catch {
        // If not JSON, use body directly if short enough
        if (body.length < 200) {
          message = body;
        }
      }
    }
    
    // Check for permanent rate limit issues first (request too large - not retryable)
    const isPermanentRateLimit = isPermanentRateLimitMessage(message);
    
    // Check for regular rate limiting (temporary - retryable with delay)
    const isRateLimited = !isPermanentRateLimit && (response.status === 429 || isRateLimitMessage(message));
    
    // Determine if error is retryable:
    // 1. Permanent rate limits (request too large) are NOT retryable - must reduce size or use fallback
    // 2. Temporary rate limits ARE retryable with longer delays
    // 3. Other errors check HTTP status and error patterns
    const statusIsRetryable = DEFAULT_RETRY_CONFIG.retryableStatusCodes.includes(response.status);
    const messageIsNonRetryable = isNonRetryableMessage(message) || isPermanentRateLimit;
    const isRetryable = isRateLimited || (statusIsRetryable && !messageIsNonRetryable);
    
    return new APIError(message, response.status, retryAfter, isRetryable, isRateLimited, isPermanentRateLimit);
  }
}

/**
 * Check if an error message indicates a non-retryable condition
 */
function isNonRetryableMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return NON_RETRYABLE_ERROR_PATTERNS.some(pattern => lowerMessage.includes(pattern));
}

/**
 * Check if an error message indicates rate limiting
 */
function isRateLimitMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return RATE_LIMIT_PATTERNS.some(pattern => lowerMessage.includes(pattern));
}

/**
 * Check if an error message indicates a PERMANENT rate limit issue
 * (request is too large to ever succeed within rate limits)
 */
function isPermanentRateLimitMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return PERMANENT_RATE_LIMIT_PATTERNS.some(pattern => {
    if (pattern instanceof RegExp) {
      return pattern.test(lowerMessage);
    }
    return lowerMessage.includes(pattern);
  });
}

/**
 * Sleep utility with optional abort signal support
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    
    const timeout = setTimeout(resolve, ms);
    
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
      }, { once: true });
    }
  });
}

/**
 * Execute an async function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
  signal?: AbortSignal
): Promise<T> {
  const options = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if aborted
      if (signal?.aborted) {
        throw error;
      }
      
      // Check if error is retryable
      const isRetryable = error instanceof APIError 
        ? error.isRetryable 
        : isTransientError(error);
      
      if (!isRetryable || attempt >= options.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      let delayMs = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
      
      // Use Retry-After header if available
      if (error instanceof APIError && error.retryAfter) {
        delayMs = Math.max(delayMs, error.retryAfter * 1000);
      }
      
      // For rate limit errors, use much longer delays (minimum 30 seconds, up to 2 minutes)
      if (error instanceof APIError && error.isRateLimited) {
        const rateLimitMinDelay = 30000; // 30 seconds minimum
        const rateLimitMaxDelay = 120000; // 2 minutes max
        delayMs = Math.max(delayMs, rateLimitMinDelay);
        delayMs = Math.min(delayMs * Math.pow(options.backoffMultiplier, attempt), rateLimitMaxDelay);
        logger.warn('Rate limit hit, waiting before retry', { attempt: attempt + 1, maxAttempts: options.maxRetries + 1, waitTimeSeconds: Math.round(delayMs / 1000) });
      } else {
        logger.warn('API request failed, retrying', { attempt: attempt + 1, maxAttempts: options.maxRetries + 1, retryInMs: Math.round(delayMs) });
      }
      
      // Cap at max delay (unless rate limited, which uses its own max)
      if (!(error instanceof APIError && error.isRateLimited)) {
        delayMs = Math.min(delayMs, options.maxDelayMs);
      }
      
      // Add jitter (±10%)
      delayMs = delayMs * (0.9 + Math.random() * 0.2);
      
      await sleep(delayMs, signal);
    }
  }
  
  throw lastError;
}

/**
 * Check if an error is a transient network/server error.
 * Delegates to the centralized errorUtils implementation.
 */
function isTransientError(error: unknown): boolean {
  return isTransientErrorUtil(error);
}

/**
 * Check if an error is specifically a network connectivity issue
 * (as opposed to a server error like 502/503).
 * Delegates to the centralized errorUtils implementation.
 */
export function isNetworkConnectivityError(error: unknown): boolean {
  return isNetworkErrorUtil(error);
}

/**
 * Fetch with timeout support
 * Creates a fetch request that will abort after the specified timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number },
  signal?: AbortSignal
): Promise<Response> {
  const timeout = options.timeout ?? DEFAULT_RETRY_CONFIG.requestTimeoutMs;
  
  // Create an abort controller for the timeout
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    timeoutController.abort();
  }, timeout);
  
  // Combine the timeout signal with any provided signal
  const combinedSignal = signal 
    ? combineAbortSignals(signal, timeoutController.signal)
    : timeoutController.signal;
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: combinedSignal,
    });
    return response;
  } catch (error) {
    if (timeoutController.signal.aborted && !signal?.aborted) {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Combine multiple abort signals into one
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    
    signal.addEventListener('abort', () => {
      controller.abort(signal.reason);
    }, { once: true });
  }
  
  return controller.signal;
}

/**
 * Execute a streaming fetch with retry logic for network errors
 * Returns the Response object, caller is responsible for reading the stream
 */
export async function fetchStreamWithRetry(
  url: string,
  options: RequestInit & { timeout?: number },
  signal?: AbortSignal,
  config: NetworkRetryConfig = {}
): Promise<Response> {
  const retryConfig = { ...DEFAULT_NETWORK_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
      
      const response = await fetchWithTimeout(url, options, signal);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw APIError.fromResponse(response, errorText);
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if user cancelled
      if (signal?.aborted) {
        throw error;
      }
      
      // Check if this is a retryable network error
      const isNetworkIssue = isNetworkConnectivityError(error) || isTransientError(error);
      const isRetryableApiError = error instanceof APIError && error.isRetryable;
      
      if ((!isNetworkIssue && !isRetryableApiError) || attempt >= retryConfig.maxRetries) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      let delayMs = retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt);
      delayMs = Math.min(delayMs, retryConfig.maxDelayMs);
      
      // Add jitter (±15%)
      delayMs = delayMs * (0.85 + Math.random() * 0.3);
      
      // Use longer delay for network connectivity issues
      if (isNetworkConnectivityError(error)) {
        delayMs = Math.max(delayMs, 5000); // Minimum 5 seconds for network issues
        logger.warn('Network connectivity issue, retrying', { 
          attempt: attempt + 1, 
          maxAttempts: retryConfig.maxRetries + 1, 
          waitTimeMs: Math.round(delayMs),
          error: lastError.message 
        });
      } else {
        logger.warn('Transient error during stream fetch, retrying', { 
          attempt: attempt + 1, 
          maxAttempts: retryConfig.maxRetries + 1, 
          waitTimeMs: Math.round(delayMs) 
        });
      }
      
      await sleep(delayMs, signal);
    }
  }
  
  throw lastError ?? new Error('All stream fetch retry attempts failed');
}

export type { ProviderResponseChunk } from '../../../shared/types';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCallPayload[];
  attachments?: AttachmentPayload[];
  toolName?: string; // Added to track tool name for tool result messages
  /** Provider-specific internal metadata (never display to users). */
  providerInternal?: {
    openai?: {
      reasoningItems?: Array<Record<string, unknown>>;
    };
  };
  /**
   * Thinking/reasoning content from thinking models (DeepSeek Reasoner, Gemini, etc.)
   * For DeepSeek: Maps to reasoning_content field in API.
   * For tool call loops: Must be passed back within the same turn.
   * For new user turns: Should be cleared to save bandwidth.
   * @see https://api-docs.deepseek.com/guides/thinking_mode
   */
  thinking?: string;
  /**
   * Thought signature for Gemini 3 Pro models.
   * Must be captured from model responses and passed back for function calling.
   * Only the first function call part in each step has a signature.
   * @see https://ai.google.dev/gemini-api/docs/thought-signatures
   */
  thoughtSignature?: string;

  /**
   * Anthropic extended thinking signature for verifying thinking blocks.
   * Must be passed back with thinking content for multi-turn tool use.
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#thinking-encryption
   */
  anthropicThinkingSignature?: string;

  /**
   * Redacted thinking content (encrypted) from Anthropic.
   * Safety-flagged reasoning that is encrypted but must be passed back to the API.
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#thinking-redaction
   */
  redactedThinking?: string;

  /**
   * Generated images from multimodal models (e.g., Gemini image generation).
   * Used for validation - messages with generated media should not be filtered out.
   */
  generatedImages?: Array<{ data: string; mimeType: string }>;
  /**
   * Generated audio from multimodal models (e.g., Gemini speech generation).
   * Used for validation - messages with generated media should not be filtered out.
   */
  generatedAudio?: { data: string; mimeType: string };
}

export interface ProviderToolDefinition {
  name: string;
  description: string;
  jsonSchema: Record<string, unknown>;
  requiresApproval: boolean;
  /** Input examples for improved LLM accuracy (72% -> 90% per Anthropic research) */
  input_examples?: Array<Record<string, unknown>>;
}

export interface ProviderRequestConfig {
  model?: string;
  temperature: number;
  maxOutputTokens: number;
  /**
   * Verbosity level for response generation (OpenAI GPT-5.2 only).
   * Controls how verbose the model's responses are.
   * - 'low': Concise responses
   * - 'medium': Balanced verbosity (default)
   * - 'high': More detailed responses
   * @see https://platform.openai.com/docs/guides/text-generation
   */
  verbosity?: 'low' | 'medium' | 'high';
  /**
   * Reasoning effort level for reasoning models (OpenAI GPT-5.x, o-series).
   * Controls how much compute the model spends on reasoning.
   * - 'none': No reasoning (fastest, temperature allowed)
   * - 'low': Minimal reasoning
   * - 'medium': Balanced reasoning (default)
   * - 'high': Deep reasoning
   * - 'xhigh': Maximum reasoning (GPT-5.2 only)
   * @see https://platform.openai.com/docs/guides/reasoning
   */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  /**
   * Response modalities for multimodal output.
   * Gemini models support: TEXT, IMAGE, AUDIO
   * @see https://ai.google.dev/gemini-api/docs/image-generation
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  responseModalities?: ('TEXT' | 'IMAGE' | 'AUDIO')[];
  /**
   * Structured output configuration.
   * When set, the model will output JSON conforming to the schema.
   * @see https://ai.google.dev/gemini-api/docs/structured-output
   */
  responseFormat?: {
    /** Type of response format */
    type: 'json_object' | 'json_schema';
    /** JSON Schema for structured output (when type is 'json_schema') */
    schema?: Record<string, unknown>;
  };
  /**
   * Media resolution for document/image processing.
   * Higher resolution uses more tokens but improves accuracy.
   * @see https://ai.google.dev/gemini-api/docs/media-resolution
   */
  mediaResolution?: 'low' | 'medium' | 'high';
  /**
   * Speech configuration for TTS models.
   * @see https://ai.google.dev/gemini-api/docs/speech-generation
   */
  speechConfig?: {
    /** Voice name for single-speaker TTS */
    voiceName?: string;
    /** Multi-speaker configuration */
    speakers?: Array<{
      name: string;
      voiceName: string;
    }>;
  };

  // Anthropic Extended Thinking Settings
  /**
   * Enable extended thinking for Anthropic Claude models.
   * When enabled, Claude will show its reasoning process before providing a final answer.
   * @default false
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking
   */
  enableAnthropicThinking?: boolean;

  /**
   * Token budget for Anthropic extended thinking (minimum 1024).
   * Must be less than maxOutputTokens.
   * @default 10000
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#working-with-thinking-budgets
   */
  anthropicThinkingBudget?: number;

  /**
   * Enable interleaved thinking for Anthropic Claude 4 models with tool use.
   * Allows Claude to reason between tool calls.
   * @default false
   * @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#interleaved-thinking
   */
  enableInterleavedThinking?: boolean;
}

/** Cache control configuration for prompt caching */
export interface CacheControl {
  /** Type of cache control (currently only 'ephemeral' supported) */
  type: 'ephemeral';
  /** Time-to-live for the cache: '5m' (5 minutes) or '1h' (1 hour) */
  ttl?: '5m' | '1h';
}

/** Configuration for provider-specific prompt caching */
export interface CacheConfig {
  /** Enable prompt caching for system prompts */
  cacheSystemPrompt?: boolean;
  /** Enable prompt caching for large file contexts */
  cacheFileContexts?: boolean;
  /** Enable prompt caching for tool definitions */
  cacheTools?: boolean;
  /** 
   * TTL for cached content 
   * - '5m': 5 minutes (default)
   * - '1h': 1 hour
   * - '24h': 24 hours (extended retention, OpenAI only)
   */
  ttl?: '5m' | '1h' | '24h';
  /** Minimum content size (in characters) to cache */
  minCacheSize?: number;
}

export interface ProviderRequest {
  systemPrompt: string;
  messages: ProviderMessage[];
  tools: ProviderToolDefinition[];
  config: ProviderRequestConfig;
  signal?: AbortSignal; // Added abort signal support
  /** Cache configuration for prompt optimization */
  cache?: CacheConfig;
}

// =============================================================================
// Message Validation Utilities
// =============================================================================

export interface MessageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cleanedMessages?: ProviderMessage[];
}

/**
 * Validates a single message for required fields and content integrity.
 */
export function validateMessage(message: ProviderMessage, index: number): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check role
  if (!message.role) {
    errors.push(`Message ${index}: Missing required 'role' field`);
  } else if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
    errors.push(`Message ${index}: Invalid role '${message.role}'. Must be system, user, assistant, or tool`);
  }

  // Check content based on role
  if (message.role === 'assistant') {
    // Assistant messages can have content, tool calls, or thinking
    const hasContent = message.content && message.content.trim().length > 0;
    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
    const hasThinking = message.thinking && message.thinking.trim().length > 0;
    const hasGeneratedMedia = message.generatedImages?.length || message.generatedAudio;
    
    if (!hasContent && !hasToolCalls && !hasThinking && !hasGeneratedMedia) {
      errors.push(`Message ${index}: Assistant message must have content, tool calls, thinking, or generated media`);
    }
  } else if (message.role === 'tool') {
    // Tool messages must have content and toolCallId
    if (!message.toolCallId) {
      errors.push(`Message ${index}: Tool message missing required 'toolCallId' field`);
    }
    // Content can be empty for tool results (e.g., void operations)
  } else if (message.role === 'user') {
    // User messages should have content or attachments
    const hasContent = message.content && message.content.trim().length > 0;
    const hasAttachments = message.attachments && message.attachments.length > 0;
    
    if (!hasContent && !hasAttachments) {
      warnings.push(`Message ${index}: User message has no content or attachments`);
    }
  }

  // Validate tool calls if present
  if (message.toolCalls) {
    for (let i = 0; i < message.toolCalls.length; i++) {
      const toolCall = message.toolCalls[i];
      if (!toolCall.callId) {
        errors.push(`Message ${index}, ToolCall ${i}: Missing required 'callId' field`);
      }
      if (!toolCall.name) {
        errors.push(`Message ${index}, ToolCall ${i}: Missing required 'name' field`);
      }
    }
  }

  // Validate attachments if present
  if (message.attachments) {
    for (let i = 0; i < message.attachments.length; i++) {
      const attachment = message.attachments[i];
      if (!attachment.mimeType) {
        warnings.push(`Message ${index}, Attachment ${i}: Missing 'mimeType' field`);
      }
      if (!attachment.content) {
        warnings.push(`Message ${index}, Attachment ${i}: Missing 'content' field`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates an array of messages for a provider request.
 * Checks for structural integrity, proper ordering, and required fields.
 */
export function validateMessages(messages: ProviderMessage[]): MessageValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!messages || !Array.isArray(messages)) {
    return { valid: false, errors: ['Messages must be an array'], warnings: [] };
  }

  if (messages.length === 0) {
    return { valid: false, errors: ['Messages array cannot be empty'], warnings: [] };
  }

  // Validate each message
  for (let i = 0; i < messages.length; i++) {
    const result = validateMessage(messages[i], i);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  // Check message ordering: should typically alternate user/assistant
  // (with tool messages allowed after assistant tool calls)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // Tool messages should follow assistant messages with tool calls
    if (msg.role === 'tool') {
      // Find the preceding assistant message
      let foundToolCall = false;
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === 'assistant' && messages[j].toolCalls?.length) {
          foundToolCall = true;
          break;
        }
        if (messages[j].role === 'user') {
          break; // Went past where we'd expect the assistant
        }
      }
      if (!foundToolCall) {
        warnings.push(`Message ${i}: Tool message without preceding assistant tool call`);
      }
    }
  }

  // Check that last message is not system (unusual pattern)
  if (messages[messages.length - 1].role === 'system') {
    warnings.push('Last message is a system message - this is unusual');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Filters out empty or invalid messages that would cause API errors.
 * Returns cleaned messages array and any issues found.
 */
export function cleanMessages(messages: ProviderMessage[]): { messages: ProviderMessage[]; removed: number; issues: string[] } {
  const issues: string[] = [];
  let removed = 0;
  
  const cleaned = messages.filter((msg, idx) => {
    // Keep all user messages (even if empty - they may have attachments processed later)
    if (msg.role === 'user') {
      return true;
    }
    
    // Keep assistant messages with tool calls, thinking, generated media, or content
    if (msg.role === 'assistant') {
      const hasContent = msg.content && msg.content.trim().length > 0;
      const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;
      const hasThinking = msg.thinking && msg.thinking.trim().length > 0;
      const hasGeneratedMedia = msg.generatedImages?.length || msg.generatedAudio;
      
      if (!hasContent && !hasToolCalls && !hasThinking && !hasGeneratedMedia) {
        issues.push(`Removed empty assistant message at index ${idx}`);
        removed++;
        return false;
      }
      return true;
    }
    
    // Keep tool messages with toolCallId
    if (msg.role === 'tool') {
      if (!msg.toolCallId) {
        issues.push(`Removed tool message without toolCallId at index ${idx}`);
        removed++;
        return false;
      }
      return true;
    }
    
    // Keep system messages
    if (msg.role === 'system') {
      return true;
    }
    
    // Unknown role - remove
    issues.push(`Removed message with unknown role '${msg.role}' at index ${idx}`);
    removed++;
    return false;
  });
  
  return { messages: cleaned, removed, issues };
}

export interface LLMProvider {
  readonly name: LLMProviderName;
  /** Whether this provider supports prompt caching */
  readonly supportsCaching?: boolean;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
  stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk>;
  /** Fetch available models from the provider API (optional) */
  fetchModels?(signal?: AbortSignal): Promise<unknown[]>;
}

export abstract class BaseLLMProvider implements LLMProvider {
  abstract readonly name: LLMProviderName;
  readonly supportsCaching: boolean = false;

  constructor(protected readonly apiKey?: string) {}

  protected assertApiKey(): string {
    if (!this.apiKey) {
      throw new Error(`${this.name} API key is not configured.`);
    }
    return this.apiKey;
  }

  /**
   * Validates and cleans a provider request before sending to the API.
   * Throws an error if the request is invalid.
   * Returns the request with cleaned messages if needed.
   */
  protected validateRequest(request: ProviderRequest): ProviderRequest {
    // Validate messages
    const validation = validateMessages(request.messages);
    
    if (!validation.valid) {
      logger.error('Message validation failed', { 
        errors: validation.errors,
        provider: this.name 
      });
      throw new Error(`Invalid messages: ${validation.errors.join('; ')}`);
    }
    
    // Log warnings but don't fail
    if (validation.warnings.length > 0) {
      logger.warn('Message validation warnings', { 
        warnings: validation.warnings,
        provider: this.name 
      });
    }
    
    // Clean messages to remove empty entries
    const { messages: cleanedMessages, removed, issues } = cleanMessages(request.messages);
    
    if (removed > 0) {
      logger.warn('Removed invalid messages during cleanup', { 
        removed, 
        issues,
        provider: this.name 
      });
    }
    
    // Validate config
    if (request.config.temperature < 0 || request.config.temperature > 2) {
      logger.warn('Temperature out of typical range', { 
        temperature: request.config.temperature,
        provider: this.name 
      });
    }
    
    if (request.config.maxOutputTokens <= 0) {
      throw new Error('maxOutputTokens must be positive');
    }
    
    // Return request with cleaned messages
    return {
      ...request,
      messages: cleanedMessages,
    };
  }

  abstract generate(request: ProviderRequest): Promise<ProviderResponse>;
  
  async *stream(request: ProviderRequest): AsyncGenerator<ProviderResponseChunk> {
    // Default implementation falls back to generate
    const response = await this.generate(request);
    if (response.content) {
      yield { delta: response.content };
    }
    if (response.toolCalls) {
      for (let i = 0; i < response.toolCalls.length; i++) {
        yield { toolCall: { ...response.toolCalls[i], index: i } };
      }
    }
    if (response.usage) {
      yield { usage: response.usage };
    }
    if (response.finishReason) {
      yield { finishReason: response.finishReason };
    }
  }
}
