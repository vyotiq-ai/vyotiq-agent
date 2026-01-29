import React, { memo, useState, useCallback } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { cn } from '../../../../utils/cn';

const MAX_COLLAPSED_LINES = 10;
const MAX_EXPANDED_LINES = 150;

/**
 * Terminal output preview for run commands
 * Clean, minimal design maintaining existing terminal aesthetics
 * NOTE: No $ or - prefixes to maintain clean output display
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
    <div className="ml-4 mt-1.5 mb-2 rounded-lg overflow-hidden border border-[var(--color-border-subtle)]/40 bg-[var(--color-surface-editor)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
      {/* Header - consistent with DiffViewer header styling */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2',
        'bg-[var(--color-surface-1)]/60',
        'border-b border-[var(--color-border-subtle)]/25'
      )}>
        <Terminal size={12} className="text-[var(--color-terminal-prompt)] flex-shrink-0" />
        
        {command && (
          <code className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate flex-1">
            {command}
          </code>
        )}
        
        <div className="flex items-center gap-2 ml-auto">
          {/* Line count */}
          <span className="text-[9px] text-[var(--color-text-dim)]/60 font-mono tabular-nums">
            {lines.length} lines
          </span>
          
          {/* Exit code badge - refined pill style */}
          {exitCode !== undefined && (
            <span
              className={cn(
                'text-[8px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded',
                exitCode === 0 
                  ? 'text-[var(--color-diff-added-text)] bg-[var(--color-diff-added-text)]/10' 
                  : 'text-[var(--color-diff-removed-text)] bg-[var(--color-diff-removed-text)]/10',
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
              'p-1.5 rounded transition-colors duration-100',
              'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]',
              'hover:bg-[var(--color-surface-2)]/60'
            )}
            title="Copy output"
          >
            {copied ? <Check size={12} className="text-[var(--color-diff-added-text)]" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      
      {/* Output - clean monospace display without any prefix symbols */}
      <pre
        className={cn(
          'px-3 py-2.5 text-[10px] font-mono leading-[1.6] overflow-x-auto',
          'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent',
          hasError ? 'text-[var(--color-diff-removed-text)]/90' : 'text-[var(--color-terminal-output)]',
          isExpanded ? 'max-h-[350px]' : 'max-h-[140px]',
        )}
      >
        {displayOutput || <span className="text-[var(--color-text-dim)]/50 italic">(no output)</span>}
      </pre>
      
      {/* Expand/collapse footer - consistent with diff expand buttons */}
      {hasMoreLines && (
        <button
          type="button"
          onClick={toggleExpand}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-1.5',
            'text-[9px] font-mono text-[var(--color-diff-expand-text)]/70',
            'bg-[var(--color-diff-expand-bg)] hover:bg-[var(--color-diff-expand-border)] hover:text-[var(--color-diff-expand-text)]',
            'border-t border-[var(--color-border-subtle)]/20 transition-colors duration-100'
          )}
        >
          {isExpanded ? (
            <>
              <ChevronUp size={10} />
              <span className="tracking-wide">collapse</span>
            </>
          ) : (
            <>
              <ChevronDown size={10} />
              <span>{hiddenCount} more line{hiddenCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
});

TerminalOutputPreview.displayName = 'TerminalOutputPreview';
