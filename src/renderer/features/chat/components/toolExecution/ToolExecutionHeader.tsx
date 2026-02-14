/**
 * ToolExecutionHeader Component
 * 
 * Header row for a tool execution block, showing the tool name,
 * status indicator, execution duration, and collapse toggle.
 */
import React, { memo, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Layers,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { getToolActionDescription } from '../../utils/toolActionDescriptions';
import { formatDurationMs } from '../../utils/toolDisplay';
import type { ToolCall } from './types';

interface ToolExecutionHeaderProps {
  /** Tool call data */
  tool: ToolCall;
  /** Whether the details section is expanded */
  isExpanded: boolean;
  /** Toggle expand/collapse */
  onToggle: () => void;
  /** Number of total tools in the batch */
  batchSize?: number;
  /** Position in the batch (1-based) */
  batchPosition?: number;
  /** Additional CSS class */
  className?: string;
}

const ToolExecutionHeaderInternal: React.FC<ToolExecutionHeaderProps> = ({
  tool,
  isExpanded,
  onToggle,
  batchSize,
  batchPosition,
  className,
}) => {
  const statusIcon = useMemo(() => {
    switch (tool.status) {
      case 'completed':
        return tool.result?.toolSuccess === false
          ? <XCircle size={10} style={{ color: 'var(--color-error)' }} />
          : <CheckCircle2 size={10} style={{ color: 'var(--color-success)' }} />;
      case 'error':
        return <XCircle size={10} style={{ color: 'var(--color-error)' }} />;
      case 'running':
        return <Loader2 size={10} className="animate-spin" style={{ color: 'var(--color-accent-primary)' }} />;
      case 'queued':
        return <Clock size={10} style={{ color: 'var(--color-text-muted)' }} />;
      default:
        return <Clock size={10} style={{ color: 'var(--color-text-dim)' }} />;
    }
  }, [tool.status, tool.result?.toolSuccess]);

  const duration = useMemo(() => {
    if (!tool.startTime) return null;
    if (tool.status === 'running') return null;
    const result = tool.result;
    if (!result) return null;
    const end = result.createdAt ?? Date.now();
    const ms = end - tool.startTime;
    return formatDurationMs(ms);
  }, [tool.startTime, tool.status, tool.result]);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 w-full px-1.5 py-1 font-mono text-[10px]',
        'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
        'transition-colors duration-100 rounded',
        'hover:bg-[var(--color-surface-2)]',
        className,
      )}
    >
      {/* Collapse chevron */}
      {isExpanded
        ? <ChevronDown size={10} className="shrink-0 opacity-50" />
        : <ChevronRight size={10} className="shrink-0 opacity-50" />
      }

      {/* Status */}
      {statusIcon}

      {/* Tool name */}
      {/* Tool action description */}
      <span className="truncate" title={tool.name}>
        {getToolActionDescription(tool.name, tool.status, tool.arguments ?? {}, tool._argsJson)}
      </span>

      {/* Dynamic indicator */}
      {tool.isDynamic && (
        <span
          className="text-[8px] uppercase tracking-wider px-1 rounded"
          style={{ color: 'var(--color-accent-primary)', backgroundColor: 'var(--color-surface-2)' }}
        >
          dyn
        </span>
      )}

      {/* Batch position */}
      {batchSize && batchSize > 1 && batchPosition && (
        <span className="flex items-center gap-0.5 opacity-40 text-[8px]">
          <Layers size={8} />
          {batchPosition}/{batchSize}
        </span>
      )}

      {/* Queue position */}
      {tool.status === 'queued' && tool.queuePosition != null && (
        <span className="tabular-nums opacity-40 text-[8px]">
          #{tool.queuePosition}
        </span>
      )}

      {/* Duration */}
      {duration && (
        <span className="ml-auto tabular-nums opacity-40 text-[9px]">
          {duration}
        </span>
      )}

      {/* Running indicator */}
      {tool.status === 'running' && (
        <span className="ml-auto text-[8px] opacity-50">executing</span>
      )}
    </button>
  );
};

export const ToolExecutionHeader = memo(ToolExecutionHeaderInternal);
ToolExecutionHeader.displayName = 'ToolExecutionHeader';
