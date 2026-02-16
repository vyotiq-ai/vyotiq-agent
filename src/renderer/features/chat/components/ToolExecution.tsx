/**
 * ToolExecution Component
 * 
 * Renders a group of tool calls for a single assistant message.
 * Maps each tool call payload to internal ToolCall format and renders ToolItem components.
 * Handles matching tool results from the agent state with their corresponding tool calls.
 */
import React, { memo, useMemo } from 'react';
import { cn } from '../../../utils/cn';
import type { ChatMessage, ToolCallPayload } from '../../../../shared/types';
import type { ToolCall } from './toolExecution/types';
import { ToolItem } from './toolExecution/ToolItem';

interface ToolExecutionProps {
  /** The assistant message containing tool calls */
  message: ChatMessage;
  /** All messages in the conversation (to find tool results) */
  messages: ChatMessage[];
  /** Map of executing tools from agent state (runId -> callId -> info) */
  executingTools?: Record<string, { callId: string; name: string; startedAt: number }>;
  /** Queued tools from agent state */
  queuedTools?: Array<{ callId: string; name: string; queuePosition: number }>;
  /** Additional CSS class */
  className?: string;
}

/**
 * Resolve a ToolCallPayload into the internal ToolCall representation
 * by finding its result message and execution status.
 */
function resolveToolCall(
  toolCallPayload: ToolCallPayload,
  messages: ChatMessage[],
  messageIndex: number,
  executingTools?: Record<string, { callId: string; name: string; startedAt: number }>,
  queuedTools?: Array<{ callId: string; name: string; queuePosition: number }>,
): ToolCall {
  const callId = toolCallPayload.callId ?? `${toolCallPayload.name}-${messageIndex}`;

  // Find the corresponding tool result message
  const resultMessage = messages.find(
    m => m.role === 'tool' && m.toolCallId === callId
  );

  // Check execution status
  const isExecuting = executingTools?.[callId] != null;
  const queuedInfo = queuedTools?.find(q => q.callId === callId);

  let status: ToolCall['status'] = 'pending';
  if (resultMessage) {
    status = resultMessage.toolSuccess === false ? 'error' : 'completed';
  } else if (isExecuting) {
    status = 'running';
  } else if (queuedInfo) {
    status = 'queued';
  }

  return {
    callId,
    name: toolCallPayload.name,
    arguments: toolCallPayload.arguments ?? {},
    _argsJson: toolCallPayload._argsJson,
    result: resultMessage,
    fullOutput: resultMessage?.content,
    resultMetadata: resultMessage?.resultMetadata,
    status,
    startTime: executingTools?.[callId]?.startedAt,
    queuePosition: queuedInfo?.queuePosition,
  };
}

const ToolExecutionInternal: React.FC<ToolExecutionProps> = ({
  message,
  messages,
  executingTools,
  queuedTools,
  className,
}) => {
  // Filter out any undefined/null entries that may appear during streaming
  const toolCalls = useMemo(
    () => (message.toolCalls ?? []).filter((tc): tc is ToolCallPayload => tc != null),
    [message.toolCalls],
  );

  // Find the index of this message for fallback callId generation
  const messageIndex = useMemo(
    () => messages.findIndex(m => m.id === message.id),
    [messages, message.id],
  );

  // Resolve all tool calls to internal format
  const resolvedTools = useMemo(() => {
    return toolCalls.map(tc =>
      resolveToolCall(tc, messages, messageIndex, executingTools, queuedTools)
    );
  }, [toolCalls, messages, messageIndex, executingTools, queuedTools]);

  if (resolvedTools.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {resolvedTools.map((tool, idx) => (
        <ToolItem
          key={tool.callId}
          tool={tool}
          batchSize={resolvedTools.length}
          batchPosition={idx + 1}
          runId={message.runId}
        />
      ))}
    </div>
  );
};

export const ToolExecution = memo(ToolExecutionInternal);
ToolExecution.displayName = 'ToolExecution';
