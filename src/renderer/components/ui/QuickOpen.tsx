/**
 * Quick Open
 * 
 * File search dialog triggered via Ctrl+P.
 * Lists workspace files with fuzzy filtering, keyboard navigation,
 * and instant file opening. Follows CommandPalette patterns.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { File, Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { createLogger } from '../../utils/logger';
import { useWorkspaceState } from '../../state/WorkspaceProvider';

const logger = createLogger('QuickOpen');

// =============================================================================
// Types
// =============================================================================

interface QuickOpenProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelect: (filePath: string) => void;
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'target',
  '__pycache__', '.vscode', '.idea', 'coverage',
]);

/**
 * Simple fuzzy match: all characters in query appear in order in target.
 * Returns a score (lower is better) or -1 if no match.
 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastIdx = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive matches score better
      score += (ti === lastIdx + 1) ? 0 : (ti - (lastIdx + 1));
      lastIdx = ti;
      qi++;
    }
  }

  if (qi < q.length) return -1; // Not all chars matched
  
  // Prefer matches in filename over path
  const fileName = target.split(/[/\\]/).pop() ?? target;
  const nameMatch = fileName.toLowerCase().includes(q) ? -100 : 0;
  return score + nameMatch;
}

/**
 * Recursively flatten file tree into a flat list of file entries.
 */
function flattenFiles(files: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = [];

  function walk(entries: FileEntry[]) {
    for (const entry of entries) {
      if (entry.type === 'directory') {
        // Skip ignored directories
        if (IGNORED_DIRS.has(entry.name)) continue;
        if ((entry as unknown as { children?: FileEntry[] }).children) {
          walk((entry as unknown as { children: FileEntry[] }).children);
        }
      } else {
        result.push(entry);
      }
    }
  }

  walk(files);
  return result;
}

/**
 * Get a simple icon color class based on file extension.
 */
function getFileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': return 'text-blue-400';
    case 'js': case 'jsx': return 'text-yellow-400';
    case 'css': case 'scss': return 'text-purple-400';
    case 'json': return 'text-green-400';
    case 'md': return 'text-gray-400';
    case 'rs': return 'text-orange-400';
    case 'html': return 'text-red-400';
    default: return 'text-[var(--color-text-dim)]';
  }
}

// =============================================================================
// Component
// =============================================================================

export const QuickOpen: React.FC<QuickOpenProps> = memo(({
  isOpen,
  onClose,
  onFileSelect,
}) => {
  const { workspacePath } = useWorkspaceState();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load files when opened
  useEffect(() => {
    if (!isOpen || !workspacePath) {
      setAllFiles([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const result = await window.vyotiq.files.listDir(workspacePath, {
          recursive: true,
          maxDepth: 6,
          showHidden: false,
        });
        if (!cancelled && result.success && result.files) {
          const flat = flattenFiles(result.files as FileEntry[]);
          setAllFiles(flat);
        }
      } catch (err) {
        logger.warn('Failed to list workspace files', { workspacePath, error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, workspacePath]);

  // Filter files by query
  const filteredFiles = useMemo(() => {
    if (!query.trim()) {
      // Show all files sorted by name (capped for performance)
      return allFiles.slice(0, 200);
    }

    const scored = allFiles
      .map(f => ({ file: f, score: fuzzyMatch(query, f.path) }))
      .filter(s => s.score >= -100)
      .sort((a, b) => a.score - b.score);

    return scored.slice(0, 100).map(s => s.file);
  }, [allFiles, query]);

  // Reset selection on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback((file: FileEntry) => {
    onClose();
    setTimeout(() => onFileSelect(file.path), 50);
  }, [onClose, onFileSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredFiles.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredFiles[selectedIndex]) {
          handleSelect(filteredFiles[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredFiles, selectedIndex, handleSelect, onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const relativePath = (fullPath: string): string => {
    if (!workspacePath) return fullPath;
    return fullPath.startsWith(workspacePath)
      ? fullPath.slice(workspacePath.length).replace(/^[/\\]/, '')
      : fullPath;
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Quick open file"
    >
      <div
        className={cn(
          'w-full max-w-[520px] rounded-lg overflow-hidden',
          'bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)]/60',
          'shadow-2xl'
        )}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)]/40">
          <Search size={14} className="text-[var(--color-text-dim)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search files by name..."
            className={cn(
              'flex-1 bg-transparent border-none outline-none',
              'text-[12px] font-mono text-[var(--color-text-primary)]',
              'placeholder:text-[var(--color-text-dim)]'
            )}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] p-0.5"
              title="Clear"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* File list */}
        <div
          ref={listRef}
          className="max-h-[320px] overflow-y-auto"
          role="listbox"
        >
          {loading && (
            <div className="px-3 py-6 text-center text-[11px] font-mono text-[var(--color-text-dim)]">
              Loading files...
            </div>
          )}

          {!loading && filteredFiles.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] font-mono text-[var(--color-text-dim)]">
              {query ? 'No matching files' : 'No files found'}
            </div>
          )}

          {!loading && filteredFiles.map((file, index) => {
            const rel = relativePath(file.path);
            const fileName = file.name;
            const dirPath = rel.includes('/') || rel.includes('\\')
              ? rel.replace(/[/\\][^/\\]+$/, '')
              : '';

            return (
              <div
                key={file.path}
                role="option"
                aria-selected={index === selectedIndex}
                data-selected={index === selectedIndex}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 cursor-pointer',
                  'text-[11px] font-mono transition-colors duration-75',
                  index === selectedIndex
                    ? 'bg-[var(--color-accent)]/15 text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                )}
                onClick={() => handleSelect(file)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <File size={13} className={cn('flex-shrink-0', getFileColor(fileName))} />
                <span className="truncate font-medium">{fileName}</span>
                {dirPath && (
                  <span className="truncate text-[var(--color-text-dim)] ml-auto text-[10px]">
                    {dirPath}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-border-subtle)]/40">
          <span className="text-[9px] font-mono text-[var(--color-text-dim)]">
            {filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 text-[9px] font-mono text-[var(--color-text-dim)]">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        </div>
      </div>
    </div>
  );
});

QuickOpen.displayName = 'QuickOpen';
