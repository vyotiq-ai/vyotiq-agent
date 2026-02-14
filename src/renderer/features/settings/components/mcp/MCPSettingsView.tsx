/**
 * MCP Settings View Component
 *
 * Displays MCP configuration options including registry sources,
 * general settings, timeouts, and connection settings.
 *
 * @module renderer/features/settings/components/mcp/MCPSettingsView
 */

import React, { memo } from 'react';
import {
  Server,
  RefreshCw,
} from 'lucide-react';
import { Spinner } from '../../../../components/ui/LoadingState';
import { Button } from '../../../../components/ui/Button';
import {
  SettingsSection,
  SettingsGroup,
  SettingsToggleRow,
  SettingsInput,
} from '../../primitives';
import { useMCPStore } from '../../../../hooks/useMCP';
import type { MCPSettings } from '../../../../../shared/types/mcp';

// =============================================================================
// Types
// =============================================================================

export interface MCPSettingsViewProps {
  settings: MCPSettings | null;
  loading: boolean;
  onUpdate: (updates: Partial<MCPSettings>) => Promise<void>;
}

// =============================================================================
// Registry Source Config
// =============================================================================

const REGISTRY_SOURCES = [
  { id: 'smithery', name: 'smithery.ai', description: 'primary mcp registry (3,800+ servers)' },
  { id: 'npm', name: 'npm', description: '@modelcontextprotocol scope packages' },
  { id: 'pypi', name: 'pypi', description: 'python mcp-server packages' },
  { id: 'github', name: 'github', description: 'official modelcontextprotocol repo' },
  { id: 'glama', name: 'glama.ai', description: 'curated mcp listings' },
] as const;

// =============================================================================
// Component
// =============================================================================

export const MCPSettingsView: React.FC<MCPSettingsViewProps> = memo(
  ({ settings, loading, onUpdate }) => {
    const store = useMCPStore();

    if (loading || !settings) {
      return (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" className="w-5 h-5 text-[var(--color-text-muted)]" />
        </div>
      );
    }

    const enabledSources = settings.enabledRegistrySources || {
      smithery: true,
      npm: true,
      pypi: true,
      github: true,
      glama: false,
    };

    const isSourceEnabled = (sourceId: string): boolean => {
      return enabledSources[sourceId as keyof typeof enabledSources] ?? false;
    };

    const handleSourceToggle = async (sourceId: string) => {
      const current = settings.enabledRegistrySources || {
        smithery: true,
        npm: true,
        pypi: true,
        github: true,
        glama: false,
      };
      const updated = {
        ...current,
        [sourceId]: !current[sourceId as keyof typeof current],
      };
      await onUpdate({ enabledRegistrySources: updated });
      await store.setSourceEnabled(sourceId, !current[sourceId as keyof typeof current]);
    };

    return (
      <div className="space-y-6">
        {/* Registry Sources */}
        <SettingsSection title="Registry Sources" description="Select which registries to search for MCP servers">
          {/* Stats Summary */}
          {store.registryStats && (
            <div className="flex items-center gap-4 px-3 py-2 text-[10px] font-mono bg-[var(--color-surface-base)] border border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Server className="w-3 h-3 text-[var(--color-text-muted)]" />
                <span className="text-[var(--color-text-muted)]">total:</span>
                <span className="text-[var(--color-accent)]">{store.registryStats.total.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">last-refresh:</span>
                <span className="text-[var(--color-text-secondary)]">
                  {store.registryStats.lastFullRefresh > 0
                    ? new Date(store.registryStats.lastFullRefresh).toLocaleTimeString()
                    : 'never'}
                </span>
              </div>
              <div className="flex-1" />
              <Button
                size="xs"
                variant="ghost"
                onClick={() => store.refreshRegistry()}
                disabled={store.loading}
                leftIcon={store.loading ? <Spinner size="sm" className="w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
              >
                Refresh
              </Button>
            </div>
          )}

          {/* Source Toggles */}
          <SettingsGroup title="Sources">
            {REGISTRY_SOURCES.map((source) => {
              const isEnabled = isSourceEnabled(source.id);
              const stats = store.registryStats?.sources[source.id];
              const countStr = stats ? ` (${stats.count.toLocaleString()})` : '';
              const staleNote = stats && !stats.fresh ? ' [stale]' : '';

              return (
                <SettingsToggleRow
                  key={source.id}
                  label={`${source.name}${countStr}${staleNote}`}
                  description={source.description}
                  checked={isEnabled}
                  onToggle={() => handleSourceToggle(source.id)}
                />
              );
            })}
          </SettingsGroup>

          <div className="text-[10px] text-[var(--color-text-dim)] font-mono px-1">
            # servers cached for 30-60 min. disable unused sources to speed up searches.
          </div>
        </SettingsSection>

        {/* General Settings */}
        <SettingsSection title="General" description="Core MCP integration settings">
          <SettingsToggleRow
            label="enable-mcp"
            description="allow agent to use mcp server tools"
            checked={settings.enabled ?? true}
            onToggle={() => onUpdate({ enabled: !(settings.enabled ?? true) })}
          />
          <SettingsToggleRow
            label="auto-start"
            description="connect enabled servers when agent starts"
            checked={settings.autoStartServers ?? true}
            onToggle={() => onUpdate({ autoStartServers: !(settings.autoStartServers ?? true) })}
          />
          <SettingsToggleRow
            label="show-in-tools"
            description="display mcp tools in tool selection ui"
            checked={settings.showInToolSelection ?? true}
            onToggle={() => onUpdate({ showInToolSelection: !(settings.showInToolSelection ?? true) })}
          />
          <SettingsToggleRow
            label="cache-results"
            description="cache repeated tool calls for faster responses"
            checked={settings.cacheToolResults ?? true}
            onToggle={() => onUpdate({ cacheToolResults: !(settings.cacheToolResults ?? true) })}
          />
          <SettingsToggleRow
            label="debug-logging"
            description="log mcp communications for debugging"
            checked={settings.debugLogging ?? false}
            onToggle={() => onUpdate({ debugLogging: !(settings.debugLogging ?? false) })}
          />
        </SettingsSection>

        {/* Timeout Settings */}
        <SettingsSection title="Timeouts" description="Connection and execution timeout values">
          <SettingsGroup title="Values">
            <div className="grid grid-cols-2 gap-4">
              <SettingsInput
                label="connection-timeout"
                description="seconds to wait for server connection"
                value={String((settings.connectionTimeoutMs ?? 30000) / 1000)}
                onChange={(val) => onUpdate({ connectionTimeoutMs: Number(val) * 1000 })}
                type="number"
                placeholder="30"
              />
              <SettingsInput
                label="tool-timeout"
                description="seconds to wait for tool execution"
                value={String((settings.toolTimeoutMs ?? 60000) / 1000)}
                onChange={(val) => onUpdate({ toolTimeoutMs: Number(val) * 1000 })}
                type="number"
                placeholder="60"
              />
            </div>
          </SettingsGroup>
        </SettingsSection>

        {/* Connection Settings */}
        <SettingsSection title="Connections" description="Server connection behavior">
          <SettingsToggleRow
            label="retry-failed"
            description="automatically retry when connection fails"
            checked={settings.retryFailedConnections ?? true}
            onToggle={() => onUpdate({ retryFailedConnections: !(settings.retryFailedConnections ?? true) })}
          />
          <SettingsGroup title="Limits">
            <div className="grid grid-cols-2 gap-4">
              <SettingsInput
                label="max-connections"
                description="maximum concurrent server connections"
                value={String(settings.maxConcurrentConnections ?? 10)}
                onChange={(val) => onUpdate({ maxConcurrentConnections: Number(val) })}
                type="number"
                placeholder="10"
              />
              <SettingsInput
                label="retry-count"
                description="number of retry attempts"
                value={String(settings.retryCount ?? 3)}
                onChange={(val) => onUpdate({ retryCount: Number(val) })}
                type="number"
                placeholder="3"
              />
            </div>
          </SettingsGroup>
        </SettingsSection>
      </div>
    );
  }
);

MCPSettingsView.displayName = 'MCPSettingsView';

export default MCPSettingsView;
