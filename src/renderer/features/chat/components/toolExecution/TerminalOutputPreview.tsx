import React, { memo } from 'react';
import { Terminal } from 'lucide-react';
import { cn } from '../../../../utils/cn';

/**
 * Terminal output preview for run commands
 * Strips ANSI escape codes for clean display
 */
export const TerminalOutputPreview: React.FC<{
  command?: string;
  output: string;
  exitCode?: number;
  hasError: boolean;
}> = memo(({ command, output, exitCode, hasError }) => {
  return (
    <div className="ml-6 mt-1 mb-2 rounded-md overflow-hidden border border-[var(--color-border-subtle)]">
      {command && (
        <div className="flex items-center gap-2 px-2 py-1 bg-[var(--color-surface-2)] border-b border-[var(--color-border-subtle)]">
          <Terminal size={10} className="text-[var(--color-text-muted)]" />
          <code className="text-[8px] font-mono text-[var(--color-text-secondary)] truncate flex-1">
            {command}
          </code>
          {exitCode !== undefined && (
            <span
              className={cn(
                'text-[8px] font-mono',
                exitCode === 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]',
              )}
            >
              exit: {exitCode}
            </span>
          )}
        </div>
      )}
      <pre
        className={cn(
          'p-2 text-[8px] font-mono overflow-x-auto max-h-[150px]',
          'bg-[var(--color-surface-editor)]',
          hasError ? 'text-[var(--color-error)]' : 'text-[var(--color-text-secondary)]',
        )}
      >
        {output || '(no output)'}
      </pre>
    </div>
  );
});

TerminalOutputPreview.displayName = 'TerminalOutputPreview';
