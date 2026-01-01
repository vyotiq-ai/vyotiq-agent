import React, { memo, useMemo } from 'react';
import { CheckCircle2, XCircle, Loader2, Wrench, Clock, Cpu } from 'lucide-react';

import type { ChatMessage, ToolResultEvent } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { calculateSessionCost, formatTokenCount, formatCost } from '../../../../shared/utils/costEstimation';

interface RunGroupHeaderProps {
  runId?: string;
  messages: ChatMessage[];
  toolResults?: Map<string, ToolResultEvent>;
  isRunning?: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function truncateOneLine(text: string, max = 90): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

function getDurationMsFromToolResult(result?: ToolResultEvent): number | undefined {
  const meta = result?.result.metadata as Record<string, unknown> | undefined;
  if (!meta) return undefined;

  const timing = meta.timing as { durationMs?: unknown } | undefined;
  if (typeof timing?.durationMs === 'number') return timing.durationMs;

  const durationMs = meta.durationMs;
  if (typeof durationMs === 'number') return durationMs;

  return undefined;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round((s - m * 60) * 10) / 10;
  return `${m}m ${rem}s`;
}

/** Extract provider/model info from the first assistant message in a run */
function getRunModelInfo(messages: ChatMessage[]): { provider?: string; modelId?: string } | null {
  const firstAssistant = messages.find(m => m.role === 'assistant' && m.provider);
  if (!firstAssistant) return null;
  return {
    provider: firstAssistant.provider,
    modelId: firstAssistant.modelId,
  };
}

/** Format model ID for compact display */
function formatModelIdShort(modelId: string): string {
  // Remove provider prefix if present (e.g., "openai/gpt-4" -> "gpt-4")
  const withoutPrefix = modelId.split('/').pop() || modelId;
  // For long model names, take first 2-3 segments
  const parts = withoutPrefix.split('-');
  if (parts.length > 3) {
    return parts.slice(0, 3).join('-');
  }
  return withoutPrefix;
}

export const RunGroupHeader: React.FC<RunGroupHeaderProps> = memo(({
  messages,
  toolResults,
  isRunning = false,
}) => {
  const startAt = messages[0]?.createdAt;
  const firstUser = messages.find(m => m.role === 'user');

  const lastAssistantPreview = useMemo(() => {
    const reversed = [...messages].reverse();
    const nonSummary = reversed.find(m => m.role === 'assistant' && !m.isSummary && typeof m.content === 'string' && m.content.trim().length > 0);
    const anyAssistant = reversed.find(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0);
    const msg = nonSummary ?? anyAssistant;
    if (!msg?.content) return null;
    return truncateOneLine(msg.content, 100);
  }, [messages]);

  const modelInfo = useMemo(() => getRunModelInfo(messages), [messages]);

  const toolCallCount = useMemo(() => {
    let count = 0;
    for (const m of messages) {
      if (m.role === 'assistant' && Array.isArray(m.toolCalls)) {
        count += m.toolCalls.length;
      }
    }
    return count;
  }, [messages]);

  const toolOutcome = useMemo(() => {
    const toolMsgs = messages.filter(m => m.role === 'tool');
    const completed = toolMsgs.length;
    const success = toolMsgs.filter(m => m.toolSuccess).length;
    const error = toolMsgs.filter(m => m.toolSuccess === false).length;
    return { completed, success, error };
  }, [messages]);

  const aggregate = useMemo(() => {
    let durationMsTotal = 0;
    let durationCount = 0;

    if (toolResults) {
      for (const [, result] of toolResults) {
        const d = getDurationMsFromToolResult(result);
        if (typeof d === 'number' && Number.isFinite(d)) {
          durationMsTotal += d;
          durationCount += 1;
        }
      }
    }

    return {
      durationMsTotal: durationCount > 0 ? durationMsTotal : undefined,
    };
  }, [toolResults]);

  const costSummary = useMemo(() => {
    const summary = calculateSessionCost(messages);
    const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
    return {
      ...summary,
      totalTokens,
      hasUsage: summary.messageCount > 0 && totalTokens > 0,
    };
  }, [messages]);

  return (
    <div className={cn(
      'px-3 sm:px-4 py-2',
      'bg-[var(--color-surface-1)]/30',
      'overflow-hidden'
    )}>
      <div className="flex items-center justify-between gap-3 min-w-0">
        {/* Left: Status + Request preview */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            {/* Status indicator */}
            <span className={cn(
              'flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0',
              isRunning && 'bg-[var(--color-warning)]/10',
              !isRunning && toolOutcome.error > 0 && 'bg-[var(--color-error)]/10',
              !isRunning && toolOutcome.error === 0 && 'bg-[var(--color-success)]/10',
            )}>
              {isRunning ? (
                <Loader2 size={12} className="animate-spin text-[var(--color-warning)]" />
              ) : toolOutcome.error > 0 ? (
                <XCircle size={11} className="text-[var(--color-error)]" />
              ) : (
                <CheckCircle2 size={11} className="text-[var(--color-success)]" />
              )}
            </span>

            {/* Request text */}
            <div className="min-w-0 flex-1 overflow-hidden">
              {firstUser?.content ? (
                <span className="text-[11px] text-[var(--color-text-secondary)] truncate block">
                  {truncateOneLine(firstUser.content, 80)}
                </span>
              ) : (
                <span className="text-[11px] text-[var(--color-text-muted)] italic">
                  {isRunning ? 'Processing...' : 'Completed'}
                </span>
              )}
            </div>
          </div>

          {/* Result preview - only when not running */}
          {!isRunning && lastAssistantPreview && (
            <div className="mt-1 ml-7 text-[10px] text-[var(--color-text-muted)] truncate">
              {lastAssistantPreview}
            </div>
          )}
        </div>

        {/* Right: Stats badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Time */}
          {typeof startAt === 'number' && (
            <span className="text-[9px] font-mono text-[var(--color-text-dim)] tabular-nums">
              {formatTime(startAt)}
            </span>
          )}

          {/* Model info */}
          {modelInfo?.provider && (
            <span 
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                'bg-[var(--color-surface-2)]/60',
                'text-[9px] font-mono text-[var(--color-text-muted)]'
              )}
              title={modelInfo.modelId ? `${modelInfo.provider}/${modelInfo.modelId}` : modelInfo.provider}
            >
              <Cpu size={9} className="text-[var(--color-accent-secondary)]" />
              <span className="text-[var(--color-text-secondary)]">{modelInfo.provider}</span>
              {modelInfo.modelId && (
                <>
                  <span className="text-[var(--color-text-dim)]">/</span>
                  <span className="text-[var(--color-text-dim)]">{formatModelIdShort(modelInfo.modelId)}</span>
                </>
              )}
            </span>
          )}

          {/* Tools count */}
          {toolCallCount > 0 && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
              'bg-[var(--color-surface-2)]/60',
              'text-[9px] font-mono text-[var(--color-text-muted)]'
            )}>
              <Wrench size={9} className="text-[var(--color-text-dim)]" />
              <span>{toolCallCount}</span>
              {toolOutcome.error > 0 && (
                <span className="text-[var(--color-error)]">({toolOutcome.error} err)</span>
              )}
            </span>
          )}

          {/* Tokens + Cost */}
          {costSummary.hasUsage && (
            <span 
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                'bg-[var(--color-surface-2)]/60',
                'text-[9px] font-mono text-[var(--color-text-muted)]'
              )}
              title={`Input: ${formatTokenCount(costSummary.totalInputTokens)} • Output: ${formatTokenCount(costSummary.totalOutputTokens)}`}
            >
              <span>{formatTokenCount(costSummary.totalTokens)}</span>
              <span className="text-[var(--color-accent-primary)]">${formatCost(costSummary.totalCost)}</span>
            </span>
          )}

          {/* Duration */}
          {typeof aggregate.durationMsTotal === 'number' && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
              'bg-[var(--color-surface-2)]/60',
              'text-[9px] font-mono text-[var(--color-text-muted)]'
            )}>
              <Clock size={9} className="text-[var(--color-text-dim)]" />
              {formatDurationMs(aggregate.durationMsTotal)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

RunGroupHeader.displayName = 'RunGroupHeader';
