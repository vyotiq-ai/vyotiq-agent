/**
 * SearchPanel Component
 *
 * Global search across workspace files using the Rust backend's full-text search
 * and grep capabilities. Provides both semantic and text search.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ChevronRight,
  X,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useRustSearch, useRustGrep, useRustSemanticSearch, useRustBackendEvents } from '../../../hooks/useRustBackend';
import { usePagination } from '../../../hooks/usePagination';
import type { RustSearchResult, RustGrepMatch, RustSemanticResult } from '../../../utils/rustBackendClient';

interface SearchPanelProps {
  workspaceId: string | null;
  onFileOpen?: (filePath: string, line?: number) => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ workspaceId, onFileOpen }) => {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'fulltext' | 'grep' | 'semantic'>('fulltext');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [includePattern, setIncludePattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [staleResults, setStaleResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fulltext = useRustSearch(workspaceId);
  const grep = useRustGrep(workspaceId);
  const semantic = useRustSemanticSearch(workspaceId);

  // Paginate grep results (they can be very large)
  const grepPagination = usePagination(grep.matches, { pageSize: 50 });

  // Listen for real-time file change events to auto-refresh stale results
  const lastSearchRef = useRef<{ query: string; mode: string } | null>(null);
  useRustBackendEvents(useCallback((event) => {
    // When files change, mark results as stale so user knows to re-search
    if (event.type === 'file_changed' && lastSearchRef.current) {
      setStaleResults(true);
    }
  }, []));

  const isSearching = searchMode === 'fulltext' ? fulltext.isSearching : searchMode === 'grep' ? grep.isSearching : semantic.isSearching;
  const error = searchMode === 'fulltext' ? fulltext.error : searchMode === 'grep' ? grep.error : semantic.error;

  // Execute search
  const executeSearch = useCallback(async () => {
    if (!query.trim() || !workspaceId) return;

    lastSearchRef.current = { query, mode: searchMode };
    setStaleResults(false);

    if (searchMode === 'fulltext') {
      await fulltext.search(query, { limit: 50 });
    } else if (searchMode === 'grep') {
      await grep.grep(query, {
        case_sensitive: caseSensitive,
        is_regex: useRegex,
        include_patterns: includePattern ? includePattern.split(',').map((s) => s.trim()) : undefined,
        exclude_patterns: excludePattern ? excludePattern.split(',').map((s) => s.trim()) : undefined,
        max_results: 200,
      });
    } else {
      await semantic.search(query, { limit: 30 });
    }
  }, [query, workspaceId, searchMode, fulltext, grep, semantic, caseSensitive, useRegex, includePattern, excludePattern]);

  // Search on Enter
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        executeSearch();
      }
    },
    [executeSearch],
  );

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleFileClick = useCallback(
    (path: string, line?: number) => {
      onFileOpen?.(path, line);
    },
    [onFileOpen],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    fulltext.clear();
    grep.clear();
    semantic.clear();
    inputRef.current?.focus();
  }, [fulltext, grep, semantic]);

  return (
    <div className="flex flex-col h-full">
      {/* Search input area */}
      <div className="shrink-0 px-2 py-2 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-accent-primary)] text-[10px] opacity-50 font-mono">λ</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchMode === 'fulltext' ? 'search files...' : searchMode === 'grep' ? 'grep pattern...' : 'semantic query...'}
              className="w-full bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-sm pl-6 pr-6 py-1.5 text-[10px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent-primary)]/50 transition-colors"
            />
            {query && (
              <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] transition-colors">
                <X size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Search mode toggles — terminal text tabs */}
        <div className="flex items-center gap-1 mt-1.5">
          <div className="flex items-center gap-px bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-sm overflow-hidden">
            {(['fulltext', 'grep', 'semantic'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSearchMode(mode)}
                className={cn(
                  'px-1.5 py-0.5 text-[9px] font-mono transition-colors',
                  searchMode === mode
                    ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]'
                    : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]',
                )}
              >
                {mode === 'fulltext' ? 'text' : mode}
              </button>
            ))}
          </div>

          {searchMode === 'grep' && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => setCaseSensitive(!caseSensitive)}
                className={cn(
                  'px-1 py-0.5 text-[9px] font-mono rounded-sm transition-colors',
                  caseSensitive
                    ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]'
                    : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]',
                )}
                title="Match Case"
              >
                Aa
              </button>
              <button
                onClick={() => setUseRegex(!useRegex)}
                className={cn(
                  'px-1 py-0.5 text-[9px] font-mono rounded-sm transition-colors',
                  useRegex
                    ? 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]'
                    : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]',
                )}
                title="Use Regular Expression"
              >
                .*
              </button>
            </div>
          )}

          <button
            onClick={() => setShowFilters(!showFilters)}
            className="ml-auto text-[9px] font-mono text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            {showFilters ? 'hide' : 'filters'}
          </button>
        </div>

        {/* Filters — terminal-style inputs */}
        {showFilters && (
          <div className="flex flex-col gap-1.5 mt-1.5">
            <input
              type="text"
              value={includePattern}
              onChange={(e) => setIncludePattern(e.target.value)}
              placeholder="include: *.ts, *.tsx"
              className="bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-sm px-2 py-1 text-[9px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent-primary)]/50 transition-colors"
            />
            <input
              type="text"
              value={excludePattern}
              onChange={(e) => setExcludePattern(e.target.value)}
              placeholder="exclude: node_modules, dist"
              className="bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-sm px-2 py-1 text-[9px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent-primary)]/50 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
        {/* Loading — terminal style */}
        {isSearching && (
          <div className="flex items-center gap-2 px-3 py-5 font-mono">
            <span className="text-[var(--color-accent-primary)] text-[10px] opacity-50">λ</span>
            <span className="text-[9px] text-[var(--color-text-dim)]">searching</span>
            <span className="flex gap-0.5">
              <span className="thinking-dot w-1 h-1 rounded-full bg-[var(--color-accent-primary)]" />
              <span className="thinking-dot w-1 h-1 rounded-full bg-[var(--color-accent-primary)]" />
              <span className="thinking-dot w-1 h-1 rounded-full bg-[var(--color-accent-primary)]" />
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-4 text-center text-[11px] text-[var(--color-error)]">{error}</div>
        )}

        {/* Stale results indicator */}
        {staleResults && lastSearchRef.current && (
          <div className="px-3 py-1.5 flex items-center justify-between bg-[var(--color-warning)]/10 border-b border-[var(--color-border)]">
            <span className="text-[10px] text-[var(--color-warning)]">Results may be outdated — files have changed</span>
            <button
              onClick={executeSearch}
              className="text-[10px] text-[var(--color-accent)] hover:underline"
            >
              Re-search
            </button>
          </div>
        )}

        {/* Full-text results */}
        {searchMode === 'fulltext' && !isSearching && fulltext.results.length > 0 && (
          <div className="py-1">
            <div className="px-3 py-1 text-[10px] text-[var(--color-text-tertiary)]">
              {fulltext.total} results in {fulltext.tookMs}ms
            </div>
            {fulltext.results.map((result, idx) => (
              <SearchResultItem key={`${result.path}-${idx}`} result={result} onClick={handleFileClick} />
            ))}
          </div>
        )}

        {/* Grep results (paginated) */}
        {searchMode === 'grep' && !isSearching && grep.matches.length > 0 && (
          <div className="py-1">
            <div className="px-3 py-1 flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)]">
              <span>{grep.totalMatches} matches in {grep.filesSearched} files</span>
              {grep.matches.length > 50 && (
                <span>{grepPagination.rangeInfo}</span>
              )}
            </div>
            <GrepResultsList matches={grepPagination.currentItems} onClick={handleFileClick} />
            {grep.matches.length > 50 && (
              <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-[var(--color-border)]">
                <button
                  onClick={grepPagination.prevPage}
                  disabled={!grepPagination.hasPrevPage}
                  className="p-1 rounded hover:bg-[var(--color-surface-2)] disabled:opacity-30"
                  title="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  {grepPagination.pageInfo}
                </span>
                <button
                  onClick={grepPagination.nextPage}
                  disabled={!grepPagination.hasNextPage}
                  className="p-1 rounded hover:bg-[var(--color-surface-2)] disabled:opacity-30"
                  title="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Semantic results */}
        {searchMode === 'semantic' && !isSearching && semantic.results.length > 0 && (
          <div className="py-1">
            <div className="px-3 py-1 text-[10px] text-[var(--color-text-tertiary)]">
              {semantic.results.length} results in {semantic.queryTimeMs}ms
            </div>
            {semantic.results.map((result, idx) => (
              <SemanticResultItem key={`${result.relative_path}-${result.line_start}-${idx}`} result={result} onClick={handleFileClick} />
            ))}
          </div>
        )}

        {/* Empty state — only check the active search mode's results */}
        {!isSearching && !error && query && (
          (searchMode === 'fulltext' && fulltext.results.length === 0) ||
          (searchMode === 'grep' && grep.matches.length === 0) ||
          (searchMode === 'semantic' && semantic.results.length === 0)
        ) && (
          <div className="flex flex-col gap-1 px-3 py-6 font-mono">
            <span className="text-[10px] text-[var(--color-text-dim)]">no results found</span>
          </div>
        )}

        {/* Initial state */}
        {!query && !isSearching && (
          <div className="flex flex-col gap-1 px-3 py-6 font-mono">
            <span className="text-[10px] text-[var(--color-text-dim)]">type to search across files</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SearchResultItem: React.FC<{
  result: RustSearchResult;
  onClick: (path: string) => void;
}> = ({ result, onClick }) => (
  <button
    onClick={() => onClick(result.path)}
    className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)] transition-colors group font-mono"
  >
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent-primary)] transition-colors">
          {result.filename}
        </span>
        <span className="text-[8px] text-[var(--color-text-dim)] truncate">
          {result.relative_path}
        </span>
      </div>
      {result.snippet && (
        <div className="text-[9px] text-[var(--color-text-dim)] line-clamp-2 mt-0.5">
          {result.snippet}
        </div>
      )}
    </div>
    <span className="text-[8px] text-[var(--color-text-dim)] shrink-0 tabular-nums">
      {result.extension}
    </span>
  </button>
);

const GrepResultsList: React.FC<{
  matches: RustGrepMatch[];
  onClick: (path: string, line?: number) => void;
}> = ({ matches, onClick }) => {
  // Group matches by file
  const grouped = matches.reduce<Record<string, RustGrepMatch[]>>((acc, match) => {
    if (!acc[match.path]) acc[match.path] = [];
    acc[match.path].push(match);
    return acc;
  }, {});

  return (
    <>
      {Object.entries(grouped).map(([filePath, fileMatches]) => (
        <GrepFileGroup key={filePath} filePath={filePath} matches={fileMatches} onClick={onClick} />
      ))}
    </>
  );
};

const GrepFileGroup: React.FC<{
  filePath: string;
  matches: RustGrepMatch[];
  onClick: (path: string, line?: number) => void;
}> = ({ filePath, matches, onClick }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const relativePath = matches[0]?.relative_path || filePath;

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 px-3 py-1 text-left hover:bg-[var(--color-surface-2)] transition-colors font-mono"
      >
        <ChevronRight
          size={9}
          className={cn('text-[var(--color-text-dim)] transition-transform shrink-0', isExpanded && 'rotate-90')}
        />
        <span className="text-[10px] font-medium text-[var(--color-text-primary)] truncate">
          {fileName}
        </span>
        <span className="text-[8px] text-[var(--color-text-dim)] truncate ml-1">{relativePath}</span>
        <span className="ml-auto text-[8px] text-[var(--color-text-dim)] tabular-nums shrink-0">
          {matches.length}
        </span>
      </button>
      {isExpanded && (
        <div className="ml-5">
          {matches.map((match, idx) => (
            <button
              key={`${match.line_number}-${idx}`}
              onClick={() => onClick(match.path, match.line_number)}
              className="w-full flex items-center gap-2 px-3 py-0.5 text-left hover:bg-[var(--color-surface-2)] transition-colors font-mono"
            >
              <span className="text-[8px] text-[var(--color-text-dim)] min-w-[28px] text-right shrink-0 tabular-nums">
                {match.line_number}
              </span>
              <span className="text-[9px] text-[var(--color-text-secondary)] truncate">
                {match.line_content.trim()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SemanticResultItem: React.FC<{
  result: RustSemanticResult;
  onClick: (path: string, line?: number) => void;
}> = ({ result, onClick }) => {
  const fileName = result.relative_path.split(/[/\\]/).pop() || result.relative_path;
  const score = Math.round(result.score * 100);

  return (
    <button
      onClick={() => onClick(result.path, result.line_start || undefined)}
      className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)] transition-colors group font-mono"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent-primary)] transition-colors">
            {fileName}
          </span>
          {result.line_start > 0 && (
            <span className="text-[8px] text-[var(--color-text-dim)] tabular-nums">
              {result.line_start}–{result.line_end}
            </span>
          )}
          <span className="text-[8px] text-[var(--color-text-dim)] truncate">
            {result.relative_path}
          </span>
        </div>
        {result.chunk_text && (
          <div className="text-[9px] text-[var(--color-text-dim)] line-clamp-3 mt-0.5 whitespace-pre-wrap">
            {result.chunk_text.slice(0, 300)}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-[8px] text-[var(--color-text-dim)] tabular-nums">
          {result.language}
        </span>
        <span className="text-[8px] text-[var(--color-accent-primary)] tabular-nums">
          {score}%
        </span>
      </div>
    </button>
  );
};
