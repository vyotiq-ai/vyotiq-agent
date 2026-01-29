/**
 * Formatting Utilities
 * 
 * Helper functions for formatting costs, context windows,
 * and other display values.
 */

// =============================================================================
// Formatting Functions
// =============================================================================

/**
 * Format cost per million tokens
 */
export function formatCost(cost: number | undefined): string {
  if (cost === undefined || cost === null) return 'N/A';
  if (cost === 0) return 'Free';
  return `$${cost.toFixed(2)}/M`;
}

/**
 * Format context window size
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}

/**
 * Format a number with thousands separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M tokens`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K tokens`;
  }
  return `${tokens} tokens`;
}

/**
 * Format model speed tier
 */
export function formatSpeed(tier: 'fast' | 'medium' | 'slow' | undefined): string {
  switch (tier) {
    case 'fast': return '[FAST]';
    case 'medium': return '[MED]';
    case 'slow': return '[SLOW]';
    default: return '';
  }
}

/**
 * Get tier badge for model display
 */
export function getTierBadge(tier: string | undefined): string {
  switch (tier) {
    case 'flagship': return '[PRO]';
    case 'balanced': return '[BAL]';
    case 'fast': return '[FAST]';
    case 'reasoning': return '[RSN]';
    default: return '';
  }
}
