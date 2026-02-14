/**
 * TerminalView - xterm.js integration for the integrated terminal panel
 * 
 * Wraps xterm.js with proper lifecycle management, theming, and
 * connection to the main process terminal via IPC.
 */
import React, { useEffect, useRef, useCallback, memo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('TerminalView');

interface TerminalViewProps {
  /** Terminal session ID managed by main process */
  terminalId: string;
  /** Whether this terminal tab is currently visible/active */
  isActive: boolean;
}

/**
 * Read a CSS custom property from the document root.
 * Falls back to a default if the property is not set.
 */
function getCSSVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Build an xterm ITheme from the app's CSS variables */
function buildTheme(): Record<string, string> {
  return {
    background: getCSSVar('--color-surface-1', '#0a0a0f'),
    foreground: getCSSVar('--color-text-primary', '#e0e0e8'),
    cursor: getCSSVar('--color-accent-primary', '#00e5a0'),
    cursorAccent: getCSSVar('--color-surface-1', '#0a0a0f'),
    selectionBackground: getCSSVar('--color-accent-primary', '#00e5a0') + '33',
    black: getCSSVar('--color-terminal-black', '#1a1a2e'),
    red: getCSSVar('--color-terminal-red', '#ff6b6b'),
    green: getCSSVar('--color-terminal-green', '#00e5a0'),
    yellow: getCSSVar('--color-terminal-yellow', '#febc2e'),
    blue: getCSSVar('--color-terminal-blue', '#6c9eff'),
    magenta: getCSSVar('--color-terminal-magenta', '#c792ea'),
    cyan: getCSSVar('--color-terminal-cyan', '#89ddff'),
    white: getCSSVar('--color-terminal-white', '#e0e0e8'),
    brightBlack: getCSSVar('--color-terminal-bright-black', '#4a4a5e'),
    brightRed: getCSSVar('--color-terminal-bright-red', '#ff8a8a'),
    brightGreen: getCSSVar('--color-terminal-bright-green', '#5cf5c0'),
    brightYellow: getCSSVar('--color-terminal-bright-yellow', '#ffd966'),
    brightBlue: getCSSVar('--color-terminal-bright-blue', '#8ab4ff'),
    brightMagenta: getCSSVar('--color-terminal-bright-magenta', '#dbb4f0'),
    brightCyan: getCSSVar('--color-terminal-bright-cyan', '#a8e8ff'),
    brightWhite: getCSSVar('--color-terminal-bright-white', '#ffffff'),
  };
}

const TerminalViewComponent: React.FC<TerminalViewProps> = ({ terminalId, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const disposeDataRef = useRef<(() => void) | null>(null);
  const disposeExitRef = useRef<(() => void) | null>(null);
  /** Track last sent cols/rows to avoid flooding IPC with identical resize calls */
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fit terminal to container dimensions (debounced IPC resize)
  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current && containerRef.current) {
      try {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        // Only send IPC if dimensions actually changed
        const last = lastSizeRef.current;
        if (!last || last.cols !== cols || last.rows !== rows) {
          lastSizeRef.current = { cols, rows };
          window.vyotiq?.terminal?.resize(terminalId, cols, rows);
        }
      } catch (err) {
        logger.debug('Terminal fit failed, container may not be visible', { error: err instanceof Error ? err.message : String(err) });
      }
    }
  }, [terminalId]);

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;
    // Guard: ensure IPC bridge is available before initializing
    if (!window.vyotiq?.terminal) {
      logger.warn('IPC bridge not ready, deferring initialization');
      return;
    }

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      theme: buildTheme(),
      allowProposedApi: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';

    term.open(containerRef.current);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Fit after a brief delay to allow layout
    const fitTimer = setTimeout(() => fitAddon.fit(), 50);

    // Forward user input to main process
    const inputDisposable = term.onData((data: string) => {
      window.vyotiq?.terminal?.write(terminalId, data);
    });

    // Receive data from main process
    const unsubData = window.vyotiq.terminal.onData((event) => {
      if (event.id === terminalId) {
        term.write(event.data);
      }
    });
    disposeDataRef.current = unsubData;

    // Handle terminal exit
    const unsubExit = window.vyotiq.terminal.onExit((event) => {
      if (event.id === terminalId) {
        term.write(`\r\n\x1b[90m[Process exited with code ${event.exitCode}]\x1b[0m\r\n`);
      }
    });
    disposeExitRef.current = unsubExit;

    return () => {
      clearTimeout(fitTimer);
      inputDisposable.dispose();
      disposeDataRef.current?.();
      disposeExitRef.current?.();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId]);

// Re-fit on visibility change or window resize (debounced)
  useEffect(() => {
    if (!isActive) return;

    // Fit when becoming active
    const timer = setTimeout(fitTerminal, 50);

    // Debounce ResizeObserver to avoid flooding IPC during drag-resize
    const debouncedFit = () => {
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = setTimeout(fitTerminal, 100);
    };

    const resizeObserver = new ResizeObserver(debouncedFit);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
      resizeObserver.disconnect();
    };
  }, [isActive, fitTerminal]);

  // Update theme when CSS vars change (theme switch)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = buildTheme();
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  );
};

export const TerminalView = memo(TerminalViewComponent);
TerminalView.displayName = 'TerminalView';
