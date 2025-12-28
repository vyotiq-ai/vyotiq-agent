/**
 * FileDiffPreview Component
 * 
 * Inline diff preview for file write/edit tool results.
 * Shows a compact, expandable diff view within the chat.
 */
import React, { memo, useMemo, useState, useCallback } from 'react';
import { 
  FilePlus, 
  FileCode, 
  Minus, 
  Plus, 
  ChevronDown, 
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { 
  computeDiff, 
  computeDiffStats, 
  filterDiffWithContext, 
  getFileName,
  type DiffLine,
} from '../../../../utils/diff';

export interface FileDiffPreviewProps {
  /** File path */
  path: string;
  /** Original content before change (null for new files) */
  originalContent: string | null;
  /** New content after change */
  newContent: string;
  /** Whether this is a new file creation */
  isNewFile?: boolean;
  /** Action type (write, edit, create) */
  action?: 'write' | 'edit' | 'create' | 'modified' | 'created';
  /** Maximum lines to show before truncating */
  maxLines?: number;
  /** Additional class name */
  className?: string;
  /** Callback to open file in editor */
  onOpenFile?: (path: string) => void;
}

const DiffLineComponent: React.FC<{ line: DiffLine }> = memo(({ line }) => {
  const lineNum = line.lineNumber?.new ?? line.lineNumber?.old ?? '';
  
  return (
    <div
      className={cn(
        'flex font-mono text-[10px] leading-[1.4]',
        line.type === 'added' && 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
        line.type === 'removed' && 'bg-[var(--color-error)]/10 text-[var(--color-error)]',
        line.type === 'unchanged' && 'text-[var(--color-text-dim)]',
        line.type === 'header' && 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] italic py-0.5',
      )}
    >
      {/* Line indicator */}
      <span className="w-4 flex-shrink-0 text-center opacity-60">
        {line.type === 'added' && <Plus size={8} className="inline" />}
        {line.type === 'removed' && <Minus size={8} className="inline" />}
      </span>
      
      {/* Line number */}
      {line.type !== 'header' && (
        <span className="w-8 flex-shrink-0 text-right pr-2 opacity-40 select-none">
          {lineNum}
        </span>
      )}
      
      {/* Content */}
      <span className={cn(
        'flex-1 min-w-0 whitespace-pre overflow-x-auto',
        line.type === 'header' && 'text-center pl-0',
      )}>
        {line.content || ' '}
      </span>
    </div>
  );
});

DiffLineComponent.displayName = 'DiffLineComponent';

export const FileDiffPreview: React.FC<FileDiffPreviewProps> = memo(({
  path,
  originalContent,
  newContent,
  isNewFile,
  action,
  maxLines = 50,
  className,
  onOpenFile,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const fileName = useMemo(() => getFileName(path), [path]);
  
  // Determine if this is a new file
  const isNew = isNewFile ?? (!originalContent || originalContent.length === 0);
  
  // Compute diff
  const diffLines = useMemo(() => {
    if (isNew) {
      // For new files, show all lines as added
      return newContent.split('\n').map((content, idx): DiffLine => ({
        type: 'added',
        content,
        lineNumber: { new: idx + 1 },
      }));
    }
    return computeDiff(originalContent, newContent);
  }, [originalContent, newContent, isNew]);
  
  // Compute stats
  const stats = useMemo(() => computeDiffStats(diffLines), [diffLines]);
  
  // Filter to show context only (unless showing full diff)
  const displayLines = useMemo(() => {
    if (showFullDiff || diffLines.length <= maxLines) {
      return diffLines;
    }
    const filtered = filterDiffWithContext(diffLines, 3);
    return filtered.length <= maxLines ? filtered : filtered.slice(0, maxLines);
  }, [diffLines, showFullDiff, maxLines]);
  
  const isTruncated = !showFullDiff && diffLines.length > maxLines;
  
  // Handle toggle expand
  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);
  
  // Handle open file
  const handleOpenFile = useCallback(() => {
    onOpenFile?.(path);
  }, [path, onOpenFile]);
  
  // Handle copy content
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(newContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [newContent]);
  
  // Get action icon
  const ActionIcon = isNew ? FilePlus : FileCode;
  const actionLabel = isNew 
    ? 'Created' 
    : (action === 'edit' ? 'Edited' : 'Modified');
  
  return (
    <div className={cn(
      'mt-1.5 rounded border border-[var(--color-border-subtle)]',
      'bg-[var(--color-surface-1)]/50 overflow-hidden',
      className,
    )}>
      {/* Header */}
      <button
        type="button"
        className={cn(
          'w-full flex items-center gap-2 px-2 py-1.5',
          'hover:bg-[var(--color-surface-2)]/50 transition-colors',
          'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25',
        )}
        onClick={toggleExpanded}
      >
        {/* Expand icon */}
        <span className="text-[var(--color-text-dim)]">
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        
        {/* File icon */}
        <ActionIcon 
          size={12} 
          className={cn(
            isNew ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
          )} 
        />
        
        {/* File name */}
        <span className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate flex-1 text-left">
          {fileName}
        </span>
        
        {/* Stats */}
        <span className="flex items-center gap-1.5 text-[9px] font-mono">
          {stats.added > 0 && (
            <span className="text-[var(--color-success)]">+{stats.added}</span>
          )}
          {stats.removed > 0 && (
            <span className="text-[var(--color-error)]">-{stats.removed}</span>
          )}
        </span>
        
        {/* Action label */}
        <span className={cn(
          'text-[9px] px-1.5 py-0.5 rounded',
          isNew 
            ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
            : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
        )}>
          {actionLabel}
        </span>
      </button>
      
      {/* Diff content */}
      {isExpanded && (
        <div className="border-t border-[var(--color-border-subtle)]">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-2 py-1 bg-[var(--color-surface-2)]/30 border-b border-[var(--color-border-subtle)]">
            <span className="text-[9px] text-[var(--color-text-dim)] truncate" title={path}>
              {path}
            </span>
            <div className="flex items-center gap-1">
              {/* Copy button */}
              <button
                type="button"
                className={cn(
                  'p-1 rounded hover:bg-[var(--color-surface-3)] transition-colors',
                  'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                )}
                onClick={handleCopy}
                title="Copy new content"
              >
                {copied ? <Check size={10} className="text-[var(--color-success)]" /> : <Copy size={10} />}
              </button>
              
              {/* Open in editor button */}
              {onOpenFile && (
                <button
                  type="button"
                  className={cn(
                    'p-1 rounded hover:bg-[var(--color-surface-3)] transition-colors',
                    'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                  )}
                  onClick={handleOpenFile}
                  title="Open in editor"
                >
                  <ExternalLink size={10} />
                </button>
              )}
            </div>
          </div>
          
          {/* Diff lines */}
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
            {displayLines.length === 0 ? (
              <div className="px-2 py-3 text-center text-[10px] text-[var(--color-text-dim)]">
                No changes
              </div>
            ) : (
              displayLines.map((line, idx) => (
                <DiffLineComponent key={idx} line={line} />
              ))
            )}
          </div>
          
          {/* Truncation notice */}
          {isTruncated && (
            <button
              type="button"
              className={cn(
                'w-full py-1.5 text-[9px] text-center',
                'bg-[var(--color-surface-2)]/50 border-t border-[var(--color-border-subtle)]',
                'text-[var(--color-accent-primary)] hover:bg-[var(--color-surface-2)] transition-colors',
              )}
              onClick={() => setShowFullDiff(true)}
            >
              Show all {diffLines.length} lines
            </button>
          )}
        </div>
      )}
    </div>
  );
});

FileDiffPreview.displayName = 'FileDiffPreview';
