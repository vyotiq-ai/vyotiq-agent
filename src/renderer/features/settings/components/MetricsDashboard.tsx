/**
 * Metrics Dashboard Component
 * 
 * Comprehensive real-time analytics dashboard showing:
 * - Token usage and costs for the active session
 * - Context window utilization
 * - Performance metrics and render statistics
 * - Session overview with all sessions
 */

import React, { useState, useMemo } from 'react';
import { useAgentSelector } from '../../../state/AgentProvider';
import { useSessionCost } from '../../sessions/hooks/useSessionCost';
import { formatCost } from '../../../../shared/utils/costEstimation';
import { getAllMetrics, clearMetrics, type RenderMetrics } from '../../../utils/profiler';
import { cn } from '../../../utils/cn';
import { 
  Activity, 
  Zap, 
  Clock, 
  TrendingUp, 
  Database, 
  Cpu, 
  BarChart3,
  RefreshCw,
  Trash2,
  MessageSquare,
  DollarSign,
  Layers
} from 'lucide-react';

interface MetricsDashboardProps {
  period?: 'hour' | 'day' | 'week' | 'month';
}

/** Format large numbers with K/M suffix */
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Format milliseconds to readable time */
function formatMs(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Metric card component */
const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info';
}> = ({ icon, label, value, subValue, color = 'primary' }) => {
  const colorClasses = {
    primary: 'text-[var(--color-accent-primary)]',
    success: 'text-[var(--color-success)]',
    warning: 'text-[var(--color-warning)]',
    error: 'text-[var(--color-error)]',
    info: 'text-[var(--color-info)]',
  };

  return (
    <div className="p-3 bg-[var(--color-surface-1)] rounded-lg border border-[var(--color-border-subtle)]">
      <div className="flex items-center gap-2 mb-1">
        <span className={cn('opacity-70', colorClasses[color])}>{icon}</span>
        <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide">{label}</span>
      </div>
      <div className={cn('text-lg font-semibold', colorClasses[color])}>{value}</div>
      {subValue && (
        <div className="text-[9px] text-[var(--color-text-dim)] mt-0.5">{subValue}</div>
      )}
    </div>
  );
};

/** Tab button component */
const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={cn(
      'px-3 py-1.5 text-[10px] font-medium rounded transition-colors',
      active
        ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
    )}
  >
    {children}
  </button>
);

export const MetricsDashboard: React.FC<MetricsDashboardProps> = () => {
  const [activeTab, setActiveTab] = useState<'session' | 'performance' | 'all-sessions'>('session');
  const [perfMetrics, setPerfMetrics] = useState<Map<string, RenderMetrics>>(getAllMetrics());
  
  // Primary data source - already computed in reducer
  const cost = useSessionCost();
  
  // Session info and live context metrics
  const sessionData = useAgentSelector(
    (state) => {
      const id = state.activeSessionId;
      const s = id ? state.sessions.find(x => x.id === id) : undefined;
      const ctx = id ? state.contextMetrics[id] : undefined;
      const agentStatus = id ? state.agentStatus[id] : undefined;
      
      // Get all sessions for the all-sessions tab
      const allSessions = state.sessions.map(sess => ({
        id: sess.id,
        title: sess.title,
        status: sess.status,
        messageCount: sess.messages.length,
        createdAt: sess.createdAt,
        cost: state.sessionCost[sess.id],
      }));
      
      return {
        id,
        title: s?.title ?? 'No session',
        msgCount: s?.messages.length ?? 0,
        isRunning: s?.status === 'running',
        isPaused: s?.status === 'paused',
        ctx: ctx?.metrics,
        agentStatus,
        allSessions,
        totalSessions: state.sessions.length,
      };
    },
    (a, b) => 
      a.id === b.id &&
      a.title === b.title &&
      a.msgCount === b.msgCount &&
      a.isRunning === b.isRunning &&
      a.isPaused === b.isPaused &&
      a.ctx === b.ctx &&
      a.agentStatus === b.agentStatus &&
      a.totalSessions === b.totalSessions
  );

  const totalTokens = cost.totalInputTokens + cost.totalOutputTokens;
  const hasData = cost.hasUsage;
  const inputPct = totalTokens > 0 ? (cost.totalInputTokens / totalTokens) * 100 : 0;
  const outputPct = totalTokens > 0 ? (cost.totalOutputTokens / totalTokens) * 100 : 0;

  // Performance metrics summary
  const perfSummary = useMemo(() => {
    const metrics = Array.from(perfMetrics.values());
    const totalRenders = metrics.reduce((sum, m) => sum + m.renderCount, 0);
    const totalTime = metrics.reduce((sum, m) => sum + m.totalRenderTime, 0);
    const avgTime = metrics.length > 0 ? totalTime / totalRenders : 0;
    const slowComponents = metrics.filter(m => m.averageRenderTime > 16).length;
    
    return {
      componentCount: metrics.length,
      totalRenders,
      totalTime,
      avgTime,
      slowComponents,
      topComponents: metrics
        .sort((a, b) => b.totalRenderTime - a.totalRenderTime)
        .slice(0, 10),
    };
  }, [perfMetrics]);

  const refreshPerfMetrics = () => {
    setPerfMetrics(getAllMetrics());
  };

  const clearPerfMetrics = () => {
    clearMetrics();
    setPerfMetrics(new Map());
  };

  return (
    <div className="font-mono text-[11px]">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
        <TabButton active={activeTab === 'session'} onClick={() => setActiveTab('session')}>
          <span className="flex items-center gap-1.5">
            <Activity size={12} />
            Current Session
          </span>
        </TabButton>
        <TabButton active={activeTab === 'all-sessions'} onClick={() => setActiveTab('all-sessions')}>
          <span className="flex items-center gap-1.5">
            <Layers size={12} />
            All Sessions ({sessionData.totalSessions})
          </span>
        </TabButton>
        <TabButton active={activeTab === 'performance'} onClick={() => setActiveTab('performance')}>
          <span className="flex items-center gap-1.5">
            <Cpu size={12} />
            Performance
          </span>
        </TabButton>
      </div>

      {/* Tab Content */}
      <div className="p-4 space-y-4">
        {activeTab === 'session' && (
          <>
            {/* Session Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'w-2 h-2 rounded-full',
                  sessionData.isRunning ? 'bg-[var(--color-success)]' 
                    : sessionData.isPaused ? 'bg-[var(--color-warning)]'
                    : 'bg-[var(--color-text-dim)]'
                )} />
                <span className="text-[var(--color-text-secondary)] truncate max-w-[300px]">
                  {sessionData.title}
                </span>
                {sessionData.id && (
                  <span className="text-[9px] text-[var(--color-text-dim)] font-mono">
                    #{sessionData.id.slice(0, 6)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1">
                  <MessageSquare size={10} />
                  {sessionData.msgCount}
                </span>
                {sessionData.agentStatus?.currentIteration && (
                  <span className="flex items-center gap-1">
                    <RefreshCw size={10} />
                    {sessionData.agentStatus.currentIteration}/{sessionData.agentStatus.maxIterations}
                  </span>
                )}
              </div>
            </div>

            {!hasData && !sessionData.ctx ? (
              <div className="py-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-surface-2)] mb-3">
                  <BarChart3 size={20} className="text-[var(--color-text-muted)]" />
                </div>
                <p className="text-[var(--color-text-muted)]">No metrics data yet</p>
                <p className="text-[9px] text-[var(--color-text-dim)] mt-1">
                  Send a message to start collecting analytics
                </p>
              </div>
            ) : (
              <>
                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard
                    icon={<Zap size={14} />}
                    label="Total Tokens"
                    value={formatNum(totalTokens)}
                    subValue={`${formatNum(cost.totalInputTokens)} in / ${formatNum(cost.totalOutputTokens)} out`}
                    color="primary"
                  />
                  <MetricCard
                    icon={<DollarSign size={14} />}
                    label="Est. Cost"
                    value={`$${cost.formattedCost}`}
                    subValue={cost.messageCount > 0 ? `~$${formatCost(cost.averageCostPerMessage)}/msg` : undefined}
                    color="success"
                  />
                  <MetricCard
                    icon={<Database size={14} />}
                    label="Context"
                    value={sessionData.ctx ? `${Math.round(sessionData.ctx.utilization * 100)}%` : 'N/A'}
                    subValue={sessionData.ctx ? `${formatNum(sessionData.ctx.totalTokens)} / ${formatNum(sessionData.ctx.maxInputTokens)}` : undefined}
                    color={sessionData.ctx?.needsPruning ? 'error' : sessionData.ctx?.isWarning ? 'warning' : 'info'}
                  />
                  <MetricCard
                    icon={<Clock size={14} />}
                    label="Messages"
                    value={cost.messageCount}
                    subValue="with usage data"
                    color="info"
                  />
                </div>

                {/* Token Distribution */}
                {totalTokens > 0 && (
                  <div className="p-3 bg-[var(--color-surface-1)] rounded-lg border border-[var(--color-border-subtle)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide">Token Distribution</span>
                    </div>
                    <div className="h-3 bg-[var(--color-surface-2)] rounded-full overflow-hidden flex">
                      <div 
                        className="bg-[var(--color-info)] transition-all duration-300" 
                        style={{ width: `${inputPct}%` }} 
                        title={`Input: ${formatNum(cost.totalInputTokens)} (${inputPct.toFixed(1)}%)`}
                      />
                      <div 
                        className="bg-[var(--color-success)] transition-all duration-300" 
                        style={{ width: `${outputPct}%` }} 
                        title={`Output: ${formatNum(cost.totalOutputTokens)} (${outputPct.toFixed(1)}%)`}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-[9px]">
                      <span className="text-[var(--color-info)]">Input {inputPct.toFixed(0)}%</span>
                      <span className="text-[var(--color-success)]">Output {outputPct.toFixed(0)}%</span>
                    </div>
                  </div>
                )}

                {/* Context Window Details */}
                {sessionData.ctx && (
                  <div className="p-3 bg-[var(--color-surface-1)] rounded-lg border border-[var(--color-border-subtle)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide">Context Window</span>
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium',
                        sessionData.ctx.needsPruning 
                          ? 'bg-[var(--color-error)]/20 text-[var(--color-error)]'
                          : sessionData.ctx.isWarning
                            ? 'bg-[var(--color-warning)]/20 text-[var(--color-warning)]'
                            : 'bg-[var(--color-success)]/20 text-[var(--color-success)]'
                      )}>
                        {sessionData.ctx.needsPruning ? 'Needs Pruning' : sessionData.ctx.isWarning ? 'Warning' : 'Healthy'}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--color-surface-3)] rounded-full overflow-hidden mb-2">
                      <div 
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          sessionData.ctx.needsPruning ? 'bg-[var(--color-error)]'
                            : sessionData.ctx.isWarning ? 'bg-[var(--color-warning)]'
                            : 'bg-[var(--color-accent-primary)]'
                        )}
                        style={{ width: `${Math.min(100, sessionData.ctx.utilization * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
                      <span>{formatNum(sessionData.ctx.totalTokens)} used</span>
                      <span>{formatNum(sessionData.ctx.availableTokens)} available</span>
                      <span>{formatNum(sessionData.ctx.maxInputTokens)} max</span>
                    </div>
                    {sessionData.ctx.tokensByRole && (
                      <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-[var(--color-accent-secondary)] text-xs font-medium">{formatNum(sessionData.ctx.tokensByRole.system)}</div>
                          <div className="text-[8px] text-[var(--color-text-dim)]">System</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[var(--color-info)] text-xs font-medium">{formatNum(sessionData.ctx.tokensByRole.user)}</div>
                          <div className="text-[8px] text-[var(--color-text-dim)]">User</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[var(--color-success)] text-xs font-medium">{formatNum(sessionData.ctx.tokensByRole.assistant)}</div>
                          <div className="text-[8px] text-[var(--color-text-dim)]">Assistant</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[var(--color-warning)] text-xs font-medium">{formatNum(sessionData.ctx.tokensByRole.tool)}</div>
                          <div className="text-[8px] text-[var(--color-text-dim)]">Tool</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Provider Breakdown */}
                {cost.providerBreakdown.length > 0 && (
                  <div className="p-3 bg-[var(--color-surface-1)] rounded-lg border border-[var(--color-border-subtle)]">
                    <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Provider Breakdown</div>
                    <div className="space-y-2">
                      {cost.providerBreakdown.map((p) => (
                        <div 
                          key={p.provider}
                          className="flex items-center justify-between p-2 bg-[var(--color-surface-2)] rounded"
                        >
                          <span className="text-[var(--color-accent-primary)] font-medium">{p.provider}</span>
                          <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
                            <span>{p.messageCount} msgs</span>
                            <span>{p.formattedTokens} tokens</span>
                            <span className="text-[var(--color-success)] font-medium">${p.formattedCost}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'all-sessions' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide">
                {sessionData.totalSessions} Session{sessionData.totalSessions !== 1 ? 's' : ''}
              </span>
            </div>
            
            {sessionData.allSessions.length === 0 ? (
              <div className="py-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-surface-2)] mb-3">
                  <Layers size={20} className="text-[var(--color-text-muted)]" />
                </div>
                <p className="text-[var(--color-text-muted)]">No sessions yet</p>
                <p className="text-[9px] text-[var(--color-text-dim)] mt-1">
                  Start a new session to begin
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {sessionData.allSessions.map((sess) => {
                  const isActive = sess.id === sessionData.id;
                  const sessCost = sess.cost;
                  const sessTokens = sessCost ? sessCost.totalInputTokens + sessCost.totalOutputTokens : 0;
                  
                  return (
                    <div 
                      key={sess.id}
                      className={cn(
                        'p-3 rounded-lg border transition-colors',
                        isActive 
                          ? 'bg-[var(--color-accent-primary)]/5 border-[var(--color-accent-primary)]/30'
                          : 'bg-[var(--color-surface-1)] border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            sess.status === 'running' ? 'bg-[var(--color-success)]'
                              : sess.status === 'paused' ? 'bg-[var(--color-warning)]'
                              : 'bg-[var(--color-text-dim)]'
                          )} />
                          <span className={cn(
                            'text-[11px] truncate max-w-[200px]',
                            isActive ? 'text-[var(--color-accent-primary)] font-medium' : 'text-[var(--color-text-secondary)]'
                          )}>
                            {sess.title}
                          </span>
                          {isActive && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-[var(--color-text-dim)] font-mono">
                          #{sess.id.slice(0, 6)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[9px] text-[var(--color-text-muted)]">
                        <span className="flex items-center gap-1">
                          <MessageSquare size={10} />
                          {sess.messageCount} msgs
                        </span>
                        {sessTokens > 0 && (
                          <>
                            <span className="flex items-center gap-1">
                              <Zap size={10} />
                              {formatNum(sessTokens)} tokens
                            </span>
                            <span className="flex items-center gap-1 text-[var(--color-success)]">
                              <DollarSign size={10} />
                              ${formatCost(sessCost?.totalCost ?? 0)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-4">
            {/* Performance Actions */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide">
                Render Performance Metrics
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={refreshPerfMetrics}
                  className="flex items-center gap-1 px-2 py-1 text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] rounded transition-colors"
                >
                  <RefreshCw size={10} />
                  Refresh
                </button>
                <button
                  onClick={clearPerfMetrics}
                  className="flex items-center gap-1 px-2 py-1 text-[9px] text-[var(--color-error)] hover:bg-[var(--color-error)]/10 rounded transition-colors"
                >
                  <Trash2 size={10} />
                  Clear
                </button>
              </div>
            </div>

            {/* Performance Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                icon={<Cpu size={14} />}
                label="Components"
                value={perfSummary.componentCount}
                subValue="tracked"
                color="primary"
              />
              <MetricCard
                icon={<RefreshCw size={14} />}
                label="Total Renders"
                value={formatNum(perfSummary.totalRenders)}
                color="info"
              />
              <MetricCard
                icon={<Clock size={14} />}
                label="Avg Render"
                value={formatMs(perfSummary.avgTime)}
                color={perfSummary.avgTime > 16 ? 'warning' : 'success'}
              />
              <MetricCard
                icon={<TrendingUp size={14} />}
                label="Slow Components"
                value={perfSummary.slowComponents}
                subValue=">16ms avg"
                color={perfSummary.slowComponents > 0 ? 'warning' : 'success'}
              />
            </div>

            {/* Top Components by Render Time */}
            {perfSummary.topComponents.length > 0 ? (
              <div className="p-3 bg-[var(--color-surface-1)] rounded-lg border border-[var(--color-border-subtle)]">
                <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
                  Top Components by Total Render Time
                </div>
                <div className="space-y-2">
                  {perfSummary.topComponents.map((comp, idx) => (
                    <div 
                      key={comp.componentName}
                      className="flex items-center justify-between p-2 bg-[var(--color-surface-2)] rounded"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[var(--color-text-dim)] w-4">{idx + 1}.</span>
                        <span className="text-[10px] text-[var(--color-text-secondary)] font-mono">
                          {comp.componentName}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[9px]">
                        <span className="text-[var(--color-text-muted)]">
                          {comp.renderCount} renders
                        </span>
                        <span className={cn(
                          comp.averageRenderTime > 16 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]'
                        )}>
                          avg {formatMs(comp.averageRenderTime)}
                        </span>
                        <span className="text-[var(--color-info)]">
                          total {formatMs(comp.totalRenderTime)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-surface-2)] mb-3">
                  <Cpu size={20} className="text-[var(--color-text-muted)]" />
                </div>
                <p className="text-[var(--color-text-muted)]">No performance data collected</p>
                <p className="text-[9px] text-[var(--color-text-dim)] mt-1">
                  Performance metrics are collected in development mode
                </p>
              </div>
            )}

            {/* Performance Tips */}
            <div className="p-3 bg-[var(--color-surface-1)] rounded-lg border border-[var(--color-border-subtle)]">
              <div className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                Performance Tips
              </div>
              <ul className="space-y-1 text-[9px] text-[var(--color-text-dim)]">
                <li>• Components with avg render time &gt;16ms may cause frame drops</li>
                <li>• Use React.memo() for components that render frequently with same props</li>
                <li>• Press Ctrl+Shift+P to log metrics summary to console</li>
                <li>• Clear metrics to start fresh measurements</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
