/**
 * DebugConsole Component
 *
 * VS Code-style debug console for displaying debug output and allowing expression evaluation.
 * Shows debug messages, breakpoint hits, and allows evaluating expressions.
 * Features:
 * - Copy/paste support with keyboard shortcuts
 * - Right-click context menu
 * - Text selection
 */

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import {
  Trash2,
  Play,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Copy,
  Search,
} from 'lucide-react';
import { cn } from '../../../utils/cn';

export interface DebugEntry {
  id: string;
  timestamp: Date;
  type: 'input' | 'output' | 'error' | 'info' | 'warning';
  content: string;
  result?: string;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

interface DebugConsoleProps {
  className?: string;
}

const typeIcons: Record<DebugEntry['type'], React.ElementType> = {
  input: ChevronRight,
  output: CheckCircle2,
  error: AlertCircle,
  info: Clock,
  warning: AlertCircle,
};

const typeColors: Record<DebugEntry['type'], string> = {
  input: 'text-[var(--color-accent-primary)]',
  output: 'text-[var(--color-text-primary)]',
  error: 'text-[var(--color-error)]',
  info: 'text-[var(--color-info)]',
  warning: 'text-[var(--color-warning)]',
};

export const DebugConsole: React.FC<DebugConsoleProps> = memo(({ className }) => {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [filterType, setFilterType] = useState<DebugEntry['type'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu({ isOpen: false, x: 0, y: 0 });
    if (contextMenu.isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.isOpen]);

  // Copy selected text
  const handleCopy = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      navigator.clipboard.writeText(selection.toString());
    }
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  }, []);

  // Copy all console output
  const handleCopyAll = useCallback(() => {
    const content = entries
      .map(e => `${e.type === 'input' ? '> ' : ''}${e.content}`)
      .join('\n');
    navigator.clipboard.writeText(content);
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  }, [entries]);

  // Select all text
  const handleSelectAll = useCallback(() => {
    if (contentRef.current) {
      const range = document.createRange();
      range.selectNodeContents(contentRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  }, []);

  // Paste to input
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputValue(prev => prev + text);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to paste:', error);
    }
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  }, []);

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  // Subscribe to debug events from main process
  useEffect(() => {
    const handleDebugEvent = (event: CustomEvent<DebugEntry>) => {
      setEntries(prev => [...prev.slice(-499), event.detail]); // Keep last 500 entries
    };

    document.addEventListener('vyotiq:debug', handleDebugEvent as EventListener);

    return () => {
      document.removeEventListener('vyotiq:debug', handleDebugEvent as EventListener);
    };
  }, []);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  // Evaluate expression
  const handleEvaluate = useCallback(async () => {
    if (!inputValue.trim() || isEvaluating) return;

    const expression = inputValue.trim();
    setInputValue('');
    setHistory(prev => [...prev.slice(-49), expression]); // Keep last 50
    setHistoryIndex(-1);
    setIsEvaluating(true);

    // Add input entry
    const inputEntry: DebugEntry = {
      id: `${Date.now()}-input`,
      timestamp: new Date(),
      type: 'input',
      content: expression,
    };
    setEntries(prev => [...prev, inputEntry]);

    try {
      // Try to evaluate as JavaScript expression using Function constructor
      // This is safer than eval() as it runs in a separate scope
      let result: string;
      try {
        // Use Function constructor for expression evaluation
        // This creates a function that returns the expression result
        const evaluator = new Function(`"use strict"; return (${expression});`);
        const evalResult = evaluator();
        result = typeof evalResult === 'object'
          ? JSON.stringify(evalResult, null, 2)
          : String(evalResult);
      } catch (evalError) {
        result = `Error: ${evalError instanceof Error ? evalError.message : String(evalError)}`;
      }

      const outputEntry: DebugEntry = {
        id: `${Date.now()}-output`,
        timestamp: new Date(),
        type: result.startsWith('Error:') ? 'error' : 'output',
        content: result,
      };
      setEntries(prev => [...prev, outputEntry]);
    } catch (error) {
      const errorEntry: DebugEntry = {
        id: `${Date.now()}-error`,
        timestamp: new Date(),
        type: 'error',
        content: error instanceof Error ? error.message : String(error),
      };
      setEntries(prev => [...prev, errorEntry]);
    } finally {
      setIsEvaluating(false);
      inputRef.current?.focus();
    }
  }, [inputValue, isEvaluating]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEvaluate();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInputValue(history[history.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(history[history.length - 1 - newIndex] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  }, [handleEvaluate, history, historyIndex]);

  // Clear all entries
  const handleClear = useCallback(() => {
    setEntries([]);
  }, []);

  // Filter entries by type and search query
  const filteredEntries = useMemo(() => {
    let result = filterType === 'all'
      ? entries
      : entries.filter(entry => entry.type === filterType);
    
    // Apply search filter if query exists
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(entry => 
        entry.content.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [entries, filterType, searchQuery]);

  // Toggle search visibility
  const toggleSearch = useCallback(() => {
    setIsSearchVisible(prev => !prev);
    if (!isSearchVisible) {
      // Focus search input when opening
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      // Clear search when closing
      setSearchQuery('');
    }
  }, [isSearchVisible]);

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className={cn('flex flex-col h-full min-w-0 overflow-hidden bg-[var(--color-surface-editor)]', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] min-w-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-shrink overflow-x-auto scrollbar-none">
          {/* Filter */}
          <div className="flex items-center gap-1">
            <Filter size={10} className="text-[var(--color-text-muted)]" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="text-[10px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 focus:outline-none focus:border-[var(--color-accent-primary)]"
            >
              <option value="all">All</option>
              <option value="input">Input</option>
              <option value="output">Output</option>
              <option value="error">Errors</option>
              <option value="info">Info</option>
              <option value="warning">Warnings</option>
            </select>
          </div>

          <span className="text-[10px] text-[var(--color-text-muted)]">
            {filteredEntries.length} entries
          </span>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Search toggle */}
          <button
            onClick={toggleSearch}
            className={cn(
              'p-1.5 rounded transition-colors',
              isSearchVisible 
                ? 'text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10' 
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
            )}
            title="Toggle search (Ctrl+F)"
          >
            <Search size={12} />
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Copy selection (Ctrl+C)"
          >
            <Copy size={12} />
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Clear console"
            disabled={entries.length === 0}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {isSearchVisible && (
        <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-editor)] min-w-0">
          <Search size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search console output..."
            className="flex-1 min-w-0 bg-transparent text-[11px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsSearchVisible(false);
                setSearchQuery('');
              }
            }}
          />
          {searchQuery && (
            <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">
              {filteredEntries.length} match{filteredEntries.length !== 1 ? 'es' : ''}
            </span>
          )}
        </div>
      )}

      {/* Console output */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 min-w-0 overflow-auto font-mono text-[11px] leading-relaxed"
        onContextMenu={handleContextMenu}
        tabIndex={0}
      >
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)] text-[11px]">
            No debug output
          </div>
        ) : (
          <div ref={contentRef} className="p-2 space-y-1">
            {filteredEntries.map((entry) => {
              const Icon = typeIcons[entry.type];
              return (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-start gap-2 py-0.5 px-1 rounded select-text',
                    entry.type === 'error' && 'bg-[var(--color-error)]/5',
                    entry.type === 'warning' && 'bg-[var(--color-warning)]/5'
                  )}
                >
                  <Icon size={12} className={cn('flex-shrink-0 mt-0.5', typeColors[entry.type])} />
                  <span className="text-[var(--color-text-placeholder)] flex-shrink-0 tabular-nums">
                    {formatTime(entry.timestamp)}
                  </span>
                  <pre className={cn('break-words whitespace-pre-wrap flex-1 m-0 select-text', typeColors[entry.type])}>
                    {entry.content}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu.isOpen && (
        <div 
          className="fixed z-[100] min-w-[160px] py-1 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-md shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] text-left hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <Copy size={12} />
            <span>Copy</span>
            <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">Ctrl+C</span>
          </button>
          <button
            onClick={handlePaste}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] text-left hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <span className="w-3" />
            <span>Paste</span>
            <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">Ctrl+V</span>
          </button>
          <button
            onClick={handleCopyAll}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] text-left hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <Copy size={12} />
            <span>Copy All</span>
          </button>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button
            onClick={handleSelectAll}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] text-left hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <span className="w-3" />
            <span>Select All</span>
            <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">Ctrl+A</span>
          </button>
          <div className="my-1 border-t border-[var(--color-border-subtle)]" />
          <button
            onClick={() => { handleClear(); setContextMenu({ isOpen: false, x: 0, y: 0 }); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] text-left hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <Trash2 size={12} />
            <span>Clear</span>
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
        <ChevronRight size={12} className="text-[var(--color-accent-primary)] flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Evaluate expression..."
          disabled={isEvaluating}
          className="flex-1 bg-transparent text-[11px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none"
        />
        <button
          onClick={handleEvaluate}
          disabled={!inputValue.trim() || isEvaluating}
          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-50"
          title="Evaluate (Enter)"
        >
          <Play size={12} />
        </button>
      </div>
    </div>
  );
});

DebugConsole.displayName = 'DebugConsole';

export default DebugConsole;
