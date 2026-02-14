/**
 * TodoProgress Component
 * 
 * Displays the current todo list progress in a clean, persistent terminal-style format.
 * Shows task status with visual indicators and progress tracking.
 * Supports both basic TodoItem[] and enhanced TaskSession data.
 * Maintains existing terminal/CLI styling without $ or - signs.
 * 
 * Features:
 * - Sticky header with progress bar always visible
 * - Collapsible task list with smooth animations
 * - Color-coded status indicators
 * - Responsive design with proper spacing
 */
import React, { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronUp,
  Circle, 
  CheckCircle,
  ListTodo,
  ClipboardList,
  FolderOpen,
  Target,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Spinner } from '../../../components/ui/LoadingState';
import type { TodoItem } from '../../../../shared/types/todo';
import type { TaskSession, TaskItem } from '../../../../shared/types/todoTask';
import { calculateTodoStats } from '../../../../shared/types/todo';

// ============================================================================
// Types
// ============================================================================

interface TodoProgressProps {
  /** Basic todo items (in-memory) */
  todos: TodoItem[];
  /** Optional TaskSession for enhanced display with plan info */
  taskSession?: TaskSession;
  /** Optional class name */
  className?: string;
  /** Whether to show in compact mode (header only) */
  compact?: boolean;
  /** Whether the component is sticky positioned */
  sticky?: boolean;
}

// ============================================================================
// Status Utilities
// ============================================================================

/**
 * Get status icon for a todo item
 */
const StatusIcon: React.FC<{ status: TodoItem['status']; size?: number }> = memo(({ status, size = 14 }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle size={size} className="text-[var(--color-success)] flex-shrink-0" />;
    case 'in_progress':
      return <Spinner size="sm" colorVariant="primary" className="w-3.5 h-3.5 flex-shrink-0" />;
    case 'pending':
    default:
      return <Circle size={size} className="text-[var(--color-text-muted)] flex-shrink-0" />;
  }
});

StatusIcon.displayName = 'StatusIcon';

/**
 * Get status color class
 */
function getStatusColorClass(status: TodoItem['status']): string {
  switch (status) {
    case 'completed':
      return 'text-[var(--color-text-muted)]';
    case 'in_progress':
      return 'text-[var(--color-text-primary)]';
    case 'pending':
    default:
      return 'text-[var(--color-text-secondary)]';
  }
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Animated progress bar with gradient and glow effect
 */
const ProgressBarAnimated: React.FC<{ 
  percentage: number; 
  completed: number; 
  total: number;
  showLabel?: boolean;
}> = memo(({ percentage, completed, total, showLabel = true }) => {
  const isComplete = percentage === 100;
  
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1 bg-[var(--color-surface-2)] rounded-full overflow-hidden min-w-[60px]">
        <div 
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            isComplete 
              ? "bg-[var(--color-success)]" 
              : "bg-gradient-to-r from-[var(--color-accent-primary)] to-[var(--color-accent-primary)]/70"
          )}
          style={{ 
            width: `${percentage}%`,
            boxShadow: isComplete ? 'none' : '0 0 8px var(--color-accent-primary)'
          }}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] font-mono text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
          {completed}/{total}
        </span>
      )}
    </div>
  );
});

ProgressBarAnimated.displayName = 'ProgressBarAnimated';

/**
 * Individual task item row
 */
const TaskItemRow: React.FC<{ 
  task: TodoItem | TaskItem; 
  index: number;
  showExtendedInfo?: boolean;
}> = memo(({ task, index, showExtendedInfo = false }) => {
  const isCompleted = task.status === 'completed';
  const isActive = task.status === 'in_progress';
  const taskItem = task as TaskItem;
  const hasDescription = showExtendedInfo && 'description' in taskItem && taskItem.description;

  return (
    <div 
      className={cn(
        'group flex items-start gap-2.5 py-2 px-3',
        'transition-colors duration-150',
        isActive && 'bg-[var(--color-accent-primary)]/5',
        !isCompleted && !isActive && 'hover:bg-[var(--color-surface-2)]/30'
      )}
    >
      {/* Task number */}
      <span className={cn(
        'text-[10px] font-mono tabular-nums w-4 text-right flex-shrink-0 pt-0.5',
        isCompleted ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-text-muted)]'
      )}>
        {index + 1}
      </span>
      
      {/* Status icon */}
      <StatusIcon status={task.status} size={14} />
      
      {/* Task content */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          'text-[11px] font-mono leading-relaxed block',
          getStatusColorClass(task.status),
          isCompleted && 'line-through decoration-[var(--color-text-dim)]/50'
        )}>
          {task.content}
        </span>
        {hasDescription && (
          <span className="text-[10px] text-[var(--color-text-dim)] font-mono mt-1 block leading-relaxed">
            {taskItem.description}
          </span>
        )}
      </div>
    </div>
  );
});

TaskItemRow.displayName = 'TaskItemRow';

/**
 * Stats badges showing task counts
 */
const StatsBadges: React.FC<{ 
  pending: number; 
  inProgress: number; 
  completed: number;
}> = memo(({ pending, inProgress, completed }) => {
  const badges = [
    { count: completed, label: 'done', color: 'text-[var(--color-success)]', show: completed > 0 },
    { count: inProgress, label: 'active', color: 'text-[var(--color-accent-primary)]', show: inProgress > 0 },
    { count: pending, label: 'todo', color: 'text-[var(--color-text-muted)]', show: pending > 0 },
  ].filter(b => b.show);

  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {badges.map(({ count, label, color }) => (
        <span key={label} className={cn('text-[10px] font-mono flex items-center gap-1', color)}>
          <span className="tabular-nums">{count}</span>
          <span className="opacity-70">{label}</span>
        </span>
      ))}
    </div>
  );
});

StatsBadges.displayName = 'StatsBadges';

/**
 * Requirements section with expandable list
 */
const RequirementsPanel: React.FC<{ requirements: string[] }> = memo(({ requirements }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (requirements.length === 0) return null;

  return (
    <div className="border-t border-[var(--color-border-subtle)]/40">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2',
          'text-[10px] font-mono text-[var(--color-text-muted)]',
          'hover:bg-[var(--color-surface-2)]/30 transition-colors'
        )}
      >
        <Target size={10} className="flex-shrink-0" />
        <span>Requirements</span>
        <span className="text-[var(--color-text-dim)]">({requirements.length})</span>
        <div className="flex-1" />
        {isOpen ? (
          <ChevronUp size={10} className="transition-transform duration-200" />
        ) : (
          <ChevronDown size={10} className="transition-transform duration-200" />
        )}
      </button>
      
      <div className={cn(
        'overflow-hidden transition-all duration-200',
        isOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
      )}>
        <div className="px-3 pb-2 space-y-1">
          {requirements.map((req, idx) => (
            <div key={idx} className="flex items-start gap-2 text-[10px] font-mono text-[var(--color-text-dim)]">
              <span className="text-[var(--color-text-placeholder)] tabular-nums">{idx + 1}.</span>
              <span className="leading-relaxed">{req}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

RequirementsPanel.displayName = 'RequirementsPanel';

/**
 * Plan metadata display
 */
const PlanMetadata: React.FC<{ session: TaskSession }> = memo(({ session }) => (
  <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-border-subtle)]/30 bg-[var(--color-surface-2)]/20">
    <span className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-dim)]">
      <FolderOpen size={10} className="flex-shrink-0" />
      <span className="truncate max-w-[120px]">.vyotiq/{session.folderName}</span>
    </span>
  </div>
));

PlanMetadata.displayName = 'PlanMetadata';

// ============================================================================
// Main Component
// ============================================================================

/**
 * Main TodoProgress component
 * Clean, persistent task progress display with collapsible details
 */
const TodoProgressComponent: React.FC<TodoProgressProps> = ({
  todos,
  taskSession,
  className,
  compact = false,
  sticky = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  
  // Calculate actual content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [todos, taskSession, isExpanded]);
  
  // Determine data source
  const hasTaskSession = !!taskSession;
  const displayTodos = hasTaskSession ? taskSession.tasks : todos;
  
  // Calculate stats
  const stats = useMemo(() => {
    if (hasTaskSession) {
      return taskSession.stats;
    }
    return calculateTodoStats(todos);
  }, [hasTaskSession, taskSession, todos]);
  
  // Sort todos: in_progress first, then pending, then completed
  const sortedTodos = useMemo(() => {
    return [...displayTodos].sort((a, b) => {
      const order = { in_progress: 0, pending: 1, completed: 2 };
      return order[a.status] - order[b.status];
    });
  }, [displayTodos]);
  
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Don't render if no todos
  if (displayTodos.length === 0) {
    return null;
  }

  const isComplete = stats.completionPercentage === 100;
  const hasActiveTask = stats.inProgress > 0;
  const title = hasTaskSession 
    ? taskSession.taskName 
    : (isComplete ? 'All Tasks Complete' : 'Task Progress');
  const Icon = hasTaskSession ? ClipboardList : ListTodo;

  return (
    <div 
      className={cn(
        'rounded-lg overflow-hidden',
        'border border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-1)]',
        'shadow-sm',
        isComplete && 'border-[var(--color-success)]/25',
        hasActiveTask && !isComplete && 'border-[var(--color-accent-primary)]/25',
        sticky && 'sticky bottom-4 z-10',
        className
      )}
    >
      {/* Header - Always visible */}
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5',
          'bg-[var(--color-surface-1)]',
          'hover:bg-[var(--color-surface-2)]/40',
          'transition-colors duration-150',
          'outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]/30 focus-visible:ring-inset'
        )}
      >
        {/* Icon with status indicator */}
        <div className="relative flex-shrink-0">
          <Icon size={16} className={cn(
            isComplete ? "text-[var(--color-success)]" : "text-[var(--color-accent-primary)]"
          )} />
          {hasActiveTask && !isComplete && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--color-accent-primary)]" />
          )}
          {isComplete && (
            <Sparkles size={8} className="absolute -top-1 -right-1 text-[var(--color-success)]" />
          )}
        </div>
        
        {/* Title */}
        <span className={cn(
          "text-[11px] font-mono font-medium truncate",
          isComplete ? "text-[var(--color-success)]" : "text-[var(--color-text-primary)]"
        )}>
          {title}
        </span>

        {/* Spacer */}
        <div className="flex-1" />
        
        {/* Stats badges (collapsed state) */}
        {!isExpanded && (
          <StatsBadges 
            pending={stats.pending}
            inProgress={stats.inProgress}
            completed={stats.completed}
          />
        )}

        {/* Progress bar */}
        <div className="w-24 flex-shrink-0">
          <ProgressBarAnimated 
            percentage={stats.completionPercentage} 
            completed={stats.completed}
            total={stats.total}
            showLabel={false}
          />
        </div>
        
        {/* Percentage */}
        <span className={cn(
          "text-[10px] font-mono tabular-nums w-8 text-right",
          isComplete ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"
        )}>
          {stats.completionPercentage}%
        </span>
        
        {/* Expand indicator */}
        {isExpanded ? (
          <ChevronUp size={14} className="text-[var(--color-text-muted)] transition-transform duration-200 flex-shrink-0" />
        ) : (
          <ChevronDown size={14} className="text-[var(--color-text-muted)] transition-transform duration-200 flex-shrink-0" />
        )}
      </button>

      {/* Expandable content */}
      <div 
        className={cn(
          'overflow-hidden transition-all duration-250 ease-out',
          isExpanded ? 'opacity-100' : 'opacity-0'
        )}
        style={{ 
          maxHeight: isExpanded ? `${Math.min(contentHeight, 320)}px` : '0px' 
        }}
      >
        <div ref={contentRef}>
          {/* Plan metadata - TaskSession only */}
          {hasTaskSession && <PlanMetadata session={taskSession} />}

          {/* Task list with scroll */}
          <div className={cn(
            'divide-y divide-[var(--color-border-subtle)]/20',
            sortedTodos.length > 5 && 'max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)]'
          )}>
            {sortedTodos.map((task, idx) => (
              <TaskItemRow 
                key={task.id} 
                task={task} 
                index={idx}
                showExtendedInfo={hasTaskSession}
              />
            ))}
          </div>
          
          {/* Requirements - TaskSession only */}
          {hasTaskSession && taskSession.plan.requirements && (
            <RequirementsPanel requirements={taskSession.plan.requirements} />
          )}
          
          {/* Footer stats */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--color-border-subtle)]/40 bg-[var(--color-surface-2)]/20">
            <StatsBadges 
              pending={stats.pending}
              inProgress={stats.inProgress}
              completed={stats.completed}
            />
            {hasTaskSession && taskSession.iterationCount && taskSession.iterationCount > 1 && (
              <span className="text-[10px] font-mono text-[var(--color-text-dim)]">
                iteration {taskSession.iterationCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TodoProgress = memo(TodoProgressComponent);
TodoProgress.displayName = 'TodoProgress';
