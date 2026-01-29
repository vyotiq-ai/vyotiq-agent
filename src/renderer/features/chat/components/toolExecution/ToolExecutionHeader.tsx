import React, { memo } from 'react';
import { Wrench } from 'lucide-react';
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
        'px-2 py-1.5 flex items-center justify-between gap-2',
        'mb-1 rounded-md',
        'bg-[var(--color-surface-2)]/30',
      )}
    >
      <div className="min-w-0 flex items-center gap-2 text-[10px] font-mono">
        <Wrench size={10} className="text-[var(--color-text-dim)]" />
        <span className="text-[var(--color-text-muted)]">{toolCount} tools</span>
        {runningCount > 0 && (
          <span className="text-[var(--color-warning)]">{runningCount} running</span>
        )}
        {errorCount > 0 && (
          <span className="text-[var(--color-error)]">{errorCount} failed</span>
        )}
        {completedCount > 0 && errorCount === 0 && runningCount === 0 && (
          <span className="text-[var(--color-success)]">{completedCount} ok</span>
        )}
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
