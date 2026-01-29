/**
 * MCP Discovery Panel Component
 * 
 * Displays discovered MCP servers and allows adding them to the configuration.
 * Features:
 * - Auto-discovery from registry, npm, workspace, and config files
 * - Confidence scoring for each candidate
 * - One-click server addition
 * - Source and verification indicators
 */

import React, { memo, useState, useCallback } from 'react';
import {
  Search,
  Plus,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Shield,
  Globe,
  Terminal,
  Package,
  FolderOpen,
  FileJson,
  Server,
  Info,
  XCircle,
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../../components/ui/Button';

// =============================================================================
// Types
// =============================================================================

export interface MCPServerCandidate {
  name: string;
  description?: string;
  source: 'registry' | 'npm' | 'workspace' | 'config' | 'environment' | 'path' | 'manual';
  transport: Record<string, unknown>;
  icon?: string;
  tags?: string[];
  verified?: boolean;
  requiredEnv?: string[];
  confidence: number;
}

interface MCPDiscoveryPanelProps {
  discoveredServers: MCPServerCandidate[];
  isDiscovering: boolean;
  existingServerNames: string[];
  onDiscover: (options?: { workspacePaths?: string[]; includeUnverified?: boolean }) => Promise<void>;
  onAddServer: (candidate: MCPServerCandidate) => Promise<void>;
  onClearCache: () => Promise<void>;
}

// =============================================================================
// Source Badge Component
// =============================================================================

interface SourceBadgeProps {
  source: MCPServerCandidate['source'];
}

const SourceBadge: React.FC<SourceBadgeProps> = memo(({ source }) => {
  const config: Record<MCPServerCandidate['source'], { icon: typeof Package; label: string; color: string }> = {
    registry: { icon: Globe, label: 'Registry', color: 'var(--color-accent-primary)' },
    npm: { icon: Package, label: 'NPM', color: 'var(--color-warning)' },
    workspace: { icon: FolderOpen, label: 'Workspace', color: 'var(--color-accent-secondary)' },
    config: { icon: FileJson, label: 'Config', color: 'var(--color-success)' },
    environment: { icon: Terminal, label: 'Environment', color: 'var(--color-text-muted)' },
    path: { icon: Terminal, label: 'PATH', color: 'var(--color-text-muted)' },
    manual: { icon: Server, label: 'Manual', color: 'var(--color-text-muted)' },
  };

  const sourceConfig = config[source];
  const Icon = sourceConfig.icon;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono rounded"
      style={{
        color: sourceConfig.color,
        backgroundColor: `color-mix(in srgb, ${sourceConfig.color} 10%, transparent)`,
        borderWidth: '1px',
        borderColor: `color-mix(in srgb, ${sourceConfig.color} 20%, transparent)`,
      }}
    >
      <Icon size={8} />
      {sourceConfig.label}
    </span>
  );
});

SourceBadge.displayName = 'SourceBadge';

// =============================================================================
// Confidence Indicator Component
// =============================================================================

interface ConfidenceIndicatorProps {
  confidence: number;
}

const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = memo(({ confidence }) => {
  const percentage = Math.round(confidence * 100);
  const color = confidence >= 0.8
    ? 'var(--color-success)'
    : confidence >= 0.5
    ? 'var(--color-warning)'
    : 'var(--color-error)';

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-16 h-1 rounded-full bg-[var(--color-surface-3)] overflow-hidden"
        title={`${percentage}% confidence`}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="text-[8px] text-[var(--color-text-muted)] w-8">{percentage}%</span>
    </div>
  );
});

ConfidenceIndicator.displayName = 'ConfidenceIndicator';

// =============================================================================
// Discovery Card Component
// =============================================================================

interface DiscoveryCardProps {
  candidate: MCPServerCandidate;
  isAdded: boolean;
  isAdding: boolean;
  onAdd: () => void;
}

const DiscoveryCard: React.FC<DiscoveryCardProps> = memo(({
  candidate,
  isAdded,
  isAdding,
  onAdd,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasRequiredEnv = candidate.requiredEnv && candidate.requiredEnv.length > 0;

  return (
    <div
      className={cn(
        "border rounded transition-all duration-150",
        isAdded
          ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/5 opacity-60"
          : "border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-default)]"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-2.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 hover:bg-[var(--color-surface-3)] rounded transition-colors"
          disabled={isAdded}
        >
          {isExpanded ? (
            <ChevronDown size={10} className="text-[var(--color-text-muted)]" />
          ) : (
            <ChevronRight size={10} className="text-[var(--color-text-muted)]" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-[var(--color-text-primary)] font-medium">
              {candidate.name}
            </span>
            <SourceBadge source={candidate.source} />
            {candidate.verified && (
              <span className="inline-flex items-center gap-0.5 text-[8px] text-[var(--color-success)]">
                <Shield size={8} />
                Verified
              </span>
            )}
          </div>
          {candidate.description && (
            <p className="text-[9px] text-[var(--color-text-muted)] truncate mt-0.5">
              {candidate.description}
            </p>
          )}
        </div>

        <ConfidenceIndicator confidence={candidate.confidence} />

        <Button
          variant={isAdded ? "ghost" : "primary"}
          size="sm"
          onClick={onAdd}
          disabled={isAdded || isAdding}
          isLoading={isAdding}
          leftIcon={isAdded ? <CheckCircle size={10} /> : !isAdding ? <Plus size={10} /> : undefined}
          className="text-[9px]"
        >
          {isAdded ? 'Added' : 'Add'}
        </Button>
      </div>

      {/* Expanded Content */}
      {isExpanded && !isAdded && (
        <div className="border-t border-[var(--color-border-subtle)] p-2.5 space-y-2 animate-in slide-in-from-top-1 fade-in duration-150">
          {/* Transport info */}
          <div className="text-[9px]">
            <span className="text-[var(--color-text-muted)]"># Transport:</span>
            <span className="ml-2 text-[var(--color-text-secondary)] font-mono">
              {candidate.transport.type === 'stdio'
                ? `${(candidate.transport as { command?: string }).command} ${((candidate.transport as { args?: string[] }).args ?? []).join(' ')}`
                : (candidate.transport as { url?: string }).url}
            </span>
          </div>

          {/* Required environment variables */}
          {hasRequiredEnv && (
            <div className="flex items-start gap-2 p-2 rounded bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
              <AlertCircle size={10} className="text-[var(--color-warning)] mt-0.5" />
              <div>
                <p className="text-[9px] text-[var(--color-warning)]">Required environment variables:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {candidate.requiredEnv?.map((env) => (
                    <span
                      key={env}
                      className="px-1.5 py-0.5 text-[8px] font-mono bg-[var(--color-surface-3)] rounded"
                    >
                      {env}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {candidate.tags && candidate.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {candidate.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-[8px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-3)] rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

DiscoveryCard.displayName = 'DiscoveryCard';

// =============================================================================
// Main Discovery Panel Component
// =============================================================================

export const MCPDiscoveryPanel: React.FC<MCPDiscoveryPanelProps> = memo(({
  discoveredServers,
  isDiscovering,
  existingServerNames,
  onDiscover,
  onAddServer,
  onClearCache,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [addingServers, setAddingServers] = useState<Set<string>>(new Set());
  const [includeUnverified, setIncludeUnverified] = useState(false);

  const handleDiscover = useCallback(async () => {
    await onDiscover({ includeUnverified });
    setIsExpanded(true);
  }, [onDiscover, includeUnverified]);

  const handleAddServer = useCallback(async (candidate: MCPServerCandidate) => {
    setAddingServers((prev) => new Set(prev).add(candidate.name));
    try {
      await onAddServer(candidate);
    } finally {
      setAddingServers((prev) => {
        const next = new Set(prev);
        next.delete(candidate.name);
        return next;
      });
    }
  }, [onAddServer]);

  const handleClearCache = useCallback(async () => {
    await onClearCache();
  }, [onClearCache]);

  // Group servers by source
  const groupedServers = discoveredServers.reduce((acc, server) => {
    const source = server.source;
    if (!acc[source]) {
      acc[source] = [];
    }
    acc[source].push(server);
    return acc;
  }, {} as Record<string, MCPServerCandidate[]>);

  const sourceOrder: MCPServerCandidate['source'][] = ['registry', 'config', 'workspace', 'npm', 'environment', 'path', 'manual'];

  return (
    <div className="border border-[var(--color-border-subtle)] rounded bg-[var(--color-surface-2)]">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full text-left p-3"
      >
        <div className="flex items-center gap-2">
          <Search size={12} className="text-[var(--color-accent-primary)]" />
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
            # Discover MCP Servers
          </span>
          {discoveredServers.length > 0 && (
            <span className="px-1.5 py-0.5 text-[8px] font-mono text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 rounded">
              {discoveredServers.length} found
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
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-[var(--color-border-subtle)] p-3 space-y-3 animate-in slide-in-from-top-1 fade-in duration-150">
          {/* Controls */}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={includeUnverified}
                onChange={(e) => setIncludeUnverified(e.target.checked)}
                className="w-3 h-3 rounded border-[var(--color-border-subtle)] bg-[var(--color-surface-3)]"
              />
              Include unverified servers
            </label>
            <div className="flex items-center gap-2">
              {discoveredServers.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCache}
                  leftIcon={<XCircle size={10} />}
                  className="text-[9px]"
                >
                  Clear
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDiscover}
                disabled={isDiscovering}
                isLoading={isDiscovering}
                leftIcon={!isDiscovering ? <Search size={10} /> : undefined}
                className="text-[9px]"
              >
                {isDiscovering ? 'Discovering...' : 'Scan'}
              </Button>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-2 rounded bg-[var(--color-surface-3)]">
            <Info size={10} className="text-[var(--color-text-muted)] mt-0.5" />
            <p className="text-[9px] text-[var(--color-text-muted)]">
              Searches for MCP servers from the official registry, your workspace, npm packages, and configuration files.
            </p>
          </div>

          {/* Results */}
          {discoveredServers.length === 0 ? (
            isDiscovering ? (
              <div className="flex flex-col items-center justify-center py-6">
                <Loader2 size={20} className="text-[var(--color-accent-primary)] animate-spin mb-2" />
                <p className="text-[10px] text-[var(--color-text-muted)]">Scanning for MCP servers...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Search size={20} className="text-[var(--color-text-muted)] mb-2" />
                <p className="text-[10px] text-[var(--color-text-muted)]">No servers discovered yet</p>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-1">
                  Click Scan to search for available MCP servers
                </p>
              </div>
            )
          ) : (
            <div className="space-y-3">
              {sourceOrder.map((source) => {
                const servers = groupedServers[source];
                if (!servers || servers.length === 0) return null;

                return (
                  <div key={source}>
                    <div className="text-[8px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
                      {source} ({servers.length})
                    </div>
                    <div className="space-y-1.5">
                      {servers.map((candidate) => (
                        <DiscoveryCard
                          key={`${candidate.source}-${candidate.name}`}
                          candidate={candidate}
                          isAdded={existingServerNames.includes(candidate.name)}
                          isAdding={addingServers.has(candidate.name)}
                          onAdd={() => handleAddServer(candidate)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

MCPDiscoveryPanel.displayName = 'MCPDiscoveryPanel';

export default MCPDiscoveryPanel;
