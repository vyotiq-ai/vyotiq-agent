/**
 * TodoProgressInline Component
 * 
 * Compact, inline task progress display for the ChatInput header area.
 * Shows a minimal progress bar with task count when tasks are active.
 * Designed to fit seamlessly into the terminal-style input header.
 * 
 * Features:
 * - Minimal height footprint for header integration
 * - Color-coded progress indication
 * - Responsive text hiding on small screens
 * - Clean, minimal design without excessive animations
 */
import React, { memo, useMemo } from 'react';
import { CheckCircle, Circle } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { TodoItem, TodoStats } from '../../../../../shared/types/todo';

// ============================================================================
// Types
// ============================================================================

interface TodoProgressInlineProps {
  /** Todo items to display progress for */
  todos: TodoItem[];
  /** Pre-calculated stats (optional, will calculate if not provided) */
  stats?: TodoStats;
  /** Optional class name */
  className?: string;
  /** Whether the progress bar should be compact (header mode) */
  compact?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate stats from todos if not provided
 */
function calculateStats(todos: TodoItem[]): TodoStats {
  const total = todos.length;
  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const pending = todos.filter(t => t.status === 'pending').length;
  const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  return { total, completed, inProgress, pending, completionPercentage };
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Minimal status icon (no animation for in_progress)
 */
const StatusIconMinimal: React.FC<{ status: 'completed' | 'in_progress' | 'pending'; size?: number }> = memo(({ status, size = 10 }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle size={size} className="text-[var(--color-success)] flex-shrink-0" />;
    case 'in_progress':
      return <Circle size={size} className="text-[var(--color-accent-primary)] flex-shrink-0 fill-[var(--color-accent-primary)]/20" />;
    case 'pending':
    default:
      return <Circle size={size} className="text-[var(--color-text-dim)] flex-shrink-0" />;
  }
});
StatusIconMinimal.displayName = 'StatusIconMinimal';

/**
 * Compact progress bar
 */
const ProgressBarCompact: React.FC<{ 
  percentage: number; 
  isComplete: boolean;
}> = memo(({ percentage, isComplete }) => (
  <div className="flex-1 h-1 min-w-[40px] max-w-[80px] bg-[var(--color-surface-2)] rounded-full overflow-hidden">
    <div 
      className={cn(
        "h-full rounded-full transition-all duration-300 ease-out",
        isComplete 
          ? "bg-[var(--color-success)]" 
          : "bg-[var(--color-accent-primary)]"
      )}
      style={{ width: `${percentage}%` }}
    />
  </div>
));
ProgressBarCompact.displayName = 'ProgressBarCompact';

// ============================================================================
// Main Component
// ============================================================================

/**
 * Inline progress indicator for ChatInput header
 */
const TodoProgressInlineComponent: React.FC<TodoProgressInlineProps> = ({
  todos,
  stats: providedStats,
  className,
  compact = true,
}) => {
  // Calculate stats if not provided
  const stats = useMemo(() => providedStats ?? calculateStats(todos), [providedStats, todos]);
  
  // Don't render if no todos
  if (todos.length === 0) {
    return null;
  }

  const isComplete = stats.completionPercentage === 100;
  const hasActive = stats.inProgress > 0;
  const activeTask = todos.find(t => t.status === 'in_progress');

  return (
    <div 
      className={cn(
        'flex items-center gap-2 min-w-0',
        'font-mono text-[9px]',
        className
      )}
      role="progressbar"
      aria-valuenow={stats.completionPercentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Task progress: ${stats.completed} of ${stats.total} completed`}
    >
      {/* Status icon */}
      <StatusIconMinimal 
        status={isComplete ? 'completed' : (hasActive ? 'in_progress' : 'pending')} 
        size={10} 
      />

      {/* Active task name - truncated, hidden on very small screens */}
      {activeTask && !compact && (
        <span className="hidden sm:inline truncate max-w-[120px] md:max-w-[180px] text-[var(--color-text-secondary)]">
          {activeTask.content}
        </span>
      )}

      {/* Progress bar */}
      <ProgressBarCompact 
        percentage={stats.completionPercentage} 
        isComplete={isComplete}
      />

      {/* Count - always visible */}
      <span className={cn(
        'tabular-nums whitespace-nowrap flex-shrink-0',
        isComplete ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'
      )}>
        {stats.completed}/{stats.total}
      </span>

      {/* Percentage - hidden on small screens */}
      <span className={cn(
        'hidden sm:inline tabular-nums flex-shrink-0',
        isComplete ? 'text-[var(--color-success)]' : 'text-[var(--color-text-dim)]'
      )}>
        ({stats.completionPercentage}%)
      </span>
    </div>
  );
};

export const TodoProgressInline = memo(TodoProgressInlineComponent);
TodoProgressInline.displayName = 'TodoProgressInline';

export default TodoProgressInline;
