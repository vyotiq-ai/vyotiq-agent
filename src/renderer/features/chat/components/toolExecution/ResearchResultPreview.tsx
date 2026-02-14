import React, { memo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
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
    <div className="ml-6 mt-1 mb-2 rounded-md overflow-hidden border border-[var(--color-border-subtle)]">
      {/* Header */}
      <div className="px-2 py-1.5 bg-[var(--color-surface-2)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2">
          <BookOpen size={10} className="text-[var(--color-accent-secondary)]" />
          <span className="text-[9px] font-medium text-[var(--color-text-secondary)]">
            Research: {query.slice(0, 50)}{query.length > 50 ? '...' : ''}
          </span>
          <span className="text-[8px] text-[var(--color-text-dim)]">
            {depth} • {sources.length} sources
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="p-2 bg-[var(--color-surface-1)] max-h-[200px] overflow-y-auto scrollbar-thin">
        <MarkdownRenderer content={output.slice(0, 1500)} compact />
      </div>

      {/* Sources toggle */}
      {sources.length > 0 && (
        <div className="border-t border-[var(--color-border-subtle)]">
          <button
            onClick={() => setShowSources(!showSources)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[8px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            {showSources ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span>{sources.length} sources</span>
          </button>
          {showSources && (
            <div className="px-2 pb-2 space-y-1">
              {sources.slice(0, 5).map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[8px] text-[var(--color-accent-primary)] hover:underline truncate"
                >
                  <ExternalLink size={8} className="flex-shrink-0" />
                  {source.title || source.url}
                </a>
              ))}
              {sources.length > 5 && (
                <span className="text-[8px] text-[var(--color-text-dim)]">
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
