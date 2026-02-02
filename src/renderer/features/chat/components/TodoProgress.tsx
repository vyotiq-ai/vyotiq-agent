/**
 * TodoProgress Component
 * 
 * Displays the current todo list progress in a compact, terminal-style format.
 * Shows task status with visual indicators and progress tracking.
 * Supports both basic TodoItem[] and enhanced TaskSession data.
 * Maintains existing terminal/CLI styling without $ or - signs.
 */
import React, { memo, useMemo, useState, useCallback } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Circle, 
  CircleCheck, 
  CircleDot, 
  ListTodo,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  FolderOpen,
  History,
  Target,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { TodoItem } from '../../../../shared/types/todo';
import type { TaskSession, TaskItem } from '../../../../shared/types/todoTask';
import { calculateTodoStats } from '../../../../shared/types/todo';

interface TodoProgressProps {
  /** Basic todo items (in-memory) */
  todos: TodoItem[];
  /** Optional TaskSession for enhanced display with plan info */
  taskSession?: TaskSession;
  /** Optional class name */
  className?: string;
}

/**
 * Get status icon for a todo item - uses consistent styling without excessive animation
 */
function getStatusIcon(status: TodoItem['status']) {
  switch (status) {
    case 'completed':
      return <CircleCheck size={12} className="text-[var(--color-success)]" />;
    case 'in_progress':
      return <CircleDot size={12} className="text-[var(--color-accent-primary)]" />;
    case 'pending':
    default:
      return <Circle size={12} className="text-[var(--color-text-dim)]" />;
  }
}

/**
 * Get status label for display
 */
function getStatusLabel(status: TodoItem['status']): string {
  switch (status) {
    case 'completed':
      return 'done';
    case 'in_progress':
      return 'working';
    case 'pending':
    default:
      return 'pending';
  }
}

/**
 * Individual todo item display - supports both TodoItem and TaskItem
 */
const TodoItemRow: React.FC<{ 
  todo: TodoItem | TaskItem; 
  isLast: boolean;
  showExtendedInfo?: boolean;
}> = memo(({ todo, isLast, showExtendedInfo = false }) => {
  const statusClass = todo.status === 'completed' 
    ? 'text-[var(--color-text-dim)] line-through' 
    : todo.status === 'in_progress'
      ? 'text-[var(--color-text-primary)]'
      : 'text-[var(--color-text-secondary)]';

  // Check if this is a TaskItem with extended properties
  const taskItem = todo as TaskItem;
  const hasDescription = showExtendedInfo && 'description' in taskItem && taskItem.description;
  const hasTargetFiles = showExtendedInfo && 'targetFiles' in taskItem && taskItem.targetFiles?.length;

  return (
    <div 
      className={cn(
        'flex items-start gap-2 py-1 px-2',
        !isLast && 'border-b border-[var(--color-border-subtle)]/30'
      )}
    >
      <span className="flex-shrink-0 mt-0.5">
        {getStatusIcon(todo.status)}
      </span>
      <div className="flex-1 min-w-0">
        <span className={cn('text-[11px] font-mono leading-tight block', statusClass)}>
          {todo.content}
        </span>
        {hasDescription && (
          <span className="text-[10px] text-[var(--color-text-dim)] font-mono mt-0.5 block">
            {taskItem.description}
          </span>
        )}
        {hasTargetFiles && (
          <span className="text-[10px] text-[var(--color-text-dim)] font-mono mt-0.5 block">
            files: {taskItem.targetFiles!.join(', ')}
          </span>
        )}
      </div>
      <span className="text-[10px] font-mono text-[var(--color-text-dim)] flex-shrink-0">
        [{getStatusLabel(todo.status)}]
      </span>
    </div>
  );
});

TodoItemRow.displayName = 'TodoItemRow';

/**
 * Progress bar component - terminal style
 */
const ProgressBar: React.FC<{ percentage: number; completed: number; total: number }> = memo(({ 
  percentage, 
  completed, 
  total 
}) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-1.5 bg-[var(--color-surface-2)] rounded-sm overflow-hidden">
      <div 
        className={cn(
          "h-full transition-all duration-300 ease-out rounded-sm",
          percentage === 100 
            ? "bg-[var(--color-success)]" 
            : percentage > 50 
              ? "bg-[var(--color-accent-primary)]"
              : "bg-[var(--color-warning)]"
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
    <span className="text-[10px] font-mono text-[var(--color-text-dim)] w-16 text-right">
      {completed}/{total} ({percentage}%)
    </span>
  </div>
));

ProgressBar.displayName = 'ProgressBar';

/**
 * Stats summary row
 */
const StatsSummary: React.FC<{ 
  pending: number; 
  inProgress: number; 
  completed: number;
  iterations?: number;
}> = memo(({ pending, inProgress, completed, iterations }) => (
  <div className="flex items-center gap-3 text-[10px] font-mono px-2 py-1 border-t border-[var(--color-border-subtle)]/30">
    {completed > 0 && (
      <span className="flex items-center gap-1 text-[var(--color-success)]">
        <CheckCircle2 size={10} />
        {completed} done
      </span>
    )}
    {inProgress > 0 && (
      <span className="flex items-center gap-1 text-[var(--color-accent-primary)]">
        <Clock size={10} />
        {inProgress} active
      </span>
    )}
    {pending > 0 && (
      <span className="flex items-center gap-1 text-[var(--color-text-dim)]">
        <AlertCircle size={10} />
        {pending} pending
      </span>
    )}
    {iterations && iterations > 1 && (
      <span className="flex items-center gap-1 text-[var(--color-text-dim)]">
        <History size={10} />
        {iterations} iterations
      </span>
    )}
  </div>
));

StatsSummary.displayName = 'StatsSummary';

/**
 * Requirements section - only shown when TaskSession is provided
 */
const RequirementsSection: React.FC<{ requirements: string[] }> = memo(({ requirements }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (requirements.length === 0) return null;

  return (
    <div className="border-t border-[var(--color-border-subtle)]/30">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-2 py-1 text-[10px] font-mono text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/30"
      >
        <Target size={10} />
        <span>Requirements ({requirements.length})</span>
        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      {isExpanded && (
        <div className="px-2 pb-1">
          {requirements.map((req, idx) => (
            <div key={idx} className="text-[10px] font-mono text-[var(--color-text-dim)] py-0.5 pl-4">
              {idx + 1}. {req}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

RequirementsSection.displayName = 'RequirementsSection';

/**
 * Plan info header - only shown when TaskSession is provided
 */
const PlanInfo: React.FC<{ session: TaskSession }> = memo(({ session }) => (
  <div className="flex items-center gap-3 text-[10px] font-mono px-2 py-1 border-b border-[var(--color-border-subtle)]/30 bg-[var(--color-surface-2)]/20">
    <span className="flex items-center gap-1 text-[var(--color-text-dim)]">
      <FolderOpen size={10} />
      .vyotiq/{session.folderName}/
    </span>
    <span className="flex items-center gap-1 text-[var(--color-text-dim)]">
      <FileText size={10} />
      {session.plan.id.substring(0, 20)}...
    </span>
  </div>
));

PlanInfo.displayName = 'PlanInfo';

/**
 * Main TodoProgress component
 * Supports both basic TodoItem[] and enhanced TaskSession display
 */
const TodoProgressComponent: React.FC<TodoProgressProps> = ({
  todos,
  taskSession,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Use TaskSession data if available, otherwise use basic todos
  const hasTaskSession = !!taskSession;
  const displayTodos = hasTaskSession ? taskSession.tasks : todos;
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

  if (displayTodos.length === 0) {
    return null;
  }

  const isComplete = stats.completionPercentage === 100;
  const title = hasTaskSession 
    ? taskSession.taskName 
    : (isComplete ? 'Tasks Complete' : 'Task Progress');
  const Icon = hasTaskSession ? ClipboardList : ListTodo;

  return (
    <div className={cn(
      'rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/50',
      'font-mono text-[11px]',
      isComplete && 'border-[var(--color-success)]/30',
      className
    )}>
      {/* Header */}
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5',
          'hover:bg-[var(--color-surface-2)]/30 transition-colors',
          'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25',
          isExpanded && 'border-b border-[var(--color-border-subtle)]/50'
        )}
      >
        <span className="text-[var(--color-text-dim)]">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        
        <Icon size={12} className={cn(
          isComplete ? "text-[var(--color-success)]" : "text-[var(--color-accent-primary)]"
        )} />
        
        <span className={cn(
          "font-medium truncate",
          isComplete ? "text-[var(--color-success)]" : "text-[var(--color-text-secondary)]"
        )}>
          {title}
        </span>

        <div className="flex-1 ml-2">
          <ProgressBar 
            percentage={stats.completionPercentage} 
            completed={stats.completed}
            total={stats.total}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div>
          {/* Plan info - only for TaskSession */}
          {hasTaskSession && <PlanInfo session={taskSession} />}

          {/* Todo list */}
          <div className="py-1">
            {sortedTodos.map((todo, idx) => (
              <TodoItemRow 
                key={todo.id} 
                todo={todo} 
                isLast={idx === sortedTodos.length - 1 && !hasTaskSession}
                showExtendedInfo={hasTaskSession}
              />
            ))}
          </div>
          
          {/* Requirements - only for TaskSession */}
          {hasTaskSession && (
            <RequirementsSection requirements={taskSession.plan.requirements} />
          )}
          
          {/* Stats summary */}
          <StatsSummary 
            pending={stats.pending}
            inProgress={stats.inProgress}
            completed={stats.completed}
            iterations={hasTaskSession ? taskSession.iterationCount : undefined}
          />
        </div>
      )}
    </div>
  );
};

export const TodoProgress = memo(TodoProgressComponent);
