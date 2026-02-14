/**
 * RunGroupHeader Component
 * 
 * Header for a group of messages that share the same runId.
 * Shows the run number, collapse toggle, iteration count,
 * and a summary of tools executed in the run.
 */
import React, { memo, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronRight, Play, StopCircle, Loader2, Pause } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ChatMessage, AgentRunStatus } from '../../../../shared/types';

interface RunGroupHeaderProps {
  /** The run ID for this group */
  runId: string | undefined;
  /** Index of this group (0-based) */
  groupIndex: number;
  /** Messages in this run group */
  messages: ChatMessage[];
  /** Whether this group is collapsed */
  isCollapsed: boolean;
  /** Callback to toggle collapse */
  onToggleCollapse: () => void;
  /** Current run status (for the active run) */
  runStatus?: AgentRunStatus;
  /** Additional CSS class */
  className?: string;
}

const RunGroupHeaderInternal: React.FC<RunGroupHeaderProps> = ({
  runId,
  groupIndex,
  messages,
  isCollapsed,
  onToggleCollapse,
  runStatus,
  className,
}) => {
  const handleClick = useCallback(() => {
    onToggleCollapse();
  }, [onToggleCollapse]);

  // Summarize the run
  const summary = useMemo(() => {
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    const toolMsgs = messages.filter(m => m.role === 'tool');
    const userMsgs = messages.filter(m => m.role === 'user');
    const iterations = new Set(messages.map(m => m.iteration).filter(Boolean));
    const toolNames = [...new Set(toolMsgs.map(m => m.toolName).filter(Boolean))];
    const successCount = toolMsgs.filter(m => m.toolSuccess === true).length;
    const failCount = toolMsgs.filter(m => m.toolSuccess === false).length;

    return {
      messageCount: messages.length,
      assistantCount: assistantMsgs.length,
      toolCount: toolMsgs.length,
      userCount: userMsgs.length,
      iterationCount: iterations.size,
      toolNames: toolNames.slice(0, 4),
      hasMoreTools: toolNames.length > 4,
      successCount,
      failCount,
    };
  }, [messages]);

  const StatusIcon = useMemo(() => {
    if (!runStatus || runStatus === 'idle') return null;
    if (runStatus === 'running') return <Loader2 size={9} className="animate-spin" style={{ color: 'var(--color-accent-primary)' }} />;
    if (runStatus === 'paused') return <Pause size={9} style={{ color: 'var(--color-warning)' }} />;
    if (runStatus === 'error') return <StopCircle size={9} style={{ color: 'var(--color-error)' }} />;
    return null;
  }, [runStatus]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-1.5 w-full px-2 py-1 font-mono text-[9px]',
        'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
        'transition-colors duration-100',
        'rounded hover:bg-[var(--color-surface-1)]',
        className,
      )}
    >
      {/* Collapse icon */}
      {isCollapsed
        ? <ChevronRight size={10} className="shrink-0" />
        : <ChevronDown size={10} className="shrink-0" />
      }

      {/* Run marker */}
      <Play size={8} className="shrink-0 opacity-40" />
      <span className="uppercase tracking-wider opacity-60">
        run {groupIndex + 1}
      </span>

      {/* Status */}
      {StatusIcon}

      {/* Iteration count */}
      {summary.iterationCount > 0 && (
        <span className="tabular-nums opacity-50">
          {summary.iterationCount} iter
        </span>
      )}

      {/* Tool summary */}
      {summary.toolCount > 0 && (
        <span className="opacity-40">
          {summary.toolCount} tool{summary.toolCount > 1 ? 's' : ''}
          {summary.failCount > 0 && (
            <span style={{ color: 'var(--color-error)' }}> ({summary.failCount} err)</span>
          )}
        </span>
      )}

      {/* Tool names preview when collapsed */}
      {isCollapsed && summary.toolNames.length > 0 && (
        <span className="truncate ml-auto opacity-30 text-[8px]">
          {summary.toolNames.join(', ')}
          {summary.hasMoreTools && '...'}
        </span>
      )}

      {/* Message count badge */}
      {isCollapsed && (
        <span className="ml-auto shrink-0 tabular-nums opacity-30">
          {summary.messageCount} msg{summary.messageCount > 1 ? 's' : ''}
        </span>
      )}
    </button>
  );
};

export const RunGroupHeader = memo(RunGroupHeaderInternal);
RunGroupHeader.displayName = 'RunGroupHeader';
