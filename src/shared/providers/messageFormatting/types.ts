/**
 * Message Formatter Types
 * 
 * Defines interfaces for provider-agnostic message formatting.
 * Each provider adapter implements these interfaces to convert between
 * our internal message format and provider-specific API formats.
 */

import type { AttachmentPayload, ToolCallPayload } from '../../types';

/**
 * Internal message representation used throughout the app
 */
export interface InternalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCallPayload[];
  attachments?: AttachmentPayload[];
  toolName?: string;
}

/**
 * Internal tool definition
 */
export interface InternalToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  requiresApproval: boolean;
  inputExamples?: Array<Record<string, unknown>>;
}

/**
 * Message formatter interface
 * Each provider implements this to convert messages to their format
 */
export interface MessageFormatter<T = unknown> {
  /** Provider name for identification */
  readonly provider: string;
  
  /**
   * Format a single message for the provider API
   */
  formatMessage(message: InternalMessage): T;
  
  /**
   * Format an array of messages for the provider API
   */
  formatMessages(messages: InternalMessage[]): T[];
  
  /**
   * Format a system prompt for the provider API
   * Some providers have special handling for system messages
   */
  formatSystemPrompt(prompt: string, options?: SystemPromptOptions): T | string;
  
  /**
   * Format tool definitions for the provider API
   */
  formatTools(tools: InternalToolDefinition[]): unknown[];
  
  /**
   * Parse a provider response message back to internal format
   */
  parseResponseMessage(response: unknown): InternalMessage;
  
  /**
   * Parse tool calls from provider response
   */
  parseToolCalls(response: unknown): ToolCallPayload[];
}

/**
 * Options for system prompt formatting
 */
export interface SystemPromptOptions {
  /** Enable caching for the system prompt (if supported) */
  cache?: boolean;
  /** Cache TTL */
  cacheTtl?: '5m' | '1h';
}

/**
 * Base class for message formatters with common utilities
 */
export abstract class BaseMessageFormatter<T = unknown> implements MessageFormatter<T> {
  abstract readonly provider: string;
  
  abstract formatMessage(message: InternalMessage): T;
  abstract formatSystemPrompt(prompt: string, options?: SystemPromptOptions): T | string;
  abstract formatTools(tools: InternalToolDefinition[]): unknown[];
  abstract parseResponseMessage(response: unknown): InternalMessage;
  abstract parseToolCalls(response: unknown): ToolCallPayload[];
  
  formatMessages(messages: InternalMessage[]): T[] {
    return messages.map(msg => this.formatMessage(msg));
  }
  
  /**
   * Utility: Convert attachment to provider format
   */
  protected formatAttachment(attachment: AttachmentPayload): unknown {
    // Default implementation - subclasses can override
    // Determine type from mimeType
    const isImage = attachment.mimeType?.startsWith('image/');
    return {
      type: isImage ? 'image' : 'file',
      content: attachment.content,
      name: attachment.name,
      mimeType: attachment.mimeType,
    };
  }
  
  /**
   * Utility: Extract text content from various formats
   */
  protected extractTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter(block => block?.type === 'text')
        .map(block => block.text || '')
        .join('');
    }
    return '';
  }
}
