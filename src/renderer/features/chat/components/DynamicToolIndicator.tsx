/**
 * DynamicToolIndicator Component
 * 
 * Shows a small badge/indicator when a tool call is from a dynamically-created tool.
 * Displays basic metadata like usage count, success rate, and status.
 */
import React, { memo } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { DynamicToolMetadata } from './toolExecution/types';

interface DynamicToolIndicatorProps {
  /** Dynamic tool metadata */
  info: DynamicToolMetadata;
  /** Compact mode (just icon + label) */
  compact?: boolean;
  /** Additional CSS class */
  className?: string;
}

const DynamicToolIndicatorInternal: React.FC<DynamicToolIndicatorProps> = ({
  info,
  compact = false,
  className,
}) => {
  const statusColor = info.status === 'active'
    ? 'var(--color-success)'
    : info.status === 'deprecated'
      ? 'var(--color-warning)'
      : 'var(--color-text-muted)';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[9px]',
        'rounded px-1 py-0.5',
        'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]',
        'border border-[var(--color-border-subtle)]',
        className,
      )}
    >
      <Zap size={8} style={{ color: 'var(--color-accent-primary)' }} />
      <span className="uppercase tracking-wider">dynamic</span>
      {!compact && info.usageCount != null && (
        <span className="opacity-50 tabular-nums">
          {info.usageCount}×
        </span>
      )}
      {!compact && info.successRate != null && (
        <span
          className="tabular-nums"
          style={{ color: info.successRate >= 0.8 ? 'var(--color-success)' : 'var(--color-warning)' }}
        >
          {Math.round(info.successRate * 100)}%
        </span>
      )}
      {!compact && info.status && (
        <span
          className="h-1 w-1 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      )}
    </span>
  );
};

export const DynamicToolIndicator = memo(DynamicToolIndicatorInternal);
DynamicToolIndicator.displayName = 'DynamicToolIndicator';
