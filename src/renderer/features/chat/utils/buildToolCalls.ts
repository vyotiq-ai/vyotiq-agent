import type { ChatMessage, ToolResultEvent } from '../../../../shared/types';
import type { ToolCall } from '../components/toolExecution/types';

/**
 * Executing tool info from real-time events
 */
export interface ExecutingToolInfo {
  callId: string;
  name: string;
  arguments?: Record<string, unknown>;
  startedAt: number;
}

/**
 * Queued tool info from real-time events
 */
export interface QueuedToolInfo {
  callId: string;
  name: string;
  arguments?: Record<string, unknown>;
  queuePosition: number;
  queuedAt: number;
}

export function buildToolCalls(params: {
  messages: ChatMessage[];
  toolResults?: Map<string, ToolResultEvent>;
  isRunning: boolean;
  runningStartTimes: Map<string, number>;
  /** Real-time executing tools from IPC events (keyed by callId) */
  executingTools?: Record<string, ExecutingToolInfo>;
  /** Real-time queued tools waiting to execute */
  queuedTools?: QueuedToolInfo[];
  /** Tools awaiting approval */
  pendingTools?: Array<{ callId: string; name: string; arguments?: Record<string, unknown> }>;
}): ToolCall[] {
  const { messages, toolResults, isRunning, runningStartTimes, executingTools, queuedTools, pendingTools } = params;

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

  // Add real-time executing tools that haven't been processed yet
  // These come from IPC events and show up immediately when tool execution starts
  if (executingTools) {
    for (const [callId, toolInfo] of Object.entries(executingTools)) {
      if (!processedCallIds.has(callId)) {
        calls.push({
          callId,
          name: toolInfo.name,
          arguments: toolInfo.arguments || {},
          status: 'running',
          startTime: toolInfo.startedAt,
        });
        processedCallIds.add(callId);
      }
    }
  }

  // Add queued tools that haven't been processed yet
  // These show up immediately when tools are queued, before execution starts
  if (queuedTools) {
    for (const toolInfo of queuedTools) {
      if (!processedCallIds.has(toolInfo.callId)) {
        calls.push({
          callId: toolInfo.callId,
          name: toolInfo.name,
          arguments: toolInfo.arguments || {},
          status: 'queued',
          queuePosition: toolInfo.queuePosition,
          startTime: toolInfo.queuedAt,
        });
        processedCallIds.add(toolInfo.callId);
      }
    }
  }

  // Add pending tools awaiting approval
  if (pendingTools) {
    for (const toolInfo of pendingTools) {
      if (!processedCallIds.has(toolInfo.callId)) {
        calls.push({
          callId: toolInfo.callId,
          name: toolInfo.name,
          arguments: toolInfo.arguments || {},
          status: 'pending',
          startTime: Date.now(),
        });
        processedCallIds.add(toolInfo.callId);
      }
    }
  }

  // Add pending tool calls from assistant messages if running (fallback)
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
        processedCallIds.add(callId);
      }
    }
  }

  // Cleanup start times for calls that finished
  for (const callId of processedCallIds) {
    if (!executingTools?.[callId]) {
      runningStartTimes.delete(callId);
    }
  }

  return calls;
}
