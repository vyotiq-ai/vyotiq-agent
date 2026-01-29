/**
 * useMCP Hook
 * 
 * React hook for managing MCP (Model Context Protocol) state and operations.
 * Provides access to MCP settings, server states, and action handlers.
 * Enhanced with discovery, health monitoring, and context-aware suggestions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MCPSettings,
  MCPServerConfig,
  MCPServerState,
  MCPTool,
  MCPPrompt,
  MCPResource,
} from '../../shared/types/mcp';
import { createLogger } from '../utils/logger';

const logger = createLogger('useMCP');

// =============================================================================
// Types
// =============================================================================

/**
 * Discovered MCP server candidate
 */
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

/**
 * Server health status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Health metrics for a single server
 */
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

/**
 * Tool suggestion from context integration
 */
export interface ToolSuggestion {
  tool: MCPTool & { serverId: string; serverName: string };
  relevanceScore: number;
  reason: string;
}

/**
 * Resource suggestion from context integration
 */
export interface ResourceSuggestion {
  resource: MCPResource & { serverId: string; serverName: string };
  relevanceScore: number;
  reason: string;
}

/**
 * Prompt suggestion from context integration
 */
export interface PromptSuggestion {
  prompt: MCPPrompt & { serverId: string; serverName: string };
  relevanceScore: number;
  reason: string;
}

/**
 * Agent context for suggestions
 */
export interface AgentContext {
  currentMessage?: string;
  workspacePath?: string;
  activeFile?: string;
  recentFiles?: string[];
  recentTools?: string[];
  sessionHistory?: string[];
  projectType?: string;
  keywords?: string[];
}

interface UseMCPResult {
  /** Current MCP settings */
  settings: MCPSettings | null;
  /** Current server states */
  serverStates: MCPServerState[];
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** All tools from all connected servers */
  allTools: Array<MCPTool & { serverId: string; serverName: string }>;
  /** All resources from all connected servers */
  allResources: Array<MCPResource & { serverId: string; serverName: string }>;
  /** All prompts from all connected servers */
  allPrompts: Array<MCPPrompt & { serverId: string; serverName: string }>;
  /** Discovered server candidates */
  discoveredServers: MCPServerCandidate[];
  /** Discovery loading state */
  isDiscovering: boolean;
  /** Health metrics for all servers */
  healthMetrics: MCPServerHealthMetrics[];
  /** Refresh settings and server states */
  refresh: () => Promise<void>;
  /** Update a settings field */
  updateSetting: <K extends keyof MCPSettings>(field: K, value: MCPSettings[K]) => void;
  /** Add a new MCP server */
  addServer: (server: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  /** Update an existing server */
  updateServer: (id: string, updates: Partial<MCPServerConfig>) => Promise<void>;
  /** Remove a server */
  removeServer: (id: string) => Promise<void>;
  /** Connect to a server */
  connectServer: (id: string) => Promise<void>;
  /** Disconnect from a server */
  disconnectServer: (id: string) => Promise<void>;
  /** Call a tool on a server */
  callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Read a resource from a server */
  readResource: (serverId: string, uri: string) => Promise<unknown>;
  /** Get a prompt from a server */
  getPrompt: (serverId: string, name: string, args?: Record<string, unknown>) => Promise<unknown>;
  /** Discover available MCP servers */
  discoverServers: (options?: { workspacePaths?: string[]; includeUnverified?: boolean }) => Promise<void>;
  /** Add a discovered server to the configuration */
  addDiscoveredServer: (candidate: MCPServerCandidate) => Promise<void>;
  /** Clear discovery cache */
  clearDiscoveryCache: () => Promise<void>;
  /** Refresh health metrics */
  refreshHealthMetrics: () => Promise<void>;
  /** Trigger manual recovery for a server */
  triggerRecovery: (serverId: string) => Promise<void>;
  /** Get tool suggestions based on context */
  getToolSuggestions: (context: AgentContext, limit?: number) => Promise<ToolSuggestion[]>;
  /** Get resource suggestions based on context */
  getResourceSuggestions: (context: AgentContext, limit?: number) => Promise<ResourceSuggestion[]>;
  /** Get prompt suggestions based on context */
  getPromptSuggestions: (context: AgentContext, limit?: number) => Promise<PromptSuggestion[]>;
}

// Default MCP settings
const DEFAULT_MCP_SETTINGS: MCPSettings = {
  enabled: true,
  servers: [],
  defaultTimeout: 30000,
  autoReconnect: true,
  requireToolConfirmation: true,
  includeInAgentContext: true,
  maxConcurrentConnections: 10,
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for managing MCP state and operations
 */
export function useMCP(): UseMCPResult {
  const [settings, setSettings] = useState<MCPSettings | null>(null);
  const [serverStates, setServerStates] = useState<MCPServerState[]>([]);
  const [allTools, setAllTools] = useState<Array<MCPTool & { serverId: string; serverName: string }>>([]);
  const [allResources, setAllResources] = useState<Array<MCPResource & { serverId: string; serverName: string }>>([]);
  const [allPrompts, setAllPrompts] = useState<Array<MCPPrompt & { serverId: string; serverName: string }>>([]);
  const [discoveredServers, setDiscoveredServers] = useState<MCPServerCandidate[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<MCPServerHealthMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [settingsResult, statesResult, toolsResult, resourcesResult, promptsResult, healthResult] = await Promise.all([
        window.vyotiq?.mcp?.getSettings() as Promise<MCPSettings | null>,
        window.vyotiq?.mcp?.getServerStates() as Promise<MCPServerState[]>,
        window.vyotiq?.mcp?.getAllTools() as Promise<Array<MCPTool & { serverId: string; serverName: string }>>,
        window.vyotiq?.mcp?.getAllResources() as Promise<Array<MCPResource & { serverId: string; serverName: string }>>,
        window.vyotiq?.mcp?.getAllPrompts() as Promise<Array<MCPPrompt & { serverId: string; serverName: string }>>,
        window.vyotiq?.mcp?.getHealthMetrics() as Promise<{ success: boolean; metrics?: MCPServerHealthMetrics[] }>,
      ]);

      if (isMounted.current) {
        setSettings(settingsResult ?? DEFAULT_MCP_SETTINGS);
        setServerStates(statesResult ?? []);
        setAllTools(toolsResult ?? []);
        setAllResources(resourcesResult ?? []);
        setAllPrompts(promptsResult ?? []);
        if (healthResult?.success) {
          setHealthMetrics(healthResult.metrics ?? []);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch MCP data', err);
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : 'Failed to load MCP data');
        setSettings(DEFAULT_MCP_SETTINGS);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
    return () => {
      isMounted.current = false;
    };
  }, [fetchData]);

  // Listen for MCP events from main process
  useEffect(() => {
    const handleMCPEvent = (data: { type: string; [key: string]: unknown }) => {
      if (!isMounted.current) return;

      switch (data.type) {
        case 'mcp-state':
          setServerStates(data.servers as MCPServerState[]);
          break;
        case 'mcp-server-connected':
          logger.debug('Server connected', { serverId: data.serverId });
          // Refresh tools/resources/prompts when server connects
          fetchData();
          break;
        case 'mcp-server-disconnected':
          logger.debug('Server disconnected', { serverId: data.serverId });
          fetchData();
          break;
        case 'mcp-server-error':
          logger.error('Server error', { serverId: data.serverId, error: data.error });
          break;
        case 'mcp-tools-changed':
          // Refresh tools list
          window.vyotiq?.mcp?.getAllTools().then((tools: unknown) => {
            if (isMounted.current) {
              setAllTools((tools ?? []) as Array<MCPTool & { serverId: string; serverName: string }>);
            }
          });
          break;
        case 'mcp-health-changed':
        case 'mcp-server-degraded':
        case 'mcp-server-unhealthy':
        case 'mcp-server-recovered':
          // Update health metrics for the affected server
          if (data.metrics) {
            setHealthMetrics(prev => {
              const metrics = data.metrics as MCPServerHealthMetrics;
              const existing = prev.findIndex(m => m.serverId === metrics.serverId);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = metrics;
                return updated;
              }
              return [...prev, metrics];
            });
          }
          break;
        case 'mcp-recovery-attempt':
          logger.info('Recovery attempt', { serverId: data.serverId, attempt: data.attempt, maxAttempts: data.maxAttempts });
          break;
        case 'mcp-recovery-failed':
          logger.error('Recovery failed', { serverId: data.serverId, reason: data.reason });
          break;
      }
    };

    const unsubscribe = window.vyotiq?.mcp?.onEvent(handleMCPEvent);
    return () => {
      unsubscribe?.();
    };
  }, [fetchData]);

  // Update setting
  const updateSetting = useCallback(<K extends keyof MCPSettings>(field: K, value: MCPSettings[K]) => {
    setSettings(prev => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });

    // Persist to main process
    window.vyotiq?.mcp?.updateSettings({ [field]: value }).catch((err: unknown) => {
      logger.error('Failed to update MCP setting', { field, error: err });
    });
  }, []);

  // Add server
  const addServer = useCallback(async (server: Omit<MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
    const result = await window.vyotiq?.mcp?.addServer(server) as { success: boolean; server?: MCPServerConfig; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to add server');
    }
    await fetchData();
  }, [fetchData]);

  // Update server
  const updateServer = useCallback(async (id: string, updates: Partial<MCPServerConfig>) => {
    const result = await window.vyotiq?.mcp?.updateServer({ id, updates }) as { success: boolean; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to update server');
    }
    await fetchData();
  }, [fetchData]);

  // Remove server
  const removeServer = useCallback(async (id: string) => {
    const result = await window.vyotiq?.mcp?.removeServer(id) as { success: boolean; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to remove server');
    }
    await fetchData();
  }, [fetchData]);

  // Connect server
  const connectServer = useCallback(async (id: string) => {
    const result = await window.vyotiq?.mcp?.connectServer(id) as { success: boolean; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to connect to server');
    }
  }, []);

  // Disconnect server
  const disconnectServer = useCallback(async (id: string) => {
    const result = await window.vyotiq?.mcp?.disconnectServer(id) as { success: boolean; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to disconnect from server');
    }
  }, []);

  // Call tool
  const callTool = useCallback(async (serverId: string, toolName: string, args: Record<string, unknown>) => {
    const result = await window.vyotiq?.mcp?.callTool(serverId, toolName, args) as { success: boolean; result?: unknown; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to call tool');
    }
    return result.result;
  }, []);

  // Read resource
  const readResource = useCallback(async (serverId: string, uri: string) => {
    const result = await window.vyotiq?.mcp?.readResource(serverId, uri) as { success: boolean; contents?: unknown; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to read resource');
    }
    return result.contents;
  }, []);

  // Get prompt
  const getPrompt = useCallback(async (serverId: string, name: string, args?: Record<string, unknown>) => {
    const result = await window.vyotiq?.mcp?.getPrompt(serverId, name, args) as { success: boolean; result?: unknown; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to get prompt');
    }
    return result.result;
  }, []);

  // Discover servers
  const discoverServers = useCallback(async (options?: { workspacePaths?: string[]; includeUnverified?: boolean }) => {
    try {
      setIsDiscovering(true);
      const result = await window.vyotiq?.mcp?.discoverServers(options) as { success: boolean; candidates?: MCPServerCandidate[]; error?: string };
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to discover servers');
      }
      if (isMounted.current) {
        setDiscoveredServers(result.candidates ?? []);
      }
    } catch (err) {
      logger.error('Failed to discover servers', err);
      throw err;
    } finally {
      if (isMounted.current) {
        setIsDiscovering(false);
      }
    }
  }, []);

  // Add discovered server
  const addDiscoveredServer = useCallback(async (candidate: MCPServerCandidate) => {
    const result = await window.vyotiq?.mcp?.addDiscoveredServer(candidate) as { success: boolean; server?: MCPServerConfig; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to add discovered server');
    }
    // Remove from discovered list
    setDiscoveredServers(prev => prev.filter(c => c.name !== candidate.name));
    await fetchData();
  }, [fetchData]);

  // Clear discovery cache
  const clearDiscoveryCache = useCallback(async () => {
    const result = await window.vyotiq?.mcp?.clearDiscoveryCache() as { success: boolean; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to clear discovery cache');
    }
    setDiscoveredServers([]);
  }, []);

  // Refresh health metrics
  const refreshHealthMetrics = useCallback(async () => {
    const result = await window.vyotiq?.mcp?.getHealthMetrics() as { success: boolean; metrics?: MCPServerHealthMetrics[]; error?: string };
    if (result?.success && isMounted.current) {
      setHealthMetrics(result.metrics ?? []);
    }
  }, []);

  // Trigger recovery
  const triggerRecovery = useCallback(async (serverId: string) => {
    const result = await window.vyotiq?.mcp?.triggerRecovery(serverId) as { success: boolean; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to trigger recovery');
    }
  }, []);

  // Get tool suggestions
  const getToolSuggestions = useCallback(async (context: AgentContext, limit?: number): Promise<ToolSuggestion[]> => {
    const result = await window.vyotiq?.mcp?.getToolSuggestions(context, limit) as { success: boolean; suggestions?: ToolSuggestion[]; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to get tool suggestions');
    }
    return result.suggestions ?? [];
  }, []);

  // Get resource suggestions
  const getResourceSuggestions = useCallback(async (context: AgentContext, limit?: number): Promise<ResourceSuggestion[]> => {
    const result = await window.vyotiq?.mcp?.getResourceSuggestions(context, limit) as { success: boolean; suggestions?: ResourceSuggestion[]; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to get resource suggestions');
    }
    return result.suggestions ?? [];
  }, []);

  // Get prompt suggestions
  const getPromptSuggestions = useCallback(async (context: AgentContext, limit?: number): Promise<PromptSuggestion[]> => {
    const result = await window.vyotiq?.mcp?.getPromptSuggestions(context, limit) as { success: boolean; suggestions?: PromptSuggestion[]; error?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Failed to get prompt suggestions');
    }
    return result.suggestions ?? [];
  }, []);

  return {
    settings,
    serverStates,
    isLoading,
    error,
    allTools,
    allResources,
    allPrompts,
    discoveredServers,
    isDiscovering,
    healthMetrics,
    refresh: fetchData,
    updateSetting,
    addServer,
    updateServer,
    removeServer,
    connectServer,
    disconnectServer,
    callTool,
    readResource,
    getPrompt,
    discoverServers,
    addDiscoveredServer,
    clearDiscoveryCache,
    refreshHealthMetrics,
    triggerRecovery,
    getToolSuggestions,
    getResourceSuggestions,
    getPromptSuggestions,
  };
}

export default useMCP;
