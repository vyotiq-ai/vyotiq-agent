import React, { memo } from 'react';
import { cn } from '../../../../utils/cn';

export const ToolExecutionHeader: React.FC<{
  toolCount: number;
  runningCount: number;
  completedCount: number;
  errorCount: number;
  isRunning: boolean;
  onStop?: () => void;
}> = memo(({ toolCount, runningCount, completedCount, errorCount, isRunning, onStop }) => {
  return (
    <div
      className={cn(
        'px-3 py-2 flex items-center justify-between gap-2',
        'border-b border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-2)]/40',
      )}
    >
      <div className="min-w-0 flex items-center gap-2 text-[10px]">
        <span className="text-[var(--color-text-secondary)]">tools</span>
        <span className="text-[var(--color-text-dim)]">• {toolCount}</span>
        {runningCount > 0 && (
          <span className="text-[var(--color-warning)]">• running {runningCount}</span>
        )}
        {completedCount > 0 && (
          <span className="text-[var(--color-success)]">• ok {completedCount}</span>
        )}
        {errorCount > 0 && (
          <span className="text-[var(--color-error)]">• err {errorCount}</span>
        )}
      </div>

      {isRunning && onStop && (
        <button
          onClick={onStop}
          className={cn(
            'text-[9px] px-2 py-1 rounded-md',
            'text-[var(--color-error)]',
            'bg-[var(--color-error)]/5 hover:bg-[var(--color-error)]/10',
            'border border-[var(--color-error)]/20 hover:border-[var(--color-error)]/40',
            'transition-colors duration-100',
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
