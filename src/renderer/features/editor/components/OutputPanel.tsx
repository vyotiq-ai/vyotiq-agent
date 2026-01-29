/**
 * OutputPanel Component
 *
 * VS Code-style output panel for displaying application logs and tool execution output.
 * Shows logs from different sources with color-coded severity levels.
 * Features:
 * - Copy/paste support with keyboard shortcuts
 * - Right-click context menu
 * - Text selection
 */

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  Trash2,
  Download,
  Filter,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Copy,
  Search,
} from 'lucide-react';
import { cn } from '../../../utils/cn';

export interface OutputEntry {
  id: string;
  timestamp: Date;
  source: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'trace';
  message: string;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

interface OutputPanelProps {
  className?: string;
}

const levelColors: Record<OutputEntry['level'], string> = {
  info: 'text-[var(--color-info)]',
  warn: 'text-[var(--color-warning)]',
  error: 'text-[var(--color-error)]',
  debug: 'text-[var(--color-text-muted)]',
  trace: 'text-[var(--color-text-placeholder)]',
};

const levelLabels: Record<OutputEntry['level'], string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
  trace: 'TRACE',
};

// Get all unique sources from entries
const getSources = (entries: OutputEntry[]): string[] => {
  const sources = new Set<string>();
  for (const entry of entries) {
    sources.add(entry.source);
  }
  return Array.from(sources).sort();
};

export const OutputPanel: React.FC<OutputPanelProps> = memo(({ className }) => {
  const [entries, setEntries] = useState<OutputEntry[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<OutputEntry['level'] | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sources = getSources(entries);

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

  // Copy all output
  const handleCopyAll = useCallback(() => {
    const content = entries
      .map(e => `[${e.timestamp.toISOString()}] [${e.source}] [${levelLabels[e.level]}] ${e.message}`)
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

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when this panel has focus
      if (!contentRef.current?.contains(document.activeElement) && 
          !scrollRef.current?.contains(document.activeElement)) return;

      // Ctrl+C - Copy
      if (e.ctrlKey && e.key === 'c') {
        const selection = window.getSelection();
        if (selection && selection.toString()) {
          navigator.clipboard.writeText(selection.toString());
        }
      }

      // Ctrl+A - Select All
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }

      // Ctrl+F - Find
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }

      // Escape - Close search
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSelectAll, isSearchOpen]);

  // Toggle expanded state for multi-line entries
  const toggleExpanded = useCallback((entryId: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }, []);

  // Helper to add entry
  const addEntry = useCallback((source: string, level: OutputEntry['level'], message: string) => {
    const entry: OutputEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date(),
      source,
      level,
      message,
    };
    setEntries(prev => [...prev.slice(-999), entry]); // Keep last 1000 entries
  }, []);

  // Subscribe to output events from main process
  useEffect(() => {
    const handleOutput = (event: CustomEvent<OutputEntry>) => {
      setEntries(prev => [...prev.slice(-999), event.detail]);
    };

    // Subscribe to agent events for comprehensive output
    const unsubscribe = window.vyotiq?.agent?.onEvent?.((event) => {
      switch (event.type) {
        case 'tool-call': {
          const toolCall = 'toolCall' in event ? event.toolCall : null;
          addEntry('Agent', 'info', `> Executing: ${toolCall?.name || 'unknown tool'}`);
          break;
        }
        case 'tool-result': {
          const result = 'result' in event ? event.result : null;
          const level = result?.success === false ? 'error' : 'info';
          const icon = result?.success ? '[OK]' : '[ERR]';
          addEntry('Agent', level, `${icon} ${result?.toolName || 'unknown'}: ${result?.success ? 'Success' : 'Failed'}`);
          break;
        }
        case 'run-status': {
          if ('status' in event && 'message' in event) {
            const status = event.status as string;
            const message = (event.message as string) || status;
            const level = status === 'error' ? 'error' : status === 'cancelled' ? 'warn' : 'info';
            addEntry('Run', level, message);
          }
          break;
        }
        case 'progress': {
          if ('progress' in event) {
            const progress = event.progress as { message?: string; percent?: number };
            if (progress?.message) {
              addEntry('Progress', 'debug', progress.message);
            }
          }
          break;
        }
        case 'terminal-output': {
          if ('data' in event && event.data) {
            const data = (event.data as string).trim();
            if (data) {
              addEntry('Terminal', 'trace', data);
            }
          }
          break;
        }
        default:
          break;
      }
    });

    document.addEventListener('vyotiq:output', handleOutput as EventListener);

    return () => {
      document.removeEventListener('vyotiq:output', handleOutput as EventListener);
      unsubscribe?.();
    };
  }, [addEntry]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // Clear all entries
  const handleClear = useCallback(() => {
    setEntries([]);
  }, []);

  // Export entries to file
  const handleExport = useCallback(() => {
    const content = entries
      .map(e => `[${e.timestamp.toISOString()}] [${e.source}] [${levelLabels[e.level]}] ${e.message}`)
      .join('\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vyotiq-output-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    if (selectedSource !== 'all' && entry.source !== selectedSource) return false;
    if (filterLevel !== 'all' && entry.level !== filterLevel) return false;
    return true;
  });

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  return (
    <div className={cn('flex flex-col h-full min-w-0 overflow-hidden bg-[var(--color-surface-editor)]', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] min-w-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-shrink overflow-x-auto scrollbar-none">
          {/* Source selector */}
          <div className="flex items-center gap-1">
            <Filter size={10} className="text-[var(--color-text-muted)]" />
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="text-[10px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 focus:outline-none focus:border-[var(--color-accent-primary)]"
            >
              <option value="all">All Sources</option>
              {sources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>

          {/* Level filter */}
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as typeof filterLevel)}
            className="text-[10px] bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 focus:outline-none focus:border-[var(--color-accent-primary)]"
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
            <option value="trace">Trace</option>
          </select>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors',
              autoScroll && 'text-[var(--color-accent-primary)]'
            )}
            title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
          >
            {autoScroll ? <Lock size={12} /> : <Unlock size={12} />}
          </button>

          {/* Export */}
          <button
            onClick={handleExport}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Export output"
            disabled={entries.length === 0}
          >
            <Download size={12} />
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Clear output"
            disabled={entries.length === 0}
          >
            <Trash2 size={12} />
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Copy selection (Ctrl+C)"
          >
            <Copy size={12} />
          </button>

          {/* Search toggle */}
          <button
            onClick={() => setIsSearchOpen(prev => !prev)}
            className={cn(
              'p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors',
              isSearchOpen && 'text-[var(--color-accent-primary)] bg-[var(--color-surface-2)]'
            )}
            title="Find (Ctrl+F)"
          >
            <Search size={12} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {isSearchOpen && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsSearchOpen(false);
              }
            }}
            placeholder="Find in output..."
            className="flex-1 px-2 py-1 text-[10px] font-mono bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:border-[var(--color-accent-primary)]"
            autoFocus
          />
        </div>
      )}

      {/* Output content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed"
        onContextMenu={handleContextMenu}
        tabIndex={0}
      >
        {filteredEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)] text-[11px]">
            No output
          </div>
        ) : (
          <div ref={contentRef} className="p-2 space-y-0.5">
            {filteredEntries.map((entry) => {
              const isMultiLine = entry.message.includes('\n');
              const isExpanded = expandedEntries.has(entry.id);
              const displayMessage = isMultiLine && !isExpanded
                ? entry.message.split('\n')[0] + '...'
                : entry.message;
              
              // Highlight search matches
              const highlightedMessage = searchQuery && displayMessage.toLowerCase().includes(searchQuery.toLowerCase())
                ? displayMessage
                : displayMessage;

              return (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-start gap-2 py-0.5 hover:bg-[var(--color-surface-hover)] px-1 rounded select-text',
                    isMultiLine && 'cursor-pointer',
                    searchQuery && entry.message.toLowerCase().includes(searchQuery.toLowerCase()) && 'bg-[var(--color-warning)]/10'
                  )}
                  onClick={isMultiLine ? () => toggleExpanded(entry.id) : undefined}
                >
                  {/* Expand/collapse icon for multi-line entries */}
                  {isMultiLine ? (
                    <button
                      className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(entry.id);
                      }}
                    >
                      {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    </button>
                  ) : (
                    <span className="w-[10px] flex-shrink-0" />
                  )}
                  <span className="text-[var(--color-text-placeholder)] flex-shrink-0 tabular-nums">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className="text-[var(--color-text-dim)] flex-shrink-0 w-12">
                    [{entry.source}]
                  </span>
                  <span className={cn('flex-shrink-0 w-12', levelColors[entry.level])}>
                    [{levelLabels[entry.level]}]
                  </span>
                  <pre className={cn(
                    'text-[var(--color-text-primary)] break-words flex-1 m-0 whitespace-pre-wrap select-text',
                    isMultiLine && !isExpanded && 'truncate'
                  )}>
                    {highlightedMessage}
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
          <button
            onClick={() => { setIsSearchOpen(true); setContextMenu({ isOpen: false, x: 0, y: 0 }); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] text-left hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <Search size={12} />
            <span>Find</span>
            <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">Ctrl+F</span>
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
    </div>
  );
});

OutputPanel.displayName = 'OutputPanel';

export default OutputPanel;
