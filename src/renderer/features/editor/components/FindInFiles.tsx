/**
 * FindInFiles Component
 * 
 * VS Code-style search across files (Ctrl+Shift+F).
 * Supports regex, case sensitivity, and whole word matching.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Search, 
  X, 
  ChevronDown, 
  ChevronRight,
  File,
  Replace,
  CaseSensitive,
  WholeWord,
  Regex,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getFileIcon } from '../../fileTree/utils/fileIcons';

// Re-export icons for potential external use
export { Search as SearchIcon, File as FileIcon, FolderOpen as FolderOpenIcon };

export interface SearchMatch {
  line: number;
  column: number;
  endColumn: number;
  lineContent: string;
  preview: string;
}

export interface FileSearchResult {
  path: string;
  name: string;
  relativePath: string;
  matches: SearchMatch[];
}

interface FindInFilesProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string, options: SearchOptions) => Promise<FileSearchResult[]>;
  onMatchClick: (path: string, line: number, column: number) => void;
  onReplace?: (query: string, replacement: string, options: SearchOptions) => Promise<number>;
  isSearching?: boolean;
}

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  includePattern?: string;
  excludePattern?: string;
}

/**
 * Highlight search match in line content
 */
function highlightSearchMatch(
  content: string, 
  column: number, 
  endColumn: number
): React.ReactNode {
  const before = content.slice(0, column - 1);
  const match = content.slice(column - 1, endColumn - 1);
  const after = content.slice(endColumn - 1);
  
  return (
    <>
      <span className="text-[var(--color-text-muted)]">{before}</span>
      <span className="bg-[var(--color-warning)]/30 text-[var(--color-text-primary)] font-medium">
        {match}
      </span>
      <span className="text-[var(--color-text-muted)]">{after}</span>
    </>
  );
}

export const FindInFiles: React.FC<FindInFilesProps> = ({
  isOpen,
  onClose,
  onSearch,
  onMatchClick,
  onReplace,
  isSearching: externalSearching = false,
}) => {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
  });
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Combined searching state (internal + external)
  const isCurrentlySearching = searching || externalSearching;

  // Total match count
  const totalMatches = useMemo(() => 
    results.reduce((sum, r) => sum + r.matches.length, 0),
    [results]
  );

  // Auto-search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const searchResults = await onSearch(query, options);
        setResults(searchResults);
        // Auto-expand first few files
        const toExpand = new Set(searchResults.slice(0, 3).map(r => r.path));
        setExpandedFiles(toExpand);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, options, onSearch]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isOpen]);

  // Toggle file expansion
  const toggleFile = useCallback((path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Toggle option
  const toggleOption = useCallback((key: keyof SearchOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Handle replace all
  const handleReplaceAll = useCallback(async () => {
    if (!onReplace || !query.trim()) return;
    
    const count = await onReplace(query, replacement, options);
    if (count > 0) {
      // Refresh search
      const searchResults = await onSearch(query, options);
      setResults(searchResults);
    }
  }, [onReplace, query, replacement, options, onSearch]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && e.ctrlKey && showReplace) {
      handleReplaceAll();
    }
  }, [onClose, showReplace, handleReplaceAll]);

  if (!isOpen) return null;

  return (
    <div 
      className={cn(
        "flex flex-col h-full bg-[var(--color-surface-1)]",
        "border-r border-[var(--color-border-subtle)]"
      )}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          Search
        </span>
        <button
          onClick={onClose}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search inputs */}
      <div className="flex flex-col gap-2 p-2 border-b border-[var(--color-border-subtle)]">
        {/* Search input row */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            {showReplace ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          
          <div className="flex-1 flex items-center gap-1 bg-[var(--color-surface-2)] rounded border border-[var(--color-border-subtle)] focus-within:border-[var(--color-accent-primary)]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className={cn(
                "flex-1 px-2 py-1 bg-transparent text-xs text-[var(--color-text-primary)]",
                "placeholder:text-[var(--color-text-placeholder)]",
                "outline-none"
              )}
              spellCheck={false}
            />
            
            {/* Option toggles */}
            <button
              onClick={() => toggleOption('caseSensitive')}
              className={cn(
                "p-1 rounded transition-colors",
                options.caseSensitive 
                  ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
              title="Match Case"
            >
              <CaseSensitive size={12} />
            </button>
            <button
              onClick={() => toggleOption('wholeWord')}
              className={cn(
                "p-1 rounded transition-colors",
                options.wholeWord 
                  ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
              title="Match Whole Word"
            >
              <WholeWord size={12} />
            </button>
            <button
              onClick={() => toggleOption('useRegex')}
              className={cn(
                "p-1 rounded transition-colors",
                options.useRegex 
                  ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
              title="Use Regular Expression"
            >
              <Regex size={12} />
            </button>
          </div>
        </div>

        {/* Replace input row */}
        {showReplace && (
          <div className="flex items-center gap-1 pl-6">
            <div className="flex-1 flex items-center bg-[var(--color-surface-2)] rounded border border-[var(--color-border-subtle)] focus-within:border-[var(--color-accent-primary)]">
              <input
                type="text"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Replace"
                className={cn(
                  "flex-1 px-2 py-1 bg-transparent text-xs text-[var(--color-text-primary)]",
                  "placeholder:text-[var(--color-text-placeholder)]",
                  "outline-none"
                )}
                spellCheck={false}
              />
            </div>
            <button
              onClick={handleReplaceAll}
              disabled={!query.trim() || !onReplace}
              className={cn(
                "p-1 rounded text-[var(--color-text-muted)]",
                "hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              title="Replace All"
            >
              <Replace size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between px-3 py-1 text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
        <span>
          {isCurrentlySearching ? (
            <span className="flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" />
              Searching...
            </span>
          ) : query ? (
            `${totalMatches} results in ${results.length} files`
          ) : (
            'Type to search'
          )}
        </span>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && query && !searching ? (
          <div className="px-3 py-8 text-center text-[var(--color-text-muted)] text-xs">
            No results found
          </div>
        ) : (
          results.map((file) => {
            const Icon = getFileIcon(file.name);
            const isExpanded = expandedFiles.has(file.path);
            
            return (
              <div key={file.path}>
                {/* File header */}
                <button
                  onClick={() => toggleFile(file.path)}
                  className={cn(
                    "w-full flex items-center gap-1 px-2 py-1 text-left",
                    "hover:bg-[var(--color-surface-2)] transition-colors"
                  )}
                >
                  {isExpanded ? (
                    <ChevronDown size={12} className="text-[var(--color-text-muted)]" />
                  ) : (
                    <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
                  )}
                  <Icon size={12} className="text-[var(--color-text-muted)]" />
                  <span className="flex-1 text-xs text-[var(--color-text-primary)] truncate">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-2)] px-1 rounded">
                    {file.matches.length}
                  </span>
                </button>

                {/* File path */}
                {isExpanded && (
                  <div className="pl-7 pr-2 text-[9px] text-[var(--color-text-muted)] truncate">
                    {file.relativePath}
                  </div>
                )}

                {/* Matches */}
                {isExpanded && (
                  <div className="ml-4">
                    {file.matches.map((match, i) => (
                      <button
                        key={`${match.line}-${match.column}-${i}`}
                        onClick={() => onMatchClick(file.path, match.line, match.column)}
                        className={cn(
                          "w-full flex items-start gap-2 px-2 py-0.5 text-left",
                          "hover:bg-[var(--color-surface-2)] transition-colors"
                        )}
                      >
                        <span className="text-[10px] text-[var(--color-text-muted)] font-mono min-w-[3ch]">
                          {match.line}
                        </span>
                        <span className="flex-1 text-[11px] font-mono truncate">
                          {highlightSearchMatch(match.lineContent, match.column, match.endColumn)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default FindInFiles;
