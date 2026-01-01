import type { AttachmentPayload, LLMProviderName, ToolCallPayload, ProviderResponse, ProviderResponseChunk } from '../../../shared/types';
import { createLogger } from '../../logger';

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
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 2, // Reduced from 3 - fail faster and let the user know
  initialDelayMs: 2000, // Increased from 1000 - start with longer delay
  maxDelayMs: 60000, // Increased from 30000 - allow longer delays for rate limits
  backoffMultiplier: 2.5, // Increased from 2 - more aggressive backoff
  retryableStatusCodes: [429, 500, 502, 503, 504],
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
const PERMANENT_RATE_LIMIT_PATTERNS = [
  'would exceed the rate limit',     // Request is larger than per-minute quota
  'exceeded the rate limit',         // Already over quota (but may be temporary)
  'exceeds.*token.*limit',           // Request exceeds token limit
  'prompt.*too.*large',              // Prompt is too large
  'context.*too.*large',             // Context is too large
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
    // Handle regex patterns
    if (pattern.includes('.*')) {
      try {
        return new RegExp(pattern).test(lowerMessage);
      } catch {
        return false;
      }
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
 * Check if an error is a transient network/server error
 */
function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket') ||
      message.includes('fetch failed')
    );
  }
  return false;
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
