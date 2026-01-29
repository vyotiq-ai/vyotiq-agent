/**
 * State Inspector Panel Component
 * 
 * Displays current agent state including:
 * - Context window usage
 * - Tool history
 * - Resource usage
 * - Message queue
 */
import React, { useState, useMemo } from 'react';
import { 
  Database, MessageSquare, Wrench, Cpu, 
  ChevronDown, ChevronRight, RefreshCw
} from 'lucide-react';
import { cn } from '../../../utils/cn';

interface StateInspectorPanelProps {
  sessionId: string;
  runId: string | undefined;
}

interface StateSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  data: Record<string, unknown>;
}

export const StateInspectorPanel: React.FC<StateInspectorPanelProps> = ({
  sessionId,
  runId,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['context']));
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mock state data - in production this would come from IPC
  const stateSections: StateSection[] = useMemo(() => [
    {
      id: 'context',
      label: 'Context Window',
      icon: <Database size={12} className="text-[var(--color-accent-primary)]" />,
      data: {
        maxTokens: 200000,
        usedTokens: 45000,
        utilization: '22.5%',
        messageCount: 24,
        systemPromptTokens: 3500,
        toolResultTokens: 12000,
      },
    },
    {
      id: 'messages',
      label: 'Message Queue',
      icon: <MessageSquare size={12} className="text-[var(--color-accent-secondary)]" />,
      data: {
        pending: 0,
        processing: 1,
        completed: 23,
        lastMessageAt: new Date().toISOString(),
      },
    },
    {
      id: 'tools',
      label: 'Tool History',
      icon: <Wrench size={12} className="text-[var(--color-warning)]" />,
      data: {
        totalCalls: 15,
        successRate: '93.3%',
        avgDuration: '245ms',
        mostUsed: 'read (8 calls)',
        lastTool: 'grep',
      },
    },
    {
      id: 'resources',
      label: 'Resource Usage',
      icon: <Cpu size={12} className="text-[var(--color-success)]" />,
      data: {
        memoryMb: 128,
        cpuPercent: 12,
        activeConnections: 2,
        cacheHitRate: '78%',
        pendingRequests: 0,
      },
    },
  ], []);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // In production: await window.vyotiq?.debug?.refreshState(sessionId)
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsRefreshing(false);
  };

  const formatValue = (value: unknown): string => {
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (value instanceof Date) {
      return value.toLocaleTimeString();
    }
    return String(value);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
      <div className="p-2 space-y-2">
        {/* Refresh button */}
        <div className="flex justify-end">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono transition-colors',
              'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
            )}
          >
            <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
            refresh
          </button>
        </div>

        {/* State sections */}
        {stateSections.map(section => {
          const isExpanded = expandedSections.has(section.id);
          
          return (
            <div
              key={section.id}
              className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]"
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-surface-2)]/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown size={10} className="text-[var(--color-text-dim)]" />
                ) : (
                  <ChevronRight size={10} className="text-[var(--color-text-dim)]" />
                )}
                {section.icon}
                <span className="text-[10px] font-mono text-[var(--color-text-secondary)]">
                  {section.label}
                </span>
              </button>

              {isExpanded && (
                <div className="px-3 py-2 border-t border-[var(--color-border-subtle)] space-y-1">
                  {Object.entries(section.data).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex justify-between text-[9px] font-mono"
                    >
                      <span className="text-[var(--color-text-dim)]">{key}:</span>
                      <span className="text-[var(--color-text-secondary)]">
                        {formatValue(value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Session info */}
        <div className="pt-2 border-t border-[var(--color-border-subtle)]">
          <div className="text-[9px] font-mono text-[var(--color-text-dim)] space-y-0.5">
            <div>session: {sessionId.slice(0, 8)}...</div>
            {runId && <div>run: {runId.slice(0, 8)}...</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
