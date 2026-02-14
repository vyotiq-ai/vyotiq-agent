/**
 * ThinkingPanel Component
 * 
 * Displays the model's reasoning/thinking content with a collapsible panel.
 * Supports streaming state with a pulsing indicator while the model is thinking.
 * Used to show extended thinking from models like Gemini, Claude, DeepSeek.
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { MarkdownRenderer } from '../../../components/ui/MarkdownRenderer';

interface ThinkingPanelProps {
  /** The thinking/reasoning text content */
  content: string;
  /** Whether thinking is currently being streamed */
  isStreaming?: boolean;
  /** Whether the panel starts expanded */
  defaultExpanded?: boolean;
  /** Additional CSS class */
  className?: string;
}

const ThinkingPanelInternal: React.FC<ThinkingPanelProps> = ({
  content,
  isStreaming = false,
  defaultExpanded = false,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const truncatedPreview = useMemo(() => {
    if (!content) return '';
    const firstLine = content.split('\n')[0] ?? '';
    return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;
  }, [content]);

  if (!content && !isStreaming) return null;

  return (
    <div
      className={cn(
        'rounded border font-mono text-[10px]',
        'border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-1)]',
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
        {isExpanded
          ? <ChevronDown size={10} className="shrink-0" />
          : <ChevronRight size={10} className="shrink-0" />
        }
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
        {!isExpanded && truncatedPreview && (
          <span className="ml-1 truncate opacity-40 text-[9px]">
            {truncatedPreview}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div
          className={cn(
            'px-2 pb-2 text-[10px] leading-relaxed overflow-auto',
            'text-[var(--color-text-secondary)]',
            'max-h-[300px]',
          )}
        >
          <MarkdownRenderer content={content} compact />
        </div>
      )}
    </div>
  );
};

export const ThinkingPanel = memo(ThinkingPanelInternal);
ThinkingPanel.displayName = 'ThinkingPanel';
