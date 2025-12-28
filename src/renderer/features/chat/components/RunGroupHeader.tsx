import React, { memo, useMemo } from 'react';
import { CheckCircle2, XCircle, Loader2, Wrench } from 'lucide-react';

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

function getFileChangeCountFromToolResult(result?: ToolResultEvent): number {
  const meta = result?.result.metadata as Record<string, unknown> | undefined;
  const fileChanges = meta?.fileChanges as Array<{ path?: unknown; action?: unknown }> | undefined;
  if (!Array.isArray(fileChanges)) return 0;
  return fileChanges.filter(fc => typeof fc?.path === 'string').length;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round((s - m * 60) * 10) / 10;
  return `${m}m ${rem}s`;
}

export const RunGroupHeader: React.FC<RunGroupHeaderProps> = memo(({
  runId,
  messages,
  toolResults,
  isRunning = false,
}) => {
  const startAt = messages[0]?.createdAt;
  const firstUser = messages.find(m => m.role === 'user');

  const lastAssistantPreview = useMemo(() => {
    // Prefer a non-summary assistant message when possible.
    const reversed = [...messages].reverse();
    const nonSummary = reversed.find(m => m.role === 'assistant' && !m.isSummary && typeof m.content === 'string' && m.content.trim().length > 0);
    const anyAssistant = reversed.find(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0);
    const msg = nonSummary ?? anyAssistant;
    if (!msg?.content) return null;
    return truncateOneLine(msg.content, 120);
  }, [messages]);

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
    let fileChangesTotal = 0;

    if (toolResults) {
      for (const [, result] of toolResults) {
        const d = getDurationMsFromToolResult(result);
        if (typeof d === 'number' && Number.isFinite(d)) {
          durationMsTotal += d;
          durationCount += 1;
        }
        fileChangesTotal += getFileChangeCountFromToolResult(result);
      }
    }

    return {
      durationMsTotal: durationCount > 0 ? durationMsTotal : undefined,
      fileChangesTotal: fileChangesTotal > 0 ? fileChangesTotal : undefined,
    };
  }, [toolResults]);

  // Token/cost summary for the run
  const costSummary = useMemo(() => {
    const summary = calculateSessionCost(messages);
    const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;
    return {
      ...summary,
      totalTokens,
      hasUsage: summary.messageCount > 0 && totalTokens > 0,
    };
  }, [messages]);

  const statusIcon = isRunning
    ? <Loader2 size={12} className="animate-spin text-[var(--color-warning)]" />
    : toolOutcome.error > 0
      ? <XCircle size={12} className="text-[var(--color-error)]" />
      : <CheckCircle2 size={12} className="text-[var(--color-success)]" />;

  const statusText = isRunning
    ? 'running'
    : toolOutcome.error > 0
      ? 'completed with errors'
      : 'completed';

  return (
    <div className={cn(
      'px-3 sm:px-4 py-2',
      'bg-[var(--color-surface-1)]/40',
      'backdrop-blur-sm overflow-hidden'
    )}>
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--color-text-muted)] min-w-0">
            {statusIcon}
            <span className="truncate min-w-0">
              {runId ? `run ${runId.slice(0, 8)}` : 'run'} • {statusText}
            </span>
            {typeof startAt === 'number' && (
              <span className="flex-shrink-0 text-[var(--color-text-dim)]">[{formatTime(startAt)}]</span>
            )}
          </div>

          {firstUser?.content && (
            <div className="mt-1 text-[11px] text-[var(--color-text-secondary)] leading-snug">
              <span className="text-[var(--color-text-dim)] font-mono mr-1">request:</span>
              <span className="break-words">{truncateOneLine(firstUser.content, 110)}</span>
            </div>
          )}

          {!isRunning && lastAssistantPreview && (
            <div className="mt-1 text-[11px] text-[var(--color-text-secondary)] leading-snug">
              <span className="text-[var(--color-text-dim)] font-mono mr-1">result:</span>
              <span className="break-words">{lastAssistantPreview}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {toolCallCount > 0 && (
            <span className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1',
              'border border-[var(--color-border-subtle)]',
              'bg-[var(--color-surface-2)]/50',
              'text-[9px] font-mono text-[var(--color-text-muted)]'
            )}>
              <Wrench size={10} className="text-[var(--color-text-dim)]" />
              <span>{toolCallCount} tool{toolCallCount === 1 ? '' : 's'}</span>
              {toolOutcome.completed > 0 && (
                <span className="text-[var(--color-text-dim)]">• {toolOutcome.success}/{toolOutcome.completed}</span>
              )}
              {toolOutcome.error > 0 && (
                <span className="text-[var(--color-error)]">• err {toolOutcome.error}</span>
              )}
            </span>
          )}

          {costSummary.hasUsage && (
            <span 
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1',
                'border border-[var(--color-border-subtle)]',
                'bg-[var(--color-surface-2)]/50',
                'text-[9px] font-mono text-[var(--color-text-muted)]'
              )}
              title={`Input: ${formatTokenCount(costSummary.totalInputTokens)} • Output: ${formatTokenCount(costSummary.totalOutputTokens)}`}
            >
              <span>{formatTokenCount(costSummary.totalTokens)} tok</span>
              <span className="text-[var(--color-accent-primary)]">${formatCost(costSummary.totalCost)}</span>
            </span>
          )}

          {typeof aggregate.durationMsTotal === 'number' && (
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-1',
              'border border-[var(--color-border-subtle)]',
              'bg-[var(--color-surface-2)]/50',
              'text-[9px] font-mono text-[var(--color-text-muted)]'
            )}>
              {formatDurationMs(aggregate.durationMsTotal)}
            </span>
          )}

          {typeof aggregate.fileChangesTotal === 'number' && (
            <span className={cn(
              'inline-flex items-center rounded-md px-2 py-1',
              'border border-[var(--color-border-subtle)]',
              'bg-[var(--color-surface-2)]/50',
              'text-[9px] font-mono text-[var(--color-text-muted)]'
            )}>
              {aggregate.fileChangesTotal} file change{aggregate.fileChangesTotal === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

RunGroupHeader.displayName = 'RunGroupHeader';
