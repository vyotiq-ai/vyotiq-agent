/**
 * Rate Limiter
 *
 * Controls the rate of operations to prevent abuse and ensure fair resource usage.
 * Supports configurable limits, cooldowns, and different response strategies.
 * Includes per-provider LLM API rate limiting.
 */
import type { RateLimitConfig, RateLimitState, LLMProviderName } from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('RateLimiter');

/**
 * Rate limit bucket types
 */
export type RateLimitBucket =
  | 'tool_creation'
  | 'tool_execution'
  | 'file_write'
  | 'terminal_command'
  | 'llm_api_call';  // Added for LLM API tracking

/**
 * Provider-specific rate limit tracking
 */
export interface ProviderRateLimitState extends RateLimitState {
  /** Token usage in current window */
  tokenCount?: number;
  /** Max tokens allowed in window */
  maxTokens?: number;
  /** Last API error (429, 529) timestamp */
  lastApiError?: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier?: number;
}

/**
 * Default rate limit configurations
 */
export const DEFAULT_RATE_LIMITS: Record<RateLimitBucket, RateLimitConfig> = {
  tool_creation: {
    maxOperations: 10,
    windowMs: 60 * 1000, // 10 per minute
    onExceeded: 'reject',
    cooldownMs: 30 * 1000,
  },
  tool_execution: {
    maxOperations: 100,
    windowMs: 60 * 1000, // 100 per minute
    onExceeded: 'throttle',
  },
  file_write: {
    maxOperations: 50,
    windowMs: 60 * 1000, // 50 per minute
    onExceeded: 'throttle',
  },
  terminal_command: {
    maxOperations: 20,
    windowMs: 60 * 1000, // 20 per minute
    onExceeded: 'throttle',
  },
  llm_api_call: {
    maxOperations: 60,
    windowMs: 60 * 1000, // 60 per minute default
    onExceeded: 'throttle',
    cooldownMs: 10 * 1000,
  },
};

/**
 * Default per-provider rate limits (requests per minute)
 * Based on typical API limits
 */
export const DEFAULT_PROVIDER_RATE_LIMITS: Record<LLMProviderName, { rpm: number; tpm?: number }> = {
  anthropic: { rpm: 60, tpm: 100000 },
  openai: { rpm: 60, tpm: 150000 },
  deepseek: { rpm: 100, tpm: 200000 },
  gemini: { rpm: 60, tpm: 100000 },
  openrouter: { rpm: 60 },
  xai: { rpm: 60 },
  mistral: { rpm: 60, tpm: 100000 },
  glm: { rpm: 60, tpm: 100000 },
};

/**
 * Result of a rate limit check
 */
export interface RateLimitCheckResult {
  /** Whether the operation is allowed */
  allowed: boolean;
  /** Current count in window */
  currentCount: number;
  /** Maximum allowed in window */
  maxAllowed: number;
  /** Remaining operations in window */
  remaining: number;
  /** When the window resets (timestamp) */
  resetsAt: number;
  /** If not allowed, when to retry */
  retryAfterMs?: number;
  /** Action that was taken */
  action: 'allowed' | 'rejected' | 'queued' | 'throttled';
}

/**
 * Rate Limiter class
 */
export class RateLimiter {
  private buckets = new Map<string, RateLimitState>();
  private configs = new Map<RateLimitBucket, RateLimitConfig>();
  private throttleQueues = new Map<string, Array<() => void>>();
  /** Provider-specific rate limit states */
  private providerStates = new Map<LLMProviderName, ProviderRateLimitState>();
  /** Custom provider rate limits (overrides defaults) */
  private providerLimits = new Map<LLMProviderName, { rpm: number; tpm?: number }>();

  constructor(customConfigs?: Partial<Record<RateLimitBucket, Partial<RateLimitConfig>>>) {
    // Initialize with defaults, overriding with custom configs
    for (const [bucket, config] of Object.entries(DEFAULT_RATE_LIMITS)) {
      const customConfig = customConfigs?.[bucket as RateLimitBucket];
      this.configs.set(bucket as RateLimitBucket, {
        ...config,
        ...customConfig,
      });
    }
  }

  /**
   * Get a bucket key for a specific actor
   */
  private getBucketKey(bucket: RateLimitBucket, actorId: string): string {
    return `${bucket}:${actorId}`;
  }

  /**
   * Get or create rate limit state for a bucket
   */
  private getOrCreateState(bucketKey: string): RateLimitState {
    let state = this.buckets.get(bucketKey);
    if (!state) {
      state = {
        count: 0,
        windowStart: Date.now(),
        inCooldown: false,
      };
      this.buckets.set(bucketKey, state);
    }
    return state;
  }

  /**
   * Check if a window has expired and reset if needed
   */
  private maybeResetWindow(state: RateLimitState, config: RateLimitConfig): void {
    const now = Date.now();
    if (now - state.windowStart >= config.windowMs) {
      state.count = 0;
      state.windowStart = now;
    }

    // Check cooldown expiry
    if (state.inCooldown && state.cooldownEndsAt && now >= state.cooldownEndsAt) {
      state.inCooldown = false;
      state.cooldownEndsAt = undefined;
    }
  }

  /**
   * Check if an operation is allowed under rate limits
   */
  check(bucket: RateLimitBucket, actorId: string): RateLimitCheckResult {
    const config = this.configs.get(bucket);
    if (!config) {
      // No config = no limit
      return {
        allowed: true,
        currentCount: 0,
        maxAllowed: Infinity,
        remaining: Infinity,
        resetsAt: 0,
        action: 'allowed',
      };
    }

    const bucketKey = this.getBucketKey(bucket, actorId);
    const state = this.getOrCreateState(bucketKey);
    this.maybeResetWindow(state, config);

    const resetsAt = state.windowStart + config.windowMs;
    const remaining = Math.max(0, config.maxOperations - state.count);

    // Check cooldown
    if (state.inCooldown && state.cooldownEndsAt) {
      return {
        allowed: false,
        currentCount: state.count,
        maxAllowed: config.maxOperations,
        remaining: 0,
        resetsAt,
        retryAfterMs: state.cooldownEndsAt - Date.now(),
        action: 'rejected',
      };
    }

    // Check if under limit
    if (state.count < config.maxOperations) {
      return {
        allowed: true,
        currentCount: state.count,
        maxAllowed: config.maxOperations,
        remaining,
        resetsAt,
        action: 'allowed',
      };
    }

    // Over limit - determine action
    const retryAfterMs = resetsAt - Date.now();
    let action: RateLimitCheckResult['action'];

    switch (config.onExceeded) {
      case 'queue':
        action = 'queued';
        break;
      case 'throttle':
        action = 'throttled';
        break;
      case 'reject':
      default:
        action = 'rejected';
        // Start cooldown if configured
        if (config.cooldownMs) {
          state.inCooldown = true;
          state.cooldownEndsAt = Date.now() + config.cooldownMs;
        }
        break;
    }

    logger.debug('Rate limit exceeded', {
      bucket,
      actorId,
      count: state.count,
      max: config.maxOperations,
      action,
    });

    return {
      allowed: false,
      currentCount: state.count,
      maxAllowed: config.maxOperations,
      remaining: 0,
      resetsAt,
      retryAfterMs,
      action,
    };
  }

  /**
   * Record an operation (increment counter)
   */
  record(bucket: RateLimitBucket, actorId: string): void {
    const config = this.configs.get(bucket);
    if (!config) return;

    const bucketKey = this.getBucketKey(bucket, actorId);
    const state = this.getOrCreateState(bucketKey);
    this.maybeResetWindow(state, config);

    state.count++;

    logger.debug('Rate limit recorded', {
      bucket,
      actorId,
      count: state.count,
      max: config.maxOperations,
    });
  }

  /**
   * Check and record in one operation
   * Returns the check result after recording if allowed
   */
  checkAndRecord(bucket: RateLimitBucket, actorId: string): RateLimitCheckResult {
    const result = this.check(bucket, actorId);
    if (result.allowed) {
      this.record(bucket, actorId);
      result.remaining = Math.max(0, result.remaining - 1);
      result.currentCount++;
    }
    return result;
  }

  /**
   * Queue an operation for later execution when throttled
   */
  queue(bucket: RateLimitBucket, actorId: string, operation: () => void): void {
    const bucketKey = this.getBucketKey(bucket, actorId);
    let queue = this.throttleQueues.get(bucketKey);
    if (!queue) {
      queue = [];
      this.throttleQueues.set(bucketKey, queue);
    }
    queue.push(operation);

    // Process queue when window resets
    const config = this.configs.get(bucket);
    if (config) {
      const state = this.getOrCreateState(bucketKey);
      const waitTime = state.windowStart + config.windowMs - Date.now();
      if (waitTime > 0) {
        setTimeout(() => this.processQueue(bucketKey), waitTime);
      }
    }
  }

  /**
   * Process queued operations
   */
  private processQueue(bucketKey: string): void {
    const queue = this.throttleQueues.get(bucketKey);
    if (!queue || queue.length === 0) return;

    const operation = queue.shift();
    if (operation) {
      try {
        operation();
      } catch (error) {
        logger.error('Queued operation failed', { bucketKey, error });
      }
    }

    // Schedule next if more in queue
    if (queue.length > 0) {
      setTimeout(() => this.processQueue(bucketKey), 100); // Small delay between operations
    }
  }

  /**
   * Get current state for a bucket
   */
  getState(bucket: RateLimitBucket, actorId: string): RateLimitState | undefined {
    const bucketKey = this.getBucketKey(bucket, actorId);
    return this.buckets.get(bucketKey);
  }

  /**
   * Reset a specific bucket
   */
  reset(bucket: RateLimitBucket, actorId: string): void {
    const bucketKey = this.getBucketKey(bucket, actorId);
    this.buckets.delete(bucketKey);
    this.throttleQueues.delete(bucketKey);
    logger.debug('Rate limit reset', { bucket, actorId });
  }

  /**
   * Reset all buckets for an actor
   */
  resetActor(actorId: string): void {
    for (const [key] of this.buckets) {
      if (key.endsWith(`:${actorId}`)) {
        this.buckets.delete(key);
      }
    }
    for (const [key] of this.throttleQueues) {
      if (key.endsWith(`:${actorId}`)) {
        this.throttleQueues.delete(key);
      }
    }
    logger.debug('All rate limits reset for actor', { actorId });
  }

  /**
   * Get all current limits for an actor
   */
  getActorLimits(actorId: string): Record<RateLimitBucket, RateLimitCheckResult> {
    const result = {} as Record<RateLimitBucket, RateLimitCheckResult>;
    for (const bucket of this.configs.keys()) {
      result[bucket] = this.check(bucket, actorId);
    }
    return result;
  }

  /**
   * Update configuration for a bucket
   */
  updateConfig(bucket: RateLimitBucket, updates: Partial<RateLimitConfig>): void {
    const existing = this.configs.get(bucket) || DEFAULT_RATE_LIMITS[bucket];
    this.configs.set(bucket, { ...existing, ...updates });
    logger.info('Rate limit config updated', { bucket, updates });
  }

  // =============================================================================
  // Provider-Specific Rate Limiting
  // =============================================================================

  /**
   * Set custom rate limits for a provider
   */
  setProviderLimit(provider: LLMProviderName, limits: { rpm: number; tpm?: number }): void {
    this.providerLimits.set(provider, limits);
    logger.info('Provider rate limit set', { provider, limits });
  }

  /**
   * Get rate limits for a provider
   */
  getProviderLimit(provider: LLMProviderName): { rpm: number; tpm?: number } {
    return this.providerLimits.get(provider) || DEFAULT_PROVIDER_RATE_LIMITS[provider];
  }

  /**
   * Get or create provider rate limit state
   */
  private getOrCreateProviderState(provider: LLMProviderName): ProviderRateLimitState {
    let state = this.providerStates.get(provider);
    if (!state) {
      state = {
        count: 0,
        windowStart: Date.now(),
        inCooldown: false,
        tokenCount: 0,
        backoffMultiplier: 1,
      };
      this.providerStates.set(provider, state);
    }
    return state;
  }

  /**
   * Check if a provider API call is allowed
   */
  checkProvider(provider: LLMProviderName, estimatedTokens?: number): RateLimitCheckResult {
    const limits = this.getProviderLimit(provider);
    const state = this.getOrCreateProviderState(provider);
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window

    // Reset window if expired
    if (now - state.windowStart >= windowMs) {
      state.count = 0;
      state.tokenCount = 0;
      state.windowStart = now;
      state.backoffMultiplier = Math.max(1, (state.backoffMultiplier || 1) * 0.9); // Decay backoff
    }

    // Check cooldown (from API errors)
    if (state.inCooldown && state.cooldownEndsAt && now < state.cooldownEndsAt) {
      return {
        allowed: false,
        currentCount: state.count,
        maxAllowed: limits.rpm,
        remaining: 0,
        resetsAt: state.cooldownEndsAt,
        retryAfterMs: state.cooldownEndsAt - now,
        action: 'rejected',
      };
    } else if (state.inCooldown) {
      state.inCooldown = false;
      state.cooldownEndsAt = undefined;
    }

    const resetsAt = state.windowStart + windowMs;
    const remaining = Math.max(0, limits.rpm - state.count);

    // Check RPM limit
    if (state.count >= limits.rpm) {
      logger.debug('Provider RPM limit exceeded', { provider, count: state.count, max: limits.rpm });
      return {
        allowed: false,
        currentCount: state.count,
        maxAllowed: limits.rpm,
        remaining: 0,
        resetsAt,
        retryAfterMs: resetsAt - now,
        action: 'throttled',
      };
    }

    // Check TPM limit if configured
    if (limits.tpm && estimatedTokens) {
      const currentTokens = state.tokenCount || 0;
      if (currentTokens + estimatedTokens > limits.tpm) {
        logger.debug('Provider TPM limit would be exceeded', {
          provider,
          currentTokens,
          estimatedTokens,
          max: limits.tpm,
        });
        return {
          allowed: false,
          currentCount: state.count,
          maxAllowed: limits.rpm,
          remaining,
          resetsAt,
          retryAfterMs: resetsAt - now,
          action: 'throttled',
        };
      }
    }

    return {
      allowed: true,
      currentCount: state.count,
      maxAllowed: limits.rpm,
      remaining,
      resetsAt,
      action: 'allowed',
    };
  }

  /**
   * Record a provider API call
   */
  recordProviderCall(provider: LLMProviderName, tokensUsed?: number): void {
    const state = this.getOrCreateProviderState(provider);
    state.count++;
    if (tokensUsed) {
      state.tokenCount = (state.tokenCount || 0) + tokensUsed;
    }
    logger.debug('Provider API call recorded', {
      provider,
      count: state.count,
      tokenCount: state.tokenCount,
    });
  }

  /**
   * Record a provider API error (429, 529, etc.)
   * Triggers exponential backoff
   */
  recordProviderError(provider: LLMProviderName, retryAfterMs?: number): void {
    const state = this.getOrCreateProviderState(provider);
    state.lastApiError = Date.now();
    state.backoffMultiplier = Math.min(16, (state.backoffMultiplier || 1) * 2); // Max 16x backoff
    
    // Calculate cooldown with exponential backoff
    const baseBackoff = retryAfterMs || 10000;
    const cooldownMs = baseBackoff * state.backoffMultiplier;
    
    state.inCooldown = true;
    state.cooldownEndsAt = Date.now() + cooldownMs;
    
    logger.warn('Provider API error recorded, entering cooldown', {
      provider,
      cooldownMs,
      backoffMultiplier: state.backoffMultiplier,
    });
  }

  /**
   * Get provider rate limit status for all providers
   */
  getProviderStatuses(): Record<LLMProviderName, RateLimitCheckResult> {
    const providers: LLMProviderName[] = ['anthropic', 'openai', 'deepseek', 'gemini', 'openrouter', 'xai', 'mistral', 'glm'];
    const result = {} as Record<LLMProviderName, RateLimitCheckResult>;
    for (const provider of providers) {
      result[provider] = this.checkProvider(provider);
    }
    return result;
  }

  /**
   * Reset rate limits for a specific provider
   */
  resetProvider(provider: LLMProviderName): void {
    this.providerStates.delete(provider);
    logger.debug('Provider rate limits reset', { provider });
  }

  /**
   * Reset all provider rate limits
   */
  resetAllProviders(): void {
    this.providerStates.clear();
    logger.debug('All provider rate limits reset');
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

/**
 * Get or create the rate limiter singleton
 */
export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}

/**
 * Create a new rate limiter with custom config (for testing)
 */
export function createRateLimiter(
  customConfigs?: Partial<Record<RateLimitBucket, Partial<RateLimitConfig>>>
): RateLimiter {
  return new RateLimiter(customConfigs);
}
