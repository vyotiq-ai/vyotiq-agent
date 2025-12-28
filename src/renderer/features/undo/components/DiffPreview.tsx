/**
 * Diff Preview Component
 * 
 * Shows a side-by-side or unified diff view of file changes.
 * Uses shared diff utilities for consistent diff computation.
 */
import React, { memo, useMemo } from 'react';
import { X, Minus, Plus, FileText } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { computeDiff, computeDiffStats, getFileName } from '../../../utils/diff';
import type { FileChange } from '../types';

interface DiffPreviewProps {
  change: FileChange;
  onClose: () => void;
}

export const DiffPreview: React.FC<DiffPreviewProps> = memo(({ change, onClose }) => {
  const diffLines = useMemo(() => {
    return computeDiff(change.previousContent, change.newContent);
  }, [change.previousContent, change.newContent]);

  const stats = useMemo(() => computeDiffStats(diffLines), [diffLines]);

  const maxLines = 500; // Limit for performance
  const truncated = diffLines.length > maxLines;
  const displayLines = truncated ? diffLines.slice(0, maxLines) : diffLines;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={cn(
        'w-[90vw] max-w-4xl max-h-[85vh] flex flex-col',
        'bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)]',
        'rounded-lg shadow-2xl overflow-hidden'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
          <div className="flex items-center gap-3">
            <FileText size={16} className="text-[var(--color-accent-primary)]" />
            <div>
              <h3 className="text-xs font-medium text-[var(--color-text-primary)]">
                {getFileName(change.filePath)}
              </h3>
              <p className="text-[10px] text-[var(--color-text-muted)] truncate max-w-md" title={change.filePath}>
                {change.filePath}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-[var(--color-success)]">
                <Plus size={12} />
                {stats.added}
              </span>
              <span className="flex items-center gap-1 text-[var(--color-error)]">
                <Minus size={12} />
                {stats.removed}
              </span>
            </div>
            <button
              onClick={onClose}
              className={cn(
                'p-1.5 rounded hover:bg-[var(--color-surface-2)]',
                'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                'transition-colors'
              )}
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto font-mono text-[11px]">
          {change.changeType === 'create' && !change.previousContent ? (
            <div className="p-4 text-[var(--color-text-muted)]">
              <p className="mb-2">New file created with {change.newContent?.split('\n').length || 0} lines</p>
              <pre className="p-3 bg-[var(--color-success)]/5 border-l-2 border-[var(--color-success)] rounded">
                {change.newContent?.slice(0, 2000)}
                {(change.newContent?.length || 0) > 2000 && '\n... (truncated)'}
              </pre>
            </div>
          ) : change.changeType === 'delete' && !change.newContent ? (
            <div className="p-4 text-[var(--color-text-muted)]">
              <p className="mb-2">File deleted ({change.previousContent?.split('\n').length || 0} lines)</p>
              <pre className="p-3 bg-[var(--color-error)]/5 border-l-2 border-[var(--color-error)] rounded">
                {change.previousContent?.slice(0, 2000)}
                {(change.previousContent?.length || 0) > 2000 && '\n... (truncated)'}
              </pre>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {displayLines.map((line, idx) => (
                  <tr
                    key={idx}
                    className={cn(
                      line.type === 'added' && 'bg-[var(--color-success)]/10',
                      line.type === 'removed' && 'bg-[var(--color-error)]/10',
                      line.type === 'unchanged' && 'hover:bg-[var(--color-surface-1)]'
                    )}
                  >
                    {/* Old line number */}
                    <td className="w-10 px-2 py-0.5 text-right text-[var(--color-text-dim)] select-none border-r border-[var(--color-border-subtle)]">
                      {line.lineNumber?.old || ''}
                    </td>
                    {/* New line number */}
                    <td className="w-10 px-2 py-0.5 text-right text-[var(--color-text-dim)] select-none border-r border-[var(--color-border-subtle)]">
                      {line.lineNumber?.new || ''}
                    </td>
                    {/* Change indicator */}
                    <td className={cn(
                      'w-6 px-1 py-0.5 text-center select-none',
                      line.type === 'added' && 'text-[var(--color-success)]',
                      line.type === 'removed' && 'text-[var(--color-error)]'
                    )}>
                      {line.type === 'added' && '+'}
                      {line.type === 'removed' && '-'}
                    </td>
                    {/* Content */}
                    <td className={cn(
                      'px-2 py-0.5 whitespace-pre',
                      line.type === 'added' && 'text-[var(--color-success)]',
                      line.type === 'removed' && 'text-[var(--color-error)]',
                      line.type === 'unchanged' && 'text-[var(--color-text-primary)]'
                    )}>
                      {line.content || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          
          {truncated && (
            <div className="p-3 text-center text-[var(--color-text-muted)] bg-[var(--color-surface-1)] border-t border-[var(--color-border-subtle)]">
              Showing first {maxLines} of {diffLines.length} lines
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
          <p className="text-[10px] text-[var(--color-text-dim)]">
            {change.description} • {change.toolName}
          </p>
        </div>
      </div>
    </div>
  );
});

DiffPreview.displayName = 'DiffPreview';

export default DiffPreview;
