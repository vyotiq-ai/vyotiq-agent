/**
 * ToolExecution Component
 *
 * Renders all tool calls for an assistant message.
 * Aggregates tool calls from messages, matches them with results,
 * and renders each via ToolItem.
 */
import React, { memo, useMemo } from 'react';
import { cn } from '../../../../utils/cn';
import { ToolItem } from './ToolItem';
import type { ToolCall } from './types';
import type { ChatMessage } from '../../../../../shared/types';

interface ToolExecutionProps {
    /** The assistant message containing tool calls */
    message: ChatMessage;
    /** All messages in the conversation (for tool result matching) */
    messages: ChatMessage[];
    /** Currently executing tools map */
    executingTools?: Record<string, { callId: string; name: string; startedAt: number }>;
    /** Queued tools awaiting execution */
    queuedTools?: Array<{ callId: string; name: string; queuePosition: number }>;
    /** Additional CSS classes */
    className?: string;
}

const ToolExecutionInternal: React.FC<ToolExecutionProps> = ({
    message,
    messages,
    executingTools,
    queuedTools,
    className,
}) => {
    const toolCalls = useMemo<ToolCall[]>(() => {
        if (!message.toolCalls || message.toolCalls.length === 0) return [];

        // Build lookup for tool result messages
        const resultMap = new Map<string, ChatMessage>();
        for (const msg of messages) {
            if (msg.role === 'tool' && msg.toolCallId) {
                resultMap.set(msg.toolCallId, msg);
            }
        }

        return message.toolCalls.map((tc) => {
            const callId = tc.callId ?? '';
            const resultMsg = resultMap.get(callId);
            const isExecuting = executingTools?.[callId] != null;
            const queuedInfo = queuedTools?.find((q) => q.callId === callId);

            let status: ToolCall['status'] = 'running';
            if (resultMsg) {
                status = resultMsg.toolSuccess ? 'completed' : 'error';
            } else if (queuedInfo) {
                status = 'queued';
            } else if (!isExecuting && !resultMsg) {
                status = 'running';
            }

            return {
                callId,
                name: tc.name,
                arguments: tc.arguments ?? {},
                _argsJson: tc._argsJson,
                result: resultMsg,
                status,
                startTime: executingTools?.[callId]?.startedAt ?? Date.now(),
                queuePosition: queuedInfo?.queuePosition,
                resultMetadata: resultMsg?.resultMetadata,
            };
        });
    }, [message.toolCalls, messages, executingTools, queuedTools]);

    if (toolCalls.length === 0) return null;

    return (
        <div className={cn('space-y-1', className)}>
            {toolCalls.map((tool, index) => (
                <ToolItem
                    key={tool.callId || index}
                    tool={tool}
                    batchSize={toolCalls.length}
                    batchPosition={index + 1}
                />
            ))}
        </div>
    );
};

export const ToolExecution = memo(ToolExecutionInternal);
ToolExecution.displayName = 'ToolExecution';
