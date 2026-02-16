/**
 * ThinkingPanel Component
 * 
 * Displays the model's reasoning/thinking content with a collapsible panel.
 * Supports streaming state with a pulsing indicator while the model is thinking.
 * Always starts expanded (uncollapsed) by default so the user can see reasoning.
 * Expands with a smooth height transition on click.
 * Used to show extended thinking from models like Gemini, Claude, DeepSeek.
 */
import React, { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { MarkdownRenderer } from '../../../components/ui/MarkdownRenderer';

interface ThinkingPanelProps {
  /** The thinking/reasoning text content */
  content: string;
  /** Whether thinking is currently being streamed */
  isStreaming?: boolean;
  /** Whether the panel starts expanded — always true by default */
  defaultExpanded?: boolean;
  /** Additional CSS class */
  className?: string;
}

const ThinkingPanelInternal: React.FC<ThinkingPanelProps> = ({
  content,
  isStreaming = false,
  defaultExpanded = true,
  className,
}) => {
  // Always start expanded (uncollapsed) by default
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Measure content height for smooth transition
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentHeight(entry.contentRect.height);
      }
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll the content pane to bottom when streaming new content while expanded
  useEffect(() => {
    if (isExpanded && isStreaming && contentRef.current) {
      const el = contentRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [isExpanded, isStreaming, content]);

  const truncatedPreview = useMemo(() => {
    if (!content) return '';
    const firstLine = content.split('\n')[0] ?? '';
    return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;
  }, [content]);

  // Word count for thinking content
  const wordCount = useMemo(() => {
    if (!content) return 0;
    return content.split(/\s+/).filter(Boolean).length;
  }, [content]);

  if (!content && !isStreaming) return null;

  return (
    <div
      className={cn(
        'rounded border font-mono text-[10px]',
        'border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-1)]',
        'transition-all duration-200 ease-out',
        className,
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          'flex items-center gap-1.5 w-full px-2 py-1 text-left',
          'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          'transition-colors duration-100',
        )}
      >
        <span className={cn(
          'shrink-0 transition-transform duration-150',
          isExpanded && 'rotate-90',
        )}>
          <ChevronRight size={10} />
        </span>
        <Brain size={10} className="shrink-0" style={{ color: 'var(--color-accent-primary)' }} />
        <span className="text-[9px] uppercase tracking-wider opacity-70">
          reasoning
        </span>
        {isStreaming && (
          <span
            className="ml-1 h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: 'var(--color-accent-primary)' }}
          />
        )}
        {/* Word count badge */}
        {wordCount > 0 && (
          <span className="ml-1 text-[8px] tabular-nums text-[var(--color-text-dim)]">
            {wordCount}w
          </span>
        )}
        {!isExpanded && truncatedPreview && (
          <span className="ml-1 truncate opacity-40 text-[9px]">
            {truncatedPreview}
          </span>
        )}
      </button>

      {/* Content with smooth height transition */}
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out"
        style={{
          maxHeight: isExpanded ? `${contentHeight + 16}px` : '0px',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div
          ref={contentRef}
          className={cn(
            'px-2 pb-2 text-[10px] leading-relaxed',
            'text-[var(--color-text-secondary)]',
          )}
        >
          <MarkdownRenderer content={content} compact />
        </div>
      </div>
    </div>
  );
};

export const ThinkingPanel = memo(ThinkingPanelInternal);
ThinkingPanel.displayName = 'ThinkingPanel';
