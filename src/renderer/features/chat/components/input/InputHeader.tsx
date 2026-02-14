/**
 * Input Header Component
 * 
 * Terminal-styled header bar with status indicator and real-time agent activity.
 * Displays context-aware status messages based on agent phase and activity.
 * Includes expandable task progress panel showing all tasks.
 * 
 * @example
 * <InputHeader
 *   isWorking={true}
 *   statusMessage="Reading files..."
 *   statusPhase="executing"
 * />
 */
import React, { memo, useMemo, useState, useCallback } from 'react';
import { Pause, Play, CheckCircle, Circle, ChevronDown } from 'lucide-react';
import { Spinner } from '../../../../components/ui/LoadingState';
import type { AgentStatusInfo } from '../../../../state/agentReducer';
import { cn } from '../../../../utils/cn';
import { getStatusDisplayMessage } from '../../../../utils';
import type { TodoItem, TodoStats } from '../../../../../shared/types/todo';
import { IterationControl } from './IterationControl';

// =============================================================================
// Types
// =============================================================================
export interface InputHeaderProps {
  /** Whether the agent is currently working */
  isWorking: boolean;
  /** Current status message from agent */
  statusMessage?: string;
  /** Phase of status (main agent phases plus idle) */
  statusPhase?: AgentStatusInfo['status'] | 'idle';
  /** Whether there's a workspace warning */
  workspaceWarning?: string | null;
  /** Formatted elapsed time string (mm:ss) */
  elapsedTime?: string;
  /** Whether the current run is paused */
  isPaused?: boolean;
  /** Toggle handler for pause/resume */
  onTogglePause?: () => void;
  /** Current iteration number when processing */
  currentIteration?: number;
  /** Maximum iterations when processing */
  maxIterations?: number;
  /** Callback when max iterations is changed (for realtime updates) */
  onMaxIterationsChange?: (value: number) => void;
  /** Todo items for progress display */
  todos?: TodoItem[];
  /** Pre-calculated todo stats */
  todoStats?: TodoStats;
  /** Custom className */
  className?: string;
}

// =============================================================================
// Sub-Components
// =============================================================================

/** Status indicator dot - simple and clean */
const StatusDot: React.FC<{ status: InputHeaderProps['statusPhase'] }> = memo(({ status }) => {
  const isActive = status === 'executing'
    || status === 'planning'
    || status === 'analyzing'
    || status === 'reasoning'
    || status === 'summarizing';

  const dotClass = cn(
    'terminal-status-dot flex-shrink-0',
    'transition-colors duration-200',
    status === 'error' && 'error',
    (status === 'recovering' || status === 'paused') && 'warning',
    isActive && 'active',
    (!status || status === 'idle' || status === 'completed') && 'idle'
  );
  
  return <div className={dotClass} aria-hidden="true" />;
});
StatusDot.displayName = 'StatusDot';

/** Typewriter status display with context-aware messages and smooth transitions */
const TypewriterStatus: React.FC<{ 
  message?: string; 
  phase?: InputHeaderProps['statusPhase'];
  isWorking: boolean;
  isPaused?: boolean;
}> = memo(({ message, phase, isWorking, isPaused }) => {
  // Get context-aware display message based on phase and raw message
  const displayMessage = useMemo(() => {
    return getStatusDisplayMessage(phase, message, isPaused);
  }, [phase, message, isPaused]);

  // Build screen-reader friendly status text
  const getStatusDescription = () => {
    if (isPaused) return 'Agent is paused';
    if (!isWorking) return 'Agent is idle and ready for input';
    if (phase === 'error') return `Error: ${message || 'An error occurred'}`;
    if (phase === 'recovering') return `Recovering: ${message || 'Retrying operation'}`;
    if (phase === 'paused') return 'Paused';
    return displayMessage || 'Agent is processing';
  };

  // Get phase-specific styling class
  const getPhaseClass = () => {
    switch (phase) {
      case 'executing': return 'phase-executing';
      case 'planning':
      case 'analyzing':
      case 'reasoning': return 'phase-thinking';
      default: return '';
    }
  };

  if ((isWorking || isPaused) && displayMessage) {
    return (
      <div className="vyotiq-typewriter min-w-0 flex-1">
        <span className={cn(
          'vyotiq-typewriter-text truncate block',
          'transition-all duration-300 ease-out',
          getPhaseClass(),
          phase === 'error' && '!text-[var(--color-error)]',
          phase === 'recovering' && '!text-[var(--color-warning)]',
          phase === 'paused' && '!text-[var(--color-warning)]'
        )}>
          {displayMessage}
        </span>
        {/* Visually hidden announcement for screen readers */}
        <span className="sr-only" role="status" aria-live="assertive">
          {getStatusDescription()}
        </span>
      </div>
    );
  }
  
  if (isWorking || isPaused) {
    return (
      <div className="vyotiq-typewriter">
        <span className="vyotiq-typewriter-text transition-opacity duration-300">vyotiq</span>
        <span className="typewriter-dots" aria-hidden="true">
          <span className="typewriter-dot">.</span>
          <span className="typewriter-dot">.</span>
          <span className="typewriter-dot">.</span>
        </span>
        <span className="sr-only" role="status" aria-live="polite">{getStatusDescription()}</span>
      </div>
    );
  }
  
  return (
    <span className={cn(
      'text-[10px] text-[var(--color-text-muted)] opacity-80 tracking-wide',
      'transition-all duration-300 ease-out'
    )}>
      vyotiq
    </span>
  );
});
TypewriterStatus.displayName = 'TypewriterStatus';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate stats from todos if not provided
 */
function calculateTodoStats(todos: TodoItem[]): TodoStats {
  const total = todos.length;
  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const pending = todos.filter(t => t.status === 'pending').length;
  const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  return { total, completed, inProgress, pending, completionPercentage };
}

// =============================================================================
// Todo Progress Sub-Components  
// =============================================================================

/** Minimal status icon for todo progress */
const TodoStatusIcon: React.FC<{ status: 'completed' | 'in_progress' | 'pending'; size?: number }> = memo(({ status, size = 10 }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle size={size} className="text-[var(--color-success)] flex-shrink-0" />;
    case 'in_progress':
      return <Spinner size="sm" colorVariant="primary" className="w-2.5 h-2.5 flex-shrink-0" />;
    case 'pending':
    default:
      return <Circle size={size} className="text-[var(--color-text-dim)] flex-shrink-0" />;
  }
});
TodoStatusIcon.displayName = 'TodoStatusIcon';

/** Simple progress bar */
const TodoProgressBar: React.FC<{ 
  percentage: number; 
  isComplete: boolean;
  showGlow?: boolean;
}> = memo(({ percentage, isComplete, showGlow }) => (
  <div className="h-1 w-16 bg-[var(--color-surface-2)] rounded-full overflow-hidden flex-shrink-0">
    <div 
      className={cn(
        "h-full rounded-full transition-all duration-300",
        isComplete ? "bg-[var(--color-success)]" : "bg-[var(--color-accent-primary)]",
        showGlow && !isComplete && "shadow-[0_0_4px_var(--color-accent-primary)]"
      )}
      style={{ width: `${percentage}%` }}
    />
  </div>
));
TodoProgressBar.displayName = 'TodoProgressBar';

/** Individual task row in expanded view */
const TaskRow: React.FC<{ task: TodoItem; index: number; total: number }> = memo(({ task, index, total }) => {
  const isCompleted = task.status === 'completed';
  const isActive = task.status === 'in_progress';

  return (
    <div 
      className={cn(
        'flex items-start gap-2 py-1.5 px-3',
        isActive && 'bg-[var(--color-accent-primary)]/5',
        !isCompleted && !isActive && 'hover:bg-[var(--color-surface-2)]/30'
      )}
    >
      {/* Task number (X of Y) */}
      <span className={cn(
        'text-[9px] tabular-nums w-8 text-right flex-shrink-0',
        isCompleted ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-text-muted)]'
      )}>
        {index + 1}/{total}
      </span>
      
      {/* Status icon */}
      <TodoStatusIcon status={task.status} size={10} />
      
      {/* Task content with better wrapping */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          'text-[10px] leading-relaxed block transition-all duration-200',
          isCompleted && 'text-[var(--color-text-dim)] line-through decoration-[var(--color-text-dim)]/40',
          isActive && 'text-[var(--color-text-primary)] font-medium',
          !isCompleted && !isActive && 'text-[var(--color-text-secondary)]'
        )}>
          {task.content}
        </span>
      </div>
    </div>
  );
});
TaskRow.displayName = 'TaskRow';

/** Stats badge component */
const StatBadge: React.FC<{ 
  count: number; 
  label: string; 
  colorClass: string;
  icon?: React.ReactNode;
}> = memo(({ count, label, colorClass, icon }) => (
  <span className={cn('flex items-center gap-1 text-[9px] tabular-nums', colorClass)}>
    {icon}
    <span className="font-medium">{count}</span>
    <span className="opacity-70">{label}</span>
  </span>
));
StatBadge.displayName = 'StatBadge';

/** Expandable task list panel with enhanced UX */
const TaskListPanel: React.FC<{ 
  todos: TodoItem[]; 
  isExpanded: boolean;
  todoStats: TodoStats;
}> = memo(({ todos, isExpanded, todoStats }) => {
  // Sort: in_progress first, then pending, then completed
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => {
      const order = { in_progress: 0, pending: 1, completed: 2 };
      return order[a.status] - order[b.status];
    });
  }, [todos]);

  if (!isExpanded || todos.length === 0) return null;

  const totalTasks = todos.length;

  return (
    <div 
      className={cn(
        'border-t border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-1)]',
        'animate-in slide-in-from-top-1 duration-200 ease-out'
      )}
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface-2)]/40">
        <span className="text-[9px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
          Tasks
        </span>
        <div className="flex items-center gap-3">
          {todoStats.completed > 0 && (
            <StatBadge 
              count={todoStats.completed} 
              label="done" 
              colorClass="text-[var(--color-success)]"
              icon={<CheckCircle size={9} />}
            />
          )}
          {todoStats.inProgress > 0 && (
            <StatBadge 
              count={todoStats.inProgress} 
              label="active" 
              colorClass="text-[var(--color-accent-primary)]"
              icon={<Spinner size="sm" className="w-2.5 h-2.5" colorVariant="primary" />}
            />
          )}
          {todoStats.pending > 0 && (
            <StatBadge 
              count={todoStats.pending} 
              label="pending" 
              colorClass="text-[var(--color-text-muted)]"
              icon={<Circle size={9} />}
            />
          )}
        </div>
      </div>

      {/* Task list with improved scroll */}
      <div className={cn(
        todos.length > 5 && 'max-h-44 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)] scrollbar-track-transparent'
      )}>
        {sortedTodos.map((task, idx) => (
          <TaskRow key={task.id} task={task} index={idx} total={totalTasks} />
        ))}
      </div>
    </div>
  );
});
TaskListPanel.displayName = 'TaskListPanel';

// =============================================================================
// Main Component
// =============================================================================

export const InputHeader: React.FC<InputHeaderProps> = memo(({
  isWorking,
  statusMessage,
  statusPhase = 'idle',
  workspaceWarning,
  elapsedTime,
  isPaused,
  onTogglePause,
  currentIteration,
  maxIterations,
  onMaxIterationsChange,
  todos = [],
  todoStats: providedTodoStats,
  className,
}) => {
  const [isTasksExpanded, setIsTasksExpanded] = useState(false);
  
  // Calculate todo stats
  const todoStats = useMemo(() => providedTodoStats ?? calculateTodoStats(todos), [providedTodoStats, todos]);
  const hasTodos = todos.length > 0;
  const isComplete = todoStats.completionPercentage === 100;
  const hasActiveTodo = todoStats.inProgress > 0;
  const activeTodo = todos.find(t => t.status === 'in_progress');
  
  const toggleTasksExpanded = useCallback(() => {
    setIsTasksExpanded(prev => !prev);
  }, []);
  
  return (
    <div className={cn('flex flex-col', className)}>
      {/* Main header row */}
      <div 
        className={cn(
          'flex items-center justify-between px-2 py-0.5',
          'border-b border-[var(--color-border-subtle)]/40',
          'bg-transparent',
          'font-mono transition-all duration-200 text-[9px]'
        )}
        role="status"
        aria-live="polite"
      >
        {/* Left: Status and process info */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className="terminal-status-indicator flex-shrink-0">
            <StatusDot status={statusPhase} />
          </div>
          <TypewriterStatus
            message={statusMessage}
            phase={statusPhase}
            isWorking={isWorking}
            isPaused={isPaused || statusPhase === 'paused'}
          />
        </div>

        {/* Center: Task progress - clickable when tasks exist */}
        {hasTodos && (
          <button
            type="button"
            onClick={toggleTasksExpanded}
            className={cn(
              'flex items-center gap-1 flex-shrink-0 mx-2 min-w-0 py-0.5 px-1.5 rounded-sm',
              'border border-transparent',
              'hover:border-[var(--color-border-subtle)]/50',
              'transition-all duration-150',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
              isTasksExpanded && 'border-[var(--color-border-subtle)]/30'
            )}
            title={isTasksExpanded ? 'Collapse tasks' : `View all ${todos.length} tasks`}
            aria-expanded={isTasksExpanded}
            aria-label={`Task progress: ${todoStats.completed} of ${todoStats.total} complete`}
          >
            <TodoStatusIcon 
              status={isComplete ? 'completed' : (hasActiveTodo ? 'in_progress' : 'pending')} 
              size={10} 
            />
            {/* Active task name - truncated */}
            {activeTodo && (
              <span className="hidden xl:inline truncate max-w-[140px] text-[var(--color-text-secondary)]">
                {activeTodo.content}
              </span>
            )}
            <TodoProgressBar 
              percentage={todoStats.completionPercentage} 
              isComplete={isComplete}
              showGlow={hasActiveTodo}
            />
            <span className={cn(
              'tabular-nums whitespace-nowrap font-medium',
              isComplete ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'
            )}>
              {todoStats.completed}/{todoStats.total}
            </span>
            <span className={cn(
              'hidden xl:inline tabular-nums',
              isComplete ? 'text-[var(--color-success)]' : 'text-[var(--color-text-dim)]'
            )}>
              ({todoStats.completionPercentage}%)
            </span>
            {/* Expand/collapse indicator with rotation */}
            <ChevronDown 
              size={10} 
              className={cn(
                'text-[var(--color-text-muted)] flex-shrink-0 transition-transform duration-200',
                isTasksExpanded && 'rotate-180'
              )} 
            />
          </button>
        )}

        {/* Right: Iteration + Time + controls */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {/* Iteration progress - interactive control for realtime updates */}
          <IterationControl
            currentIteration={currentIteration}
            maxIterations={maxIterations}
            onMaxIterationsChange={onMaxIterationsChange}
            isWorking={isWorking}
          />
          {workspaceWarning && (
            <span 
              className="text-[8px] text-[var(--color-warning)] hidden lg:inline"
              title={workspaceWarning}
            >
              [!]
            </span>
          )}
          {(isWorking || statusPhase === 'paused' || isPaused) && (
            <span className={cn(
              'terminal-elapsed tabular-nums',
              'transition-all duration-300 ease-out',
              (isWorking || statusPhase === 'paused' || isPaused) && 'active'
            )}>
              {elapsedTime ?? '--:--'}
            </span>
          )}
          {onTogglePause && (isWorking || statusPhase === 'paused' || isPaused) && (
            <button
              type="button"
              onClick={onTogglePause}
              className={cn(
                'p-1 rounded-sm border border-transparent',
                'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                'hover:border-[var(--color-border-subtle)] transition-colors duration-150'
              )}
              title={(statusPhase === 'paused' || isPaused) ? 'Resume' : 'Pause'}
              aria-label={(statusPhase === 'paused' || isPaused) ? 'Resume run' : 'Pause run'}
            >
              {(statusPhase === 'paused' || isPaused) ? <Play size={10} /> : <Pause size={10} />}
            </button>
          )}
        </div>
      </div>
      
      {/* Expandable task list panel */}
      <TaskListPanel 
        todos={todos} 
        isExpanded={isTasksExpanded} 
        todoStats={todoStats}
      />
    </div>
  );
});

InputHeader.displayName = 'InputHeader';
