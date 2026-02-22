/**
 * DebugConsoleTabContent
 *
 * Displays debug execution traces fetched from the debug API,
 * with refresh support and status indicators.
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { Bug, RefreshCw } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../../../components/ui/Tooltip';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('DebugConsoleTabContent');

// =============================================================================
// Types
// =============================================================================

interface DebugTrace {
  id: string;
  sessionId: string;
  startTime: number;
  status: string;
  error?: { message: string };
}

interface DebugConsoleTabContentProps {
  isOpen: boolean;
  activeTab: string;
}

// =============================================================================
// Component
// =============================================================================

const DebugConsoleTabContentInner: React.FC<DebugConsoleTabContentProps> = ({ isOpen, activeTab }) => {
  const [debugTraces, setDebugTraces] = useState<DebugTrace[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);

  const fetchDebugTraces = useCallback(async () => {
    if (!window.vyotiq?.debug?.getTraces) return;
    setDebugLoading(true);
    try {
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
};

export const DebugConsoleTabContent = memo(DebugConsoleTabContentInner);
DebugConsoleTabContent.displayName = 'DebugConsoleTabContent';
