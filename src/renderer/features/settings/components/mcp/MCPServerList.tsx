/**
 * MCP Server List Component
 *
 * Displays the list of installed MCP servers with a stats bar
 * and bulk actions for connect/disconnect all.
 *
 * @module renderer/features/settings/components/mcp/MCPServerList
 */

import React, { memo, useState, useCallback } from 'react';
import {
  Server,
  Plus,
  Play,
  Pause,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { useConfirm } from '../../../../components/ui/ConfirmModal';
import { MCPServerCard } from './MCPServerCard';
import type { MCPServerSummary } from '../../../../../shared/types/mcp';

// =============================================================================
// Types
// =============================================================================

export interface MCPServerListProps {
  servers: MCPServerSummary[];
  loading: boolean;
  onConnect: (serverId: string) => Promise<unknown>;
  onDisconnect: (serverId: string) => Promise<unknown>;
  onRestart: (serverId: string) => Promise<unknown>;
  onEnable: (serverId: string) => Promise<unknown>;
  onDisable: (serverId: string) => Promise<unknown>;
  onUninstall: (serverId: string) => Promise<unknown>;
  onConnectAll: () => Promise<unknown>;
  onDisconnectAll: () => Promise<unknown>;
  onRefresh: () => Promise<void>;
  onAddServer: () => void;
  onViewDetails: (serverId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export const MCPServerList: React.FC<MCPServerListProps> = memo(
  ({
    servers,
    loading,
    onConnect,
    onDisconnect,
    onRestart,
    onEnable,
    onDisable,
    onUninstall,
    onConnectAll,
    onDisconnectAll,
    onRefresh,
    onAddServer,
    onViewDetails,
  }) => {
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const { confirm, ConfirmDialog } = useConfirm();

    const connectedCount = servers.filter((s) => s.status === 'connected').length;
    const totalToolCount = servers.reduce((acc, s) => acc + s.toolCount, 0);

    const handleConfirmUninstall = useCallback(
      async (serverName: string): Promise<boolean> => {
        return confirm({
          title: 'Uninstall Server',
          message: `Remove "${serverName}"? This will delete the server configuration.`,
          confirmLabel: 'Uninstall',
          variant: 'destructive',
        });
      },
      [confirm]
    );

    const handleAction = async (serverId: string, action: () => Promise<unknown>) => {
      setActionLoading(serverId);
      try {
        await action();
      } finally {
        setActionLoading(null);
      }
    };

    return (
      <div className="space-y-2 sm:space-y-3 font-mono">
        {/* Stats Bar */}
        <div className="flex flex-col xs:flex-row xs:items-center gap-2 xs:justify-between px-2 sm:px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-border)]">
          <div className="flex items-center gap-3 sm:gap-4 text-[9px] sm:text-[10px]">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[var(--color-text-muted)]">servers:</span>
              <span className="text-[var(--color-text-primary)]">
                {connectedCount}/{servers.length}
              </span>
              <span className="text-[var(--color-success)] hidden xs:inline">
                {connectedCount > 0 ? '[active]' : '[none]'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[var(--color-text-muted)]">tools:</span>
              <span className="text-[var(--color-text-primary)]">{totalToolCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onConnectAll()}
              leftIcon={<Play className="w-3 h-3" />}
              className="text-[9px] sm:text-[10px]"
            >
              <span className="hidden xs:inline">Start All</span>
              <span className="xs:hidden">Start</span>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onDisconnectAll()}
              leftIcon={<Pause className="w-3 h-3" />}
              className="text-[9px] sm:text-[10px]"
            >
              <span className="hidden xs:inline">Stop All</span>
              <span className="xs:hidden">Stop</span>
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={onRefresh}
              leftIcon={<RefreshCw className="w-3 h-3" />}
              className="text-[9px] sm:text-[10px]"
            >
              <span className="hidden xs:inline">Refresh</span>
            </Button>
            <div className="w-px h-4 bg-[var(--color-border)] mx-1 hidden xs:block" />
            <Button
              size="xs"
              variant="primary"
              onClick={onAddServer}
              leftIcon={<Plus className="w-3 h-3" />}
              className="text-[9px] sm:text-[10px]"
            >
              Add
            </Button>
          </div>
        </div>

        {/* Server List */}
        {loading && servers.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" />
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
            <p className="text-[11px] text-[var(--color-text-muted)]">
              no mcp servers installed
            </p>
            <p className="text-[10px] text-[var(--color-text-dim)] mt-1">
              # browse the store or add a custom server
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {servers.map((server) => (
              <MCPServerCard
                key={server.id}
                server={server}
                onConnect={() => handleAction(server.id, () => onConnect(server.id))}
                onDisconnect={() => handleAction(server.id, () => onDisconnect(server.id))}
                onRestart={() => handleAction(server.id, () => onRestart(server.id))}
                onEnable={() => handleAction(server.id, () => onEnable(server.id))}
                onDisable={() => handleAction(server.id, () => onDisable(server.id))}
                onUninstall={() => handleAction(server.id, () => onUninstall(server.id))}
                onViewDetails={() => onViewDetails(server.id)}
                isLoading={actionLoading === server.id}
                onConfirmUninstall={handleConfirmUninstall}
              />
            ))}
          </div>
        )}

        <ConfirmDialog />
      </div>
    );
  }
);

MCPServerList.displayName = 'MCPServerList';

export default MCPServerList;
