/**
 * ProgressGroupPanel Component
 * 
 * Renders active progress groups for the current session.
 * Each group contains a list of progress items (tool calls, file ops, etc.)
 * with real-time status updates and duration tracking.
 * 
 * Follows the existing terminal aesthetic with monospace fonts
 * and CSS variable-based theming.
 */
import React, { memo, useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  X,
  Clock,
  FileText,
  PenTool,
  Terminal,
  Search,
  Brain,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ProgressGroup, ProgressItem } from '../../../../shared/types';

// =============================================================================
// Types
// =============================================================================

interface ProgressGroupPanelProps {
  /** Progress groups for the current session */
  groups: ProgressGroup[];
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const itemTypeIcons: Record<ProgressItem['type'], React.FC<{ size: number; className?: string }>> = {
  'tool-call': Wrench,
  'file-read': FileText,
  'file-write': PenTool,
  'command': Terminal,
  'search': Search,
  'analysis': Brain,
  'iteration': RefreshCw,
};

function getStatusIcon(status: ProgressItem['status']) {
  switch (status) {
    case 'running':
      return <Loader2 size={9} className="animate-spin text-[var(--color-accent-primary)]" />;
    case 'success':
      return <Check size={9} className="text-[var(--color-success)]" />;
    case 'error':
      return <X size={9} className="text-[var(--color-error)]" />;
    case 'pending':
    default:
      return <Clock size={9} className="text-[var(--color-text-dim)]" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// =============================================================================
// Sub-components
// =============================================================================

const ProgressItemRow: React.FC<{ item: ProgressItem }> = memo(({ item }) => {
  const TypeIcon = itemTypeIcons[item.type] ?? Wrench;

  return (
    <div className="flex items-center gap-1.5 py-0.5 px-1">
      {getStatusIcon(item.status)}
      <TypeIcon size={9} className="shrink-0 text-[var(--color-text-dim)]" />
      <span className="text-[9px] text-[var(--color-text-secondary)] truncate flex-1">
        {item.label}
      </span>
      {item.detail && (
        <span className="text-[8px] text-[var(--color-text-dim)] truncate max-w-[100px]">
          {item.detail}
        </span>
      )}
      {item.duration != null && (
        <span className="text-[8px] tabular-nums text-[var(--color-text-dim)] ml-auto shrink-0">
          {formatDuration(item.duration)}
        </span>
      )}
    </div>
  );
});
ProgressItemRow.displayName = 'ProgressItemRow';

// =============================================================================
// Component
// =============================================================================

const ProgressGroupPanelInternal: React.FC<ProgressGroupPanelProps> = ({
  groups,
  className,
}) => {
  // Track expanded state per group. Default: show all groups expanded.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Filter to only show active or recently completed groups
  const visibleGroups = useMemo(() => {
    const now = Date.now();
    return groups.filter(g => {
      // Always show groups with running items
      if (g.items.some(i => i.status === 'running')) return true;
      // Show completed groups for 10 seconds
      if (g.completedAt && now - g.completedAt < 10000) return true;
      // Show groups started in the last 30 seconds
      if (now - g.startedAt < 30000) return true;
      return false;
    });
  }, [groups]);

  if (visibleGroups.length === 0) return null;

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={cn('font-mono', className)}>
      {visibleGroups.map(group => {
        const isCollapsed = collapsedGroups.has(group.id);
        const runningCount = group.items.filter(i => i.status === 'running').length;
        const completedCount = group.items.filter(i => i.status === 'success').length;
        const errorCount = group.items.filter(i => i.status === 'error').length;
        const isComplete = !!group.completedAt;

        return (
          <div
            key={group.id}
            className={cn(
              'border rounded mb-1',
              isComplete
                ? 'border-[var(--color-border-subtle)]/30'
                : 'border-[var(--color-border-subtle)]',
            )}
          >
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={cn(
                'flex items-center gap-1.5 w-full px-2 py-1',
                'text-left hover:bg-[var(--color-surface-hover)] transition-colors',
              )}
            >
              {isCollapsed ? (
                <ChevronRight size={10} className="shrink-0 text-[var(--color-text-dim)]" />
              ) : (
                <ChevronDown size={10} className="shrink-0 text-[var(--color-text-dim)]" />
              )}

              <span className={cn(
                'text-[9px] font-medium truncate flex-1',
                isComplete ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-text-secondary)]',
              )}>
                {group.title}
              </span>

              {/* Summary badges */}
              <div className="flex items-center gap-1 shrink-0">
                {runningCount > 0 && (
                  <span className="text-[8px] tabular-nums text-[var(--color-accent-primary)] flex items-center gap-0.5">
                    <Loader2 size={7} className="animate-spin" />
                    {runningCount}
                  </span>
                )}
                {completedCount > 0 && (
                  <span className="text-[8px] tabular-nums text-[var(--color-success)]">
                    {completedCount}✓
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-[8px] tabular-nums text-[var(--color-error)]">
                    {errorCount}✗
                  </span>
                )}
              </div>
            </button>

            {/* Items */}
            {!isCollapsed && (
              <div className="px-1 pb-1">
                {group.items.map(item => (
                  <ProgressItemRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ProgressGroupPanel = memo(ProgressGroupPanelInternal);
ProgressGroupPanel.displayName = 'ProgressGroupPanel';
