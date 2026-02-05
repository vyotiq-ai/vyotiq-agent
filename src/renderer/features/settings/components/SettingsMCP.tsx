/**
 * SettingsMCP Component
 *
 * Settings panel for MCP (Model Context Protocol) configuration.
 * Composes sub-components for servers, store, tools, and settings views.
 *
 * Features:
 * - Installed servers management (MCPServerList)
 * - Server store browser (MCPStoreView)
 * - Tools overview (MCPToolsList)
 * - MCP settings (MCPSettingsView)
 * - Import/export configurations
 *
 * @module renderer/features/settings/components/SettingsMCP
 */

import React, { memo, useState, useCallback, useMemo } from 'react';
import { Server } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useMCPSettings, useMCPServers, useMCPStore } from '../../../hooks/useMCP';
import {
  MCPServerList,
  MCPStoreView,
  MCPSettingsView,
  AddServerModal,
  ServerDetailModal,
  MCPToolsList,
  ImportExportPanel,
} from './mcp';
import type {
  MCPStoreListing,
  MCPServerConfig,
  MCPInstallRequest,
  MCPServerCategory,
} from '../../../../shared/types/mcp';

// =============================================================================
// Types
// =============================================================================

type ViewMode = 'servers' | 'store' | 'tools' | 'settings';

// =============================================================================
// Tab Button Component
// =============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={cn(
      'px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] font-mono transition-colors whitespace-nowrap flex-shrink-0',
      active
        ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
    )}
  >
    {children}
  </button>
);

// =============================================================================
// Main Component
// =============================================================================

export const SettingsMCP: React.FC = memo(() => {
  const [viewMode, setViewMode] = useState<ViewMode>('servers');
  const { settings, loading: settingsLoading, updateSettings } = useMCPSettings();
  const servers = useMCPServers();
  const store = useMCPStore();

  // Modal state
  const [addServerModalOpen, setAddServerModalOpen] = useState(false);
  const [detailServerId, setDetailServerId] = useState<string | null>(null);

  // Build set of installed server identifiers
  const installedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const server of servers.servers) {
      ids.add(server.id);
      ids.add(server.id.toLowerCase());
      ids.add(server.name);
      ids.add(server.name.toLowerCase());
      if (server.sourceId) {
        ids.add(server.sourceId);
        ids.add(server.sourceId.toLowerCase());
      }
    }
    return ids;
  }, [servers.servers]);

  // Check if a listing is installed
  const isListingInstalled = useCallback(
    (listing: MCPStoreListing): boolean => {
      const checks = [
        listing.id,
        listing.id.toLowerCase(),
        listing.name,
        listing.name.toLowerCase(),
        listing.installCommand,
        listing.installCommand.toLowerCase(),
      ];
      return checks.some((check) => installedIds.has(check));
    },
    [installedIds]
  );

  // Store search handler
  const handleStoreSearch = useCallback(
    (query: string) => {
      if (!query) {
        store.loadAll();
      } else {
        store.setFilters({ ...store.filters, query, offset: 0 });
        store.search();
      }
    },
    [store]
  );

  // Category filter handler
  const handleCategoryFilter = useCallback(
    (category: string | undefined) => {
      if (category === undefined) {
        store.loadAll();
      } else {
        store.setFilters({
          ...store.filters,
          category: category as MCPServerCategory | undefined,
          offset: 0,
        });
        store.search();
      }
    },
    [store]
  );

  // Install from store handler
  const handleInstallFromStore = useCallback(
    async (listingId: string) => {
      const result = await store.installFromStore(listingId, { autoStart: true });
      if (result.success) {
        await servers.refresh();
      }
      return result;
    },
    [store, servers]
  );

  // Custom server install handler
  const handleInstallServer = useCallback(
    async (request: MCPInstallRequest) => {
      const result = await window.vyotiq.mcp.installServer(request);
      if (result.success) {
        await servers.refresh();
      }
      return result;
    },
    [servers]
  );

  // Import servers handler
  const handleImportServers = useCallback(
    async (configs: MCPServerConfig[]) => {
      const results = { success: true, imported: 0, errors: [] as string[] };

      for (const config of configs) {
        try {
          const installRequest: MCPInstallRequest = {
            source: config.source,
            packageId: config.sourceId || config.id,
            name: config.name,
            category: config.category,
            autoStart: false,
          };
          const result = await window.vyotiq.mcp.installServer(installRequest);
          if (result.success) {
            results.imported++;
          } else {
            results.errors.push(`${config.name}: ${result.error}`);
          }
        } catch (error) {
          results.errors.push(
            `${config.name}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      results.success = results.imported > 0;
      await servers.refresh();
      return results;
    },
    [servers]
  );

  return (
    <div className="space-y-3 sm:space-y-4 font-mono">
      {/* Header */}
      <div className="flex flex-col xs:flex-row xs:items-center gap-2 xs:justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--color-accent)]" />
          <h2 className="text-[10px] sm:text-[11px] text-[var(--color-text-primary)]">
            mcp-servers
          </h2>
        </div>

        {/* View Mode Tabs - scrollable on small screens */}
        <div className="flex items-center border border-[var(--color-border)] overflow-x-auto -mx-1 px-1 scrollbar-none">
          <TabButton
            active={viewMode === 'servers'}
            onClick={() => setViewMode('servers')}
          >
            [servers]
          </TabButton>
          <TabButton
            active={viewMode === 'store'}
            onClick={() => setViewMode('store')}
          >
            [store]
          </TabButton>
          <TabButton
            active={viewMode === 'tools'}
            onClick={() => setViewMode('tools')}
          >
            [tools]
          </TabButton>
          <TabButton
            active={viewMode === 'settings'}
            onClick={() => setViewMode('settings')}
          >
            [config]
          </TabButton>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'servers' && (
        <MCPServerList
          servers={servers.servers}
          loading={servers.loading}
          onConnect={servers.connectServer}
          onDisconnect={servers.disconnectServer}
          onRestart={servers.restartServer}
          onEnable={servers.enableServer}
          onDisable={servers.disableServer}
          onUninstall={servers.uninstallServer}
          onConnectAll={servers.connectAll}
          onDisconnectAll={servers.disconnectAll}
          onRefresh={servers.refresh}
          onAddServer={() => setAddServerModalOpen(true)}
          onViewDetails={(serverId) => setDetailServerId(serverId)}
        />
      )}

      {viewMode === 'store' && (
        <MCPStoreView
          listings={store.listings}
          featured={store.featured}
          categories={store.categories}
          loading={store.loading}
          hasMore={store.hasMore}
          total={store.total}
          onSearch={handleStoreSearch}
          onCategoryFilter={handleCategoryFilter}
          onLoadMore={store.loadMore}
          onInstall={handleInstallFromStore}
          onRefresh={store.refreshRegistry}
          isInstalled={isListingInstalled}
        />
      )}

      {viewMode === 'tools' && (
        <MCPToolsList maxHeight="calc(100vh - 300px)" />
      )}

      {viewMode === 'settings' && (
        <div className="space-y-6">
          <MCPSettingsView
            settings={settings}
            loading={settingsLoading}
            onUpdate={updateSettings}
          />
          <ImportExportPanel onImport={handleImportServers} />
        </div>
      )}

      {/* Modals */}
      <AddServerModal
        open={addServerModalOpen}
        onClose={() => setAddServerModalOpen(false)}
        onInstall={handleInstallServer}
      />

      {detailServerId && (
        <ServerDetailModal
          open={!!detailServerId}
          onClose={() => setDetailServerId(null)}
          serverId={detailServerId}
        />
      )}
    </div>
  );
});

SettingsMCP.displayName = 'SettingsMCP';

export default SettingsMCP;
