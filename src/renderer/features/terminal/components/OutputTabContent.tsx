/**
 * OutputTabContent
 *
 * Displays captured output log entries (agent activity, system events)
 * with auto-scroll and a clear button.
 */

import React, { useState, useEffect, useRef, memo } from 'react';
import { FileOutput, Trash2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../../../components/ui/Tooltip';

// =============================================================================
// Types
// =============================================================================

interface OutputLogEntry {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

interface OutputTabContentProps {
  isOpen: boolean;
  activeTab: string;
}

// =============================================================================
// Component
// =============================================================================

let nextLogId = 1;

const OutputTabContentInner: React.FC<OutputTabContentProps> = ({ isOpen, activeTab }) => {
  const [outputLogs, setOutputLogs] = useState<OutputLogEntry[]>([]);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || activeTab !== 'output') return;

    const handler = (_event: Event) => {
      const detail = (_event as CustomEvent)?.detail;
      if (detail?.type && detail?.message) {
        setOutputLogs(prev => {
          const next = [...prev, {
            id: nextLogId++,
            timestamp: Date.now(),
            level: detail.level || 'info',
            message: detail.message,
            source: detail.source || 'agent',
          } as OutputLogEntry];
          return next.length > 500 ? next.slice(-500) : next;
        });
      }
    };
    document.addEventListener('vyotiq:output-log', handler);
    return () => document.removeEventListener('vyotiq:output-log', handler);
  }, [isOpen, activeTab]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [outputLogs]);

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
          {outputLogs.map(log => (
            <div key={log.id} className="flex items-start gap-2 px-3 py-0.5 hover:bg-[var(--color-surface-3)]">
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
};

export const OutputTabContent = memo(OutputTabContentInner);
OutputTabContent.displayName = 'OutputTabContent';
