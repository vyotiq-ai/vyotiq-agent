import React, { memo } from 'react';
import { cn } from '../../../../utils/cn';
import { Spinner } from '../../../../components/ui/LoadingState';

/**
 * Context-aware tool execution header
 * Shows descriptive status of ongoing operations without icons
 */
export const ToolExecutionHeader: React.FC<{
  toolCount: number;
  runningCount: number;
  completedCount: number;
  errorCount: number;
  isRunning: boolean;
  onStop?: () => void;
  /** Optional label for what's currently being processed */
  currentOperationLabel?: string;
}> = memo(({ 
  toolCount, 
  runningCount, 
  completedCount, 
  errorCount, 
  isRunning, 
  onStop,
  currentOperationLabel,
}) => {
  // Generate context-aware status description
  const getStatusDescription = () => {
    if (runningCount > 0) {
      if (runningCount === 1 && currentOperationLabel) {
        return currentOperationLabel;
      }
      return `Processing ${runningCount} operation${runningCount > 1 ? 's' : ''}`;
    }
    if (errorCount > 0 && completedCount === 0) {
      return `${errorCount} operation${errorCount > 1 ? 's' : ''} failed`;
    }
    if (errorCount > 0) {
      return `${completedCount} completed, ${errorCount} failed`;
    }
    if (completedCount > 0) {
      return `${completedCount} operation${completedCount > 1 ? 's' : ''} completed`;
    }
    return `${toolCount} operation${toolCount > 1 ? 's' : ''} pending`;
  };

  return (
    <div
      className={cn(
        'px-2 py-1.5 flex items-center justify-between gap-2',
        'mb-1 rounded-md',
        'bg-[var(--color-surface-2)]/30',
      )}
    >
      <div className="min-w-0 flex items-center gap-2 text-[10px] font-mono">
        {/* Show spinner for running operations */}
        {runningCount > 0 && (
          <Spinner size="sm" variant="default" className="w-3 h-3" />
        )}
        
        {/* Context-aware status description */}
        <span className={cn(
          runningCount > 0 && 'text-[var(--color-warning)]',
          errorCount > 0 && runningCount === 0 && 'text-[var(--color-error)]',
          completedCount > 0 && errorCount === 0 && runningCount === 0 && 'text-[var(--color-success)]',
          !runningCount && !errorCount && !completedCount && 'text-[var(--color-text-muted)]',
        )}>
          {getStatusDescription()}
        </span>
      </div>

      {isRunning && onStop && (
        <button
          onClick={onStop}
          className={cn(
            'text-[9px] px-2 py-0.5 rounded',
            'text-[var(--color-error)]',
            'hover:bg-[var(--color-error)]/10',
            'transition-colors',
          )}
          title="Stop execution (ESC)"
        >
          stop
        </button>
      )}
    </div>
  );
});

ToolExecutionHeader.displayName = 'ToolExecutionHeader';
