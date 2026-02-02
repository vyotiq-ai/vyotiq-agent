/**
 * Message Utilities
 * 
 * Functions for converting and handling chat messages.
 */

import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../../../shared/types';
import type { ProviderMessage } from '../providers/baseProvider';

/**
 * Convert internal chat messages to provider message format
 */
export function convertMessagesToProvider(messages: ChatMessage[]): ProviderMessage[] {
  return messages.map((msg): ProviderMessage => {
    if (msg.role === 'user') {
      return {
        role: 'user',
        content: msg.content,
        attachments: msg.attachments,
        providerInternal: msg.providerInternal,
      };
    }

    if (msg.role === 'assistant') {
      return {
        role: 'assistant',
        content: msg.content,
        toolCalls: msg.toolCalls,
        providerInternal: msg.providerInternal,
        thinking: msg.reasoningContent || msg.thinking,
        thoughtSignature: msg.thoughtSignature,
        // Anthropic extended thinking fields for multi-turn tool use
        // @see https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking#preserving-thinking-blocks
        anthropicThinkingSignature: msg.anthropicThinkingSignature,
        redactedThinking: msg.redactedThinking,
        generatedImages: msg.generatedImages,
        generatedAudio: msg.generatedAudio,
      };
    }

    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content,
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        providerInternal: msg.providerInternal,
      };
    }

    return {
      role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
      content: msg.content,
      providerInternal: msg.providerInternal,
    };
  });
}

/**
 * Handle incomplete tool call sequences when cancelling a run.
 * 
 * When a run is cancelled mid-execution, there may be an assistant message
 * with tool_calls that don't have corresponding tool result messages.
 * This causes API errors like:
 * "An assistant message with 'tool_calls' must be followed by tool messages 
 * responding to each 'tool_call_id'"
 * 
 * This function adds synthetic "cancelled" tool result messages for any
 * pending tool_calls to maintain message structure integrity.
 * 
 * @returns The number of cancelled tool messages added
 */
export function handleIncompleteToolCalls(messages: ChatMessage[]): number {
  if (!messages || messages.length === 0) return 0;

  // Find the last assistant message
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  if (lastAssistantIndex === -1) return 0;

  const lastAssistant = messages[lastAssistantIndex];
  if (!lastAssistant.toolCalls || lastAssistant.toolCalls.length === 0) return 0;

  // Collect tool_call_ids that need responses
  const toolCallIds = new Set(lastAssistant.toolCalls.map(tc => tc.callId));

  // Check which tool_calls already have corresponding tool messages
  for (let i = lastAssistantIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'tool' && msg.toolCallId) {
      toolCallIds.delete(msg.toolCallId);
    }
  }

  // If there are any tool_calls without responses, add cancelled messages
  if (toolCallIds.size > 0) {
    for (const toolCallId of toolCallIds) {
      const toolCall = lastAssistant.toolCalls?.find(tc => tc.callId === toolCallId);
      const toolName = toolCall?.name || 'unknown';

      messages.push({
        id: randomUUID(),
        role: 'tool',
        content: `Tool execution was cancelled by the user.`,
        toolCallId: toolCallId,
        toolName: toolName,
        createdAt: Date.now(),
        runId: lastAssistant.runId,
      });
    }
  }

  return toolCallIds.size;
}

/**
 * Validate that a message has all required fields
 */
export function isValidMessage(msg: ChatMessage): boolean {
  return !!(msg.id && msg.role && typeof msg.createdAt === 'number');
}

/**
 * Validate an array of messages
 */
export function validateMessages(messages: ChatMessage[]): { valid: boolean; invalidIndex?: number } {
  for (let i = 0; i < messages.length; i++) {
    if (!isValidMessage(messages[i])) {
      return { valid: false, invalidIndex: i };
    }
  }
  return { valid: true };
}
