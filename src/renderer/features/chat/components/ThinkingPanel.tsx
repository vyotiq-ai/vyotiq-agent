/**
 * ThinkingPanel Component
 * 
 * Displays the model's thinking/reasoning content in a collapsible panel.
 * Follows the terminal/CLI design language matching ToolItem.
 * Features smooth transitions and visual feedback for streaming state.
 */
import React, { memo, useState, useCallback, useEffect, useRef } from 'react';
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
  const contentRef = useRef<HTMLPreElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  // Auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) setIsCollapsed(false);
  }, [isStreaming]);

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinking, isStreaming]);

  // Check if content is scrollable
  useEffect(() => {
    if (contentRef.current) {
      setShowScrollHint(contentRef.current.scrollHeight > contentRef.current.clientHeight);
    }
  }, [thinking, isCollapsed]);

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
    <div className={cn(
      'group/thinking font-mono min-w-0',
      'transition-all duration-300 ease-out'
    )}>
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'flex items-center gap-1.5 py-0.5 min-w-0 w-full cursor-pointer',
          'hover:bg-[var(--color-surface-1)]/30 rounded-sm px-1 -mx-1',
          'transition-all duration-200',
          'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25',
          isStreaming && 'bg-[var(--color-info)]/5'
        )}
        onClick={handleToggle}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleToggle())}
        aria-expanded={!isCollapsed}
      >
        {/* Label */}
        <span className={cn(
          'text-[11px] font-medium transition-colors duration-200',
          isStreaming ? 'text-[var(--color-info)]' : 'text-[var(--color-text-secondary)]'
        )}>
          Reasoning
        </span>

        {/* Model name */}
        {modelName && (
          <span className="text-[10px] text-[var(--color-text-muted)] transition-opacity duration-200">
            {modelName}
          </span>
        )}

        {/* Right side */}
        <span className="ml-auto flex items-center gap-2 text-[9px] font-mono">
          {thinking && (
            <span className={cn(
              'text-[var(--color-text-dim)] tabular-nums transition-all duration-200',
              isStreaming && 'text-[var(--color-info)]/70'
            )}>
              {charDisplay} chars
            </span>
          )}
          <span className="text-[var(--color-text-dim)]/70">
            {isCollapsed ? 'show' : 'hide'}
          </span>
          {thinking && !isStreaming && (
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'px-1 py-0.5 rounded text-[var(--color-text-muted)] text-[9px]',
                'hover:text-[var(--color-text-secondary)]',
                'transition-all duration-150 opacity-0 group-hover/thinking:opacity-100',
                'active:scale-95'
              )}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? 'copied' : 'copy'}
            </button>
          )}
        </span>
      </div>
      
      {/* Content with smooth expand/collapse */}
      <div className={cn(
        'overflow-hidden transition-all duration-300 ease-out',
        isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
      )}>
        <div className="ml-3 mt-0.5 border-l border-[var(--color-border-subtle)] pl-2 relative">
          {thinking ? (
            <>
              <pre 
                ref={contentRef}
                className={cn(
                  'text-[11px] whitespace-pre-wrap break-words',
                  'text-[var(--color-text-reasoning)] leading-relaxed',
                  'max-h-[400px] overflow-y-auto scrollbar-thin py-0.5 italic',
                  'transition-all duration-200'
                )}
              >
                {thinking}
                {isStreaming && (
                  <span 
                    className="inline-block w-[2px] h-[12px] bg-[var(--color-info)] ml-0.5 align-middle opacity-70"
                    aria-hidden="true"
                  />
                )}
              </pre>
              {/* Scroll hint gradient */}
              {showScrollHint && !isStreaming && (
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--color-surface-base)] to-transparent pointer-events-none" />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const ThinkingPanel = memo(ThinkingPanelComponent);
ThinkingPanel.displayName = 'ThinkingPanel';
