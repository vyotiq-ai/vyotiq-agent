/**
 * BottomPanel - Tabbed bottom panel with Terminal, Problems, Output, Debug Console
 * 
 * Listens for custom toggle events dispatched by the Sidebar and
 * provides keyboard shortcuts for toggling visibility.
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Terminal, AlertCircle, FileOutput, Bug, X, Plus, ChevronDown, ChevronUp, Trash2, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../../../components/ui/Tooltip';
import { createLogger } from '../../../utils/logger';
import { TerminalView } from '../../terminal/components/TerminalView';
import { useResizablePanel } from '../../../hooks';

const logger = createLogger('BottomPanel');

export type BottomPanelTab = 'terminal' | 'problems' | 'output' | 'debug-console';

interface TerminalSession {
  id: string;
  label: string;
}

interface BottomPanelProps {
  /** External open/close control */
  isOpen: boolean;
  onToggle: () => void;
}

const TAB_ICONS: Record<BottomPanelTab, React.ReactNode> = {
  terminal: <Terminal size={12} />,
  problems: <AlertCircle size={12} />,
  output: <FileOutput size={12} />,
  'debug-console': <Bug size={12} />,
};

const TAB_LABELS: Record<BottomPanelTab, string> = {
  terminal: 'Terminal',
  problems: 'Problems',
  output: 'Output',
  'debug-console': 'Debug Console',
};

interface DiagnosticItem {
  filePath: string;
  fileName?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source?: string;
  code?: string | number;
}

interface OutputLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

const BottomPanelComponent: React.FC<BottomPanelProps> = ({ isOpen, onToggle }) => {
  const [activeTab, setActiveTab] = useState<BottomPanelTab>(() => {
    // Persist active tab across sessions
    try {
      const saved = localStorage.getItem('vyotiq-bottom-panel-tab');
      if (saved && ['terminal', 'problems', 'output'].includes(saved)) {
        return saved as BottomPanelTab;
      }
    } catch { /* ignore */ }
    return 'terminal';
  });

  // Resize via shared hook (vertical, bottom-anchored)
  const {
    size: panelHeight,
    isResizing,
    resizeHandleProps,
    setSize: setPanelHeight,
  } = useResizablePanel({
    direction: 'vertical',
    initialSize: 250,
    minSize: 100,
    maxSize: 600,
    persistKey: 'vyotiq-bottom-panel-height',
  });

  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const terminalCounterRef = useRef(0);

  // Persist tab selection to localStorage
  const handleSetActiveTab = useCallback((tab: BottomPanelTab) => {
    setActiveTab(tab);
    try { localStorage.setItem('vyotiq-bottom-panel-tab', tab); } catch { /* ignore */ }
  }, []);

  // Diagnostics state for Problems tab
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  // Output log state
  const [outputLogs, setOutputLogs] = useState<OutputLogEntry[]>([]);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Debug console state
  const [debugTraces, setDebugTraces] = useState<Array<{ id: string; sessionId: string; startTime: number; status: string; error?: { message: string } }>>([]);
  const [debugLoading, setDebugLoading] = useState(false);

  // Listen for sidebar toggle events
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'vyotiq:terminal:toggle': () => {
        if (!isOpen || activeTab !== 'terminal') {
          handleSetActiveTab('terminal');
          if (!isOpen) onToggle();
        } else {
          onToggle();
        }
      },
      'vyotiq:problems:toggle': () => {
        if (!isOpen || activeTab !== 'problems') {
          handleSetActiveTab('problems');
          if (!isOpen) onToggle();
        } else {
          onToggle();
        }
      },
      'vyotiq:output:toggle': () => {
        if (!isOpen || activeTab !== 'output') {
          handleSetActiveTab('output');
          if (!isOpen) onToggle();
        } else {
          onToggle();
        }
      },
      'vyotiq:debug-console:toggle': () => {
        if (!isOpen || activeTab !== 'debug-console') {
          handleSetActiveTab('debug-console');
          if (!isOpen) onToggle();
        } else {
          onToggle();
        }
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      document.addEventListener(event, handler);
    }

    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        document.removeEventListener(event, handler);
      }
    };
  }, [isOpen, activeTab, onToggle]);

  // Keyboard shortcut: Ctrl+` to toggle terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        if (!isOpen || activeTab !== 'terminal') {
          handleSetActiveTab('terminal');
          if (!isOpen) onToggle();
        } else {
          onToggle();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, onToggle]);

  // Fetch diagnostics when Problems tab is active
  const fetchDiagnostics = useCallback(async () => {
    if (!window.vyotiq?.lsp?.diagnostics) return;
    setDiagnosticsLoading(true);
    try {
      const result = await window.vyotiq.lsp.diagnostics();
      if (result.success && result.diagnostics) {
        setDiagnostics(result.diagnostics);
      }
    } catch (err) {
      logger.debug('Failed to fetch diagnostics', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'problems') {
      fetchDiagnostics();
      // Subscribe to real-time diagnostics updates
      if (window.vyotiq?.lsp?.onDiagnosticsUpdated) {
        const unsub = window.vyotiq.lsp.onDiagnosticsUpdated(() => {
          fetchDiagnostics();
        });
        return unsub;
      }
    }
  }, [isOpen, activeTab, fetchDiagnostics]);

  // Capture console output for Output tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'output') return;

    // Intercept agent events as output log entries
    const handler = (_event: Event) => {
      const detail = (_event as CustomEvent)?.detail;
      if (detail?.type && detail?.message) {
        setOutputLogs(prev => {
          const next = [...prev, {
            timestamp: Date.now(),
            level: detail.level || 'info',
            message: detail.message,
            source: detail.source || 'agent',
          } as OutputLogEntry];
          // Cap at 500 entries
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
    };
    document.addEventListener('vyotiq:output-log', handler);
    return () => document.removeEventListener('vyotiq:output-log', handler);
  }, [isOpen, activeTab]);

  // Auto-scroll output to bottom
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputLogs]);

  // Fetch debug traces when Debug Console tab is active
  const fetchDebugTraces = useCallback(async () => {
    if (!window.vyotiq?.debug?.getTraces) return;
    setDebugLoading(true);
    try {
      // Use getTraces with empty sessionId to get traces for current context
      const traces = await window.vyotiq.debug.getTraces('');
      if (Array.isArray(traces)) {
        setDebugTraces(traces.map((t) => ({
          id: t.traceId,
          sessionId: t.sessionId,
          startTime: t.startedAt,
          status: t.status,
          error: t.error ? { message: t.error.message } : undefined,
        })));
      }
    } catch (err) {
      logger.debug('Failed to fetch debug traces', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setDebugLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'debug-console') {
      fetchDebugTraces();
    }
  }, [isOpen, activeTab, fetchDebugTraces]);

  // Spawn a default terminal when first opening terminal tab
  useEffect(() => {
    if (isOpen && activeTab === 'terminal' && terminals.length === 0) {
      spawnTerminal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab]);

  const spawnTerminal = useCallback(async () => {
    terminalCounterRef.current++;
    const id = `term-${Date.now()}-${terminalCounterRef.current}`;
    const label = `Terminal ${terminalCounterRef.current}`;

    const result = await window.vyotiq.terminal.spawn({ id });
    if (result.success) {
      const session: TerminalSession = { id, label };
      setTerminals(prev => [...prev, session]);
      setActiveTerminalId(id);
    }
  }, []);

  const killTerminal = useCallback(async (termId: string) => {
    await window.vyotiq.terminal.kill(termId);
    setTerminals(prev => {
      const remaining = prev.filter(t => t.id !== termId);
      if (activeTerminalId === termId) {
        setActiveTerminalId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
      }
      return remaining;
    });
  }, [activeTerminalId]);

  // Cleanup: kill all terminal sessions on unmount to prevent orphaned processes
  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;
  useEffect(() => {
    return () => {
      for (const t of terminalsRef.current) {
        window.vyotiq?.terminal?.kill(t.id).catch(() => {});
      }
    };
  }, []);

  if (!isOpen) return null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'terminal':
        return (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Terminal session tabs */}
            {terminals.length > 1 && (
              <div className="shrink-0 flex items-center gap-0.5 px-2 py-0.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sidebar)]">
                {terminals.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTerminalId(t.id)}
                    className={cn(
                      'group flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded transition-colors',
                      t.id === activeTerminalId
                        ? 'text-[var(--color-text-primary)] bg-[var(--color-surface-2)]'
                        : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                    )}
                  >
                    <Terminal size={10} />
                    {t.label}
                    <span
                      className="ml-1 opacity-0 group-hover:opacity-100 hover:text-[var(--color-error)] transition-opacity cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); killTerminal(t.id); }}
                    >
                      <X size={8} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {/* Terminal views */}
            <div className="flex-1 min-h-0 relative">
              {terminals.map(t => (
                <TerminalView
                  key={t.id}
                  terminalId={t.id}
                  isActive={t.id === activeTerminalId}
                />
              ))}
              {terminals.length === 0 && (
                <div className="flex items-center justify-center h-full text-[var(--color-text-placeholder)] font-mono text-[11px]">
                  No terminal sessions
                </div>
              )}
            </div>
          </div>
        );

      case 'problems':
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-border-subtle)]">
              <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                {diagnostics.length === 0 ? 'No problems' : `${diagnostics.filter(d => d.severity === 'error').length} errors, ${diagnostics.filter(d => d.severity === 'warning').length} warnings`}
              </span>
              <Tooltip content="Refresh diagnostics">
              <button
                onClick={fetchDiagnostics}
                className="ml-auto p-0.5 rounded hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                aria-label="Refresh diagnostics"
              >
                <RefreshCw size={10} className={diagnosticsLoading ? 'animate-spin' : ''} />
              </button>
              </Tooltip>
            </div>
            {diagnostics.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center font-mono">
                  <AlertCircle size={20} className="mx-auto mb-2 text-[var(--color-text-placeholder)]" />
                  <p className="text-[11px] text-[var(--color-text-placeholder)]">
                    No problems detected in workspace
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto font-mono text-[11px]">
                {diagnostics.map((d, i) => (
                  <div
                    key={`${d.filePath}-${d.line}-${d.column}-${i}`}
                    className="flex items-start gap-2 px-3 py-1 hover:bg-[var(--color-surface-3)] cursor-pointer border-b border-[var(--color-border-subtle)]/50"
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
                    <span className="shrink-0 text-[var(--color-text-muted)]">{d.source}{d.code ? `(${d.code})` : ''}</span>
                    <span className="shrink-0 text-[var(--color-text-dim)]">{d.fileName || d.filePath.split(/[\\/]/).pop()}:{d.line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'output':
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-border-subtle)]">
              <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                {outputLogs.length} entries
              </span>
              <Tooltip content="Clear output">
              <button
                onClick={() => setOutputLogs([])}
                className="ml-auto p-0.5 rounded hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                aria-label="Clear output"
              >
                <Trash2 size={10} />
              </button>
              </Tooltip>
            </div>
            {outputLogs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center font-mono">
                  <FileOutput size={20} className="mx-auto mb-2 text-[var(--color-text-placeholder)]" />
                  <p className="text-[11px] text-[var(--color-text-placeholder)]">
                    Output logs will appear here
                  </p>
                  <p className="text-[10px] text-[var(--color-text-placeholder)] mt-1">
                    Agent activity and system events are captured in real-time
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto font-mono text-[11px]">
                {outputLogs.map((log, i) => (
                  <div key={`${log.timestamp}-${i}`} className="flex items-start gap-2 px-3 py-0.5 hover:bg-[var(--color-surface-3)]">
                    <span className="shrink-0 text-[var(--color-text-dim)]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={cn(
                      'shrink-0 w-12',
                      log.level === 'error' && 'text-[var(--color-error)]',
                      log.level === 'warn' && 'text-[var(--color-warning)]',
                      log.level === 'info' && 'text-[var(--color-text-secondary)]',
                      log.level === 'debug' && 'text-[var(--color-text-muted)]',
                    )}>
                      [{log.level}]
                    </span>
                    {log.source && (
                      <span className="shrink-0 text-[var(--color-accent-secondary)]">[{log.source}]</span>
                    )}
                    <span className="text-[var(--color-text-primary)] flex-1 min-w-0 break-words">{log.message}</span>
                  </div>
                ))}
                <div ref={outputEndRef} />
              </div>
            )}
          </div>
        );

      case 'debug-console':
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--color-border-subtle)]">
              <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                {debugTraces.length} traces
              </span>
              <Tooltip content="Refresh traces">
              <button
                onClick={fetchDebugTraces}
                className="ml-auto p-0.5 rounded hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
                aria-label="Refresh traces"
              >
                <RefreshCw size={10} className={debugLoading ? 'animate-spin' : ''} />
              </button>
              </Tooltip>
            </div>
            {debugTraces.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center font-mono">
                  <Bug size={20} className="mx-auto mb-2 text-[var(--color-text-placeholder)]" />
                  <p className="text-[11px] text-[var(--color-text-placeholder)]">
                    {debugLoading ? 'Loading traces...' : 'No debug traces available'}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-placeholder)] mt-1">
                    Enable debug mode in settings to capture execution traces
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto font-mono text-[11px]">
                {debugTraces.map(trace => (
                  <div
                    key={trace.id}
                    className="flex items-start gap-2 px-3 py-1 hover:bg-[var(--color-surface-3)] cursor-pointer border-b border-[var(--color-border-subtle)]/50"
                  >
                    <span className={cn(
                      'shrink-0 mt-0.5',
                      trace.status === 'completed' && 'text-[var(--color-success)]',
                      trace.status === 'error' && 'text-[var(--color-error)]',
                      trace.status === 'running' && 'text-[var(--color-warning)]',
                    )}>
                      <Bug size={10} />
                    </span>
                    <span className="text-[var(--color-text-primary)]">{trace.sessionId.slice(0, 8)}</span>
                    <span className={cn(
                      'shrink-0 px-1 rounded text-[10px]',
                      trace.status === 'completed' && 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
                      trace.status === 'error' && 'bg-[var(--color-error)]/10 text-[var(--color-error)]',
                      trace.status === 'running' && 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
                    )}>
                      {trace.status}
                    </span>
                    {trace.error && (
                      <span className="text-[var(--color-error)] flex-1 min-w-0 truncate">{trace.error.message}</span>
                    )}
                    <span className="shrink-0 text-[var(--color-text-dim)]">
                      {new Date(trace.startTime).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div
      ref={panelRef}
      className="shrink-0 flex flex-col bg-[var(--color-surface-1)] border-t border-[var(--color-border-subtle)]"
      style={{ height: panelHeight }}
    >
      {/* Resize handle with visual drag indicator */}
      <div
        className={cn(
          'h-1.5 cursor-row-resize shrink-0 hover:bg-[var(--color-accent-primary)]/20 transition-colors group/resize flex items-center justify-center',
          isResizing && 'bg-[var(--color-accent-primary)]/30'
        )}
        {...resizeHandleProps}
      >
        {/* Three-dot drag affordance — matches sidebar resize handle pattern */}
        <div className={cn(
          'flex gap-[3px] opacity-0 group-hover/resize:opacity-100 transition-opacity',
          isResizing && 'opacity-100'
        )}>
          <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-dim)]" />
          <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-dim)]" />
          <div className="w-[3px] h-[3px] rounded-full bg-[var(--color-text-dim)]" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 flex items-center justify-between px-2 py-0 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sidebar)]">
        <div className="flex items-center gap-0.5" role="tablist" aria-label="Bottom panel tabs">
          {(Object.keys(TAB_LABELS) as BottomPanelTab[]).map(tab => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`panel-${tab}`}
              id={`tab-${tab}`}
              onClick={() => handleSetActiveTab(tab)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wide transition-colors',
                activeTab === tab
                  ? 'text-[var(--color-text-primary)] border-b border-[var(--color-accent-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              )}
            >
              {TAB_ICONS[tab]}
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {/* New terminal button (only visible on terminal tab) */}
          {activeTab === 'terminal' && (
            <Tooltip content="New Terminal">
            <button
              onClick={spawnTerminal}
              className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
              aria-label="New Terminal"
            >
              <Plus size={12} />
            </button>
            </Tooltip>
          )}
          {/* Kill terminal button */}
          {activeTab === 'terminal' && activeTerminalId && (
            <Tooltip content="Kill Terminal">
            <button
              onClick={() => activeTerminalId && killTerminal(activeTerminalId)}
              className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition-colors"
              aria-label="Kill Terminal"
            >
              <Trash2 size={12} />
            </button>
            </Tooltip>
          )}
          {/* Maximize / restore panel */}
          <Tooltip content={panelHeight >= 500 ? 'Restore Panel Size' : 'Maximize Panel'}>
          <button
            onClick={() => setPanelHeight(panelHeight >= 500 ? 250 : 600)}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label={panelHeight >= 500 ? 'Restore Panel Size' : 'Maximize Panel'}
          >
            {panelHeight >= 500 ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
          </Tooltip>
          {/* Minimize / close */}
          <Tooltip content="Minimize Panel">
          <button
            onClick={onToggle}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Minimize Panel"
          >
            <ChevronDown size={12} />
          </button>
          </Tooltip>
        </div>
      </div>

      {/* Panel content */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        {renderTabContent()}
      </div>
    </div>
  );
};

export const BottomPanel = memo(BottomPanelComponent);
BottomPanel.displayName = 'BottomPanel';
