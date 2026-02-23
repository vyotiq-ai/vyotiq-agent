/**
 * ProblemsTabContent
 * 
 * Displays workspace-wide diagnostics (errors, warnings, info) grouped by file.
 * Supports severity filtering, text search, file grouping with collapse,
 * and click-to-navigate to the diagnostic location in the editor.
 */

import React, { useState, useCallback, useMemo, memo } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, FileCode, RefreshCw } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../../../components/ui/Tooltip';
import { openFileInEditor } from '../../editor/components/EditorPanel';
import type { DiagnosticItem } from '../hooks/useDiagnostics';

// =============================================================================
// Types
// =============================================================================

type SeverityFilter = 'all' | 'error' | 'warning' | 'info' | 'hint';

interface ProblemsTabContentProps {
  diagnostics: DiagnosticItem[];
  isLoading: boolean;
  onRefresh: () => void;
}

// =============================================================================
// Component
// =============================================================================

const ProblemsTabContentInner: React.FC<ProblemsTabContentProps> = ({
  diagnostics,
  isLoading,
  onRefresh,
}) => {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');

  // Filter diagnostics by severity and text
  const filtered = useMemo(() => {
    let items = diagnostics;
    if (severityFilter !== 'all') {
      items = items.filter(d => d.severity === severityFilter);
    }
    if (filterText.trim()) {
      const lower = filterText.toLowerCase();
      items = items.filter(d =>
        d.message.toLowerCase().includes(lower) ||
        d.filePath.toLowerCase().includes(lower) ||
        (d.source ?? '').toLowerCase().includes(lower)
      );
    }
    return items;
  }, [diagnostics, severityFilter, filterText]);

  // Group by file
  const grouped = useMemo(() => {
    const map = new Map<string, DiagnosticItem[]>();
    for (const d of filtered) {
      const key = d.filePath;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    // Sort files: those with errors first, then by name
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const aErrors = a.filter(d => d.severity === 'error').length;
      const bErrors = b.filter(d => d.severity === 'error').length;
      if (aErrors !== bErrors) return bErrors - aErrors;
      return 0;
    });
  }, [filtered]);

  const counts = useMemo(() => ({
    errors: diagnostics.filter(d => d.severity === 'error').length,
    warnings: diagnostics.filter(d => d.severity === 'warning').length,
    infos: diagnostics.filter(d => d.severity === 'info').length + diagnostics.filter(d => d.severity === 'hint').length,
  }), [diagnostics]);

  const toggleFileCollapse = useCallback((filePath: string) => {
    setCollapsedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const handleDiagnosticClick = useCallback((d: DiagnosticItem) => {
    // Open file and navigate to the diagnostic location
    openFileInEditor(d.filePath);
    // Dispatch an event so the editor can jump to the line
    requestAnimationFrame(() => {
      document.dispatchEvent(new CustomEvent('vyotiq:editor-go-to-line', {
        detail: { filePath: d.filePath, line: d.line, column: d.column },
      }));
    });
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Status & filter bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-border-subtle)]">
        {/* Severity counts */}
        <button
          onClick={() => setSeverityFilter(severityFilter === 'error' ? 'all' : 'error')}
          className={cn(
            'flex items-center gap-1 text-[10px] font-mono px-1 rounded transition-colors',
            severityFilter === 'error' ? 'bg-[var(--color-error)]/15 text-[var(--color-error)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-error)]'
          )}
        >
          <AlertCircle size={9} /> {counts.errors}
        </button>
        <button
          onClick={() => setSeverityFilter(severityFilter === 'warning' ? 'all' : 'warning')}
          className={cn(
            'flex items-center gap-1 text-[10px] font-mono px-1 rounded transition-colors',
            severityFilter === 'warning' ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-warning)]'
          )}
        >
          <AlertCircle size={9} /> {counts.warnings}
        </button>
        <button
          onClick={() => setSeverityFilter(severityFilter === 'info' ? 'all' : 'info')}
          className={cn(
            'flex items-center gap-1 text-[10px] font-mono px-1 rounded transition-colors',
            severityFilter === 'info' ? 'bg-[var(--color-info)]/15 text-[var(--color-info)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-info)]'
          )}
        >
          <AlertCircle size={9} /> {counts.infos}
        </button>

        {/* Filter text */}
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="filter problems..."
            className="w-full bg-transparent text-[10px] font-mono px-1 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none"
          />
        </div>

        <Tooltip content="Refresh diagnostics">
          <button
            onClick={onRefresh}
            className="p-0.5 rounded hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Refresh diagnostics"
          >
            <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </Tooltip>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center font-mono">
            <AlertCircle size={20} className="mx-auto mb-2 text-[var(--color-text-placeholder)]" />
            <p className="text-[11px] text-[var(--color-text-placeholder)]">
              {diagnostics.length === 0 ? 'No problems detected in workspace' : 'No problems match current filter'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto font-mono text-[11px]">
          {grouped.map(([filePath, items]) => {
            const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
            const isCollapsed = collapsedFiles.has(filePath);
            const fileErrors = items.filter(d => d.severity === 'error').length;
            const fileWarnings = items.filter(d => d.severity === 'warning').length;

            return (
              <div key={filePath}>
                {/* File header */}
                <button
                  type="button"
                  className="w-full flex items-center gap-1.5 px-2 py-0.5 bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] transition-colors border-b border-[var(--color-border-subtle)]/30 text-left"
                  onClick={() => toggleFileCollapse(filePath)}
                >
                  {isCollapsed ? <ChevronRight size={10} className="shrink-0" /> : <ChevronDown size={10} className="shrink-0" />}
                  <FileCode size={10} className="shrink-0 text-[var(--color-text-muted)]" />
                  <span className="text-[10px] text-[var(--color-text-primary)] truncate">{fileName}</span>
                  <span className="text-[9px] text-[var(--color-text-dim)] truncate ml-1">
                    {filePath.split(/[\\/]/).slice(-3, -1).join('/')}
                  </span>
                  <span className="ml-auto flex items-center gap-1 shrink-0">
                    {fileErrors > 0 && (
                      <span className="text-[9px] text-[var(--color-error)]">{fileErrors}</span>
                    )}
                    {fileWarnings > 0 && (
                      <span className="text-[9px] text-[var(--color-warning)]">{fileWarnings}</span>
                    )}
                    <span className="text-[9px] text-[var(--color-text-dim)]">{items.length}</span>
                  </span>
                </button>

                {/* Diagnostics for this file */}
                {!isCollapsed && items.map((d, i) => (
                  <div
                    key={`${d.filePath}-${d.line}-${d.column}-${i}`}
                    className="flex items-start gap-2 px-3 pl-6 py-0.5 hover:bg-[var(--color-surface-3)] cursor-pointer border-b border-[var(--color-border-subtle)]/20"
                    onClick={() => handleDiagnosticClick(d)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleDiagnosticClick(d)}
                  >
                    <span className={cn(
                      'shrink-0 mt-0.5',
                      d.severity === 'error' && 'text-[var(--color-error)]',
                      d.severity === 'warning' && 'text-[var(--color-warning)]',
                      d.severity === 'info' && 'text-[var(--color-info)]',
                      d.severity === 'hint' && 'text-[var(--color-text-muted)]',
                    )}>
                      <AlertCircle size={10} />
                    </span>
                    <span className="text-[var(--color-text-primary)] flex-1 min-w-0 break-words">{d.message}</span>
                    {d.source && (
                      <span className="shrink-0 text-[var(--color-text-muted)]">
                        {d.source}{d.code ? `(${d.code})` : ''}
                      </span>
                    )}
                    <span className="shrink-0 text-[var(--color-text-dim)]">[Ln {d.line}, Col {d.column}]</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ProblemsTabContent = memo(ProblemsTabContentInner);
ProblemsTabContent.displayName = 'ProblemsTabContent';
