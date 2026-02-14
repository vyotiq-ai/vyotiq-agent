import React, { memo, useState, useCallback } from 'react';
import { ChevronRight, Terminal } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { cleanTerminalOutput } from '../../../../utils/ansi';

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
  
  const cleanedOutput = cleanTerminalOutput(output);
  const lines = cleanedOutput.split('\n');
  const hasMoreLines = lines.length > MAX_COLLAPSED_LINES;
  const displayLines = isExpanded 
    ? lines.slice(0, MAX_EXPANDED_LINES) 
    : lines.slice(0, MAX_COLLAPSED_LINES);
  const displayOutput = displayLines.join('\n');
  const hiddenCount = isExpanded 
    ? Math.max(0, lines.length - MAX_EXPANDED_LINES)
    : lines.length - MAX_COLLAPSED_LINES;
  
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(cleanedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [cleanedOutput]);
  
  const toggleExpand = useCallback(() => setIsExpanded(prev => !prev), []);

  return (
    <div className="ml-4 mt-1.5 mb-2 rounded-md overflow-hidden border border-[var(--color-border-subtle)]/30 bg-[var(--color-surface-editor)]">
      {/* Header — clean terminal bar */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5',
        'bg-[var(--color-surface-1)]/40',
        'border-b border-[var(--color-border-subtle)]/20'
      )}>
        <Terminal size={11} className="text-[var(--color-terminal-prompt)]/70 flex-shrink-0" />
        
        {command && (
          <code className="text-[10px] font-mono text-[var(--color-text-secondary)]/80 truncate flex-1">
            {command}
          </code>
        )}
        
        <div className="flex items-center gap-2 ml-auto">
          {/* Line count */}
          <span className="text-[9px] text-[var(--color-text-dim)]/50 font-mono tabular-nums">
            {lines.length} lines
          </span>
          
          {/* Exit code badge */}
          {exitCode !== undefined && (
            <span
              className={cn(
                'text-[8px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded-md',
                exitCode === 0 
                  ? 'text-[var(--color-diff-added-text)]/80 bg-[var(--color-diff-added-text)]/8' 
                  : 'text-[var(--color-diff-removed-text)]/80 bg-[var(--color-diff-removed-text)]/8',
              )}
            >
              {exitCode === 0 ? 'ok' : `exit ${exitCode}`}
            </span>
          )}
          
          {/* Copy button — text-based for terminal consistency */}
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'px-1.5 py-0.5 rounded-md text-[9px] font-mono',
              'transition-all duration-150',
              'text-[var(--color-text-dim)]/60 hover:text-[var(--color-text-secondary)]',
              'hover:bg-[var(--color-surface-2)]/40'
            )}
            title="Copy output"
          >
            {copied ? 'copied' : 'copy'}
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
      
      {/* Expand/collapse footer — subtle toggle */}
      {hasMoreLines && (
        <button
          type="button"
          onClick={toggleExpand}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-1',
            'text-[9px] font-mono text-[var(--color-text-dim)]/60',
            'hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]/30',
            'border-t border-[var(--color-border-subtle)]/15 transition-all duration-150'
          )}
        >
          <ChevronRight
            size={9}
            className={cn(
              'transition-transform duration-150',
              isExpanded && 'rotate-90'
            )}
          />
          <span>{isExpanded ? 'collapse' : `${hiddenCount} more line${hiddenCount !== 1 ? 's' : ''}`}</span>
        </button>
      )}
    </div>
  );
});

TerminalOutputPreview.displayName = 'TerminalOutputPreview';
