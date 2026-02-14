/**
 * MCP IPC Handlers
 *
 * Handles all MCP-related IPC operations including:
 * - Server management (list, connect, disconnect, restart)
 * - Tool discovery and execution
 * - Store browsing and installation
 * - Settings management
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import {
  getMCPStore,
  initializeMCPServerManager,
} from '../mcp';
import type { IpcContext } from './types';
import type {
  MCPServerConfig,
  MCPSettings,
  MCPStoreFilters,
  MCPInstallRequest,
  MCPToolCallRequest,
} from '../../shared/types/mcp';

const logger = createLogger('IPC:MCP');

export function registerMCPHandlers(context: IpcContext): void {
  const { getSettingsStore, emitToRenderer } = context;

  // ==========================================================================
  // Initialization
  // ==========================================================================

  // Get or initialize the MCP manager with settings
  const getMCPManager = () => {
    const settings = getSettingsStore()?.get()?.mcpSettings;
    return initializeMCPServerManager(settings || undefined);
  };

  const getMCPStoreInstance = () => {
    return getMCPStore(getMCPManager());
  };

  // Set up event forwarding to renderer (eagerly on handler registration)
  let eventForwardingSetup = false;
  const setupEventForwarding = () => {
    if (eventForwardingSetup) return;
    const manager = getMCPManager();

    manager.on('server:status-changed', (serverId, status, error) => {
      emitToRenderer?.({ type: 'mcp:server-status-changed', serverId, status, error });
    });

    manager.on('server:tools-changed', (serverId, tools) => {
      emitToRenderer?.({ type: 'mcp:server-tools-changed', serverId, tools });
    });

    manager.on('tools:updated', (allTools) => {
      emitToRenderer?.({ type: 'mcp:tools-updated', tools: allTools });
    });

    manager.on('event', (event) => {
      emitToRenderer?.({ type: 'mcp:event', ...event });
    });

    eventForwardingSetup = true;
  };

  // Initialize event forwarding eagerly so server status events
  // are forwarded to the renderer from the start (not just on first IPC call)
  try {
    setupEventForwarding();
  } catch (err) {
    logger.warn('Failed to setup MCP event forwarding eagerly, will retry on first access', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const ensureEventForwarding = () => {
    if (!eventForwardingSetup) {
      setupEventForwarding();
    }
  };

  // ==========================================================================
  // Settings Management
  // ==========================================================================

  ipcMain.handle('mcp:get-settings', () => {
    try {
      const settings = getSettingsStore()?.get()?.mcpSettings;
      return settings || getMCPManager().getSettings();
    } catch (error) {
      logger.error('Failed to get MCP settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  ipcMain.handle('mcp:update-settings', async (_event, settings: Partial<MCPSettings>) => {
    try {
      logger.info('Updating MCP settings', { settings });
      const manager = getMCPManager();
      manager.updateSettings(settings);

      // Persist to settings store
      const currentSettings = getSettingsStore()?.get()?.mcpSettings || manager.getSettings();
      const newSettings = { ...currentSettings, ...settings };
      getSettingsStore()?.set({ mcpSettings: newSettings });

      // Update custom registries in store
      if (settings.customRegistries) {
        getMCPStoreInstance().setCustomRegistries(settings.customRegistries);
      }

      return newSettings;
    } catch (error) {
      logger.error('Failed to update MCP settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  // ==========================================================================
  // Server Configuration Management
  // ==========================================================================

  ipcMain.handle('mcp:get-servers', () => {
    try {
      ensureEventForwarding();
      return getMCPManager().getAllServers();
    } catch (error) {
      logger.error('Failed to get servers', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle('mcp:get-server-states', () => {
    try {
      ensureEventForwarding();
      return getMCPManager().getAllServerStates();
    } catch (error) {
      logger.error('Failed to get server states', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle('mcp:get-server-summaries', () => {
    try {
      ensureEventForwarding();
      return getMCPManager().getServerSummaries();
    } catch (error) {
      logger.error('Failed to get server summaries', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle('mcp:get-server', (_event, serverId: string) => {
    try {
      return getMCPManager().getServer(serverId);
    } catch (error) {
      logger.error('Failed to get server', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  ipcMain.handle('mcp:get-server-state', (_event, serverId: string) => {
    try {
      return getMCPManager().getServerState(serverId);
    } catch (error) {
      logger.error('Failed to get server state', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  ipcMain.handle('mcp:register-server', async (_event, config: MCPServerConfig) => {
    try {
      logger.info('Registering MCP server', { serverId: config.id, name: config.name });
      const manager = getMCPManager();
      manager.registerServer(config);

      // Persist server config
      saveServersToSettings();

      return { success: true };
    } catch (error) {
      logger.error('Failed to register server', {
        config,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:update-server', async (_event, config: MCPServerConfig) => {
    try {
      logger.info('Updating MCP server', { serverId: config.id });
      getMCPManager().updateServerConfig(config);

      // Persist server config
      saveServersToSettings();

      return { success: true };
    } catch (error) {
      logger.error('Failed to update server', {
        serverId: config.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:unregister-server', async (_event, serverId: string) => {
    try {
      logger.info('Unregistering MCP server', { serverId });
      getMCPManager().unregisterServer(serverId);

      // Persist server config
      saveServersToSettings();

      return { success: true };
    } catch (error) {
      logger.error('Failed to unregister server', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ==========================================================================
  // Server Connection Management
  // ==========================================================================

  ipcMain.handle('mcp:connect-server', async (_event, serverId: string) => {
    try {
      logger.info('Connecting to MCP server', { serverId });
      await getMCPManager().connectServer(serverId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to connect to server', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:disconnect-server', async (_event, serverId: string) => {
    try {
      logger.info('Disconnecting from MCP server', { serverId });
      await getMCPManager().disconnectServer(serverId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect from server', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:restart-server', async (_event, serverId: string) => {
    try {
      logger.info('Restarting MCP server', { serverId });
      await getMCPManager().restartServer(serverId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to restart server', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:enable-server', async (_event, serverId: string) => {
    try {
      logger.info('Enabling MCP server', { serverId });
      const config = getMCPManager().getServer(serverId);
      if (!config) {
        return { success: false, error: 'Server not found' };
      }
      getMCPManager().updateServerConfig({ ...config, enabled: true });
      saveServersToSettings();
      return { success: true };
    } catch (error) {
      logger.error('Failed to enable server', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:disable-server', async (_event, serverId: string) => {
    try {
      logger.info('Disabling MCP server', { serverId });
      const config = getMCPManager().getServer(serverId);
      if (!config) {
        return { success: false, error: 'Server not found' };
      }
      getMCPManager().updateServerConfig({ ...config, enabled: false });
      saveServersToSettings();
      return { success: true };
    } catch (error) {
      logger.error('Failed to disable server', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:connect-all', async () => {
    try {
      logger.info('Connecting to all enabled MCP servers');
      await getMCPManager().connectAll();
      return { success: true };
    } catch (error) {
      logger.error('Failed to connect to all servers', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:disconnect-all', async () => {
    try {
      logger.info('Disconnecting from all MCP servers');
      await getMCPManager().disconnectAll();
      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect from all servers', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ==========================================================================
  // Tool Management
  // ==========================================================================

  ipcMain.handle('mcp:get-all-tools', () => {
    try {
      return getMCPManager().getAllTools();
    } catch (error) {
      logger.error('Failed to get all tools', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle('mcp:get-server-tools', (_event, serverId: string) => {
    try {
      return getMCPManager().getServerTools(serverId);
    } catch (error) {
      logger.error('Failed to get server tools', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle('mcp:find-tool', (_event, toolName: string) => {
    try {
      return getMCPManager().findTool(toolName);
    } catch (error) {
      logger.error('Failed to find tool', {
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  ipcMain.handle('mcp:call-tool', async (_event, request: MCPToolCallRequest) => {
    try {
      logger.info('Calling MCP tool', {
        serverId: request.serverId,
        toolName: request.toolName,
      });
      return await getMCPManager().callTool(request);
    } catch (error) {
      logger.error('Failed to call tool', {
        request,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: 0,
      };
    }
  });

  ipcMain.handle('mcp:clear-cache', () => {
    try {
      getMCPManager().clearCache();
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear cache', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ==========================================================================
  // Resource Management
  // ==========================================================================

  ipcMain.handle('mcp:get-all-resources', () => {
    try {
      return getMCPManager().getAllResources();
    } catch (error) {
      logger.error('Failed to get all resources', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle(
    'mcp:read-resource',
    async (_event, serverId: string, uri: string) => {
      try {
        return await getMCPManager().readResource(serverId, uri);
      } catch (error) {
        logger.error('Failed to read resource', {
          serverId,
          uri,
          error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // ==========================================================================
  // Prompt Management
  // ==========================================================================

  ipcMain.handle('mcp:get-all-prompts', () => {
    try {
      return getMCPManager().getAllPrompts();
    } catch (error) {
      logger.error('Failed to get all prompts', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle(
    'mcp:get-prompt',
    async (_event, serverId: string, promptName: string, args?: Record<string, string>) => {
      try {
        return await getMCPManager().getPrompt(serverId, promptName, args);
      } catch (error) {
        logger.error('Failed to get prompt', {
          serverId,
          promptName,
          error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // ==========================================================================
  // Store Management
  // ==========================================================================

  ipcMain.handle('mcp:store-search', async (_event, filters: MCPStoreFilters) => {
    try {
      return await getMCPStoreInstance().search(filters);
    } catch (error) {
      logger.error('Failed to search store', {
        filters,
        error: error instanceof Error ? error.message : String(error),
      });
      return { total: 0, items: [], hasMore: false };
    }
  });

  ipcMain.handle('mcp:store-get-featured', async () => {
    try {
      return await getMCPStoreInstance().getFeatured();
    } catch (error) {
      logger.error('Failed to get featured servers', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle('mcp:store-get-categories', async () => {
    try {
      return await getMCPStoreInstance().getCategories();
    } catch (error) {
      logger.error('Failed to get categories', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle('mcp:store-get-details', async (_event, id: string) => {
    try {
      return await getMCPStoreInstance().getServerDetails(id);
    } catch (error) {
      logger.error('Failed to get server details', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  });

  ipcMain.handle('mcp:store-refresh', async () => {
    try {
      // Clear cache first to ensure fresh data
      await getMCPStoreInstance().clearRegistryCache();
      await getMCPStoreInstance().refreshRegistry();
      return { success: true };
    } catch (error) {
      logger.error('Failed to refresh registry', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:store-is-installed', (_event, listingId: string) => {
    try {
      return getMCPStoreInstance().isInstalled(listingId);
    } catch (error) {
      logger.error('Failed to check installation status', {
        listingId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  });

  // ==========================================================================
  // Installation Management
  // ==========================================================================

  ipcMain.handle('mcp:install-server', async (_event, request: MCPInstallRequest) => {
    try {
      logger.info('Installing MCP server', { request });
      const result = await getMCPStoreInstance().installServer(request);
      if (result.success) {
        saveServersToSettings();
      }
      return result;
    } catch (error) {
      logger.error('Failed to install server', {
        request,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(
    'mcp:install-from-store',
    async (
      _event,
      listingId: string,
      options?: { env?: Record<string, string>; autoStart?: boolean }
    ) => {
      try {
        logger.info('Installing MCP server from store', { listingId, options });
        const result = await getMCPStoreInstance().installFromStore(listingId, options);
        if (result.success) {
          saveServersToSettings();
        }
        return result;
      } catch (error) {
        logger.error('Failed to install server from store', {
          listingId,
          error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  ipcMain.handle('mcp:uninstall-server', async (_event, serverId: string) => {
    try {
      logger.info('Uninstalling MCP server', { serverId });
      const result = await getMCPStoreInstance().uninstallServer(serverId);
      if (result.success) {
        saveServersToSettings();
      }
      return result;
    } catch (error) {
      logger.error('Failed to uninstall server', {
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // ==========================================================================
  // Registry Management (Dynamic)
  // ==========================================================================

  ipcMain.handle('mcp:registry-get-stats', () => {
    try {
      return getMCPStoreInstance().getRegistryStats();
    } catch (error) {
      logger.error('Failed to get registry stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { sources: {}, total: 0, lastFullRefresh: 0 };
    }
  });

  ipcMain.handle('mcp:registry-get-sources', () => {
    try {
      return getMCPStoreInstance().getEnabledSources();
    } catch (error) {
      logger.error('Failed to get enabled sources', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });

  ipcMain.handle(
    'mcp:registry-set-source-enabled',
    (
      _event,
      source: 'smithery' | 'npm' | 'pypi' | 'github' | 'glama',
      enabled: boolean
    ) => {
      try {
        getMCPStoreInstance().setSourceEnabled(source, enabled);
        return { success: true };
      } catch (error) {
        logger.error('Failed to set source enabled', {
          source,
          enabled,
          error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    }
  );

  // ==========================================================================
  // Persistence Helpers
  // ==========================================================================

  const saveServersToSettings = () => {
    try {
      const servers = getMCPManager().getAllServers();
      getSettingsStore()?.set({ mcpServers: servers });
    } catch (error) {
      logger.error('Failed to save servers to settings', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Load saved servers on startup only if not already loaded by orchestrator init
  const loadServersFromSettings = () => {
    try {
      const servers = getSettingsStore()?.get()?.mcpServers;
      if (servers && Array.isArray(servers)) {
        const manager = getMCPManager();
        const existingServerIds = new Set(manager.getAllServers().map((s: MCPServerConfig) => s.id));
        let newCount = 0;
        for (const server of servers) {
          if (!existingServerIds.has(server.id)) {
            manager.registerServer(server);
            newCount++;
          }
        }
        if (newCount > 0) {
          logger.info('Loaded new MCP servers from settings', { newCount, totalSettings: servers.length });
        } else {
          logger.debug('All MCP servers already registered (likely loaded by orchestrator)', { count: servers.length });
        }
      }
    } catch (error) {
      logger.error('Failed to load servers from settings', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Initialize: Load saved servers
  loadServersFromSettings();
}
