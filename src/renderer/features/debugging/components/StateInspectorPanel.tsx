/**
 * State Inspector Panel Component
 * 
 * Displays current agent state including:
 * - Context window usage
 * - Tool history
 * - Resource usage
 * - Message queue
 */
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Database, MessageSquare, Wrench, Cpu, 
  ChevronDown, ChevronRight, RefreshCw
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('StateInspectorPanel');
import { DataViewer } from '../../../components/ui/DataViewer';

interface StateInspectorPanelProps {
  sessionId: string;
  runId: string | undefined;
}

interface StateData {
  context: {
    maxTokens: number;
    usedTokens: number;
    utilization: string;
    messageCount: number;
    systemPromptTokens: number;
    toolResultTokens: number;
  };
  messages: {
    pending: number;
    processing: number;
    completed: number;
    lastMessageAt: number | null;
  };
  tools: {
    totalCalls: number;
    successRate: string;
    avgDuration: string;
    mostUsed: string;
    lastTool: string | null;
  };
  resources: {
    memoryMb: number;
    cpuPercent: number;
    activeConnections: number;
    cacheHitRate: string;
    pendingRequests: number;
  };
}

interface StateSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  data: Record<string, unknown>;
}

const defaultStateData: StateData = {
  context: {
    maxTokens: 200000,
    usedTokens: 0,
    utilization: '0%',
    messageCount: 0,
    systemPromptTokens: 0,
    toolResultTokens: 0,
  },
  messages: {
    pending: 0,
    processing: 0,
    completed: 0,
    lastMessageAt: null,
  },
  tools: {
    totalCalls: 0,
    successRate: '0%',
    avgDuration: '0ms',
    mostUsed: 'none',
    lastTool: null,
  },
  resources: {
    memoryMb: 0,
    cpuPercent: 0,
    activeConnections: 0,
    cacheHitRate: '0%',
    pendingRequests: 0,
  },
};

export const StateInspectorPanel: React.FC<StateInspectorPanelProps> = ({
  sessionId,
  runId,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['context']));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stateData, setStateData] = useState<StateData>(defaultStateData);

  // Fetch state data from IPC
  const fetchStateData = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      const data = await window.vyotiq?.debug?.getSessionState?.(sessionId);
      if (data) {
        setStateData(data);
      }
    } catch (error) {
      logger.error('Failed to fetch session state', { error: error instanceof Error ? error.message : String(error) });
    }
  }, [sessionId]);

  // Initial fetch
  useEffect(() => {
    fetchStateData();
  }, [fetchStateData]);

  // Build sections from state data
  const stateSections: StateSection[] = [
    {
      id: 'context',
      label: 'Context Window',
      icon: <Database size={12} className="text-[var(--color-accent-primary)]" />,
      data: stateData.context,
    },
    {
      id: 'messages',
      label: 'Message Queue',
      icon: <MessageSquare size={12} className="text-[var(--color-accent-secondary)]" />,
      data: {
        ...stateData.messages,
        lastMessageAt: stateData.messages.lastMessageAt 
          ? new Date(stateData.messages.lastMessageAt).toISOString()
          : 'N/A',
      },
    },
    {
      id: 'tools',
      label: 'Tool History',
      icon: <Wrench size={12} className="text-[var(--color-warning)]" />,
      data: {
        ...stateData.tools,
        lastTool: stateData.tools.lastTool || 'none',
      },
    },
    {
      id: 'resources',
      label: 'Resource Usage',
      icon: <Cpu size={12} className="text-[var(--color-success)]" />,
      data: stateData.resources,
    },
  ];

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
    await fetchStateData();
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
                <div className="px-3 py-2 border-t border-[var(--color-border-subtle)]">
                  <DataViewer
                    data={section.data}
                    compact
                    initialDepth={1}
                    maxDepth={3}
                    showRoot={false}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Session info */}
        <div className="pt-2 border-t border-[var(--color-border-subtle)]">
          <div className="text-[9px] font-mono text-[var(--color-text-dim)] space-y-0.5">
            <div>session: {formatValue(sessionId.slice(0, 8))}...</div>
            {runId && <div>run: {formatValue(runId.slice(0, 8))}...</div>}
            <div>sections: {formatValue(stateSections.length)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
