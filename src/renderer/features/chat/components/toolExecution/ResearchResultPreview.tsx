import React, { memo, useState } from 'react';
import { BookOpen, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { MarkdownRenderer } from '../../../../components/ui/MarkdownRenderer';

/**
 * Research result preview for deep_research tool
 */
export const ResearchResultPreview: React.FC<{
  query: string;
  sources: Array<{ url: string; title: string; accessed?: number }>;
  findings?: Array<{ title: string; content: string; source: string; relevance: number }>;
  depth?: string;
  output: string;
}> = memo(({ query, sources, depth, output }) => {
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="ml-5 mt-1.5 mb-2 rounded-md overflow-hidden border border-[var(--color-border-subtle)]/30 bg-[var(--color-surface-editor)]">
      {/* Header */}
      <div className="px-2.5 py-1.5 bg-[var(--color-surface-1)]/40 border-b border-[var(--color-border-subtle)]/20">
        <div className="flex items-center gap-2">
          <BookOpen size={10} className="text-[var(--color-accent-secondary)]/70" />
          <span className="text-[9px] font-medium text-[var(--color-text-secondary)]/80">
            Research: {query.slice(0, 50)}{query.length > 50 ? '...' : ''}
          </span>
          <span className="text-[8px] text-[var(--color-text-dim)]/60 ml-auto">
            {depth} · {sources.length} sources
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="p-2.5 bg-[var(--color-surface-1)]/20 max-h-[200px] overflow-y-auto scrollbar-thin">
        <MarkdownRenderer content={output.slice(0, 1500)} compact />
      </div>

      {/* Sources toggle */}
      {sources.length > 0 && (
        <div className="border-t border-[var(--color-border-subtle)]/20">
          <button
            onClick={() => setShowSources(!showSources)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1 text-[8px] text-[var(--color-text-muted)]/70 hover:bg-[var(--color-surface-1)]/30 transition-all duration-150"
          >
            <ChevronRight
              size={9}
              className={cn(
                'transition-transform duration-150',
                showSources && 'rotate-90'
              )}
            />
            <span>{sources.length} sources</span>
          </button>
          {showSources && (
            <div className="px-2.5 pb-2 space-y-1">
              {sources.slice(0, 5).map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[8px] text-[var(--color-accent-primary)]/80 hover:text-[var(--color-accent-primary)] hover:underline truncate transition-colors duration-150"
                >
                  <ExternalLink size={8} className="flex-shrink-0" />
                  {source.title || source.url}
                </a>
              ))}
              {sources.length > 5 && (
                <span className="text-[8px] text-[var(--color-text-dim)]/50">
                  +{sources.length - 5} more sources
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ResearchResultPreview.displayName = 'ResearchResultPreview';
