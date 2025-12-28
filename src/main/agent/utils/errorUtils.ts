
/**
 * Check if error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('quota exceeded')
    );
  }
  return false;
}

/**
 * Check if error indicates the model doesn't support tool/function calling
 */
export function isToolSupportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('no endpoints found that support tool use') ||
    message.includes('does not support tools') ||
    message.includes('does not support function') ||
    message.includes('tool_choice') && message.includes('not supported')
  );
}

/**
 * Check if error is a context length overflow error
 */
export function isContextOverflowError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('context length') ||
      message.includes('maximum context') ||
      message.includes('token limit') ||
      message.includes('too many tokens') ||
      message.includes('exceeds the model') ||
      message.includes('prompt is too long') ||
      // DeepSeek specific patterns
      (message.includes('requested') && message.includes('tokens')) ||
      message.includes('131072 tokens') ||
      message.includes('128000 tokens')
    );
  }
  return false;
}

export function isQuotaOrBillingError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('quota') ||
    message.includes('insufficient_quota') ||
    message.includes('billing') ||
    message.includes('payment required') ||
    message.includes('insufficient balance') ||
    message.includes('insufficient credits') ||
    message.includes('resource has been exhausted') ||
    message.includes('resourceexhausted') ||
    // OpenRouter credit errors
    message.includes('requires more credits') ||
    message.includes('can only afford') ||
    message.includes('fewer max_tokens') ||
    message.includes('never purchased credits') ||
    message.includes('purchase more')
  );
}

/**
 * Check if error is specifically about maxOutputTokens being too high
 * This is different from context overflow - it means we need to reduce output tokens, not input
 */
export function isMaxOutputTokensError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    // OpenRouter specific pattern: "You requested up to X tokens, but can only afford Y"
    (message.includes('requested') && message.includes('tokens') && message.includes('afford')) ||
    // Generic patterns
    message.includes('fewer max_tokens') ||
    message.includes('max_tokens too high') ||
    message.includes('reduce max_tokens')
  );
}

/**
 * Determine if an error warrants trying the fallback provider
 */
export function shouldTryFallback(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Don't fallback for context overflow (already handled by pruning)
  if (isContextOverflowError(error)) return false;

  // Don't fallback for rate limits (retry with same provider)
  if (isRateLimitError(error)) return false;

  // Don't fallback for tool support errors (user needs to select a different model)
  if (isToolSupportError(error)) return false;

  // Try fallback for these errors:
  return (
    // Authentication/API key issues
    message.includes('api key') ||
    message.includes('unauthorized') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('invalid_api_key') ||
    // Service unavailable
    message.includes('service unavailable') ||
    message.includes('502') ||
    message.includes('503') ||
    // Model not available
    message.includes('model not found') ||
    message.includes('model_not_found') ||
    message.includes('does not exist') ||
    // Quota exceeded (different from rate limit)
    message.includes('quota') ||
    message.includes('insufficient') ||
    // Google/Gemini specific quota errors
    message.includes('resource has been exhausted') ||
    message.includes('resourceexhausted') ||
    // Generic server errors that persist
    message.includes('internal server error') ||
    message.includes('500') ||
    // OpenRouter specific errors
    message.includes('provider returned error') ||
    message.includes('upstream error') ||
    message.includes('no endpoints available') ||
    message.includes('no endpoints found') ||
    message.includes('all providers failed')
  );
}
