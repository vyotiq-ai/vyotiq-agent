/**
 * OpenAI Message Formatter
 * 
 * Converts internal messages to OpenAI's Chat Completions API format.
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */

import type { ToolCallPayload } from '../../types';
import { 
  BaseMessageFormatter, 
  type InternalMessage, 
  type InternalToolDefinition,
} from './types';

/**
 * OpenAI content block types (for vision models)
 */
interface OpenAITextContent {
  type: 'text';
  text: string;
}

interface OpenAIImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

type OpenAIContentBlock = OpenAITextContent | OpenAIImageContent;

/**
 * OpenAI message format
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentBlock[] | null;
  name?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/**
 * OpenAI tool call format
 */
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * OpenAI tool/function definition
 */
export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * OpenAI Message Formatter Implementation
 */
export class OpenAIFormatter extends BaseMessageFormatter<OpenAIMessage> {
  readonly provider = 'openai';
  
  formatMessage(message: InternalMessage): OpenAIMessage {
    switch (message.role) {
      case 'system':
        return {
          role: 'system',
          content: message.content,
        };
        
      case 'user':
        return this.formatUserMessage(message);
        
      case 'assistant':
        return this.formatAssistantMessage(message);
        
      case 'tool':
        return {
          role: 'tool',
          content: message.content,
          tool_call_id: message.toolCallId || '',
        };
        
      default:
        return {
          role: 'user',
          content: message.content,
        };
    }
  }
  
  formatSystemPrompt(prompt: string): string {
    // OpenAI system prompt is just a string
    return prompt;
  }
  
  formatTools(tools: InternalToolDefinition[]): OpenAIToolDefinition[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
    }));
  }
  
  parseResponseMessage(response: unknown): InternalMessage {
    const res = response as {
      message?: {
        role?: string;
        content?: string | null;
        tool_calls?: OpenAIToolCall[];
      };
    };
    
    const message = res.message;
    if (!message) {
      return { role: 'assistant', content: '' };
    }
    
    const toolCalls = this.parseToolCallsFromResponse(message.tool_calls);
    
    return {
      role: 'assistant',
      content: message.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
  
  parseToolCalls(response: unknown): ToolCallPayload[] {
    const res = response as {
      message?: { tool_calls?: OpenAIToolCall[] };
      choices?: Array<{ message?: { tool_calls?: OpenAIToolCall[] } }>;
    };
    
    // Handle direct message format
    if (res.message?.tool_calls) {
      return this.parseToolCallsFromResponse(res.message.tool_calls);
    }
    
    // Handle choices array format
    if (res.choices?.[0]?.message?.tool_calls) {
      return this.parseToolCallsFromResponse(res.choices[0].message.tool_calls);
    }
    
    return [];
  }
  
  /**
   * Parse tool calls from OpenAI format
   */
  private parseToolCallsFromResponse(toolCalls?: OpenAIToolCall[]): ToolCallPayload[] {
    if (!toolCalls) return [];
    
    return toolCalls.map(call => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // Keep empty args if parse fails (provider sometimes emits partial/invalid JSON)
      }
      
      return {
        name: call.function.name,
        arguments: args,
        callId: call.id,
      };
    });
  }
  
  /**
   * Format user message with possible attachments
   */
  private formatUserMessage(message: InternalMessage): OpenAIMessage {
    // If no attachments, return simple message
    if (!message.attachments || message.attachments.length === 0) {
      return {
        role: 'user',
        content: message.content,
      };
    }
    
    const content: OpenAIContentBlock[] = [];
    
    // Add text first
    if (message.content) {
      content.push({ type: 'text', text: message.content });
    }
    
    // Add images
    for (const attachment of message.attachments) {
      const isImage = attachment.mimeType?.startsWith('image/');
      if (isImage) {
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${attachment.mimeType || 'image/png'};base64,${attachment.content || ''}`,
            detail: 'auto',
          },
        });
      }
    }
    
    return {
      role: 'user',
      content,
    };
  }
  
  /**
   * Format assistant message with tool calls
   */
  private formatAssistantMessage(message: InternalMessage): OpenAIMessage {
    const result: OpenAIMessage = {
      role: 'assistant',
      content: message.content || null,
    };
    
    if (message.toolCalls && message.toolCalls.length > 0) {
      result.tool_calls = message.toolCalls.map(call => ({
        id: call.callId,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      }));
    }
    
    return result;
  }
}
