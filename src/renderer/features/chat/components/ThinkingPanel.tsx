/**
 * ThinkingPanel Component
 * 
 * Displays the model's thinking/reasoning content in a collapsible panel.
 * Used for thinking models like Gemini 2.5/3 that provide thought summaries.
 * 
 * Follows the terminal/CLI design language of the app with:
 * - Compact, dense styling (9-10px fonts)
 * - CSS variable-based theming
 * - Minimal borders and subtle backgrounds
 * - Consistent expand/collapse patterns from ToolExecution
 * 
 * @see https://ai.google.dev/gemini-api/docs/thinking
 */
import React, { memo, useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, Brain, Copy, Check } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface ThinkingPanelProps {
  /** The thinking/reasoning content to display */
  thinking: string;
  /** Whether thinking content is currently being streamed */
  isStreaming?: boolean;
  /** Model name for display (optional) */
  modelName?: string;
  /** Initial collapsed state (default: collapsed) */
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

  // Auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) {
      setIsCollapsed(false);
    }
  }, [isStreaming]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCollapsed(prev => !prev);
  }, []);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [thinking]);

  // Don't render if no thinking content and not streaming
  if (!thinking && !isStreaming) {
    return null;
  }

  // Format character count like tool execution
  const charDisplay = thinking 
    ? thinking.length > 1000 
      ? `${Math.round(thinking.length / 1000)}k` 
      : thinking.length
    : 0;

  return (
    <div className="group/thinking mb-2 font-mono">
      {/* Header row - clickable toggle */}
      <button 
        type="button"
        className={cn(
          'flex items-center gap-2 py-1.5 cursor-pointer w-full text-left',
          'rounded-md px-2.5',
          'bg-[var(--color-accent-secondary)]/10 hover:bg-[var(--color-accent-secondary)]/20',
          'border border-[var(--color-accent-secondary)]/30',
          'transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
        )}
        onClick={handleToggle}
      >
        {/* Expand/collapse indicator - always clickable */}
        <span className="text-[var(--color-accent-secondary)] w-3 flex-shrink-0">
          {isCollapsed ? (
            <ChevronRight size={12} />
          ) : (
            <ChevronDown size={12} />
          )}
        </span>
        
        {/* Status indicator */}
        <Brain size={14} className="text-[var(--color-accent-secondary)] flex-shrink-0" />
        
        {/* Label */}
        <span className={cn(
          'text-[11px] font-semibold',
          isStreaming 
            ? 'text-[var(--color-accent-secondary)]' 
            : 'text-[var(--color-text-primary)]'
        )}>
          {isStreaming ? 'Thinking...' : 'Reasoning'}
        </span>
        
        {/* Model badge (like target in ToolItem) */}
        {modelName && (
          <>
            <span className="text-[var(--color-text-dim)]">·</span>
            <span className="text-[11px] text-[var(--color-text-secondary)]">
              {modelName}
            </span>
          </>
        )}
        
        {/* Character count */}
        {thinking && (
          <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
            {charDisplay} chars
          </span>
        )}
      </button>
      
      {/* Expanded content - improved readability */}
      {!isCollapsed && (
        <div className={cn(
          'mt-2 mb-2 text-[11px] font-mono',
          'bg-[var(--color-surface-1)]/30 rounded-md px-3 py-3',
          'border border-[var(--color-accent-secondary)]/20',
          'max-h-[400px] overflow-y-auto scrollbar-thin'
        )}>
          {/* Copy button - inline like other tools */}
          {thinking && !isStreaming && (
            <div className="flex justify-end mb-1">
              <button
                onClick={handleCopy}
                className={cn(
                  'p-0.5 rounded transition-colors text-[var(--color-text-muted)]',
                  'hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
                title="copy thinking"
              >
                {copied ? (
                  <Check size={10} className="text-[var(--color-success)]" />
                ) : (
                  <Copy size={10} />
                )}
              </button>
            </div>
          )}
          
          {thinking ? (
            <pre className="whitespace-pre-wrap break-words text-[var(--color-text-secondary)] leading-[1.6] tracking-normal">
              {thinking}
            </pre>
          ) : isStreaming ? (
            <div className="flex items-center gap-1.5 text-[var(--color-text-muted)] py-1">
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-[var(--color-accent-secondary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-[var(--color-accent-secondary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-[var(--color-accent-secondary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="text-[var(--color-text-placeholder)]">reasoning...</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export const ThinkingPanel = memo(ThinkingPanelComponent);
