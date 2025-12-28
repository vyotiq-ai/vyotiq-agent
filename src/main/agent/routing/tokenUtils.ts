/**
 * Token Utilities - Minimal Implementation
 * Provides basic token counting and estimation functionality
 */

export class SimpleTokenCounter {
  /**
   * Estimate token count for text using a simple heuristic
   * Roughly 4 characters per token for English text
   */
  static countTokens(text: string): number {
    if (!text) return 0;
    // Simple approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Count tokens in a message object
   */
  static countMessageTokens(message: { role: string; content: string }): number {
    // Add some overhead for role and structure
    const contentTokens = this.countTokens(message.content);
    const roleTokens = this.countTokens(message.role);
    return contentTokens + roleTokens + 4; // +4 for message structure overhead
  }

  /**
   * Count tokens in an array of messages
   */
  static countMessagesTokens(messages: Array<{ role: string; content: string }>): number {
    return messages.reduce((total, message) => {
      return total + this.countMessageTokens(message);
    }, 0);
  }
}

/**
 * Estimate token count for JSON data
 */
export function estimateJsonTokens(data: unknown): number {
  if (data === null || data === undefined) return 1;
  
  const jsonString = JSON.stringify(data);
  return SimpleTokenCounter.countTokens(jsonString);
}

/**
 * Estimate tokens for function/tool definitions
 */
export function estimateToolTokens(tool: {
  name: string;
  description: string;
  parameters?: unknown;
}): number {
  let tokens = 0;
  tokens += SimpleTokenCounter.countTokens(tool.name);
  tokens += SimpleTokenCounter.countTokens(tool.description);
  
  if (tool.parameters) {
    tokens += estimateJsonTokens(tool.parameters);
  }
  
  // Add overhead for tool structure
  return tokens + 10;
}

/**
 * Check if content fits within token limit
 */
export function fitsWithinLimit(content: string, limit: number): boolean {
  return SimpleTokenCounter.countTokens(content) <= limit;
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokenLimit(text: string, limit: number): string {
  const currentTokens = SimpleTokenCounter.countTokens(text);
  
  if (currentTokens <= limit) {
    return text;
  }
  
  // Rough approximation: keep proportional amount of text
  const ratio = limit / currentTokens;
  const targetLength = Math.floor(text.length * ratio);
  
  return text.substring(0, targetLength) + '...';
}