/**
 * MCP (Model Context Protocol) Module
 *
 * Central entry point for MCP server management system.
 * Provides server lifecycle management, tool discovery, and store functionality.
 *
 * @module main/mcp
 */

export { MCPClient } from './MCPClient';
export {
  MCPServerManager,
  getMCPServerManager,
  initializeMCPServerManager,
  shutdownMCPServerManager,
} from './MCPServerManager';
export { MCPStore, getMCPStore, shutdownMCPStore } from './MCPStore';
export {
  MCPToolRegistryAdapter,
  getMCPToolRegistryAdapter,
  initializeMCPToolRegistryAdapter,
  mcpToolToToolDefinition,
  getAllMCPToolDefinitions,
  getServerMCPToolDefinitions,
  findMCPToolDefinition,
  isMCPTool,
  getMCPToolMetadata,
} from './MCPToolAdapter';
export {
  buildMCPContextInfo,
  getMCPStatusSummary,
  hasMCPServersConnected,
} from './MCPContextProvider';

// Dynamic Registry exports
export {
  MCPDynamicRegistry,
  getMCPDynamicRegistry,
  initializeMCPDynamicRegistry,
  shutdownMCPDynamicRegistry,
  getMCPRegistryCache,
  initializeMCPRegistryCache,
  shutdownMCPRegistryCache,
} from './registry';

export type {
  MCPRegistrySource,
  MCPRegistryListing,
  MCPRegistryConfig,
  MCPRegistryFetchOptions,
  MCPRegistryFetchResult,
} from './registry';

// Re-export types for convenience
export type {
  MCPTransportType,
  MCPServerStatus,
  MCPServerSource,
  MCPServerCategory,
  MCPToolDefinition,
  MCPResourceDefinition,
  MCPPromptDefinition,
  MCPServerCapabilities,
  MCPStdioConfig,
  MCPSSEConfig,
  MCPStreamableHTTPConfig,
  MCPTransportConfig,
  MCPServerConfig,
  MCPServerState,
  MCPStoreListing,
  MCPStoreFilters,
  MCPStoreSearchResult,
  MCPSettings,
  MCPEventType,
  MCPEvent,
  MCPToolCallRequest,
  MCPToolCallResult,
  MCPInstallRequest,
  MCPInstallResult,
  MCPServerSummary,
  MCPToolWithContext,
} from '../../shared/types/mcp';

export { DEFAULT_MCP_SETTINGS } from '../../shared/types/mcp';
