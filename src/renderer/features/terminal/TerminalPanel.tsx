/**
 * Terminal Panel Component
 *
 * Embedded terminal panel with real xterm.js terminal integration
 * and fallback command execution support.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Play,
  Plus,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { cn } from '../../utils/cn';
import { cleanTerminalOutput } from '../../utils/ansi';
import { useActiveWorkspace } from '../../hooks';
import { createLogger } from '../../utils/logger';

const logger = createLogger('TerminalPanel');

type TerminalMode = 'simple' | 'xterm';

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'info';
  content: string;
  timestamp: number;
  pid?: number;
}

interface RunningProcess {
  pid: number;
  command: string;
}

interface TerminalTab {
  id: string;
  ptyId: string;
  title: string;
  history: TerminalLine[];
  runningProcess: RunningProcess | null;
  mode: TerminalMode;
}

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
}

const generatePtyId = () => `pty-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

function newLine(type: TerminalLine['type'], content: string, pid?: number): TerminalLine {
  return {
    id: `${Date.now()}-${Math.random()}`,
    type,
    content,
    timestamp: Date.now(),
    pid,
  };
}

function getCssVar(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = memo(({
  isOpen,
  onClose,
  onToggleMaximize,
  isMaximized = false,
}) => {
  const activeWorkspace = useActiveWorkspace();
  const workspacePath = activeWorkspace?.path;

  const workspaceLabel = useMemo(() => {
    const name = (activeWorkspace as { name?: string } | null | undefined)?.name;
    if (name && name.trim()) return name.trim();
    if (!workspacePath) return undefined;
    const parts = workspacePath.split(/[/\\]+/).filter(Boolean);
    return parts[parts.length - 1];
  }, [activeWorkspace, workspacePath]);

  const getTabTitle = useCallback(
    (tab: TerminalTab) => (workspaceLabel ? `${workspaceLabel} — ${tab.title}` : tab.title),
    [workspaceLabel]
  );

  const [tabs, setTabs] = useState<TerminalTab[]>(() => [
    {
      id: 'tab-1',
      ptyId: generatePtyId(),
      title: 'Terminal 1',
      history: [],
      runningProcess: null,
      mode: 'simple',
    },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [command, setCommand] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const tabCounter = useRef(1);

  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const tabsRef = useRef<TerminalTab[]>(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const workspacePathRef = useRef<string | undefined>(workspacePath);
  useEffect(() => {
    workspacePathRef.current = workspacePath;
  }, [workspacePath]);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];
  const terminalMode: TerminalMode = activeTab?.mode ?? 'simple';

  const setTerminalMode = useCallback(
    (mode: TerminalMode) => {
      setTabs(prev => prev.map(t => (t.id === activeTabId ? { ...t, mode } : t)));
    },
    [activeTabId]
  );

  const xtermContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const xtermInstancesRef = useRef<
    Map<string, { term: XTermTerminal; fit: FitAddon; inputBuffer: string; promptPrinted: boolean }>
  >(new Map());

  const ensureXTerm = useCallback((ptyId: string) => {
    const existing = xtermInstancesRef.current.get(ptyId);
    if (existing) return existing;

    const fit = new FitAddon();
    const term = new XTermTerminal({
      convertEol: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 12,
      cursorBlink: true,
      theme: {
        background: 'transparent',
        foreground: getCssVar('--color-text-primary', '#e4e4e7'),
        cursor: getCssVar('--color-accent-primary', '#34d399'),
      },
    });
    term.loadAddon(fit);

    const instance = { term, fit, inputBuffer: '', promptPrinted: false };
    xtermInstancesRef.current.set(ptyId, instance);
    return instance;
  }, []);

  const writeToXTerm = useCallback((ptyId: string, text: string) => {
    const inst = xtermInstancesRef.current.get(ptyId);
    if (!inst) return;
    inst.term.write(text.replace(/\n/g, '\r\n'));
  }, []);

  const printXTermPrompt = useCallback((ptyId: string) => {
    const inst = xtermInstancesRef.current.get(ptyId);
    if (!inst) return;
    inst.term.write('$ ');
    inst.promptPrinted = true;
  }, []);

  const clearTabHistory = useCallback((tabId: string) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, history: [] } : t)));
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find(t => t.id === tabId);
      if (tab?.runningProcess?.pid) {
        void window.vyotiq?.terminal?.kill(tab.runningProcess.pid);
      }

      setTabs(prev => {
        const next = prev.filter(t => t.id !== tabId);
        if (next.length === 0) {
          tabCounter.current += 1;
          return [
            {
              id: `tab-${tabCounter.current}`,
              ptyId: generatePtyId(),
              title: `Terminal ${tabCounter.current}`,
              history: [],
              runningProcess: null,
              mode: 'simple',
            },
          ];
        }
        return next;
      });

      setActiveTabId(current => {
        if (current !== tabId) return current;
        const remaining = tabsRef.current.filter(t => t.id !== tabId);
        return remaining[0]?.id ?? `tab-${tabCounter.current}`;
      });
    },
    []
  );

  const addLineToActiveTab = useCallback(
    (type: TerminalLine['type'], content: string, pid?: number) => {
      setTabs(prev =>
        prev.map(t => (t.id === activeTabId ? { ...t, history: [...t.history, newLine(type, content, pid)] } : t))
      );
    },
    [activeTabId]
  );

  const startCommandForTab = useCallback(
    async (tabId: string, cmd: string, source: 'simple' | 'xterm') => {
      const tab = tabsRef.current.find(t => t.id === tabId);
      if (!tab) return;
      if (tab.runningProcess) return;

      const cwd = workspacePathRef.current;

      if (cmd === 'clear' || cmd === 'cls') {
        clearTabHistory(tabId);
        if (source === 'xterm') {
          const inst = xtermInstancesRef.current.get(tab.ptyId);
          inst?.term.clear();
          printXTermPrompt(tab.ptyId);
        }
        return;
      }

      if (cmd === 'pwd' || cmd === 'cd') {
        const out = cwd || '(no workspace selected)';
        if (source === 'xterm') {
          writeToXTerm(tab.ptyId, `${out}\n`);
          printXTermPrompt(tab.ptyId);
        } else {
          addLineToActiveTab('output', out);
        }
        return;
      }

      if (cmd === 'help') {
        const helpText =
          `Built-in commands:\n` +
          `  clear, cls  - Clear terminal output\n` +
          `  pwd, cd     - Show current directory\n` +
          `  help        - Show this help\n` +
          `  exit        - Close this terminal tab\n\n` +
          `All other commands are executed in the system shell.\n` +
          `Press Ctrl+C to cancel running processes.`;

        if (source === 'xterm') {
          writeToXTerm(tab.ptyId, `${helpText}\n`);
          printXTermPrompt(tab.ptyId);
        } else {
          addLineToActiveTab('output', helpText);
        }
        return;
      }

      if (cmd === 'exit') {
        if (tabsRef.current.length > 1) {
          handleCloseTab(tabId);
        } else {
          onClose();
        }
        return;
      }

      try {
        const result = await window.vyotiq?.terminal?.run({
          command: cmd,
          cwd,
          waitForExit: false,
          timeout: 300000,
        });

        if (result?.success && result.pid) {
          setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, runningProcess: { pid: result.pid!, command: cmd } } : t)));
        } else {
          const msg = result?.error || 'Failed to start command';
          if (source === 'xterm') {
            writeToXTerm(tab.ptyId, `${msg}\n`);
            printXTermPrompt(tab.ptyId);
          } else {
            addLineToActiveTab('error', msg);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Command failed';
        if (source === 'xterm') {
          writeToXTerm(tab.ptyId, `${msg}\n`);
          printXTermPrompt(tab.ptyId);
        } else {
          addLineToActiveTab('error', msg);
        }
      }
    },
    [addLineToActiveTab, clearTabHistory, handleCloseTab, onClose, printXTermPrompt, writeToXTerm]
  );

  const handleNewTab = useCallback(() => {
    tabCounter.current += 1;
    const inheritMode = tabsRef.current.find(t => t.id === activeTabId)?.mode ?? 'simple';
    const newTab: TerminalTab = {
      id: `tab-${tabCounter.current}`,
      ptyId: generatePtyId(),
      title: `Terminal ${tabCounter.current}`,
      history: [],
      runningProcess: null,
      mode: inheritMode,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [activeTabId]);

  const handleClear = useCallback(() => {
    clearTabHistory(activeTabId);
    if (terminalMode === 'xterm' && activeTab) {
      const inst = xtermInstancesRef.current.get(activeTab.ptyId);
      inst?.term.clear();
      printXTermPrompt(activeTab.ptyId);
    }
  }, [activeTab, activeTabId, clearTabHistory, printXTermPrompt, terminalMode]);

  const handleKillProcess = useCallback(async () => {
    const tab = tabsRef.current.find(t => t.id === activeTabId);
    const pid = tab?.runningProcess?.pid;
    if (!pid) return;

    try {
      const result = await window.vyotiq?.terminal?.kill(pid);
      if (result?.success) {
        setTabs(prev =>
          prev.map(t =>
            t.id === activeTabId
              ? {
                  ...t,
                  runningProcess: null,
                  history: [...t.history, newLine('info', '^C - Process terminated', pid)],
                }
              : t
          )
        );

        if (tab?.mode === 'xterm') {
          writeToXTerm(tab.ptyId, '^C\n');
          printXTermPrompt(tab.ptyId);
        }
      }
    } catch (error) {
      logger.debug('Kill process failed', {
        pid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeTabId, printXTermPrompt, writeToXTerm]);

  const handleRunCommand = useCallback(async () => {
    if (!command.trim()) return;
    if (activeTab?.runningProcess) return;

    const cmd = command.trim();
    setCommandHistory(prev => [...prev.filter(c => c !== cmd), cmd]);
    setCommand('');
    setHistoryIndex(-1);

    addLineToActiveTab('input', `$ ${cmd}`);
    await startCommandForTab(activeTabId, cmd, 'simple');
  }, [activeTab?.runningProcess, activeTabId, addLineToActiveTab, command, startCommandForTab]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleRunCommand();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (commandHistory.length > 0) {
          const nextIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
          setHistoryIndex(nextIndex);
          setCommand(commandHistory[commandHistory.length - 1 - nextIndex] || '');
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
          const nextIndex = historyIndex - 1;
          setHistoryIndex(nextIndex);
          setCommand(commandHistory[commandHistory.length - 1 - nextIndex] || '');
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setCommand('');
        }
        return;
      }

      if (e.key === 'c' && e.ctrlKey && activeTab?.runningProcess) {
        e.preventDefault();
        void handleKillProcess();
        return;
      }

      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        handleClear();
      }
    },
    [activeTab?.runningProcess, commandHistory, handleClear, handleKillProcess, handleRunCommand, historyIndex]
  );

  useEffect(() => {
    if (terminalMode !== 'simple') return;
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [terminalMode, activeTab?.history]);

  useEffect(() => {
    if (isOpen && terminalMode === 'simple') {
      inputRef.current?.focus();
    }
  }, [isOpen, terminalMode]);

  useEffect(() => {
    if (!isOpen) return;

    const unsubOutput = window.vyotiq?.terminal?.onOutput?.(data => {
      const tab = tabsRef.current.find(t => t.runningProcess?.pid === data.pid);
      if (!tab) return;

      if (tab.mode === 'xterm') {
        writeToXTerm(tab.ptyId, data.data);
      }

      setTabs(prev =>
        prev.map(t =>
          t.runningProcess?.pid === data.pid
            ? {
                ...t,
                history: [...t.history, newLine(data.stream === 'stderr' ? 'error' : 'output', data.data, data.pid)],
              }
            : t
        )
      );
    });

    const unsubExit = window.vyotiq?.terminal?.onExit?.(data => {
      const tab = tabsRef.current.find(t => t.runningProcess?.pid === data.pid);
      if (!tab) return;

      if (tab.mode === 'xterm') {
        writeToXTerm(tab.ptyId, `\n[process exited with code ${data.code}]\n`);
        printXTermPrompt(tab.ptyId);
      }

      setTabs(prev =>
        prev.map(t =>
          t.runningProcess?.pid === data.pid
            ? {
                ...t,
                runningProcess: null,
                history: [...t.history, newLine('info', `Process exited with code ${data.code}`, data.pid)],
              }
            : t
        )
      );
    });

    const unsubError = window.vyotiq?.terminal?.onError?.(data => {
      const tab = tabsRef.current.find(t => t.runningProcess?.pid === data.pid);
      if (!tab) return;

      if (tab.mode === 'xterm') {
        writeToXTerm(tab.ptyId, `\n[error] ${data.error}\n`);
        printXTermPrompt(tab.ptyId);
      }

      setTabs(prev =>
        prev.map(t =>
          t.runningProcess?.pid === data.pid
            ? {
                ...t,
                runningProcess: null,
                history: [...t.history, newLine('error', `Error: ${data.error}`, data.pid)],
              }
            : t
        )
      );
    });

    return () => {
      unsubOutput?.();
      unsubExit?.();
      unsubError?.();
    };
  }, [isOpen, printXTermPrompt, writeToXTerm]);

  const attachXTerm = useCallback(
    (ptyId: string, element: HTMLDivElement | null) => {
      if (!element) {
        xtermContainersRef.current.delete(ptyId);
        return;
      }

      xtermContainersRef.current.set(ptyId, element);
      const inst = ensureXTerm(ptyId);

      if (element.childNodes.length === 0) {
        inst.term.open(element);
        inst.fit.fit();

        if (!inst.promptPrinted) {
          inst.term.writeln('Vyotiq Terminal');
          const cwd = workspacePathRef.current;
          if (cwd) inst.term.writeln(`Working directory: ${cwd}`);
          inst.term.writeln("Type 'help' for available commands");
          inst.term.writeln('');
          printXTermPrompt(ptyId);
        }

        inst.term.onData(async data => {
          const currentTab = tabsRef.current.find(t => t.ptyId === ptyId);
          if (!currentTab) return;

          if (data === '\u0003') {
            if (currentTab.runningProcess?.pid) {
              await window.vyotiq?.terminal?.kill(currentTab.runningProcess.pid);
              writeToXTerm(ptyId, '^C\n');
              printXTermPrompt(ptyId);
            }
            return;
          }

          if (currentTab.runningProcess) return;

          if (data === '\r') {
            const cmd = inst.inputBuffer.trim();
            inst.term.writeln('');
            inst.inputBuffer = '';

            if (!cmd) {
              printXTermPrompt(ptyId);
              return;
            }

            setCommandHistory(prev => [...prev.filter(c => c !== cmd), cmd]);
            setTabs(prev =>
              prev.map(t => (t.ptyId === ptyId ? { ...t, history: [...t.history, newLine('input', `$ ${cmd}`)] } : t))
            );

            await startCommandForTab(currentTab.id, cmd, 'xterm');
            return;
          }

          if (data === '\u007F') {
            if (inst.inputBuffer.length > 0) {
              inst.inputBuffer = inst.inputBuffer.slice(0, -1);
              inst.term.write('\b \b');
            }
            return;
          }

          if (data >= ' ') {
            inst.inputBuffer += data;
            inst.term.write(data);
          }
        });
      }
    },
    [ensureXTerm, printXTermPrompt, startCommandForTab, writeToXTerm]
  );

  useEffect(() => {
    const activePtyIds = new Set(tabs.map(t => t.ptyId));
    for (const [ptyId, inst] of xtermInstancesRef.current.entries()) {
      if (!activePtyIds.has(ptyId)) {
        inst.term.dispose();
        xtermInstancesRef.current.delete(ptyId);
        xtermContainersRef.current.delete(ptyId);
      }
    }
  }, [tabs]);

  useEffect(() => {
    if (!isOpen) return;
    if (terminalMode !== 'xterm') return;

    const ptyId = activeTab?.ptyId;
    if (!ptyId) return;

    const doFit = () => {
      xtermInstancesRef.current.get(ptyId)?.fit.fit();
    };

    doFit();
    window.addEventListener('resize', doFit);
    return () => window.removeEventListener('resize', doFit);
  }, [activeTab?.ptyId, isOpen, terminalMode]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'flex flex-col bg-[var(--color-surface-base)] border-t border-[var(--color-border-subtle)]',
        'font-mono text-[11px]',
        isMaximized ? 'h-full' : 'h-full'
      )}
    >
      <div className="h-8 flex items-center justify-between bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-0 flex-1 overflow-x-auto scrollbar-none">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={cn(
                'group flex items-center gap-2 px-3 py-1 border-r border-[var(--color-border-subtle)] cursor-pointer',
                'hover:bg-[var(--color-surface-1)] transition-colors min-w-0',
                tab.id === activeTabId && 'bg-[var(--color-surface-1)]',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
              )}
              onClick={() => setActiveTabId(tab.id)}
              role="button"
              tabIndex={0}
              aria-current={tab.id === activeTabId}
              aria-label={`Activate ${getTabTitle(tab)}`}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTabId(tab.id);
                }
              }}
            >
              <Terminal
                size={12}
                className={cn(tab.id === activeTabId ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-muted)]')}
              />
              <span
                className={cn(
                  'text-[10px] truncate max-w-[100px]',
                  tab.id === activeTabId ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'
                )}
              >
                {getTabTitle(tab)}
              </span>
              {tab.runningProcess && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />}
              {tabs.length > 1 && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  aria-label={`Close ${getTabTitle(tab)}`}
                  className={cn(
                    'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
                    'p-0.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                  )}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={handleNewTab}
            className={cn(
              'p-1 rounded hover:bg-[var(--color-surface-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
            title="New Terminal"
            aria-label="New Terminal"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="flex items-center gap-1 px-2">
          <button
            onClick={() => setTerminalMode(terminalMode === 'xterm' ? 'simple' : 'xterm')}
            className={cn(
              'p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
            title={terminalMode === 'xterm' ? 'Switch to simple mode' : 'Switch to xterm mode'}
            aria-label={terminalMode === 'xterm' ? 'Switch to simple mode' : 'Switch to xterm mode'}
          >
            <Terminal size={12} />
          </button>
          <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
          <button
            onClick={() => {
              const newPtyId = generatePtyId();
              const tabId = activeTabId;
              setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, ptyId: newPtyId, runningProcess: null, history: [] } : t)));
            }}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            title="Restart Terminal"
            aria-label="Restart Terminal"
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            title="Clear (Ctrl+L)"
            aria-label="Clear"
          >
            <Trash2 size={12} />
          </button>
          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
              title={isMaximized ? 'Minimize' : 'Maximize'}
              aria-label={isMaximized ? 'Minimize terminal panel' : 'Maximize terminal panel'}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
            title="Close"
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {tabs
          .filter(t => t.mode === 'xterm')
          .map(t => (
            <div key={t.ptyId} className={cn('absolute inset-0', t.id === activeTabId && terminalMode === 'xterm' ? 'block' : 'hidden')}>
              <div ref={el => attachXTerm(t.ptyId, el)} className="h-full w-full p-2 bg-[var(--color-surface-base)]" />
            </div>
          ))}

        {terminalMode === 'simple' && (
          <div
            ref={outputRef}
            className="h-full overflow-y-auto p-2 space-y-0.5 scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent bg-[var(--color-surface-base)]"
            onClick={() => inputRef.current?.focus()}
          >
            {workspacePath && activeTab.history.length === 0 && (
              <div className="text-[var(--color-text-dim)] mb-2">
                <div className="text-[var(--color-accent-primary)]">Vyotiq Terminal</div>
                <div className="text-[9px]">Working directory: {workspacePath}</div>
                <div className="text-[9px] mt-1">Type 'help' for available commands</div>
              </div>
            )}

            {activeTab.history.map(line => (
              <div
                key={line.id}
                className={cn(
                  'whitespace-pre-wrap break-all leading-relaxed',
                  line.type === 'input' && 'text-[var(--color-accent-primary)]',
                  line.type === 'output' && 'text-[var(--color-text-primary)]',
                  line.type === 'error' && 'text-[var(--color-error)]',
                  line.type === 'info' && 'text-[var(--color-text-muted)] italic'
                )}
              >
                {/* Clean ANSI codes from output in simple mode */}
                {line.type === 'output' || line.type === 'error' 
                  ? cleanTerminalOutput(line.content) 
                  : line.content}
              </div>
            ))}

            {activeTab.runningProcess && (
              <div className="flex items-center gap-1 text-[var(--color-warning)] mt-1">
                <span className="animate-pulse">●</span>
                <span className="text-[10px]">
                  Running: {activeTab.runningProcess.command.slice(0, 50)}
                  {activeTab.runningProcess.command.length > 50 ? '...' : ''}
                </span>
                <span className="text-[var(--color-text-dim)] text-[9px]">(Ctrl+C to cancel)</span>
              </div>
            )}
          </div>
        )}
      </div>

      {terminalMode === 'simple' && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
          <span className="text-[var(--color-accent-primary)]">$</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!!activeTab.runningProcess}
            className={cn(
              'flex-1 bg-transparent outline-none text-[var(--color-text-primary)]',
              'placeholder-[var(--color-text-placeholder)]',
              activeTab.runningProcess && 'opacity-50'
            )}
            placeholder={activeTab.runningProcess ? 'Ctrl+C to cancel...' : 'Enter command...'}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={activeTab.runningProcess ? () => void handleKillProcess() : () => void handleRunCommand()}
            disabled={!command.trim() && !activeTab.runningProcess}
            className={cn(
              'p-1.5 rounded transition-colors flex items-center gap-1',
              activeTab.runningProcess
                ? 'text-[var(--color-error)] hover:bg-[var(--color-error)]/10'
                : 'text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/10',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
              !command.trim() && !activeTab.runningProcess && 'opacity-50 cursor-not-allowed'
            )}
            title={activeTab.runningProcess ? 'Stop (Ctrl+C)' : 'Run (Enter)'}
            aria-label={activeTab.runningProcess ? 'Stop running command' : 'Run command'}
          >
            {activeTab.runningProcess ? <Square size={12} /> : <Play size={12} />}
          </button>
        </div>
      )}
    </div>
  );
});

TerminalPanel.displayName = 'TerminalPanel';

export default TerminalPanel;
