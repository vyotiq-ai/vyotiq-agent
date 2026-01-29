/**
 * MCP (Model Context Protocol) Module
 * 
 * Central export point for MCP server integration system.
 * Provides dynamic MCP server management, tool integration, and context awareness.
 * 
 * @see https://modelcontextprotocol.io/specification/2025-06-18
 */

// Core manager
export { MCPManager, getMCPManager, initMCPManager, shutdownMCPManager } from './MCPManager';

// Server connection handling
export { MCPServerConnection } from './MCPServerConnection';

// Transport implementations
export { MCPStdioTransport } from './transports/MCPStdioTransport';
export { MCPHttpTransport } from './transports/MCPHttpTransport';
export type { MCPTransport } from './transports/types';

// Tool integration
export { MCPToolAdapter, getMCPToolAdapter } from './MCPToolAdapter';

// Tool registry sync
export { 
  initMCPToolSync, 
  resyncAllMCPTools, 
  cleanupMCPToolSync 
} from './MCPToolSync';

// Context integration
export { MCPContextProvider, getMCPContextProvider } from './MCPContextProvider';

// Server discovery
export { 
  MCPServerDiscovery, 
  getMCPServerDiscovery,
  type MCPServerCandidate,
  type MCPDiscoverySource,
  type DiscoveryOptions,
} from './discovery';

// Health monitoring
export {
  MCPHealthMonitor,
  getMCPHealthMonitor,
  initMCPHealthMonitor,
  shutdownMCPHealthMonitor,
  type MCPServerHealthMetrics,
  type HealthMonitorConfig,
  type HealthStatus,
} from './health';

// Context integration (deep)
export {
  MCPContextIntegration,
  getMCPContextIntegration,
  type MCPToolSuggestion,
  type MCPResourceSuggestion,
  type ContextQuery,
  type EnrichedContext,
} from './context';

// Utility functions
export { 
  validateServerConfig,
  generateServerId,
  parseServerCommand,
  formatMCPError,
} from './utils';

// Re-export types
export type {
  MCPServerConfig,
  MCPServerState,
  MCPSettings,
  MCPTool,
  MCPPrompt,
  MCPResource,
  MCPResourceTemplate,
  MCPServerCapabilities,
  MCPConnectionStatus,
  MCPTransportType,
  MCPTransportConfig,
  MCPStdioConfig,
  MCPHttpConfig,
} from '../../../shared/types/mcp';
