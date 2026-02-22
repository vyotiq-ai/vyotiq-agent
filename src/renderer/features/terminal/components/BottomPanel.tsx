/**
 * BottomPanel - Tabbed bottom panel with Terminal, Problems, Output, Debug Console
 * 
 * Listens for custom toggle events dispatched by the Sidebar and
 * provides keyboard shortcuts for toggling visibility.
 */
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Terminal, AlertCircle, FileOutput, Bug, X, Plus, ChevronDown, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../../../components/ui/Tooltip';
import { createLogger } from '../../../utils/logger';
import { TerminalView } from '../../terminal/components/TerminalView';
import { ProblemsTabContent } from './ProblemsTabContent';
import { OutputTabContent } from './OutputTabContent';
import { DebugConsoleTabContent } from './DebugConsoleTabContent';
import { useResizablePanel } from '../../../hooks';
import { useDiagnostics } from '../hooks/useDiagnostics';
import { useWorkspaceState } from '../../../state/WorkspaceProvider';

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

// =============================================================================
// Bottom Panel Component
// =============================================================================

const BottomPanelComponent: React.FC<BottomPanelProps> = ({ isOpen, onToggle }) => {
  const [activeTab, setActiveTab] = useState<BottomPanelTab>(() => {
    try {
      const saved = localStorage.getItem('vyotiq-bottom-panel-tab');
      if (saved && ['terminal', 'problems', 'output'].includes(saved)) {
        return saved as BottomPanelTab;
      }
    } catch { /* ignore */ }
    return 'terminal';
  });

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

  const handleSetActiveTab = useCallback((tab: BottomPanelTab) => {
    setActiveTab(tab);
    try { localStorage.setItem('vyotiq-bottom-panel-tab', tab); } catch { /* ignore */ }
  }, []);

  const { workspacePath } = useWorkspaceState();

  const problemsPollingEnabled = isOpen && activeTab === 'problems';
  const { diagnostics, isLoading: diagnosticsLoading, counts: diagnosticCounts, refresh: refreshDiagnostics } = useDiagnostics(problemsPollingEnabled, workspacePath);

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

  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;
  useEffect(() => {
    return () => {
      for (const t of terminalsRef.current) {
        window.vyotiq?.terminal?.kill(t.id).catch((err) => {
          logger.debug('Failed to kill terminal on unmount', { id: t.id, error: String(err) });
        });
      }
    };
  }, []);

  if (!isOpen) return null;

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
        <div className={cn(
          'w-8 h-[2px] rounded-sm bg-[var(--color-text-dim)]/30 opacity-0 group-hover/resize:opacity-100 transition-opacity',
          isResizing && 'opacity-100'
        )} />
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
              {tab === 'problems' && (diagnosticCounts.errors > 0 || diagnosticCounts.warnings > 0) && (
                <span className="flex items-center gap-0.5 ml-0.5">
                  {diagnosticCounts.errors > 0 && (
                    <span className="flex items-center gap-0.5 text-[9px] text-[var(--color-error)]">
                      <AlertCircle size={8} />
                      {diagnosticCounts.errors}
                    </span>
                  )}
                  {diagnosticCounts.warnings > 0 && (
                    <span className="flex items-center gap-0.5 text-[9px] text-[var(--color-warning)]">
                      <AlertCircle size={8} />
                      {diagnosticCounts.warnings}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
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
          <Tooltip content={panelHeight >= 500 ? 'Restore Panel Size' : 'Maximize Panel'}>
          <button
            onClick={() => setPanelHeight(panelHeight >= 500 ? 250 : 600)}
            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label={panelHeight >= 500 ? 'Restore Panel Size' : 'Maximize Panel'}
          >
            {panelHeight >= 500 ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
          </Tooltip>
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
        {activeTab === 'terminal' && (
          <div className="flex-1 min-h-0 flex flex-col">
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
                      role="button"
                      tabIndex={0}
                      className="ml-1 opacity-0 group-hover:opacity-100 hover:text-[var(--color-error)] transition-opacity cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); killTerminal(t.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); killTerminal(t.id); } }}
                      aria-label={`Close ${t.label}`}
                    >
                      <X size={8} />
                    </span>
                  </button>
                ))}
              </div>
            )}
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
        )}
        {activeTab === 'problems' && (
          <ProblemsTabContent diagnostics={diagnostics} isLoading={diagnosticsLoading} onRefresh={refreshDiagnostics} />
        )}
        {activeTab === 'output' && (
          <OutputTabContent isOpen={isOpen} activeTab={activeTab} />
        )}
        {activeTab === 'debug-console' && (
          <DebugConsoleTabContent isOpen={isOpen} activeTab={activeTab} />
        )}
      </div>
    </div>
  );
};

export const BottomPanel = memo(BottomPanelComponent);
BottomPanel.displayName = 'BottomPanel';
