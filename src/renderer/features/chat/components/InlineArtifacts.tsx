/**
 * InlineArtifacts Component
 * 
 * Renders inline artifacts (file, code, image, table, html, markdown)
 * within message lines. These are artifacts created during tool execution
 * that should be displayed directly in the chat flow.
 * 
 * Follows the terminal aesthetic with monospace fonts and CSS variable theming.
 */
import React, { memo, useState, useCallback } from 'react';
import {
  FileText,
  Code,
  Image,
  Table,
  Globe,
  FileCode,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import type { InlineArtifactState } from '../../../state/types';
import { MarkdownRenderer } from '../../../components/ui/MarkdownRenderer';

// =============================================================================
// Types
// =============================================================================

interface InlineArtifactsProps {
  /** The inline artifacts to render */
  artifacts: InlineArtifactState[];
  /** Additional CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const typeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  file: { icon: FileText, color: 'var(--color-info)', label: 'FILE' },
  code: { icon: Code, color: 'var(--color-accent-primary)', label: 'CODE' },
  image: { icon: Image, color: 'var(--color-accent-tertiary)', label: 'IMAGE' },
  table: { icon: Table, color: 'var(--color-warning)', label: 'TABLE' },
  html: { icon: Globe, color: 'var(--color-error)', label: 'HTML' },
  markdown: { icon: FileCode, color: 'var(--color-accent-secondary)', label: 'MD' },
};

function formatSize(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// =============================================================================
// Sub-component: Single Inline Artifact
// =============================================================================

const InlineArtifactItem: React.FC<{
  artifact: InlineArtifactState;
}> = memo(({ artifact }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const config = typeConfig[artifact.type] ?? typeConfig.file;
  const Icon = config.icon;
  const sizeStr = formatSize(artifact.size);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact.content]);

  return (
    <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(p => !p)}
        className="flex items-center gap-1.5 px-2 py-1 w-full text-left hover:bg-[var(--color-surface-2)] transition-colors duration-100"
      >
        {isExpanded ? (
          <ChevronDown size={9} className="shrink-0 text-[var(--color-text-dim)]" />
        ) : (
          <ChevronRight size={9} className="shrink-0 text-[var(--color-text-dim)]" />
        )}
        <Icon size={10} className="shrink-0" style={{ color: config.color }} />
        <span className="text-[8px] uppercase tracking-wider" style={{ color: config.color }}>
          {config.label}
        </span>
        <span className="text-[10px] text-[var(--color-text-primary)] truncate flex-1">
          {artifact.title}
        </span>
        {artifact.language && (
          <span className="text-[8px] text-[var(--color-text-dim)] shrink-0">
            {artifact.language}
          </span>
        )}
        {sizeStr && (
          <span className="text-[8px] tabular-nums text-[var(--color-text-dim)] shrink-0">
            {sizeStr}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[var(--color-border-subtle)]">
          {/* Filepath */}
          {artifact.filepath && (
            <div className="flex items-center gap-1 px-2 py-0.5 text-[9px] text-[var(--color-text-muted)]">
              <ExternalLink size={8} />
              <span className="truncate">{artifact.filepath}</span>
            </div>
          )}

          {/* Content based on type */}
          <div className="relative">
            {artifact.type === 'code' || artifact.type === 'file' ? (
              <pre className="px-2 py-1.5 text-[9px] text-[var(--color-text-secondary)] overflow-x-auto max-h-[300px] bg-[var(--color-surface-2)]">
                {artifact.content}
              </pre>
            ) : artifact.type === 'markdown' ? (
              <div className="px-2 py-1.5 text-[10px]">
                <MarkdownRenderer content={artifact.content} compact />
              </div>
            ) : artifact.type === 'image' ? (
              <div className="px-2 py-1.5">
                <img
                  src={artifact.content}
                  alt={artifact.title}
                  className="max-w-full max-h-[300px] rounded"
                />
              </div>
            ) : artifact.type === 'html' ? (
              <div
                className="px-2 py-1.5 text-[10px] text-[var(--color-text-secondary)] max-h-[300px] overflow-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(artifact.content) }}
              />
            ) : (
              <pre className="px-2 py-1.5 text-[9px] text-[var(--color-text-secondary)] overflow-x-auto max-h-[300px] bg-[var(--color-surface-2)]">
                {artifact.content}
              </pre>
            )}

            {/* Copy button */}
            {artifact.type !== 'image' && (
              <button
                type="button"
                onClick={handleCopy}
                className="absolute top-1 right-1 p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
                title={copied ? 'Copied' : 'Copy content'}
              >
                {copied ? <Check size={9} style={{ color: 'var(--color-success)' }} /> : <Copy size={9} />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
InlineArtifactItem.displayName = 'InlineArtifactItem';

// =============================================================================
// Main Component
// =============================================================================

const InlineArtifactsInternal: React.FC<InlineArtifactsProps> = ({
  artifacts,
  className,
}) => {
  if (!artifacts || artifacts.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {artifacts.map(artifact => (
        <InlineArtifactItem key={artifact.id} artifact={artifact} />
      ))}
    </div>
  );
};

export const InlineArtifacts = memo(InlineArtifactsInternal);
InlineArtifacts.displayName = 'InlineArtifacts';
