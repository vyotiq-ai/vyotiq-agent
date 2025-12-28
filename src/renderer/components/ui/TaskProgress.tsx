/**
 * Task Progress Component
 * 
 * Displays multi-step task progress with detailed status information.
 * Used for complex autonomous tasks like deep research, data extraction, etc.
 */
import React, { memo, useMemo } from 'react';
import { 
  CheckCircle, 
  Circle, 
  Loader2, 
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
} from 'lucide-react';
import { cn } from '../../utils/cn';

interface TaskStep {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

interface TaskProgressProps {
  /** Task title */
  title: string;
  /** Task description */
  description?: string;
  /** Task type */
  taskType?: string;
  /** List of steps */
  steps: TaskStep[];
  /** Current status */
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  /** Time started */
  startedAt?: number;
  /** Time completed */
  completedAt?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Whether to show step details */
  showDetails?: boolean;
  /** Callback when step is clicked */
  onStepClick?: (stepId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

export const TaskProgress: React.FC<TaskProgressProps> = memo(({
  title,
  description,
  taskType,
  steps,
  status,
  startedAt,
  completedAt,
  errorMessage,
  showDetails = true,
  className,
}) => {
  const [expandedSteps, setExpandedSteps] = React.useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // Calculate progress
  const progress = useMemo(() => {
    const completed = steps.filter(s => s.status === 'completed').length;
    const total = steps.length;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }, [steps]);

  // Calculate elapsed time
  const elapsedTime = useMemo(() => {
    if (!startedAt) return null;
    const endTime = completedAt || Date.now();
    const elapsed = Math.floor((endTime - startedAt) / 1000);
    if (elapsed < 60) return `${elapsed}s`;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}m ${secs}s`;
  }, [startedAt, completedAt]);

  // Current step
  const currentStep = steps.find(s => s.status === 'running');
  const currentStepIndex = currentStep ? steps.indexOf(currentStep) : -1;

  // Status colors
  const statusColors = {
    pending: 'text-[var(--color-text-muted)]',
    running: 'text-[var(--color-warning)]',
    completed: 'text-[var(--color-success)]',
    error: 'text-[var(--color-error)]',
    cancelled: 'text-[var(--color-text-muted)]',
  };

  const statusBg = {
    pending: 'bg-[var(--color-surface-2)]',
    running: 'bg-[var(--color-warning)]/5',
    completed: 'bg-[var(--color-success)]/5',
    error: 'bg-[var(--color-error)]/5',
    cancelled: 'bg-[var(--color-surface-2)]',
  };

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      status === 'error' ? "border-[var(--color-error)]/30" : "border-[var(--color-border-subtle)]",
      statusBg[status],
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              "p-2 rounded-lg",
              status === 'running' 
                ? "bg-[var(--color-warning)]/10" 
                : status === 'completed'
                  ? "bg-[var(--color-success)]/10"
                  : status === 'error'
                    ? "bg-[var(--color-error)]/10"
                    : "bg-[var(--color-surface-3)]"
            )}>
              {status === 'running' ? (
                <Loader2 size={16} className="animate-spin text-[var(--color-warning)]" />
              ) : status === 'completed' ? (
                <CheckCircle size={16} className="text-[var(--color-success)]" />
              ) : status === 'error' ? (
                <XCircle size={16} className="text-[var(--color-error)]" />
              ) : (
                <Zap size={16} className="text-[var(--color-text-muted)]" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-medium text-[var(--color-text-primary)]">
                {title}
              </h3>
              {description && (
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  {description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--color-text-dim)]">
                {taskType && (
                  <>
                    <span className="uppercase font-medium">{taskType}</span>
                    <span>•</span>
                  </>
                )}
                <span>{steps.filter(s => s.status === 'completed').length}/{steps.length} steps</span>
                {elapsedTime && (
                  <>
                    <span>•</span>
                    <Clock size={9} className="inline" />
                    <span>{elapsedTime}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* Progress indicator */}
          <div className="flex flex-col items-end">
            <span className={cn("text-[12px] font-medium", statusColors[status])}>
              {progress}%
            </span>
            <span className="text-[9px] text-[var(--color-text-dim)] capitalize">
              {status}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-[var(--color-surface-3)] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              status === 'error' 
                ? "bg-[var(--color-error)]" 
                : status === 'completed'
                  ? "bg-[var(--color-success)]"
                  : "bg-[var(--color-warning)]"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Current step highlight */}
      {currentStep && (
        <div className="px-4 py-2 bg-[var(--color-warning)]/10 border-b border-[var(--color-warning)]/20">
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-[var(--color-warning)]" />
            <span className="text-[11px] text-[var(--color-warning)] font-medium">
              Step {currentStepIndex + 1}: {currentStep.name}
            </span>
          </div>
          {currentStep.description && (
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1 ml-5">
              {currentStep.description}
            </p>
          )}
        </div>
      )}

      {/* Steps list */}
      {showDetails && (
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {steps.map((step, idx) => {
            const isExpanded = expandedSteps.has(step.id);
            const hasContent = step.output || step.error;

            return (
              <div key={step.id} className="group">
                <button
                  onClick={() => hasContent && toggleStep(step.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-left",
                    "transition-colors",
                    hasContent && "hover:bg-[var(--color-surface-2)] cursor-pointer",
                    !hasContent && "cursor-default"
                  )}
                >
                  {/* Step status icon */}
                  <div className="flex-shrink-0">
                    {step.status === 'completed' ? (
                      <CheckCircle size={14} className="text-[var(--color-success)]" />
                    ) : step.status === 'running' ? (
                      <Loader2 size={14} className="animate-spin text-[var(--color-warning)]" />
                    ) : step.status === 'error' ? (
                      <XCircle size={14} className="text-[var(--color-error)]" />
                    ) : step.status === 'skipped' ? (
                      <Circle size={14} className="text-[var(--color-text-dim)]" />
                    ) : (
                      <Circle size={14} className="text-[var(--color-text-muted)]" />
                    )}
                  </div>

                  {/* Step number and name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--color-text-dim)]">
                        {idx + 1}.
                      </span>
                      <span className={cn(
                        "text-[11px]",
                        step.status === 'completed' && "text-[var(--color-text-secondary)]",
                        step.status === 'running' && "text-[var(--color-warning)] font-medium",
                        step.status === 'error' && "text-[var(--color-error)]",
                        step.status === 'pending' && "text-[var(--color-text-muted)]",
                        step.status === 'skipped' && "text-[var(--color-text-dim)] line-through"
                      )}>
                        {step.name}
                      </span>
                    </div>
                  </div>

                  {/* Duration */}
                  {step.startedAt && step.completedAt && (
                    <span className="text-[9px] text-[var(--color-text-dim)]">
                      {Math.round((step.completedAt - step.startedAt) / 1000)}s
                    </span>
                  )}

                  {/* Expand indicator */}
                  {hasContent && (
                    <span className="text-[var(--color-text-dim)] opacity-0 group-hover:opacity-100 transition-opacity">
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && hasContent && (
                  <div className="px-4 pb-3 pl-10">
                    {step.output && (
                      <pre className={cn(
                        "text-[9px] font-mono p-2 rounded",
                        "bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]",
                        "text-[var(--color-text-secondary)] overflow-x-auto max-h-[100px]"
                      )}>
                        {step.output}
                      </pre>
                    )}
                    {step.error && (
                      <div className={cn(
                        "text-[9px] font-mono p-2 rounded",
                        "bg-[var(--color-error)]/10 border border-[var(--color-error)]/20",
                        "text-[var(--color-error)]"
                      )}>
                        {step.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <div className="px-4 py-3 bg-[var(--color-error)]/10 border-t border-[var(--color-error)]/20">
          <div className="flex items-start gap-2">
            <XCircle size={14} className="text-[var(--color-error)] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-[var(--color-error)]">
              {errorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

TaskProgress.displayName = 'TaskProgress';

export default TaskProgress;
