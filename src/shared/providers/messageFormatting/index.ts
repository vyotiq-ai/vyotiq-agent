/**
 * Message Formatting Module
 * 
 * Provides unified message formatting for different LLM providers.
 * This enables consistent message handling across Anthropic, OpenAI, 
 * DeepSeek, and other providers.
 */

// Types
export { 
  type MessageFormatter,
  type InternalMessage,
  type InternalToolDefinition,
  type SystemPromptOptions,
  BaseMessageFormatter,
} from './types';

// Provider-specific formatters
export { AnthropicFormatter, type AnthropicMessage, type AnthropicToolDefinition } from './AnthropicFormatter';
export { OpenAIFormatter, type OpenAIMessage, type OpenAIToolDefinition } from './OpenAIFormatter';

// Factory and utilities
export { 
  getFormatter, 
  registerFormatter, 
  convertMessages, 
  formatToolsForProvider,
  parseProviderResponse,
} from './factory';
