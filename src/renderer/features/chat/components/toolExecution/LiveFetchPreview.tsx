import React, { memo, useState } from 'react';
import { ChevronRight, CloudDownload, ExternalLink } from 'lucide-react';
import { cn } from '../../../../utils/cn';
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
    <div className="ml-5 mt-1.5 mb-2 rounded-md overflow-hidden border border-[var(--color-border-subtle)]/30 bg-[var(--color-surface-editor)]">
      {/* Header */}
      <div className="px-2.5 py-1.5 bg-[var(--color-surface-1)]/40 border-b border-[var(--color-border-subtle)]/20">
        <div className="flex items-center gap-2">
          <CloudDownload size={10} className="text-[var(--color-accent-primary)]/70" />
          <span className="text-[9px] font-medium text-[var(--color-text-secondary)]/80">
            {title ? title.slice(0, 40) : 'Web Content'}
            {title && title.length > 40 ? '...' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[8px] text-[var(--color-text-dim)]/60">
            {(contentLength / 1000).toFixed(1)}k chars
          </span>
          {headingCount !== undefined && (
            <span className="text-[8px] text-[var(--color-text-dim)]/60">
              {headingCount} sections
            </span>
          )}
          {linkCount !== undefined && (
            <span className="text-[8px] text-[var(--color-text-dim)]/60">
              {linkCount} links
            </span>
          )}
        </div>
      </div>

      {/* URL */}
      {url && (
        <div className="flex items-center justify-between px-2.5 py-1 bg-[var(--color-surface-1)]/20">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[8px] text-[var(--color-accent-primary)]/80 hover:text-[var(--color-accent-primary)] hover:underline truncate flex-1 transition-colors duration-150"
          >
            {url}
          </a>
          <ExternalLink size={8} className="text-[var(--color-text-dim)]/40 ml-1 flex-shrink-0" />
        </div>
      )}

      {/* Content toggle */}
      <button
        onClick={() => setShowContent(!showContent)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1 text-[8px] text-[var(--color-text-muted)]/70 hover:bg-[var(--color-surface-1)]/30 transition-all duration-150 border-t border-[var(--color-border-subtle)]/20"
      >
        <ChevronRight
          size={9}
          className={cn(
            'transition-transform duration-150',
            showContent && 'rotate-90'
          )}
        />
        <span>{showContent ? 'hide preview' : 'show preview'}</span>
      </button>

      {showContent && (
        <div className="p-2.5 bg-[var(--color-surface-1)]/20 max-h-[150px] overflow-y-auto scrollbar-thin border-t border-[var(--color-border-subtle)]/15">
          <MarkdownRenderer content={output.slice(0, 2000)} compact />
        </div>
      )}
    </div>
  );
});

LiveFetchPreview.displayName = 'LiveFetchPreview';
