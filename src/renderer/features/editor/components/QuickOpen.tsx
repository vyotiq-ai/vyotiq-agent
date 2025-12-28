/**
 * QuickOpen Component
 * 
 * VS Code-style quick open file picker (Ctrl+P).
 * Fuzzy search across all files in the workspace.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { File, Folder, Search, X, Clock, Star } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getFileIcon } from '../../fileTree/utils/fileIcons';

// Re-export icons for external use
export { File as FileIcon, Folder as FolderIcon, Star as StarIcon };

export interface QuickOpenFile {
  path: string;
  name: string;
  relativePath: string;
  isRecent?: boolean;
}

interface QuickOpenProps {
  isOpen: boolean;
  onClose: () => void;
  files: QuickOpenFile[];
  recentFiles?: string[];
  onFileSelect: (path: string) => void;
  onGoToLine?: (line: number) => void;
}

/**
 * Fuzzy match with scoring for file names
 */
function fuzzyMatchFile(query: string, file: QuickOpenFile): { match: boolean; score: number } {
  if (!query) return { match: true, score: file.isRecent ? 100 : 0 };
  
  const queryLower = query.toLowerCase();
  
  // Check for special syntax: "filename:line" or ":line"
  if (query.includes(':')) {
    const [fileQuery] = query.split(':');
    if (!fileQuery) return { match: true, score: 0 }; // Just ":number" - show all
    return fuzzyMatchFile(fileQuery, file);
  }
  
  const nameLower = file.name.toLowerCase();
  const pathLower = file.relativePath.toLowerCase();
  
  // Exact name match
  if (nameLower === queryLower) return { match: true, score: 100 };
  
  // Name starts with query
  if (nameLower.startsWith(queryLower)) return { match: true, score: 90 };
  
  // Name contains query
  if (nameLower.includes(queryLower)) return { match: true, score: 80 };
  
  // Path contains query
  if (pathLower.includes(queryLower)) return { match: true, score: 60 };
  
  // Fuzzy match on name
  let queryIndex = 0;
  let score = 0;
  let consecutiveMatches = 0;
  
  for (let i = 0; i < nameLower.length && queryIndex < queryLower.length; i++) {
    if (nameLower[i] === queryLower[queryIndex]) {
      queryIndex++;
      consecutiveMatches++;
      score += consecutiveMatches * 2;
      
      // Bonus for matching at word boundaries
      if (i === 0 || !nameLower[i - 1].match(/[a-z]/)) {
        score += 5;
      }
    } else {
      consecutiveMatches = 0;
    }
  }
  
  if (queryIndex === queryLower.length) {
    return { match: true, score: Math.min(score, 50) + (file.isRecent ? 10 : 0) };
  }
  
  // Try fuzzy on path
  queryIndex = 0;
  score = 0;
  consecutiveMatches = 0;
  
  for (let i = 0; i < pathLower.length && queryIndex < queryLower.length; i++) {
    if (pathLower[i] === queryLower[queryIndex]) {
      queryIndex++;
      consecutiveMatches++;
      score += consecutiveMatches;
    } else {
      consecutiveMatches = 0;
    }
  }
  
  if (queryIndex === queryLower.length) {
    return { match: true, score: Math.min(score, 30) + (file.isRecent ? 10 : 0) };
  }
  
  return { match: false, score: 0 };
}

/**
 * Highlight matched characters
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  
  // Remove line number syntax
  const cleanQuery = query.split(':')[0].toLowerCase();
  if (!cleanQuery) return text;
  
  const textLower = text.toLowerCase();
  
  // Try contains match first
  const index = textLower.indexOf(cleanQuery);
  if (index !== -1) {
    return (
      <>
        {text.slice(0, index)}
        <span className="text-[var(--color-accent-primary)] font-semibold">
          {text.slice(index, index + cleanQuery.length)}
        </span>
        {text.slice(index + cleanQuery.length)}
      </>
    );
  }
  
  // Fuzzy highlight
  const result: React.ReactNode[] = [];
  let queryIndex = 0;
  
  for (let i = 0; i < text.length; i++) {
    if (queryIndex < cleanQuery.length && textLower[i] === cleanQuery[queryIndex]) {
      result.push(
        <span key={i} className="text-[var(--color-accent-primary)] font-semibold">
          {text[i]}
        </span>
      );
      queryIndex++;
    } else {
      result.push(text[i]);
    }
  }
  
  return result;
}

export const QuickOpen: React.FC<QuickOpenProps> = ({
  isOpen,
  onClose,
  files,
  recentFiles = [],
  onFileSelect,
  onGoToLine,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Mark recent files
  const filesWithRecent = useMemo(() => {
    const recentSet = new Set(recentFiles);
    return files.map(f => ({
      ...f,
      isRecent: recentSet.has(f.path),
    }));
  }, [files, recentFiles]);

  // Filter and sort files
  const filteredFiles = useMemo(() => {
    const scored = filesWithRecent
      .map(file => {
        const result = fuzzyMatchFile(query, file);
        return { file, ...result };
      })
      .filter(({ match }) => match)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ file }) => file);
  }, [filesWithRecent, query]);

  // Parse line number from query
  const lineNumber = useMemo(() => {
    if (query.includes(':')) {
      const parts = query.split(':');
      const num = parseInt(parts[parts.length - 1], 10);
      return isNaN(num) ? null : num;
    }
    return null;
  }, [query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredFiles.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Handle selection
  const handleSelect = useCallback((file: QuickOpenFile) => {
    onFileSelect(file.path);
    if (lineNumber && onGoToLine) {
      // Small delay to let file open first
      setTimeout(() => onGoToLine(lineNumber), 100);
    }
    onClose();
  }, [onFileSelect, onGoToLine, lineNumber, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredFiles.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredFiles.length - 1
        );
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

  // Click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-quick-open]')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      {/* Quick Open */}
      <div 
        data-quick-open
        className={cn(
          "relative w-[600px] max-w-[90vw] bg-[var(--color-surface-1)] rounded-lg shadow-2xl",
          "border border-[var(--color-border-subtle)] overflow-hidden",
          "animate-in fade-in slide-in-from-top-4 duration-150"
        )}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)]">
          <Search size={16} className="text-[var(--color-text-muted)] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name (add :line to go to line)"
            className={cn(
              "flex-1 bg-transparent text-xs text-[var(--color-text-primary)]",
              "placeholder:text-[var(--color-text-placeholder)]",
              "outline-none"
            )}
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results */}
        <div 
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto"
        >
          {filteredFiles.length === 0 ? (
            <div className="px-3 py-8 text-center text-[var(--color-text-muted)] text-xs">
              No files found
            </div>
          ) : (
            filteredFiles.slice(0, 100).map((file, index) => {
              const Icon = getFileIcon(file.name);
              return (
                <button
                  key={file.path}
                  onClick={() => handleSelect(file)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left",
                    "transition-colors",
                    index === selectedIndex
                      ? "bg-[var(--color-accent-primary)]/20 text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                  )}
                >
                  <Icon size={14} className="flex-shrink-0 text-[var(--color-text-muted)]" />
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-xs truncate">
                      {highlightMatch(file.name, query)}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                      {file.relativePath}
                    </span>
                  </div>
                  {file.isRecent && (
                    <Clock size={12} className="flex-shrink-0 text-[var(--color-text-muted)]" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
          <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-3)]">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-3)]">↵</kbd>
              open
            </span>
            {lineNumber && (
              <span className="text-[var(--color-accent-primary)]">
                Go to line {lineNumber}
              </span>
            )}
          </div>
          <div className="text-[9px] text-[var(--color-text-muted)]">
            {filteredFiles.length} files
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickOpen;
