/**
 * DiffViewer Component
 *
 * Real-time inline diff viewer that streams line-by-line changes as
 * files are created or edited by the agent. Supports:
 * - Semantic line-level diff with LCS alignment
 * - Word-level inline highlighting for modified lines
 * - Context lines with expand/collapse
 * - Streaming mode for real-time updates during tool execution
 * - Accept/reject actions for file changes
 * - Hunk-based navigation
 */
import React, { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  FileText,
  FilePlus,
  ChevronRight,
  Check,
  Undo2,
  Copy,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import {
  buildSemanticDiffLines,
  computeDiffStats,
  type DiffLine,
  type DiffStats,
  type InlineDiffResult,
} from './diffUtils';

// =============================================================================
// Exported Types
// =============================================================================

export interface DiffViewerProps {
  /** File path for display */
  filePath: string;
  /** Original file content (empty string for new files) */
  originalContent: string;
  /** Modified file content */
  modifiedContent: string;
  /** Whether this is a newly created file */
  isNewFile?: boolean;
  /** Unique ID for persisting expand/collapse state */
  diffId?: string;
  /** Accept callback */
  onAccept?: () => void;
  /** Reject callback */
  onReject?: () => void;
  /** Open file in editor callback */
  onEdit?: () => void;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Enable streaming mode — content is still arriving */
  isStreaming?: boolean;
  /** Additional CSS class */
  className?: string;
}

export interface DiffActionState {
  accepted: boolean;
  rejected: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONTEXT_LINES = 3;
const MAX_COLLAPSED_LINES = 12;
const MAX_EXPANDED_LINES = 500;
const NEW_FILE_MAX_LINES = 20;

// =============================================================================
// Sub-Components
// =============================================================================

/** Renders inline diff highlights within a single line */
const InlineDiffSpan = memo<{
  parts: InlineDiffResult['oldParts'] | InlineDiffResult['newParts'];
  side: 'old' | 'new';
}>(({ parts, side }) => (
  <>
    {parts.map((part, i) => {
      const isHighlight =
        (side === 'old' && part.type === 'removed') ||
        (side === 'new' && part.type === 'added');
      return (
        <span
          key={i}
          className={cn(
            isHighlight && side === 'old' && 'bg-[var(--color-diff-removed-word-bg)] text-[var(--color-diff-removed-word-text)] rounded-[2px] ring-1 ring-[var(--color-diff-removed-word-ring)]',
            isHighlight && side === 'new' && 'bg-[var(--color-diff-added-word-bg)] text-[var(--color-diff-added-word-text)] rounded-[2px] ring-1 ring-[var(--color-diff-added-word-ring)]',
          )}
        >
          {part.text}
        </span>
      );
    })}
  </>
));
InlineDiffSpan.displayName = 'InlineDiffSpan';

/** Single diff line row */
const DiffLineRow = memo<{
  line: DiffLine;
  isLast?: boolean;
  onExpandClick?: () => void;
}>(({ line, isLast, onExpandClick }) => {
  if (line.type === 'expand') {
    return (
      <button
        type="button"
        onClick={onExpandClick}
        className={cn(
          'flex items-center w-full gap-2 px-2 py-0.5 text-[9px] font-mono',
          'text-[var(--color-diff-expand-text)] bg-[var(--color-diff-expand-bg)]',
          'hover:bg-[var(--color-diff-expand-bg-hover)] transition-colors duration-100',
          'border-y border-[var(--color-diff-expand-border)]',
        )}
      >
        <span className="opacity-60">···</span>
        <span>{line.hiddenLines} lines hidden</span>
        <span className="opacity-60">···</span>
      </button>
    );
  }

  const isAdded = line.type === 'added';
  const isRemoved = line.type === 'removed';
  const isContext = line.type === 'context';

  // Determine indicator character
  const indicator = isAdded ? '+' : isRemoved ? '−' : ' ';

  return (
    <div
      className={cn(
        'flex font-mono text-[10px] leading-[1.65] group/line',
        'transition-colors duration-75',
        isAdded && 'bg-[var(--color-diff-added-bg)] hover:bg-[var(--color-diff-added-bg-hover)]',
        isRemoved && 'bg-[var(--color-diff-removed-bg)] hover:bg-[var(--color-diff-removed-bg-hover)]',
        isContext && 'hover:bg-[var(--color-surface-1)]/30',
        isLast && 'rounded-b',
      )}
    >
      {/* Old line number gutter */}
      <span
        className={cn(
          'w-[36px] text-right pr-1 select-none flex-shrink-0 tabular-nums',
          'text-[9px] leading-[1.65]',
          isAdded && 'bg-[var(--color-diff-added-gutter-bg)] text-transparent',
          isRemoved && 'bg-[var(--color-diff-removed-gutter-bg)] text-[var(--color-diff-removed-gutter)]',
          isContext && 'text-[var(--color-text-dim)]/40',
        )}
      >
        {line.oldLineNum ?? ''}
      </span>

      {/* New line number gutter */}
      <span
        className={cn(
          'w-[36px] text-right pr-1 select-none flex-shrink-0 tabular-nums',
          'text-[9px] leading-[1.65]',
          isAdded && 'bg-[var(--color-diff-added-gutter-bg)] text-[var(--color-diff-added-gutter)]',
          isRemoved && 'bg-[var(--color-diff-removed-gutter-bg)] text-transparent',
          isContext && 'text-[var(--color-text-dim)]/40',
        )}
      >
        {line.newLineNum ?? ''}
      </span>

      {/* Indicator column */}
      <span
        className={cn(
          'w-[16px] text-center select-none flex-shrink-0',
          'text-[10px] leading-[1.65] font-medium',
          isAdded && 'text-[var(--color-diff-added-indicator)]',
          isRemoved && 'text-[var(--color-diff-removed-indicator)]',
          isContext && 'text-transparent',
        )}
      >
        {indicator}
      </span>

      {/* Content */}
      <span
        className={cn(
          'flex-1 whitespace-pre px-1.5 overflow-x-auto',
          isAdded && 'text-[var(--color-diff-added-text-content)]',
          isRemoved && 'text-[var(--color-diff-removed-text-content)]',
          isContext && 'text-[var(--color-text-secondary)]',
        )}
      >
        {line.inlineDiff ? (
          <InlineDiffSpan
            parts={isRemoved ? line.inlineDiff.oldParts : line.inlineDiff.newParts}
            side={isRemoved ? 'old' : 'new'}
          />
        ) : (
          line.content
        )}
      </span>
    </div>
  );
});
DiffLineRow.displayName = 'DiffLineRow';

/** Stats badge */
const DiffStatsBadge = memo<{ stats: DiffStats; isNewFile?: boolean }>(({ stats, isNewFile }) => {
  if (isNewFile) {
    return (
      <span className="text-[8px] font-mono text-[var(--color-diff-added-text)] opacity-70 tabular-nums">
        +{stats.added}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[8px] font-mono tabular-nums">
      {stats.added > 0 && (
        <span className="text-[var(--color-diff-added-text)] opacity-70">+{stats.added}</span>
      )}
      {stats.removed > 0 && (
        <span className="text-[var(--color-diff-removed-text)] opacity-70">−{stats.removed}</span>
      )}
      {stats.added === 0 && stats.removed === 0 && (
        <span className="text-[var(--color-text-dim)] opacity-50">no changes</span>
      )}
    </span>
  );
});
DiffStatsBadge.displayName = 'DiffStatsBadge';

/** Streaming progress indicator */
const StreamingIndicator = memo(() => (
  <span className="flex items-center gap-1 text-[8px] text-[var(--color-accent-primary)] opacity-80">
    <span className="inline-block w-1 h-1 rounded-full bg-current animate-pulse" />
    streaming
  </span>
));
StreamingIndicator.displayName = 'StreamingIndicator';

// =============================================================================
// Main Component
// =============================================================================

export const DiffViewer: React.FC<DiffViewerProps> = memo(({
  filePath,
  originalContent,
  modifiedContent,
  isNewFile = false,
  diffId,
  onAccept,
  onReject,
  onEdit,
  defaultCollapsed = false,
  isStreaming = false,
  className,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isFullyExpanded, setIsFullyExpanded] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevLineCountRef = useRef(0);

  // Extract filename from path
  const fileName = useMemo(() => {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }, [filePath]);

  // Compute diff lines
  const diffLines = useMemo(() => {
    if (isNewFile && !originalContent) {
      // New file — show all lines as added
      const lines = modifiedContent.split('\n');
      return lines.map((line, i): DiffLine => ({
        type: 'added',
        content: line,
        newLineNum: i + 1,
      }));
    }
    return buildSemanticDiffLines(originalContent, modifiedContent, DEFAULT_CONTEXT_LINES);
  }, [originalContent, modifiedContent, isNewFile]);

  // Compute stats
  const stats = useMemo(
    () => computeDiffStats(originalContent, modifiedContent),
    [originalContent, modifiedContent],
  );

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && scrollContainerRef.current && diffLines.length > prevLineCountRef.current) {
      const el = scrollContainerRef.current;
      // Only auto-scroll if user is near the bottom
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
    prevLineCountRef.current = diffLines.length;
  }, [isStreaming, diffLines.length]);

  // Determine visible lines
  const visibleLines = useMemo(() => {
    if (isCollapsed) return [];

    // Expand any sections the user has clicked
    let lines: DiffLine[];
    if (expandedSections.size === 0) {
      lines = diffLines;
    } else {
      lines = [];
      for (const line of diffLines) {
        if (line.type === 'expand' && line.expandIndex != null && expandedSections.has(line.expandIndex)) {
          // Replace expand marker with its hidden context lines
          if (line.hiddenLineData && line.hiddenLineData.length > 0) {
            lines.push(...line.hiddenLineData);
          }
        } else {
          lines.push(line);
        }
      }
    }

    // For new files, cap initial display
    if (isNewFile && !isFullyExpanded && lines.length > NEW_FILE_MAX_LINES) {
      return lines.slice(0, NEW_FILE_MAX_LINES);
    }

    // Cap total lines for performance
    if (!isFullyExpanded && lines.length > MAX_EXPANDED_LINES) {
      return lines.slice(0, MAX_EXPANDED_LINES);
    }

    return lines;
  }, [diffLines, isCollapsed, isFullyExpanded, isNewFile, expandedSections]);

  const hasMore = diffLines.length > visibleLines.length;
  const remainingCount = diffLines.length - visibleLines.length;

  // Handlers
  const toggleCollapse = useCallback(() => setIsCollapsed(prev => !prev), []);
  const toggleFullExpand = useCallback(() => setIsFullyExpanded(prev => !prev), []);

  const handleExpandSection = useCallback((index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(modifiedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [modifiedContent]);

  // Don't render if there's nothing to show
  if (!modifiedContent && !originalContent) return null;

  return (
    <div
      className={cn(
        'ml-4 mt-1.5 mb-2 rounded-md overflow-hidden',
        'border border-[var(--color-border-subtle)]/30',
        'bg-[var(--color-surface-editor)]',
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5',
          'bg-[var(--color-surface-1)]/40',
          'border-b border-[var(--color-border-subtle)]/20',
          'cursor-pointer select-none',
        )}
        onClick={toggleCollapse}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} diff for ${fileName}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCollapse();
          }
        }}
      >
        {/* Collapse indicator */}
        <ChevronRight
          size={10}
          className={cn(
            'text-[var(--color-text-dim)]/60 flex-shrink-0 transition-transform duration-150',
            !isCollapsed && 'rotate-90',
          )}
        />

        {/* File icon */}
        {isNewFile ? (
          <FilePlus size={11} className="text-[var(--color-diff-added-text)]/70 flex-shrink-0" />
        ) : (
          <FileText size={11} className="text-[var(--color-diff-modified-text)]/70 flex-shrink-0" />
        )}

        {/* Filename */}
        <code className="text-[10px] font-mono text-[var(--color-text-secondary)]/80 truncate flex-1">
          {fileName}
        </code>

        {/* Stats + streaming indicator */}
        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {isStreaming && <StreamingIndicator />}
          <DiffStatsBadge stats={stats} isNewFile={isNewFile} />

          {/* Actions */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {/* Copy */}
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'px-1.5 py-0.5 rounded-md text-[9px] font-mono',
                'transition-all duration-150',
                'text-[var(--color-text-dim)]/60 hover:text-[var(--color-text-secondary)]',
                'hover:bg-[var(--color-surface-2)]/40',
              )}
              title="Copy modified content"
            >
              {copied ? 'copied' : 'copy'}
            </button>

            {/* Accept */}
            {onAccept && (
              <button
                type="button"
                onClick={onAccept}
                className={cn(
                  'p-0.5 rounded-md transition-all duration-150',
                  'text-[var(--color-diff-added-text)]/60',
                  'hover:text-[var(--color-diff-added-text)] hover:bg-[var(--color-diff-added-text)]/10',
                )}
                title="Accept changes"
                aria-label="Accept file changes"
              >
                <Check size={11} />
              </button>
            )}

            {/* Reject */}
            {onReject && (
              <button
                type="button"
                onClick={onReject}
                className={cn(
                  'p-0.5 rounded-md transition-all duration-150',
                  'text-[var(--color-diff-removed-text)]/60',
                  'hover:text-[var(--color-diff-removed-text)] hover:bg-[var(--color-diff-removed-text)]/10',
                )}
                title="Reject changes"
                aria-label="Reject file changes"
              >
                <Undo2 size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Diff content */}
      {!isCollapsed && (
        <div
          ref={scrollContainerRef}
          className={cn(
            'overflow-auto',
            'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent',
            isFullyExpanded ? 'max-h-[600px]' : 'max-h-[350px]',
          )}
        >
          {visibleLines.length === 0 && !isStreaming ? (
            <div className="flex items-center justify-center py-4 text-[var(--color-text-dim)] text-[10px] font-mono">
              no changes
            </div>
          ) : (
            <div className="min-w-0">
              {visibleLines.map((line, idx) => (
                <DiffLineRow
                  key={`${line.type}-${line.oldLineNum ?? ''}-${line.newLineNum ?? ''}-${line.expandIndex ?? idx}`}
                  line={line}
                  isLast={idx === visibleLines.length - 1 && !hasMore}
                  onExpandClick={line.type === 'expand' && line.expandIndex != null ? () => handleExpandSection(line.expandIndex!) : undefined}
                />
              ))}

              {/* Streaming cursor */}
              {isStreaming && (
                <div className="flex items-center px-[88px] py-0.5 text-[10px] font-mono">
                  <span className="inline-block w-[5px] h-[13px] bg-[var(--color-accent-primary)] opacity-70 animate-pulse rounded-[1px]" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer — expand/collapse for long diffs */}
      {!isCollapsed && hasMore && (
        <button
          type="button"
          onClick={toggleFullExpand}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 px-3 py-1',
            'text-[9px] font-mono text-[var(--color-text-dim)]/60',
            'hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]/30',
            'border-t border-[var(--color-border-subtle)]/15 transition-all duration-150',
          )}
        >
          {isFullyExpanded ? (
            <>
              <ChevronUp size={9} />
              <span>collapse</span>
            </>
          ) : (
            <>
              <ChevronDown size={9} />
              <span>{remainingCount} more line{remainingCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
});

DiffViewer.displayName = 'DiffViewer';
