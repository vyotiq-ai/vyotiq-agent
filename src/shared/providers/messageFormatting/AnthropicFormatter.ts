/**
 * Anthropic Message Formatter
 * 
 * Converts internal messages to Anthropic's Messages API format.
 * @see https://docs.anthropic.com/claude/reference/messages_post
 */

import type { ToolCallPayload } from '../../types';
import { 
  BaseMessageFormatter, 
  type InternalMessage, 
  type InternalToolDefinition,
  type SystemPromptOptions,
} from './types';

/**
 * Anthropic content block types
 */
interface AnthropicTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl?: string };
}

interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type AnthropicContentBlock = 
  | AnthropicTextBlock 
  | AnthropicImageBlock 
  | AnthropicToolUseBlock 
  | AnthropicToolResultBlock;

/**
 * Anthropic message format
 */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/**
 * Anthropic tool definition format
 */
export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: 'ephemeral' };
}

/**
 * Anthropic Message Formatter Implementation
 */
export class AnthropicFormatter extends BaseMessageFormatter<AnthropicMessage> {
  readonly provider = 'anthropic';
  
  formatMessage(message: InternalMessage): AnthropicMessage {
    switch (message.role) {
      case 'system':
        // System messages should use formatSystemPrompt instead
        // If passed here, convert to user message
        return {
          role: 'user',
          content: `[System]: ${message.content}`,
        };
        
      case 'user':
        return this.formatUserMessage(message);
        
      case 'assistant':
        return this.formatAssistantMessage(message);
        
      case 'tool':
        // Tool results are included as part of a user message
        return {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: message.toolCallId || '',
            content: message.content,
          }],
        };
        
      default:
        return {
          role: 'user',
          content: message.content,
        };
    }
  }
  
  formatSystemPrompt(prompt: string, options?: SystemPromptOptions): string {
    // Options parameter reserved for future caching configuration
    void options;
    // Anthropic's system prompt is just a string
    // Caching is handled at the API call level
    return prompt;
  }
  
  formatTools(tools: InternalToolDefinition[]): AnthropicToolDefinition[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.schema,
      // Input examples can help Claude understand expected inputs
      // (Anthropic supports this via description, not as a separate field)
    }));
  }
  
  parseResponseMessage(response: unknown): InternalMessage {
    const res = response as {
      content?: AnthropicContentBlock[];
      stop_reason?: string;
    };
    
    let textContent = '';
    const toolCalls: ToolCallPayload[] = [];
    
    if (Array.isArray(res.content)) {
      for (const block of res.content) {
        if (block.type === 'text') {
          textContent += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            name: block.name,
            arguments: block.input,
            callId: block.id,
          });
        }
      }
    }
    
    return {
      role: 'assistant',
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
  
  parseToolCalls(response: unknown): ToolCallPayload[] {
    const res = response as { content?: AnthropicContentBlock[] };
    
    if (!Array.isArray(res.content)) {
      return [];
    }
    
    return res.content
      .filter((block): block is AnthropicToolUseBlock => block.type === 'tool_use')
      .map(block => ({
        name: block.name,
        arguments: block.input,
        callId: block.id,
      }));
  }
  
  /**
   * Format user message with possible attachments
   */
  private formatUserMessage(message: InternalMessage): AnthropicMessage {
    const content: AnthropicContentBlock[] = [];
    
    // Add attachments first
    if (message.attachments) {
      for (const attachment of message.attachments) {
        const isImage = attachment.mimeType?.startsWith('image/');
        if (isImage) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: attachment.mimeType || 'image/png',
              data: attachment.content || '',
            },
          });
        }
      }
    }
    
    // Add text content
    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }
    
    // If no structured content, return simple string
    if (content.length === 1 && content[0].type === 'text') {
      return {
        role: 'user',
        content: message.content,
      };
    }
    
    return {
      role: 'user',
      content,
    };
  }
  
  /**
   * Format assistant message with tool calls
   */
  private formatAssistantMessage(message: InternalMessage): AnthropicMessage {
    const content: AnthropicContentBlock[] = [];
    
    // Add text content
    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }
    
    // Add tool uses
    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        content.push({
          type: 'tool_use',
          id: call.callId,
          name: call.name,
          input: call.arguments as Record<string, unknown>,
        });
      }
    }
    
    // If just text, return simple string
    if (content.length === 1 && content[0].type === 'text') {
      return {
        role: 'assistant',
        content: message.content,
      };
    }
    
    return {
      role: 'assistant',
      content,
    };
  }
}
