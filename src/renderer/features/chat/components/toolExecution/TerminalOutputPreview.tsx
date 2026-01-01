import React, { memo, useState, useCallback } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../../../utils/cn';

const MAX_COLLAPSED_LINES = 10;
const MAX_EXPANDED_LINES = 150;

/**
 * Terminal output preview for run commands
 * Clean, minimal design maintaining existing terminal aesthetics
 */
export const TerminalOutputPreview: React.FC<{
  command?: string;
  output: string;
  exitCode?: number;
  hasError: boolean;
}> = memo(({ command, output, exitCode, hasError }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const lines = output.split('\n');
  const hasMoreLines = lines.length > MAX_COLLAPSED_LINES;
  const displayLines = isExpanded 
    ? lines.slice(0, MAX_EXPANDED_LINES) 
    : lines.slice(0, MAX_COLLAPSED_LINES);
  const displayOutput = displayLines.join('\n');
  const hiddenCount = isExpanded 
    ? Math.max(0, lines.length - MAX_EXPANDED_LINES)
    : lines.length - MAX_COLLAPSED_LINES;
  
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [output]);
  
  const toggleExpand = useCallback(() => setIsExpanded(prev => !prev), []);

  return (
    <div className="ml-4 mt-1.5 mb-2 rounded-lg overflow-hidden border border-[var(--color-border-subtle)]/60 bg-[var(--color-surface-editor)]">
      {/* Header - minimal with command and actions */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-1)]/50 border-b border-[var(--color-border-subtle)]/40">
        {command && (
          <code className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate flex-1">
            {command}
          </code>
        )}
        
        <div className="flex items-center gap-2 ml-auto">
          {/* Line count */}
          <span className="text-[9px] text-[var(--color-text-dim)] font-mono tabular-nums">
            {lines.length} lines
          </span>
          
          {/* Exit code badge */}
          {exitCode !== undefined && (
            <span
              className={cn(
                'text-[9px] font-mono px-1.5 py-0.5 rounded',
                exitCode === 0 
                  ? 'text-[var(--color-success)] bg-[var(--color-success)]/10' 
                  : 'text-[var(--color-error)] bg-[var(--color-error)]/10',
              )}
            >
              {exitCode === 0 ? 'ok' : `exit ${exitCode}`}
            </span>
          )}
          
          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'p-1 rounded transition-all',
              'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
              'hover:bg-[var(--color-surface-2)]'
            )}
            title="Copy output"
          >
            {copied ? <Check size={12} className="text-[var(--color-success)]" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      
      {/* Output - clean monospace display */}
      <pre
        className={cn(
          'px-3 py-2 text-[10px] font-mono leading-relaxed overflow-x-auto',
          'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent',
          hasError ? 'text-[var(--color-error)]/90' : 'text-[var(--color-text-secondary)]',
          isExpanded ? 'max-h-[350px]' : 'max-h-[140px]',
        )}
      >
        {displayOutput || <span className="text-[var(--color-text-dim)] italic">(no output)</span>}
      </pre>
      
      {/* Expand/collapse footer */}
      {hasMoreLines && (
        <button
          type="button"
          onClick={toggleExpand}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-1.5',
            'text-[9px] font-mono text-[var(--color-text-muted)]',
            'hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]/50',
            'border-t border-[var(--color-border-subtle)]/40 transition-colors'
          )}
        >
          {isExpanded ? (
            <>
              <ChevronUp size={12} />
              <span>collapse</span>
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              <span>{hiddenCount} more line{hiddenCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
});

TerminalOutputPreview.displayName = 'TerminalOutputPreview';
