/**
 * Metrics Dashboard Component
 * 
 * Real-time token analytics and cost tracking for the active session.
 * Uses useSessionCost for aggregated data + live context metrics during runs.
 */

import React from 'react';
import { useAgentSelector } from '../../../state/AgentProvider';
import { useSessionCost } from '../../sessions/hooks/useSessionCost';
import { formatCost } from '../../../../shared/utils/costEstimation';
import { cn } from '../../../utils/cn';

interface MetricsDashboardProps {
  period?: 'hour' | 'day' | 'week' | 'month';
}

/** Format large numbers with K/M suffix */
function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = () => {
  // Primary data source - already computed in reducer
  const cost = useSessionCost();
  
  // Session info and live context metrics
  const session = useAgentSelector(
    (state) => {
      const id = state.activeSessionId;
      const s = id ? state.sessions.find(x => x.id === id) : undefined;
      const ctx = id ? state.contextMetrics[id] : undefined;
      return {
        id,
        title: s?.title ?? 'No session',
        msgCount: s?.messages.length ?? 0,
        isRunning: s?.status === 'running',
        ctx: ctx?.metrics,
      };
    },
    (a, b) => 
      a.id === b.id &&
      a.title === b.title &&
      a.msgCount === b.msgCount &&
      a.isRunning === b.isRunning &&
      a.ctx === b.ctx
  );

  const totalTokens = cost.totalInputTokens + cost.totalOutputTokens;
  const hasData = cost.hasUsage;
  const inputPct = totalTokens > 0 ? (cost.totalInputTokens / totalTokens) * 100 : 0;
  const outputPct = totalTokens > 0 ? (cost.totalOutputTokens / totalTokens) * 100 : 0;

  return (
    <div className="p-4 space-y-4 font-mono text-[11px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-2">
          <span className={cn(
            'w-2 h-2 rounded-full',
            session.isRunning ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-text-dim)]'
          )} />
          <span className="text-[var(--color-text-secondary)] truncate max-w-[200px]">
            {session.title}
          </span>
        </div>
        <span className="text-[var(--color-text-muted)]">{session.msgCount} msgs</span>
      </div>

      {!hasData ? (
        <div className="py-8 text-center text-[var(--color-text-muted)]">
          <p>No token data yet</p>
          <p className="text-[9px] mt-1">Send a message to see analytics</p>
        </div>
      ) : (
        <>
          {/* Token Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2 bg-[var(--color-surface-1)] rounded border border-[var(--color-border-subtle)]">
              <div className="text-[var(--color-text-muted)] text-[9px]">Total</div>
              <div className="text-[var(--color-text-primary)] text-xs font-medium">
                {formatNum(totalTokens)}
              </div>
            </div>
            <div className="p-2 bg-[var(--color-surface-1)] rounded border border-[var(--color-border-subtle)]">
              <div className="text-[var(--color-text-muted)] text-[9px]">Input</div>
              <div className="text-[var(--color-info)] text-xs font-medium">
                {formatNum(cost.totalInputTokens)}
              </div>
            </div>
            <div className="p-2 bg-[var(--color-surface-1)] rounded border border-[var(--color-border-subtle)]">
              <div className="text-[var(--color-text-muted)] text-[9px]">Output</div>
              <div className="text-[var(--color-success)] text-xs font-medium">
                {formatNum(cost.totalOutputTokens)}
              </div>
            </div>
          </div>

          {/* Distribution Bar */}
          {totalTokens > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-[var(--color-text-muted)]">
                <span>input {inputPct.toFixed(0)}%</span>
                <span>output {outputPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-[var(--color-surface-2)] rounded-full overflow-hidden flex">
                <div className="bg-[var(--color-info)]" style={{ width: `${inputPct}%` }} />
                <div className="bg-[var(--color-success)]" style={{ width: `${outputPct}%` }} />
              </div>
            </div>
          )}

          {/* Live Context Window */}
          {session.ctx && (
            <div className="p-2 bg-[var(--color-surface-1)] rounded border border-[var(--color-border-subtle)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[var(--color-text-muted)] text-[9px]">Context Window</span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  session.ctx.needsPruning 
                    ? 'bg-[var(--color-error)]/20 text-[var(--color-error)]'
                    : session.ctx.isWarning
                      ? 'bg-[var(--color-warning)]/20 text-[var(--color-warning)]'
                      : 'bg-[var(--color-success)]/20 text-[var(--color-success)]'
                )}>
                  {Math.round(session.ctx.utilization * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-[var(--color-surface-3)] rounded-full overflow-hidden">
                <div 
                  className={cn(
                    'h-full rounded-full',
                    session.ctx.needsPruning ? 'bg-[var(--color-error)]'
                      : session.ctx.isWarning ? 'bg-[var(--color-warning)]'
                      : 'bg-[var(--color-accent-primary)]'
                  )}
                  style={{ width: `${Math.min(100, session.ctx.utilization * 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-[var(--color-text-dim)]">
                <span>{formatNum(session.ctx.totalTokens)} used</span>
                <span>{formatNum(session.ctx.maxInputTokens)} max</span>
              </div>
              {session.ctx.tokensByRole && (
                <div className="mt-2 pt-2 border-t border-[var(--color-border-subtle)] grid grid-cols-4 gap-1 text-[9px]">
                  <div><span className="text-[var(--color-accent-secondary)]">sys</span> <span className="text-[var(--color-text-muted)]">{formatNum(session.ctx.tokensByRole.system)}</span></div>
                  <div><span className="text-[var(--color-info)]">usr</span> <span className="text-[var(--color-text-muted)]">{formatNum(session.ctx.tokensByRole.user)}</span></div>
                  <div><span className="text-[var(--color-success)]">ast</span> <span className="text-[var(--color-text-muted)]">{formatNum(session.ctx.tokensByRole.assistant)}</span></div>
                  <div><span className="text-[var(--color-warning)]">tool</span> <span className="text-[var(--color-text-muted)]">{formatNum(session.ctx.tokensByRole.tool)}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Cost */}
          <div className="p-2 bg-[var(--color-surface-1)] rounded border border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-text-muted)] text-[9px]">Estimated Cost</span>
              <span className="text-[var(--color-success)] text-xs font-medium">
                ${cost.formattedCost}
              </span>
            </div>
            {cost.messageCount > 0 && (
              <div className="text-[9px] text-[var(--color-text-dim)] mt-1">
                ~${formatCost(cost.averageCostPerMessage)}/msg • {cost.messageCount} msgs with usage
              </div>
            )}
          </div>

          {/* Provider Breakdown */}
          {cost.providerBreakdown.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] text-[var(--color-text-muted)]">By Provider</div>
              {cost.providerBreakdown.map((p) => (
                <div 
                  key={p.provider}
                  className="flex items-center justify-between p-1.5 bg-[var(--color-surface-1)] rounded text-[10px]"
                >
                  <span className="text-[var(--color-accent-primary)]">{p.provider}</span>
                  <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                    <span>{p.messageCount} msgs</span>
                    <span>{p.formattedTokens} tok</span>
                    <span className="text-[var(--color-success)]">${p.formattedCost}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
