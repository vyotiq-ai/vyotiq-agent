import type { ChatMessage, ToolResultEvent } from '../../../../shared/types';
import type { ToolCall } from '../components/toolExecution/types';

export function buildToolCalls(params: {
  messages: ChatMessage[];
  toolResults?: Map<string, ToolResultEvent>;
  isRunning: boolean;
  runningStartTimes: Map<string, number>;
}): ToolCall[] {
  const { messages, toolResults, isRunning, runningStartTimes } = params;

  const calls: ToolCall[] = [];
  const processedCallIds = new Set<string>();

  // Build a lookup map of all toolCalls from all assistant messages
  const toolCallMap = new Map<string, NonNullable<ChatMessage['toolCalls']>[number]>();

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        if (tc.callId) {
          toolCallMap.set(tc.callId, tc);
        }
      }
    }
  }

  // Process tool messages and match them with their toolCalls
  for (const msg of messages) {
    if (msg.role === 'tool' && msg.toolCallId) {
      const matchedToolCall = toolCallMap.get(msg.toolCallId);
      const resultEvent = toolResults?.get(msg.toolCallId);
      // Use metadata from toolResults event first, fall back to message's resultMetadata
      const metadata = resultEvent?.result?.metadata ?? msg.resultMetadata;
      const fullOutput = resultEvent?.result?.output;

      if (matchedToolCall) {
        calls.push({
          callId: msg.toolCallId,
          name: matchedToolCall.name,
          arguments: matchedToolCall.arguments,
          _argsJson: matchedToolCall._argsJson,
          result: msg,
          fullOutput,
          resultMetadata: metadata,
          status: msg.toolSuccess ? 'completed' : 'error',
          startTime: msg.createdAt,
        });
        processedCallIds.add(msg.toolCallId);
      } else {
        calls.push({
          callId: msg.toolCallId,
          name: msg.toolName || 'unknown',
          arguments: {},
          result: msg,
          fullOutput,
          resultMetadata: metadata,
          status: msg.toolSuccess ? 'completed' : 'error',
          startTime: msg.createdAt,
        });
        processedCallIds.add(msg.toolCallId);
      }
    }
  }

  // Add pending tool calls if running
  if (isRunning) {
    for (const [callId, toolCall] of toolCallMap) {
      if (!processedCallIds.has(callId)) {
        if (!runningStartTimes.has(callId)) {
          runningStartTimes.set(callId, Date.now());
        }
        calls.push({
          callId,
          name: toolCall.name,
          arguments: toolCall.arguments,
          _argsJson: toolCall._argsJson,
          status: 'running',
          startTime: runningStartTimes.get(callId),
        });
      }
    }
  }

  // Cleanup start times for calls that finished
  for (const callId of processedCallIds) {
    runningStartTimes.delete(callId);
  }

  return calls;
}
