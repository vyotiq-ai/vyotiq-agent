/**
 * ThinkingPanel Component
 *
 * Displays the assistant's reasoning/thinking content in a collapsible panel.
 * Follows the existing terminal aesthetic with monospace fonts and CSS variable theming.
 */
import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { MarkdownRenderer } from '../../../components/ui/MarkdownRenderer';

interface ThinkingPanelProps {
    /** The thinking/reasoning content */
    content: string;
    /** Whether the thinking content is currently streaming */
    isStreaming?: boolean;
    /** Additional CSS classes */
    className?: string;
}

const ThinkingPanelInternal: React.FC<ThinkingPanelProps> = ({
    content,
    isStreaming = false,
    className,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom during streaming
    useEffect(() => {
        if (isStreaming && isExpanded && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [content, isStreaming, isExpanded]);

    const toggleExpand = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);

    const trimmedContent = content.trim();
    if (!trimmedContent) return null;

    return (
        <div
            className={cn(
                'rounded-sm border font-mono',
                'border-[var(--color-border-subtle)]',
                'bg-[var(--color-surface-base)]',
                isStreaming && 'border-[var(--color-accent-primary)]/20',
                className,
            )}
        >
            {/* Header */}
            <button
                type="button"
                onClick={toggleExpand}
                className={cn(
                    'w-full flex items-center gap-1.5 px-1.5 py-0.5 text-left',
                    'text-[9px] text-[var(--color-text-muted)]',
                    'hover:bg-[var(--color-surface-2)] transition-colors',
                )}
                aria-expanded={isExpanded}
            >
                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <Brain size={9} style={{ color: 'var(--color-accent-secondary, var(--color-accent-primary))' }} />
                <span className="uppercase tracking-wider">thinking</span>
                {isStreaming && (
                    <span className="text-[8px] text-[var(--color-accent-primary)] animate-pulse ml-1">
                        streaming...
                    </span>
                )}
            </button>

            {/* Content */}
            {isExpanded && (
                <div
                    ref={contentRef}
                    className={cn(
                        'px-2 py-1 text-[10px] leading-relaxed',
                        'text-[var(--color-text-secondary)]',
                        'max-h-[300px] overflow-y-auto',
                        'border-t border-[var(--color-border-subtle)]',
                    )}
                >
                    <MarkdownRenderer content={trimmedContent} compact />
                    {isStreaming && (
                        <span className="streaming-cursor text-[var(--color-accent-primary)]">▍</span>
                    )}
                </div>
            )}
        </div>
    );
};

export const ThinkingPanel = memo(ThinkingPanelInternal);
ThinkingPanel.displayName = 'ThinkingPanel';
