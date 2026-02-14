/**
 * Message Formatter Factory
 * 
 * Provides unified access to provider-specific message formatters.
 */

import type { LLMProviderName } from '../../types';
import type { MessageFormatter, InternalMessage, InternalToolDefinition } from './types';
import { AnthropicFormatter } from './AnthropicFormatter';
import { OpenAIFormatter } from './OpenAIFormatter';

// Simple logger for shared code (works in both main and renderer)
// Using no-op functions to avoid console output
const logger = {
  warn: (_message: string) => { /* no-op */ },
  info: (_message: string) => { /* no-op */ },
  error: (_message: string) => { /* no-op */ },
};

/**
 * Registry of provider formatters
 */
const formatters: Record<string, MessageFormatter> = {
  anthropic: new AnthropicFormatter(),
  openai: new OpenAIFormatter(),
  deepseek: new OpenAIFormatter(), // DeepSeek uses OpenAI-compatible API
  gemini: new OpenAIFormatter(),   // Gemini uses OpenAI-compatible format (via adapter)
};

/**
 * Get a message formatter for a specific provider
 */
export function getFormatter(provider: LLMProviderName): MessageFormatter {
  const formatter = formatters[provider];
  if (!formatter) {
    // Default to OpenAI format for unknown providers
    logger.warn(`Unknown provider "${provider}", using OpenAI format`);
    return formatters.openai;
  }
  return formatter;
}

/**
 * Register a custom formatter for a provider
 */
export function registerFormatter(provider: string, formatter: MessageFormatter): void {
  formatters[provider] = formatter;
}

/**
 * Convert messages between providers
 * Useful when switching providers mid-conversation
 */
export function convertMessages(
  messages: InternalMessage[],
  _fromProvider: LLMProviderName,
  toProvider: LLMProviderName
): unknown[] {
  // Messages are stored in internal format; format for the target provider
  return getFormatter(toProvider).formatMessages(messages);
}

/**
 * Format tools for a specific provider
 */
export function formatToolsForProvider(
  tools: InternalToolDefinition[],
  provider: LLMProviderName
): unknown[] {
  return getFormatter(provider).formatTools(tools);
}

/**
 * Parse a response from any provider to internal format
 */
export function parseProviderResponse(
  response: unknown,
  provider: LLMProviderName
): InternalMessage {
  return getFormatter(provider).parseResponseMessage(response);
}
