import React, { memo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Globe, Zap } from 'lucide-react';
import { MarkdownRenderer } from '../../../../components/ui/MarkdownRenderer';

/**
 * Auto Fetch preview for intelligent web research
 */
export const AutoFetchPreview: React.FC<{
  query: string;
  focus: string;
  sourceCount: number;
  sources: Array<{ url: string; title: string }>;
  output: string;
}> = memo(({ query, focus, sourceCount, sources, output }) => {
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="ml-6 mt-1 mb-2 rounded-md overflow-hidden border border-[var(--color-border-subtle)]">
      {/* Header */}
      <div className="px-2 py-1.5 bg-gradient-to-r from-[var(--color-surface-2)] to-[var(--color-accent-primary)]/5 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2">
          <Zap size={10} className="text-[var(--color-accent-primary)]" />
          <span className="text-[9px] font-medium text-[var(--color-text-secondary)]">
            Real-time Info: {query.slice(0, 35)}{query.length > 35 ? '...' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[8px] px-1 py-0.5 bg-[var(--color-accent-primary)]/10 rounded text-[var(--color-accent-primary)]">
            {focus}
          </span>
          <span className="text-[8px] text-[var(--color-text-dim)]">
            {sourceCount} source{sourceCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Summary content */}
      <div className="p-2 bg-[var(--color-surface-1)] max-h-[200px] overflow-y-auto scrollbar-thin">
        <MarkdownRenderer content={output.slice(0, 2000)} compact />
      </div>

      {/* Sources toggle */}
      {sources && sources.length > 0 && (
        <div className="border-t border-[var(--color-border-subtle)]">
          <button
            onClick={() => setShowSources(!showSources)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[8px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            {showSources ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <Globe size={9} />
            <span>{sources.length} sources consulted</span>
          </button>
          {showSources && (
            <div className="px-2 pb-2 space-y-1">
              {sources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[8px] text-[var(--color-accent-primary)] hover:underline truncate"
                >
                  <ExternalLink size={8} className="flex-shrink-0" />
                  {source.title || source.url}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

AutoFetchPreview.displayName = 'AutoFetchPreview';
