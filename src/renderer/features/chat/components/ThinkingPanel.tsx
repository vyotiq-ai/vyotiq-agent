/**
 * ThinkingPanel Component
 * 
 * Displays the model's thinking/reasoning content in a collapsible panel.
 * Follows the terminal/CLI design language matching ToolItem.
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Loader2 } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface ThinkingPanelProps {
  thinking: string;
  isStreaming?: boolean;
  modelName?: string;
  defaultCollapsed?: boolean;
}

const ThinkingPanelComponent: React.FC<ThinkingPanelProps> = ({
  thinking,
  isStreaming = false,
  modelName,
  defaultCollapsed = true,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isStreaming) setIsCollapsed(false);
  }, [isStreaming]);

  const handleToggle = useCallback(() => setIsCollapsed(prev => !prev), []);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [thinking]);

  if (!thinking && !isStreaming) return null;

  const charDisplay = thinking 
    ? thinking.length >= 1000 ? `${(thinking.length / 1000).toFixed(1)}k` : String(thinking.length)
    : '0';

  return (
    <div className="group/thinking font-mono min-w-0">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'flex items-center gap-1.5 py-0.5 min-w-0 w-full cursor-pointer',
          'hover:bg-[var(--color-surface-1)]/30 rounded-sm px-1 -mx-1',
          'transition-colors duration-100',
          'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25'
        )}
        onClick={handleToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleToggle())}
        aria-expanded={!isCollapsed}
      >
        {/* Status indicator */}
        {isStreaming ? (
          <Loader2 size={10} className="text-[var(--color-info)] animate-spin flex-shrink-0" />
        ) : (
          <Check size={10} className="text-[var(--color-success)] flex-shrink-0" />
        )}

        {/* Chevron */}
        <span className="text-[var(--color-text-dim)] opacity-40 w-2.5 flex-shrink-0">
          {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        </span>

        {/* Label */}
        <span className={cn(
          'text-[11px] font-medium',
          isStreaming ? 'text-[var(--color-info)]' : 'text-[var(--color-text-secondary)]'
        )}>
          Reasoning
        </span>

        {/* Model name */}
        {modelName && (
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {modelName}
          </span>
        )}

        {/* Right side */}
        <span className="ml-auto flex items-center gap-2 text-[9px] font-mono">
          {thinking && (
            <span className="text-[var(--color-text-dim)]">{charDisplay} chars</span>
          )}
          {thinking && !isStreaming && (
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'p-0.5 rounded text-[var(--color-text-muted)]',
                'hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
                'transition-colors opacity-0 group-hover/thinking:opacity-100'
              )}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? <Check size={10} className="text-[var(--color-success)]" /> : <Copy size={10} />}
            </button>
          )}
        </span>
      </div>
      
      {/* Content */}
      {!isCollapsed && (
        <div className="ml-3 mt-0.5 border-l border-[var(--color-border-subtle)] pl-2">
          {thinking ? (
            <pre className="text-[11px] whitespace-pre-wrap break-words text-[var(--color-text-reasoning)] leading-relaxed max-h-[400px] overflow-y-auto scrollbar-thin py-0.5 italic">
              {thinking}
              {isStreaming && (
                <span 
                  className="inline-block w-[2px] h-[12px] bg-[var(--color-info)] animate-pulse ml-0.5 align-middle"
                  style={{ animationDuration: '800ms' }}
                  aria-hidden="true"
                />
              )}
            </pre>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] py-1">
              <span className="w-1.5 h-1.5 bg-[var(--color-info)] animate-pulse rounded-full" />
              <span className="text-[var(--color-text-placeholder)]">reasoning...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ThinkingPanel = memo(ThinkingPanelComponent);
