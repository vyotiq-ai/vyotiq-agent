import React, { memo, useState } from 'react';
import { ChevronDown, ChevronRight, CloudDownload, ExternalLink } from 'lucide-react';
import { MarkdownRenderer } from '../../../../components/ui/MarkdownRenderer';

/**
 * Live Fetch preview for web content extraction
 */
export const LiveFetchPreview: React.FC<{
  url: string;
  title: string;
  contentLength: number;
  headingCount?: number;
  linkCount?: number;
  output: string;
}> = memo(({ url, title, contentLength, headingCount, linkCount, output }) => {
  const [showContent, setShowContent] = useState(false);

  return (
    <div className="ml-6 mt-1 mb-2 rounded-md overflow-hidden border border-[var(--color-border-subtle)]">
      {/* Header */}
      <div className="px-2 py-1.5 bg-[var(--color-surface-2)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2">
          <CloudDownload size={10} className="text-[var(--color-accent-primary)]" />
          <span className="text-[9px] font-medium text-[var(--color-text-secondary)]">
            {title ? title.slice(0, 40) : 'Web Content'}
            {title && title.length > 40 ? '...' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[8px] text-[var(--color-text-dim)]">
            {(contentLength / 1000).toFixed(1)}k chars
          </span>
          {headingCount !== undefined && (
            <span className="text-[8px] text-[var(--color-text-dim)]">
              {headingCount} sections
            </span>
          )}
          {linkCount !== undefined && (
            <span className="text-[8px] text-[var(--color-text-dim)]">
              {linkCount} links
            </span>
          )}
        </div>
      </div>

      {/* URL */}
      {url && (
        <div className="flex items-center justify-between px-2 py-1 bg-[var(--color-surface-1)]">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[8px] text-[var(--color-accent-primary)] hover:underline truncate flex-1"
          >
            {url}
          </a>
          <ExternalLink size={8} className="text-[var(--color-text-dim)] ml-1 flex-shrink-0" />
        </div>
      )}

      {/* Content toggle */}
      <button
        onClick={() => setShowContent(!showContent)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[8px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] transition-colors border-t border-[var(--color-border-subtle)]"
      >
        {showContent ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>{showContent ? 'Hide content preview' : 'Show content preview'}</span>
      </button>

      {showContent && (
        <div className="p-2 bg-[var(--color-surface-1)] max-h-[150px] overflow-y-auto scrollbar-thin border-t border-[var(--color-border-subtle)]">
          <MarkdownRenderer content={output.slice(0, 2000)} compact />
        </div>
      )}
    </div>
  );
});

LiveFetchPreview.displayName = 'LiveFetchPreview';
