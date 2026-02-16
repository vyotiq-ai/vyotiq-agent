/**
 * CommunicationProgress Component
 * 
 * Renders communication progress updates from the agent, showing
 * multi-step task progress with phase labels, progress bars, and messages.
 * Consumes `communicationProgress` from the agent state.
 * 
 * Follows the terminal aesthetic with monospace fonts and CSS variable theming.
 */
import React, { memo, useMemo } from 'react';
import { Activity, CheckCircle, AlertTriangle, Info, AlertOctagon } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { AgentUIState } from '../../../state/types';

// =============================================================================
// Types
// =============================================================================

type ProgressEntry = AgentUIState['communicationProgress'][0];

interface CommunicationProgressProps {
  /** Progress entries to render */
  entries: ProgressEntry[];
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const levelConfig: Record<string, { icon: React.ElementType; color: string }> = {
  verbose: { icon: Info, color: 'var(--color-text-dim)' },
  info: { icon: Info, color: 'var(--color-info)' },
  warning: { icon: AlertTriangle, color: 'var(--color-warning)' },
  error: { icon: AlertOctagon, color: 'var(--color-error)' },
};

// =============================================================================
// Sub-components
// =============================================================================

const ProgressBar: React.FC<{ progress: number; color: string }> = memo(({ progress, color }) => (
  <div className="h-1 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
    <div
      className="h-full rounded-full transition-all duration-300 ease-out"
      style={{
        width: `${Math.min(100, Math.max(0, progress))}%`,
        backgroundColor: color,
      }}
    />
  </div>
));
ProgressBar.displayName = 'ProgressBar';

const ProgressItem: React.FC<{ entry: ProgressEntry }> = memo(({ entry }) => {
  const config = levelConfig[entry.level] ?? levelConfig.info;
  const Icon = config.icon;
  const isComplete = entry.progress >= 100;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        {isComplete ? (
          <CheckCircle size={9} style={{ color: 'var(--color-success)' }} />
        ) : (
          <Icon size={9} style={{ color: config.color }} />
        )}
        {entry.phase && (
          <span className="text-[8px] uppercase tracking-wider" style={{ color: config.color }}>
            {entry.phase}
          </span>
        )}
        <span className="text-[9px] text-[var(--color-text-secondary)] truncate flex-1">
          {entry.message}
        </span>
        <span className="text-[8px] tabular-nums text-[var(--color-text-dim)] shrink-0">
          {Math.round(entry.progress)}%
        </span>
      </div>
      <ProgressBar progress={entry.progress} color={isComplete ? 'var(--color-success)' : config.color} />
    </div>
  );
});
ProgressItem.displayName = 'ProgressItem';

// =============================================================================
// Main Component
// =============================================================================

const CommunicationProgressInternal: React.FC<CommunicationProgressProps> = ({
  entries,
  className,
}) => {
  // Group by taskId if multiple, otherwise show flat list
  const activeEntries = useMemo(() => {
    // Show the most recent entries, remove completed ones older than 5s
    const now = Date.now();
    return entries.filter(e => e.progress < 100 || (now - e.createdAt) < 5000);
  }, [entries]);

  if (activeEntries.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded border font-mono',
        'bg-[var(--color-surface-1)]',
        'border-[var(--color-border-subtle)]',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[var(--color-border-subtle)]">
        <Activity size={10} className="animate-pulse" style={{ color: 'var(--color-accent-primary)' }} />
        <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
          progress
        </span>
        <span className="text-[8px] tabular-nums text-[var(--color-text-dim)]">
          {activeEntries.length} {activeEntries.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* Progress entries */}
      <div className="px-2 py-1.5 flex flex-col gap-1.5">
        {activeEntries.map(entry => (
          <ProgressItem key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
};

export const CommunicationProgress = memo(CommunicationProgressInternal);
CommunicationProgress.displayName = 'CommunicationProgress';
