/**
 * MCP Health Dashboard Component
 * 
 * Displays health and performance metrics for connected MCP servers.
 * Features:
 * - Real-time health status indicators
 * - Latency metrics (average and P95)
 * - Error rate tracking
 * - Manual recovery triggers
 * - Performance trends
 */

import React, { memo, useState, useCallback } from 'react';
import {
  Activity,
  RefreshCw,
  Heart,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  ArrowUp,
  TrendingUp,
  Wrench,
  FileText,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../../components/ui/Button';

// =============================================================================
// Types
// =============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface MCPServerHealthMetrics {
  serverId: string;
  serverName: string;
  status: HealthStatus;
  connectionStatus: string;
  uptime: number;
  lastPing?: number;
  avgLatency: number;
  p95Latency: number;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  toolCallCount: number;
  resourceReadCount: number;
  consecutiveFailures: number;
  lastError?: string;
  lastErrorAt?: number;
  memoryUsage?: number;
}

interface MCPHealthDashboardProps {
  healthMetrics: MCPServerHealthMetrics[];
  onRefresh: () => Promise<void>;
  onTriggerRecovery: (serverId: string) => Promise<void>;
  isRefreshing?: boolean;
}

// =============================================================================
// Health Status Badge Component
// =============================================================================

interface HealthStatusBadgeProps {
  status: HealthStatus;
  className?: string;
}

const HealthStatusBadge: React.FC<HealthStatusBadgeProps> = memo(({ status, className }) => {
  const statusConfig: Record<HealthStatus, { icon: typeof Heart; label: string; color: string }> = {
    healthy: {
      icon: Heart,
      label: 'HEALTHY',
      color: 'var(--color-success)',
    },
    degraded: {
      icon: AlertTriangle,
      label: 'DEGRADED',
      color: 'var(--color-warning)',
    },
    unhealthy: {
      icon: AlertCircle,
      label: 'UNHEALTHY',
      color: 'var(--color-error)',
    },
    unknown: {
      icon: Activity,
      label: 'UNKNOWN',
      color: 'var(--color-text-muted)',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono rounded",
        className
      )}
      style={{
        color: config.color,
        backgroundColor: `color-mix(in srgb, ${config.color} 10%, transparent)`,
        borderWidth: '1px',
        borderColor: `color-mix(in srgb, ${config.color} 20%, transparent)`,
      }}
    >
      <Icon size={8} />
      {config.label}
    </div>
  );
});

HealthStatusBadge.displayName = 'HealthStatusBadge';

// =============================================================================
// Metric Card Component
// =============================================================================

interface MetricCardProps {
  icon: typeof Clock;
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  trend?: 'up' | 'down' | 'stable';
}

const MetricCard: React.FC<MetricCardProps> = memo(({
  icon: Icon,
  label,
  value,
  unit,
  color = 'var(--color-text-secondary)',
  trend,
}) => {
  return (
    <div className="flex flex-col p-2 rounded bg-[var(--color-surface-3)]">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1 text-[8px] text-[var(--color-text-muted)] uppercase tracking-wider">
          <Icon size={8} />
          {label}
        </div>
        {trend && (
          <TrendingUp
            size={8}
            className={cn(
              trend === 'up' && 'text-[var(--color-error)] rotate-0',
              trend === 'down' && 'text-[var(--color-success)] rotate-180',
              trend === 'stable' && 'text-[var(--color-text-muted)]'
            )}
          />
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[14px] font-medium" style={{ color }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && (
          <span className="text-[8px] text-[var(--color-text-muted)]">{unit}</span>
        )}
      </div>
    </div>
  );
});

MetricCard.displayName = 'MetricCard';

// =============================================================================
// Server Health Card Component
// =============================================================================

interface ServerHealthCardProps {
  metrics: MCPServerHealthMetrics;
  onTriggerRecovery: () => void;
  isRecovering: boolean;
}

const ServerHealthCard: React.FC<ServerHealthCardProps> = memo(({
  metrics,
  onTriggerRecovery,
  isRecovering,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatUptime = (ms: number): string => {
    if (ms < 1000) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatLatency = (ms: number): string => {
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getErrorRateColor = (rate: number): string => {
    if (rate < 0.05) return 'var(--color-success)';
    if (rate < 0.2) return 'var(--color-warning)';
    return 'var(--color-error)';
  };

  const getLatencyColor = (ms: number): string => {
    if (ms < 100) return 'var(--color-success)';
    if (ms < 500) return 'var(--color-warning)';
    return 'var(--color-error)';
  };

  const isConnected = metrics.connectionStatus === 'connected';
  const showRecoveryButton = metrics.status === 'degraded' || metrics.status === 'unhealthy';

  return (
    <div
      className={cn(
        "border rounded transition-all duration-150",
        metrics.status === 'unhealthy'
          ? "border-[var(--color-error)]/30 bg-[var(--color-error)]/5"
          : metrics.status === 'degraded'
          ? "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5"
          : "border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-2.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-[var(--color-surface-3)] rounded transition-colors"
        >
          {isExpanded ? (
            <ChevronDown size={10} className="text-[var(--color-text-muted)]" />
          ) : (
            <ChevronRight size={10} className="text-[var(--color-text-muted)]" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--color-text-primary)] font-medium">
              {metrics.serverName}
            </span>
            <HealthStatusBadge status={metrics.status} />
            {isConnected ? (
              <Wifi size={10} className="text-[var(--color-success)]" />
            ) : (
              <WifiOff size={10} className="text-[var(--color-text-muted)]" />
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 text-[9px]">
          <span className="flex items-center gap-1" style={{ color: getLatencyColor(metrics.avgLatency) }}>
            <Zap size={10} />
            {formatLatency(metrics.avgLatency)}
          </span>
          <span className="flex items-center gap-1" style={{ color: getErrorRateColor(metrics.errorRate) }}>
            <AlertCircle size={10} />
            {(metrics.errorRate * 100).toFixed(1)}%
          </span>
          <span className="flex items-center gap-1 text-[var(--color-text-muted)]">
            <Clock size={10} />
            {formatUptime(metrics.uptime)}
          </span>
        </div>

        {/* Actions */}
        {showRecoveryButton && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onTriggerRecovery}
            disabled={isRecovering}
            isLoading={isRecovering}
            leftIcon={!isRecovering ? <RotateCcw size={10} /> : undefined}
            className="text-[9px]"
          >
            Recover
          </Button>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-[var(--color-border-subtle)] p-2.5 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
          {/* Metrics Grid */}
          <div className="grid grid-cols-4 gap-2">
            <MetricCard
              icon={Zap}
              label="Avg Latency"
              value={formatLatency(metrics.avgLatency)}
              color={getLatencyColor(metrics.avgLatency)}
            />
            <MetricCard
              icon={ArrowUp}
              label="P95 Latency"
              value={formatLatency(metrics.p95Latency)}
              color={getLatencyColor(metrics.p95Latency)}
            />
            <MetricCard
              icon={AlertCircle}
              label="Error Rate"
              value={(metrics.errorRate * 100).toFixed(1)}
              unit="%"
              color={getErrorRateColor(metrics.errorRate)}
            />
            <MetricCard
              icon={Clock}
              label="Uptime"
              value={formatUptime(metrics.uptime)}
            />
          </div>

          {/* Request Stats */}
          <div className="grid grid-cols-4 gap-2">
            <MetricCard
              icon={Activity}
              label="Total Requests"
              value={metrics.totalRequests}
            />
            <MetricCard
              icon={AlertTriangle}
              label="Total Errors"
              value={metrics.totalErrors}
              color={metrics.totalErrors > 0 ? 'var(--color-error)' : undefined}
            />
            <MetricCard
              icon={Wrench}
              label="Tool Calls"
              value={metrics.toolCallCount}
              color="var(--color-accent-primary)"
            />
            <MetricCard
              icon={FileText}
              label="Resource Reads"
              value={metrics.resourceReadCount}
              color="var(--color-accent-secondary)"
            />
          </div>

          {/* Last Error */}
          {metrics.lastError && (
            <div className="flex items-start gap-2 p-2 rounded bg-[var(--color-error)]/10 border border-[var(--color-error)]/20">
              <AlertCircle size={10} className="text-[var(--color-error)] mt-0.5" />
              <div>
                <p className="text-[9px] text-[var(--color-error)]">{metrics.lastError}</p>
                {metrics.lastErrorAt && (
                  <p className="text-[8px] text-[var(--color-text-muted)] mt-0.5">
                    {new Date(metrics.lastErrorAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Consecutive Failures Warning */}
          {metrics.consecutiveFailures > 0 && (
            <div className="flex items-center gap-2 p-2 rounded bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
              <AlertTriangle size={10} className="text-[var(--color-warning)]" />
              <p className="text-[9px] text-[var(--color-warning)]">
                {metrics.consecutiveFailures} consecutive failure{metrics.consecutiveFailures !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ServerHealthCard.displayName = 'ServerHealthCard';

// =============================================================================
// Main Health Dashboard Component
// =============================================================================

export const MCPHealthDashboard: React.FC<MCPHealthDashboardProps> = memo(({
  healthMetrics,
  onRefresh,
  onTriggerRecovery,
  isRefreshing,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [recoveringServers, setRecoveringServers] = useState<Set<string>>(new Set());

  const handleTriggerRecovery = useCallback(async (serverId: string) => {
    setRecoveringServers((prev) => new Set(prev).add(serverId));
    try {
      await onTriggerRecovery(serverId);
    } finally {
      setRecoveringServers((prev) => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  }, [onTriggerRecovery]);

  // Calculate aggregate stats
  const healthyCount = healthMetrics.filter((m) => m.status === 'healthy').length;
  const degradedCount = healthMetrics.filter((m) => m.status === 'degraded').length;
  const unhealthyCount = healthMetrics.filter((m) => m.status === 'unhealthy').length;
  const avgLatency = healthMetrics.length > 0
    ? healthMetrics.reduce((sum, m) => sum + m.avgLatency, 0) / healthMetrics.length
    : 0;

  const overallStatus: HealthStatus = 
    unhealthyCount > 0 ? 'unhealthy' :
    degradedCount > 0 ? 'degraded' :
    healthyCount > 0 ? 'healthy' : 'unknown';

  if (healthMetrics.length === 0) {
    return null;
  }

  return (
    <div className="border border-[var(--color-border-subtle)] rounded bg-[var(--color-surface-2)]">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left p-3"
      >
        <div className="flex items-center gap-2">
          <Activity size={12} className="text-[var(--color-accent-secondary)]" />
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            # Server Health
          </span>
          <HealthStatusBadge status={overallStatus} />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[9px]">
            {healthyCount > 0 && (
              <span className="flex items-center gap-1 text-[var(--color-success)]">
                <CheckCircle size={10} />
                {healthyCount}
              </span>
            )}
            {degradedCount > 0 && (
              <span className="flex items-center gap-1 text-[var(--color-warning)]">
                <AlertTriangle size={10} />
                {degradedCount}
              </span>
            )}
            {unhealthyCount > 0 && (
              <span className="flex items-center gap-1 text-[var(--color-error)]">
                <AlertCircle size={10} />
                {unhealthyCount}
              </span>
            )}
          </div>
          <ChevronDown
            size={12}
            className={cn(
              "text-[var(--color-text-muted)] transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-[var(--color-border-subtle)] p-3 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <Zap size={10} />
                Avg: {avgLatency.toFixed(0)}ms
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              isLoading={isRefreshing}
              leftIcon={!isRefreshing ? <RefreshCw size={10} /> : undefined}
              className="text-[9px]"
            >
              Refresh
            </Button>
          </div>

          {/* Server Health Cards */}
          <div className="space-y-2">
            {healthMetrics.map((metrics) => (
              <ServerHealthCard
                key={metrics.serverId}
                metrics={metrics}
                onTriggerRecovery={() => handleTriggerRecovery(metrics.serverId)}
                isRecovering={recoveringServers.has(metrics.serverId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

MCPHealthDashboard.displayName = 'MCPHealthDashboard';

export default MCPHealthDashboard;
