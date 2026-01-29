/**
 * MCP IPC Handlers
 * 
 * IPC handlers for MCP server management and operations.
 * Provides the bridge between renderer and main process for MCP functionality.
 */

import { ipcMain } from 'electron';
import type { IpcContext } from './types';
import type {
  MCPServerConfig,
  MCPServerState,
  MCPSettings,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPToolResult,
  MCPResourceContent,
  MCPPromptResult,
  MCPAddServerRequest,
  MCPUpdateServerRequest,
} from '../../shared/types/mcp';
import { 
  getMCPManager, 
  initMCPManager, 
  shutdownMCPManager, 
  MCPManager,
  getMCPServerDiscovery,
  getMCPHealthMonitor,
  initMCPHealthMonitor,
  shutdownMCPHealthMonitor,
  getMCPContextIntegration,
} from '../agent/mcp';
import type { MCPServerCandidate, DiscoveryOptions } from '../agent/mcp/discovery/MCPServerDiscovery';
import type { MCPServerHealthMetrics, HealthMonitorConfig } from '../agent/mcp/health/MCPHealthMonitor';
import type { 
  ToolSuggestion, 
  ResourceSuggestion, 
  PromptSuggestion, 
  AgentContext 
} from '../agent/mcp/context/MCPContextIntegration';
import { createLogger } from '../logger';

const logger = createLogger('MCPHandlers');

/**
 * Register MCP IPC handlers
 */
export function registerMCPHandlers(context: IpcContext): void {
  const { getSettingsStore, getMainWindow } = context;

  // Helper to emit MCP events to renderer
  const emitMCPEvent = (event: Record<string, unknown>) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mcp:event', event);
    }
  };

  // =========================================================================
  // Settings
  // =========================================================================

  ipcMain.handle('mcp:get-settings', async (): Promise<MCPSettings | null> => {
    try {
      const manager = getMCPManager();
      return manager?.getSettings() ?? null;
    } catch (error) {
      logger.error('Failed to get MCP settings', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('mcp:update-settings', async (_event, updates: Partial<MCPSettings>): Promise<{ success: boolean; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      await manager.updateSettings(updates);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update MCP settings', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // =========================================================================
  // Server Management
  // =========================================================================

  ipcMain.handle('mcp:get-servers', async (): Promise<MCPServerConfig[]> => {
    try {
      const manager = getMCPManager();
      return manager?.getServers() ?? [];
    } catch (error) {
      logger.error('Failed to get MCP servers', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('mcp:get-server-states', async (): Promise<MCPServerState[]> => {
    try {
      const manager = getMCPManager();
      return manager?.getServerStates() ?? [];
    } catch (error) {
      logger.error('Failed to get server states', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('mcp:add-server', async (_event, request: MCPAddServerRequest): Promise<{ success: boolean; server?: MCPServerConfig; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      const server = await manager.addServer(request);
      
      // Emit state change to renderer
      emitMCPEvent({ type: 'mcp-state', servers: manager.getServerStates() });
      
      return { success: true, server };
    } catch (error) {
      logger.error('Failed to add MCP server', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:update-server', async (_event, request: MCPUpdateServerRequest): Promise<{ success: boolean; server?: MCPServerConfig; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      const server = await manager.updateServer(request);
      if (!server) {
        return { success: false, error: 'Server not found' };
      }

      // Emit state change to renderer
      emitMCPEvent({ type: 'mcp-state', servers: manager.getServerStates() });

      return { success: true, server };
    } catch (error) {
      logger.error('Failed to update MCP server', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:remove-server', async (_event, serverId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      const removed = await manager.removeServer(serverId);
      if (!removed) {
        return { success: false, error: 'Server not found' };
      }

      // Emit state change to renderer
      emitMCPEvent({ type: 'mcp-state', servers: manager.getServerStates() });

      return { success: true };
    } catch (error) {
      logger.error('Failed to remove MCP server', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // =========================================================================
  // Connection Management
  // =========================================================================

  ipcMain.handle('mcp:connect-server', async (_event, serverId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      await manager.connectServer(serverId);

      // Emit state change to renderer
      emitMCPEvent({ type: 'mcp-state', servers: manager.getServerStates() });

      return { success: true };
    } catch (error) {
      logger.error('Failed to connect MCP server', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:disconnect-server', async (_event, serverId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      await manager.disconnectServer(serverId);

      // Emit state change to renderer
      emitMCPEvent({ type: 'mcp-state', servers: manager.getServerStates() });

      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect MCP server', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // =========================================================================
  // Tools
  // =========================================================================

  ipcMain.handle('mcp:get-all-tools', async (): Promise<Array<MCPTool & { serverId: string; serverName: string }>> => {
    try {
      const manager = getMCPManager();
      return manager?.getAllTools() ?? [];
    } catch (error) {
      logger.error('Failed to get MCP tools', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('mcp:call-tool', async (_event, serverId: string, toolName: string, args: Record<string, unknown>): Promise<{ success: boolean; result?: MCPToolResult; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      const result = await manager.callTool(serverId, toolName, args);
      return { success: !result.isError, result };
    } catch (error) {
      logger.error('Failed to call MCP tool', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // =========================================================================
  // Resources
  // =========================================================================

  ipcMain.handle('mcp:get-all-resources', async (): Promise<Array<MCPResource & { serverId: string; serverName: string }>> => {
    try {
      const manager = getMCPManager();
      return manager?.getAllResources() ?? [];
    } catch (error) {
      logger.error('Failed to get MCP resources', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('mcp:read-resource', async (_event, serverId: string, uri: string): Promise<{ success: boolean; contents?: MCPResourceContent[]; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      const contents = await manager.readResource(serverId, uri);
      return { success: true, contents };
    } catch (error) {
      logger.error('Failed to read MCP resource', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // =========================================================================
  // Prompts
  // =========================================================================

  ipcMain.handle('mcp:get-all-prompts', async (): Promise<Array<MCPPrompt & { serverId: string; serverName: string }>> => {
    try {
      const manager = getMCPManager();
      return manager?.getAllPrompts() ?? [];
    } catch (error) {
      logger.error('Failed to get MCP prompts', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('mcp:get-prompt', async (_event, serverId: string, name: string, args?: Record<string, unknown>): Promise<{ success: boolean; result?: MCPPromptResult; error?: string }> => {
    try {
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }

      const result = await manager.getPrompt(serverId, name, args);
      return { success: true, result };
    } catch (error) {
      logger.error('Failed to get MCP prompt', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // =========================================================================
  // Setup Manager Event Forwarding
  // =========================================================================

  // Initialize MCP manager when settings store is available
  const settingsStore = getSettingsStore();
  initMCPManager(settingsStore).then((manager: MCPManager) => {
    // Forward manager events to renderer
    manager.on('stateChanged', (states: MCPServerState[]) => {
      emitMCPEvent({ type: 'mcp-state', servers: states });
    });

    manager.on('serverConnected', (serverId: string) => {
      const state = manager.getServerState(serverId);
      if (state?.serverInfo && state?.capabilities) {
        emitMCPEvent({
          type: 'mcp-server-connected',
          serverId,
          serverInfo: state.serverInfo,
          capabilities: state.capabilities,
        });
      }
    });

    manager.on('serverDisconnected', (serverId: string, reason?: string) => {
      emitMCPEvent({
        type: 'mcp-server-disconnected',
        serverId,
        reason,
      });
    });

    manager.on('serverError', (serverId: string, error: Error) => {
      emitMCPEvent({
        type: 'mcp-server-error',
        serverId,
        error: error.message,
      });
    });

    manager.on('toolsChanged', (serverId: string, tools: MCPTool[]) => {
      emitMCPEvent({
        type: 'mcp-tools-changed',
        serverId,
        tools,
      });
    });

    logger.info('MCP handlers registered and manager initialized');
  }).catch((error: unknown) => {
    logger.error('Failed to initialize MCP manager', { error: error instanceof Error ? error.message : String(error) });
  });

  // =========================================================================
  // Discovery Handlers
  // =========================================================================

  ipcMain.handle('mcp:discover-servers', async (_event, options?: DiscoveryOptions): Promise<{ success: boolean; candidates?: MCPServerCandidate[]; error?: string }> => {
    try {
      const discovery = getMCPServerDiscovery();
      const candidates = await discovery.discover(options);
      return { success: true, candidates };
    } catch (error) {
      logger.error('Failed to discover MCP servers', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:get-discovery-cache', async (): Promise<{ success: boolean; candidates?: MCPServerCandidate[]; error?: string }> => {
    try {
      const discovery = getMCPServerDiscovery();
      const candidates = discovery.getCachedCandidates();
      return { success: true, candidates };
    } catch (error) {
      logger.error('Failed to get discovery cache', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:clear-discovery-cache', async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const discovery = getMCPServerDiscovery();
      discovery.clearCache();
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear discovery cache', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:add-discovered-server', async (_event, candidate: MCPServerCandidate): Promise<{ success: boolean; server?: MCPServerConfig; error?: string }> => {
    try {
      const discovery = getMCPServerDiscovery();
      const config = discovery.candidateToConfig(candidate);
      
      const manager = getMCPManager();
      if (!manager) {
        return { success: false, error: 'MCP Manager not initialized' };
      }
      
      const server = await manager.addServer({
        name: config.name,
        transport: config.transport,
        enabled: config.enabled,
        autoConnect: config.autoConnect,
        env: config.env,
      });
      
      emitMCPEvent({ type: 'mcp-state', servers: manager.getServerStates() });
      
      return { success: true, server };
    } catch (error) {
      logger.error('Failed to add discovered server', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // =========================================================================
  // Health Monitoring Handlers
  // =========================================================================

  ipcMain.handle('mcp:get-health-metrics', async (): Promise<{ success: boolean; metrics?: MCPServerHealthMetrics[]; error?: string }> => {
    try {
      const monitor = getMCPHealthMonitor();
      if (!monitor) {
        return { success: true, metrics: [] };
      }
      const metrics = monitor.getAllHealthMetrics();
      return { success: true, metrics };
    } catch (error) {
      logger.error('Failed to get health metrics', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:get-server-health', async (_event, serverId: string): Promise<{ success: boolean; metrics?: MCPServerHealthMetrics; error?: string }> => {
    try {
      const monitor = getMCPHealthMonitor();
      if (!monitor) {
        return { success: false, error: 'Health monitor not initialized' };
      }
      const metrics = monitor.getServerHealth(serverId);
      if (!metrics) {
        return { success: false, error: 'Server not found' };
      }
      return { success: true, metrics };
    } catch (error) {
      logger.error('Failed to get server health', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:update-health-config', async (_event, config: Partial<HealthMonitorConfig>): Promise<{ success: boolean; error?: string }> => {
    try {
      const monitor = getMCPHealthMonitor();
      if (!monitor) {
        return { success: false, error: 'Health monitor not initialized' };
      }
      monitor.updateConfig(config);
      return { success: true };
    } catch (error) {
      logger.error('Failed to update health config', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:trigger-recovery', async (_event, serverId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const monitor = getMCPHealthMonitor();
      if (!monitor) {
        return { success: false, error: 'Health monitor not initialized' };
      }
      await monitor.triggerRecovery(serverId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to trigger recovery', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // =========================================================================
  // Context Integration Handlers
  // =========================================================================

  ipcMain.handle('mcp:get-tool-suggestions', async (_event, context: AgentContext, limit?: number): Promise<{ success: boolean; suggestions?: ToolSuggestion[]; error?: string }> => {
    try {
      const integration = getMCPContextIntegration();
      if (!integration) {
        return { success: true, suggestions: [] };
      }
      const suggestions = await integration.getToolSuggestions(context, limit);
      return { success: true, suggestions };
    } catch (error) {
      logger.error('Failed to get tool suggestions', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:get-resource-suggestions', async (_event, context: AgentContext, limit?: number): Promise<{ success: boolean; suggestions?: ResourceSuggestion[]; error?: string }> => {
    try {
      const integration = getMCPContextIntegration();
      if (!integration) {
        return { success: true, suggestions: [] };
      }
      const suggestions = await integration.getResourceSuggestions(context, limit);
      return { success: true, suggestions };
    } catch (error) {
      logger.error('Failed to get resource suggestions', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:get-prompt-suggestions', async (_event, context: AgentContext, limit?: number): Promise<{ success: boolean; suggestions?: PromptSuggestion[]; error?: string }> => {
    try {
      const integration = getMCPContextIntegration();
      if (!integration) {
        return { success: true, suggestions: [] };
      }
      const suggestions = await integration.getPromptSuggestions(context, limit);
      return { success: true, suggestions };
    } catch (error) {
      logger.error('Failed to get prompt suggestions', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('mcp:enrich-context', async (_event, context: AgentContext): Promise<{ success: boolean; enrichedContext?: AgentContext; error?: string }> => {
    try {
      const integration = getMCPContextIntegration();
      if (!integration) {
        return { success: true, enrichedContext: context };
      }
      const enrichedContext = await integration.enrichContext(context);
      return { success: true, enrichedContext };
    } catch (error) {
      logger.error('Failed to enrich context', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Initialize health monitor after MCP manager
  initMCPHealthMonitor().then((monitor) => {
    // Forward health events to renderer
    monitor.on('healthChanged', (serverId: string, metrics: MCPServerHealthMetrics) => {
      emitMCPEvent({
        type: 'mcp-health-changed',
        serverId,
        metrics,
      });
    });

    monitor.on('serverDegraded', (serverId: string, metrics: MCPServerHealthMetrics) => {
      emitMCPEvent({
        type: 'mcp-server-degraded',
        serverId,
        metrics,
      });
    });

    monitor.on('serverUnhealthy', (serverId: string, metrics: MCPServerHealthMetrics) => {
      emitMCPEvent({
        type: 'mcp-server-unhealthy',
        serverId,
        metrics,
      });
    });

    monitor.on('serverRecovered', (serverId: string, metrics: MCPServerHealthMetrics) => {
      emitMCPEvent({
        type: 'mcp-server-recovered',
        serverId,
        metrics,
      });
    });

    monitor.on('recoveryAttempt', (serverId: string, attempt: number, maxAttempts: number) => {
      emitMCPEvent({
        type: 'mcp-recovery-attempt',
        serverId,
        attempt,
        maxAttempts,
      });
    });

    monitor.on('recoveryFailed', (serverId: string, reason: string) => {
      emitMCPEvent({
        type: 'mcp-recovery-failed',
        serverId,
        reason,
      });
    });

    logger.info('MCP health monitor initialized and event forwarding enabled');
  }).catch((error: unknown) => {
    logger.error('Failed to initialize health monitor', { error: error instanceof Error ? error.message : String(error) });
  });
}

/**
 * Cleanup MCP handlers
 */
export async function cleanupMCPHandlers(): Promise<void> {
  await shutdownMCPHealthMonitor();
  await shutdownMCPManager();
}
