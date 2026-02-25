/**
 * Encoding Checker Panel
 *
 * Shows results of encoding consistency scan across workspace files.
 * Can be triggered from editor settings or command palette.
 */

import React, { memo, useCallback, useEffect, useState, useRef } from 'react';
import { X, AlertTriangle, CheckCircle2, FileText, Loader2, Search } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { checkEncodingConsistency, type ConsistencyReport, type ConsistencyIssue } from '../utils/encodingChecker';

// =============================================================================
// Types
// =============================================================================

interface EncodingCheckerPanelProps {
  workspacePath: string;
  onClose: () => void;
  onOpenFile?: (filePath: string) => void;
}

// =============================================================================
// Issue Type Badge
// =============================================================================

const IssueBadge = memo<{ type: ConsistencyIssue['type'] }>(({ type }) => {
  const config = {
    encoding: { label: 'encoding', color: 'text-[var(--color-warning)]' },
    lineEnding: { label: 'line ending', color: 'text-[var(--color-accent-secondary)]' },
    mixedLineEndings: { label: 'mixed', color: 'text-[var(--color-error)]' },
    bom: { label: 'BOM', color: 'text-[var(--color-warning)]' },
  }[type];

  return (
    <span className={cn('text-[8px] uppercase tracking-wide px-1 py-0.5 rounded bg-[var(--color-surface-2)]', config.color)}>
      {config.label}
    </span>
  );
});
IssueBadge.displayName = 'IssueBadge';

// =============================================================================
// EncodingCheckerPanel
// =============================================================================

export const EncodingCheckerPanel: React.FC<EncodingCheckerPanelProps> = memo(({
  workspacePath,
  onClose,
  onOpenFile,
}) => {
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ scanned: number; total: number }>({ scanned: 0, total: 0 });
  const [filter, setFilter] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Run scan on mount
  useEffect(() => {
    let cancelled = false;
    setScanning(true);

    void checkEncodingConsistency(workspacePath, {
      maxFiles: 500,
      onProgress: (scanned, total) => {
        if (!cancelled) setProgress({ scanned, total });
      },
    }).then((result) => {
      if (!cancelled) {
        setReport(result);
        setScanning(false);
      }
    }).catch(() => {
      if (!cancelled) setScanning(false);
    });

    return () => { cancelled = true; };
  }, [workspacePath]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  const filteredIssues = report?.issues.filter(
    issue => !filter || issue.path.toLowerCase().includes(filter.toLowerCase()) || issue.type.includes(filter.toLowerCase())
  ) ?? [];

  const handleOpenFile = useCallback((relPath: string) => {
    const fullPath = `${workspacePath}/${relPath}`;
    onOpenFile?.(fullPath);
  }, [workspacePath, onOpenFile]);

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 w-[500px] max-h-[70vh] overflow-hidden',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
        'rounded-lg shadow-[var(--shadow-dropdown)] font-mono text-[11px]',
        'animate-in fade-in-0 slide-in-from-top-1 duration-150',
        'flex flex-col',
      )}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      role="dialog"
      aria-label="Encoding Consistency Check"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]/40 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-[var(--color-accent-primary)]" />
          <span className="text-[var(--color-text-primary)] font-medium">encoding consistency</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)] transition-colors"
          title="Close (Esc)"
        >
          <X size={12} />
        </button>
      </div>

      {/* Scanning progress */}
      {scanning && (
        <div className="px-3 py-4 flex flex-col items-center gap-2">
          <Loader2 size={16} className="animate-spin text-[var(--color-accent-primary)]" />
          <span className="text-[10px] text-[var(--color-text-dim)]">
            scanning files... {progress.scanned}/{progress.total}
          </span>
          <div className="w-48 h-1 bg-[var(--color-surface-2)] rounded overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent-primary)] transition-all"
              style={{ width: progress.total > 0 ? `${(progress.scanned / progress.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {report && !scanning && (
        <>
          {/* Summary */}
          <div className="px-3 py-2 border-b border-[var(--color-border-subtle)]/30 flex items-center gap-4 text-[10px]">
            <span className="text-[var(--color-text-dim)]">
              {report.totalFiles} files scanned in {(report.durationMs / 1000).toFixed(1)}s
            </span>
            <span className="text-[var(--color-text-dim)]">
              standard: {report.dominantEncoding} / {report.dominantLineEnding}
            </span>
            {report.issueCount === 0 ? (
              <span className="flex items-center gap-1 text-[var(--color-success)]">
                <CheckCircle2 size={10} />
                all consistent
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[var(--color-warning)]">
                <AlertTriangle size={10} />
                {report.issueCount} issues
              </span>
            )}
          </div>

          {/* Filter */}
          {report.issueCount > 0 && (
            <div className="px-3 py-1.5 border-b border-[var(--color-border-subtle)]/20">
              <div className="relative">
                <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
                <input
                  type="text"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="filter issues..."
                  className={cn(
                    'w-full pl-6 pr-2 py-1 rounded text-[10px] font-mono',
                    'bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)]/30',
                    'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)]',
                    'focus:outline-none focus:border-[var(--color-accent-primary)]/40',
                  )}
                />
              </div>
            </div>
          )}

          {/* Issue list */}
          <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)] scrollbar-track-transparent">
            {filteredIssues.length === 0 && report.issueCount > 0 ? (
              <div className="px-3 py-4 text-center text-[var(--color-text-dim)] text-[10px]">
                no matching issues
              </div>
            ) : report.issueCount === 0 ? (
              <div className="px-3 py-8 text-center">
                <CheckCircle2 size={24} className="mx-auto text-[var(--color-success)] mb-2" />
                <div className="text-[var(--color-text-secondary)]">all files are consistent</div>
                <div className="text-[var(--color-text-dim)] text-[10px] mt-1">
                  {report.dominantEncoding} encoding, {report.dominantLineEnding} line endings
                </div>
              </div>
            ) : (
              filteredIssues.map((issue, i) => (
                <button
                  key={`${issue.path}-${issue.type}-${i}`}
                  type="button"
                  onClick={() => handleOpenFile(issue.path)}
                  className={cn(
                    'w-full flex items-start gap-2 px-3 py-1.5 text-left',
                    'hover:bg-[var(--color-surface-2)] transition-colors border-b border-[var(--color-border-subtle)]/10',
                  )}
                >
                  <AlertTriangle size={10} className="shrink-0 mt-0.5 text-[var(--color-warning)]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--color-text-secondary)] truncate text-[10px]">{issue.path}</span>
                      <IssueBadge type={issue.type} />
                    </div>
                    <div className="text-[9px] text-[var(--color-text-dim)]">{issue.message}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
});

EncodingCheckerPanel.displayName = 'EncodingCheckerPanel';
