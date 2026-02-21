/**
 * MCP Settings Sync Utility
 *
 * Synchronizes MCP settings and server configurations from the settings store
 * to the live MCPServerManager singleton. This ensures that settings changes
 * made through the general settings:update IPC channel (not just the dedicated
 * mcp:* channels) are propagated to the running MCP infrastructure.
 *
 * @module main/ipc/mcpSettingsSync
 */

import type { AgentSettings } from '../../shared/types';
import type { MCPServerConfig } from '../../shared/types/mcp';

interface SyncLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Synchronize MCP settings and server configs from the full settings object
 * to the live MCPServerManager singleton.
 *
 * This function is safe to call even if MCPServerManager hasn't been initialized yet —
 * `initializeMCPServerManager` will create the singleton if needed.
 *
 * Uses dynamic ESM import (not require()) to avoid Vite bundling issues where
 * relative CommonJS require paths resolve incorrectly in the bundled output.
 */
export async function syncMCPSettingsToManager(settings: AgentSettings, logger: SyncLogger): Promise<void> {
  try {
    // Dynamic ESM import to avoid circular dependencies while staying
    // compatible with Vite's bundler (require('../mcp') breaks in Vite builds)
    const { getMCPServerManager } = await import('../mcp');

    const manager = getMCPServerManager();
    if (!manager) {
      logger.debug('MCPServerManager not initialized, skipping sync');
      return;
    }

    // Sync MCP global settings (timeouts, caching, retries, etc.)
    if (settings.mcpSettings) {
      manager.updateSettings(settings.mcpSettings);
      logger.debug('Synced MCP settings to live manager', {
        enabled: settings.mcpSettings.enabled,
        autoStartServers: settings.mcpSettings.autoStartServers,
      });
    }

    // Sync MCP server configs
    const settingsServers: MCPServerConfig[] = settings.mcpServers ?? [];
    const liveServers = manager.getAllServers();
    const liveServerIds = new Set(liveServers.map((s: MCPServerConfig) => s.id));
    const settingsServerIds = new Set(settingsServers.map((s: MCPServerConfig) => s.id));

    // Register new servers or update existing ones
    for (const serverConfig of settingsServers) {
      if (liveServerIds.has(serverConfig.id)) {
        // Update existing server config (handles enable/disable state changes)
        manager.updateServerConfig(serverConfig);
      } else {
        // Register new server
        manager.registerServer(serverConfig);
      }
    }

    // Unregister servers that were removed from settings
    for (const liveServer of liveServers) {
      if (!settingsServerIds.has(liveServer.id)) {
        manager.unregisterServer(liveServer.id);
        logger.info('Unregistered removed MCP server', { serverId: liveServer.id, name: liveServer.name });
      }
    }

    const addedCount = settingsServers.filter((s: MCPServerConfig) => !liveServerIds.has(s.id)).length;
    const removedCount = liveServers.filter((s: MCPServerConfig) => !settingsServerIds.has(s.id)).length;
    const updatedCount = settingsServers.filter((s: MCPServerConfig) => liveServerIds.has(s.id)).length;

    if (addedCount > 0 || removedCount > 0 || updatedCount > 0) {
      logger.info('MCP servers synced from settings', {
        added: addedCount,
        removed: removedCount,
        updated: updatedCount,
        total: settingsServers.length,
      });
    }
  } catch (error) {
    logger.warn('Failed to sync MCP settings to live manager', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
