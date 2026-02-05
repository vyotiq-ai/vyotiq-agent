/**
 * IntegratedTerminal Component
 * 
 * VS Code-style integrated terminal using xterm.js with node-pty backend.
 * Features:
 * - Real shell integration (PowerShell on Windows, bash/zsh on Unix)
 * - Full terminal emulation (colors, cursor, scrollback)
 * - Fit addon for responsive sizing
 * - Search addon for finding text
 * - Web links addon for clickable URLs
 * - Clipboard addon for copy/paste support
 * - Unicode11 addon for better emoji/unicode handling
 * - Maintains existing terminal styling aesthetics
 * - VSCode-like keyboard shortcuts (Ctrl+Shift+C/V for copy/paste)
 * - Right-click context menu for terminal actions
 */

import React, { useRef, useEffect, useCallback, useState, memo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { X, Plus, RotateCcw, Trash2, Search, Copy, ClipboardPaste } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

interface IntegratedTerminalProps {
  className?: string;
  workspacePath?: string;
}

export const IntegratedTerminal: React.FC<IntegratedTerminalProps> = memo(({
  className,
  workspacePath,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0 });
  const [hasSelection, setHasSelection] = useState(false);
  
  // Get active tab for displaying cwd and status
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu({ isOpen: false, x: 0, y: 0 });
    if (contextMenu.isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.isOpen]);

  // Copy selected text from terminal
  const handleCopy = useCallback(() => {
    if (terminalRef.current) {
      const selection = terminalRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
        terminalRef.current.clearSelection();
      }
    }
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  }, []);

  // Paste from clipboard to terminal
  const handlePaste = useCallback(async () => {
    if (terminalRef.current && activeTabId) {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          window.vyotiq?.terminal?.write?.(activeTabId, text);
        }
      } catch (error) {
        console.error('Failed to paste:', error);
      }
    }
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  }, [activeTabId]);

  // Select all text in terminal
  const handleSelectAll = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.selectAll();
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
  
  // Generate unique terminal ID
  const generateTerminalId = useCallback(() => {
    return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);
  
  // Create a new terminal tab
  const createTerminal = useCallback(async () => {
    const id = generateTerminalId();
    const cwd = workspacePath || '';
    
    try {
      const result = await window.vyotiq?.terminal?.spawn?.({ id, cwd });
      if (result?.success) {
        const name = `Terminal ${tabs.length + 1}`;
        setTabs(prev => [...prev, { id, name, cwd: result.cwd || cwd }]);
        setActiveTabId(id);
      }
    } catch (error) {
      console.error('Failed to create terminal:', error);
    }
  }, [generateTerminalId, tabs.length, workspacePath]);
  
  // Kill terminal tab
  const killTerminal = useCallback(async (id: string) => {
    try {
      await window.vyotiq?.terminal?.kill?.(id);
      setTabs(prev => prev.filter(t => t.id !== id));
      if (activeTabId === id) {
        setActiveTabId(tabs.find(t => t.id !== id)?.id || null);
      }
    } catch (error) {
      console.error('Failed to kill terminal:', error);
    }
  }, [activeTabId, tabs]);
  
  // Clear terminal screen
  const clearTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear();
    }
  }, []);
  
  // Search in terminal
  const handleSearch = useCallback((query: string, findNext = true) => {
    if (searchAddonRef.current && query) {
      if (findNext) {
        searchAddonRef.current.findNext(query, { caseSensitive: false, wholeWord: false });
      } else {
        searchAddonRef.current.findPrevious(query, { caseSensitive: false, wholeWord: false });
      }
    }
  }, []);
  
  // Initialize xterm.js when active tab changes
  useEffect(() => {
    if (!containerRef.current || !activeTabId) return;
    
    // Dispose previous terminal
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }
    
    // Create new terminal
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
      fontSize: 13,
      fontWeight: 'normal',
      lineHeight: 1.4,
      letterSpacing: 0,
      scrollback: 10000,
      allowTransparency: true,
      allowProposedApi: true,
      theme: {
        background: '#0b0b0f',
        foreground: '#e4e4e7',
        cursor: '#34d399',
        cursorAccent: '#0b0b0f',
        selectionBackground: '#34d39940',
        selectionForeground: undefined,
        black: '#18181b',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#a78bfa',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#71717a',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#c4b5fd',
        brightCyan: '#67e8f9',
        brightWhite: '#fafafa',
      },
    });
    
    // Load addons
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicodeAddon = new Unicode11Addon();
    const clipboardAddon = new ClipboardAddon();
    
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(unicodeAddon);
    terminal.loadAddon(clipboardAddon);
    terminal.unicode.activeVersion = '11';
    
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    
    // Open terminal in container
    terminal.open(containerRef.current);
    
    // Fit to container
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        // Notify backend of new size
        const { cols, rows } = terminal;
        window.vyotiq?.terminal?.resize?.(activeTabId, cols, rows);
      } catch {
        // Ignore fit errors during initialization
      }
    });
    
    // Handle user input
    terminal.onData((data) => {
      window.vyotiq?.terminal?.write?.(activeTabId, data);
    });
    
    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      window.vyotiq?.terminal?.resize?.(activeTabId, cols, rows);
    });

    // Track selection changes
    terminal.onSelectionChange(() => {
      setHasSelection(terminal.hasSelection());
    });

    // Custom keyboard shortcuts (VSCode-style)
    terminal.attachCustomKeyEventHandler((event) => {
      // Ctrl+Shift+C - Copy (VSCode style)
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c' && event.type === 'keydown') {
        if (terminal.hasSelection()) {
          navigator.clipboard.writeText(terminal.getSelection());
          terminal.clearSelection();
        }
        return false; // Prevent default
      }
      
      // Ctrl+Shift+V - Paste (VSCode style)
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'v' && event.type === 'keydown') {
        navigator.clipboard.readText().then(text => {
          if (text && activeTabId) {
            window.vyotiq?.terminal?.write?.(activeTabId, text);
          }
        });
        return false;
      }

      // Ctrl+L - Clear terminal
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'l' && event.type === 'keydown') {
        terminal.clear();
        return false;
      }

      // Ctrl+A - Select all
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'a' && event.type === 'keydown') {
        terminal.selectAll();
        return false;
      }

      // Ctrl+F - Open search
      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'f' && event.type === 'keydown') {
        setIsSearchOpen(true);
        return false;
      }

      // Escape - Close search or clear selection
      if (event.key === 'Escape' && event.type === 'keydown') {
        if (terminal.hasSelection()) {
          terminal.clearSelection();
          return false;
        }
      }

      return true; // Allow default handling for other keys
    });
    
    // Set up resize observer
    resizeObserverRef.current = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore errors during resize
        }
      });
    });
    resizeObserverRef.current.observe(containerRef.current);
    
    // Focus terminal
    terminal.focus();
    
    return () => {
      resizeObserverRef.current?.disconnect();
      terminal.dispose();
    };
  }, [activeTabId]);
  
  // Listen for terminal data from backend
  useEffect(() => {
    if (!activeTabId) return;
    
    const unsubscribeData = window.vyotiq?.terminal?.onData?.((event) => {
      if (event.id === activeTabId && terminalRef.current) {
        terminalRef.current.write(event.data);
        
        // Dispatch event for other components to detect terminal output (e.g., npm install completion)
        document.dispatchEvent(new CustomEvent('vyotiq:terminal:output', {
          detail: { output: event.data, terminalId: event.id }
        }));
      }
    });
    
    const unsubscribeExit = window.vyotiq?.terminal?.onExit?.((event) => {
      if (event.id === activeTabId && terminalRef.current) {
        terminalRef.current.writeln(`\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m`);
      }
    });
    
    return () => {
      unsubscribeData?.();
      unsubscribeExit?.();
    };
  }, [activeTabId]);
  
  // Auto-create first terminal if none exists
  useEffect(() => {
    if (tabs.length === 0) {
      createTerminal();
    }
  }, [createTerminal, tabs.length]);
  
  return (
    <div className={cn('flex flex-col h-full min-w-0 overflow-hidden bg-[var(--color-surface-editor)]', className)}>
      {/* Terminal tabs header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] min-w-0 gap-1">
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none min-w-0 flex-shrink">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setActiveTabId(tab.id)}
              className={cn(
                'group flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono transition-colors cursor-pointer',
                tab.id === activeTabId
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/50'
              )}
            >
              <span className="text-[var(--color-accent-primary)]">›</span>
              <span className="truncate max-w-[100px]">{tab.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  killTerminal(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-all"
                title="Close terminal"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Copy selection */}
          <button
            onClick={handleCopy}
            disabled={!hasSelection}
            className={cn(
              "p-1.5 rounded transition-colors",
              hasSelection 
                ? "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                : "text-[var(--color-text-placeholder)] cursor-not-allowed"
            )}
            title="Copy selection (Ctrl+Shift+C)"
          >
            <Copy size={12} />
          </button>

          {/* Paste from clipboard */}
          <button
            onClick={handlePaste}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Paste (Ctrl+Shift+V)"
          >
            <ClipboardPaste size={12} />
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
          
          {/* Clear terminal */}
          <button
            onClick={clearTerminal}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="Clear terminal (Ctrl+L)"
          >
            <RotateCcw size={12} />
          </button>
          
          {/* New terminal */}
          <button
            onClick={createTerminal}
            className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
            title="New terminal (Ctrl+Shift+`)"
          >
            <Plus size={12} />
          </button>
          
          {/* Kill all */}
          {tabs.length > 0 && (
            <button
              onClick={() => tabs.forEach(t => killTerminal(t.id))}
              className="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-surface-2)] transition-colors"
              title="Kill all terminals"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      
      {/* Search bar */}
      {isSearchOpen && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(searchQuery, !e.shiftKey);
              }
              if (e.key === 'Escape') {
                setIsSearchOpen(false);
              }
            }}
            placeholder="Find in terminal..."
            className="flex-1 min-w-0 px-2 py-1 text-[10px] font-mono bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] focus:outline-none focus:border-[var(--color-accent-primary)]"
            autoFocus
          />
          <button
            onClick={() => handleSearch(searchQuery, true)}
            className="px-2 py-1 text-[10px] rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors flex-shrink-0"
          >
            Next
          </button>
          <button
            onClick={() => handleSearch(searchQuery, false)}
            className="px-2 py-1 text-[10px] rounded bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors flex-shrink-0"
          >
            Prev
          </button>
        </div>
      )}
      
      {/* Terminal content */}
      <div 
        ref={containerRef} 
        className="flex-1 min-h-0 min-w-0 p-1 overflow-hidden"
        onClick={() => terminalRef.current?.focus()}
        onContextMenu={handleContextMenu}
      />

      {/* Context menu */}
      {contextMenu.isOpen && (
        <div 
          className="fixed z-[100] min-w-[160px] py-1 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-md shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleCopy}
            disabled={!hasSelection}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors",
              hasSelection 
                ? "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                : "text-[var(--color-text-muted)] cursor-not-allowed opacity-50"
            )}
          >
            <Copy size={12} />
            <span>Copy</span>
            <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">Ctrl+Shift+C</span>
          </button>
          <button
            onClick={handlePaste}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] text-left hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <ClipboardPaste size={12} />
            <span>Paste</span>
            <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">Ctrl+Shift+V</span>
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
            onClick={() => { clearTerminal(); setContextMenu({ isOpen: false, x: 0, y: 0 }); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-[var(--color-text-primary)] text-left hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <RotateCcw size={12} />
            <span>Clear</span>
            <span className="ml-auto text-[9px] text-[var(--color-text-muted)]">Ctrl+L</span>
          </button>
        </div>
      )}

      {/* Status bar showing current working directory */}
      {activeTab && (
        <div className="flex items-center justify-between px-2 py-0.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] min-w-0 gap-2">
          <span className="text-[9px] font-mono text-[var(--color-text-muted)] truncate min-w-0 flex-shrink" title={activeTab.cwd}>
            {activeTab.cwd}
          </span>
          <span className="text-[9px] font-mono text-[var(--color-text-placeholder)] flex-shrink-0">
            {activeTab.name}
          </span>
        </div>
      )}
      
      {/* Empty state */}
      {tabs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={createTerminal}
            className="flex items-center gap-2 px-4 py-2 text-[11px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] transition-colors"
          >
            <Plus size={14} />
            <span>Create Terminal</span>
          </button>
        </div>
      )}
    </div>
  );
});

IntegratedTerminal.displayName = 'IntegratedTerminal';

export default IntegratedTerminal;
