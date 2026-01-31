/**
 * MCP Hooks
 *
 * React hooks for MCP (Model Context Protocol) server management.
 * Provides state management, event subscriptions, and API integration.
 *
 * @module renderer/hooks/useMCP
 */

import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '../utils/logger';
import type {
  MCPServerSummary,
  MCPSettings,
  MCPStoreListing,
  MCPStoreFilters,
  MCPToolWithContext,
  MCPInstallResult,
  MCPToolCallResult,
} from '../../shared/types/mcp';

// Re-export types that may be needed by consumers
export type { MCPServerSummary, MCPSettings, MCPStoreListing, MCPStoreFilters, MCPToolWithContext };

const logger = createLogger('useMCP');

// =============================================================================
// useMCPSettings Hook
// =============================================================================

export interface UseMCPSettingsResult {
  settings: MCPSettings | null;
  loading: boolean;
  error: string | null;
  updateSettings: (updates: Partial<MCPSettings>) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing MCP settings
 */
export function useMCPSettings(): UseMCPSettingsResult {
  const [settings, setSettings] = useState<MCPSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await window.vyotiq.mcp.getSettings();
      setSettings(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      logger.error('Failed to load MCP settings', { error: message });
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (updates: Partial<MCPSettings>) => {
    try {
      setError(null);
      const result = await window.vyotiq.mcp.updateSettings(updates);
      setSettings(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      logger.error('Failed to update MCP settings', { error: message });
      throw err;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { settings, loading, error, updateSettings, refresh };
}

// =============================================================================
// useMCPServers Hook
// =============================================================================

export interface UseMCPServersResult {
  servers: MCPServerSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  connectServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
  disconnectServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
  restartServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
  enableServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
  disableServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
  uninstallServer: (serverId: string) => Promise<{ success: boolean; error?: string }>;
  connectAll: () => Promise<{ success: boolean; error?: string }>;
  disconnectAll: () => Promise<{ success: boolean; error?: string }>;
}

/**
 * Hook for managing MCP servers
 */
export function useMCPServers(): UseMCPServersResult {
  const [servers, setServers] = useState<MCPServerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await window.vyotiq.mcp.getServerSummaries();
      setServers(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      logger.error('Failed to load MCP servers', { error: message });
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to status changes
  useEffect(() => {
    const unsubscribe = window.vyotiq.mcp.onServerStatusChanged(() => {
      // Refresh servers when status changes
      refresh();
    });
    return unsubscribe;
  }, [refresh]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  const connectServer = useCallback(async (serverId: string) => {
    const result = await window.vyotiq.mcp.connectServer(serverId);
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const disconnectServer = useCallback(async (serverId: string) => {
    const result = await window.vyotiq.mcp.disconnectServer(serverId);
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const restartServer = useCallback(async (serverId: string) => {
    const result = await window.vyotiq.mcp.restartServer(serverId);
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const enableServer = useCallback(async (serverId: string) => {
    const result = await window.vyotiq.mcp.enableServer(serverId);
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const disableServer = useCallback(async (serverId: string) => {
    const result = await window.vyotiq.mcp.disableServer(serverId);
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const uninstallServer = useCallback(async (serverId: string) => {
    const result = await window.vyotiq.mcp.uninstallServer(serverId);
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const connectAll = useCallback(async () => {
    const result = await window.vyotiq.mcp.connectAll();
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  const disconnectAll = useCallback(async () => {
    const result = await window.vyotiq.mcp.disconnectAll();
    if (result.success) await refresh();
    return result;
  }, [refresh]);

  return {
    servers,
    loading,
    error,
    refresh,
    connectServer,
    disconnectServer,
    restartServer,
    enableServer,
    disableServer,
    uninstallServer,
    connectAll,
    disconnectAll,
  };
}

// =============================================================================
// useMCPTools Hook
// =============================================================================

export interface UseMCPToolsResult {
  tools: MCPToolWithContext[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  callTool: (
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<MCPToolCallResult>;
}

/**
 * Hook for accessing MCP tools
 */
export function useMCPTools(): UseMCPToolsResult {
  const [tools, setTools] = useState<MCPToolWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await window.vyotiq.mcp.getAllTools();
      setTools(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      logger.error('Failed to load MCP tools', { error: message });
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to tools changes
  useEffect(() => {
    const unsubscribe = window.vyotiq.mcp.onToolsUpdated((event) => {
      setTools(event.tools);
    });
    return unsubscribe;
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  const callTool = useCallback(
    async (serverId: string, toolName: string, args: Record<string, unknown>) => {
      return window.vyotiq.mcp.callTool({
        serverId,
        toolName,
        arguments: args,
      });
    },
    []
  );

  return { tools, loading, error, refresh, callTool };
}

// =============================================================================
// useMCPStore Hook
// =============================================================================

export interface UseMCPStoreResult {
  listings: MCPStoreListing[];
  featured: MCPStoreListing[];
  categories: { category: string; count: number }[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  filters: MCPStoreFilters;
  setFilters: (filters: MCPStoreFilters) => void;
  search: () => Promise<void>;
  loadAll: () => Promise<void>;
  loadMore: () => Promise<void>;
  refreshFeatured: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshRegistry: () => Promise<void>;
  getDetails: (id: string) => Promise<MCPStoreListing | null>;
  isInstalled: (listingId: string) => Promise<boolean>;
  installFromStore: (
    listingId: string,
    options?: { env?: Record<string, string>; autoStart?: boolean }
  ) => Promise<MCPInstallResult>;
  registryStats: {
    sources: Record<string, { count: number; age: number; fresh: boolean }>;
    total: number;
    lastFullRefresh: number;
  } | null;
  enabledSources: string[];
  setSourceEnabled: (source: string, enabled: boolean) => Promise<void>;
}

/** Default limit for loading all servers */
const ALL_SERVERS_LIMIT = 200;

/**
 * Hook for browsing the MCP store
 */
export function useMCPStore(): UseMCPStoreResult {
  const [listings, setListings] = useState<MCPStoreListing[]>([]);
  const [featured, setFeatured] = useState<MCPStoreListing[]>([]);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MCPStoreFilters>({ limit: 50, offset: 0 });
  const [registryStats, setRegistryStats] = useState<{
    sources: Record<string, { count: number; age: number; fresh: boolean }>;
    total: number;
    lastFullRefresh: number;
  } | null>(null);
  const [enabledSources, setEnabledSources] = useState<string[]>([]);

  const search = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await window.vyotiq.mcp.storeSearch({ ...filters, offset: 0 });
      setListings(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setFilters((prev) => ({ ...prev, offset: 0 }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      logger.error('Failed to search MCP store', { error: message });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Load all servers with high limit and no query filter
      const result = await window.vyotiq.mcp.storeSearch({
        limit: ALL_SERVERS_LIMIT,
        offset: 0,
        query: undefined,
        category: undefined,
      });
      setListings(result.items);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setFilters({ limit: ALL_SERVERS_LIMIT, offset: 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      logger.error('Failed to load all MCP servers', { error: message });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;

    try {
      setLoading(true);
      const newOffset = (filters.offset || 0) + (filters.limit || 50);
      const result = await window.vyotiq.mcp.storeSearch({ ...filters, offset: newOffset });
      setListings((prev) => [...prev, ...result.items]);
      setHasMore(result.hasMore);
      setFilters((prev) => ({ ...prev, offset: newOffset }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters, hasMore, loading]);

  const refreshFeatured = useCallback(async () => {
    try {
      const result = await window.vyotiq.mcp.storeGetFeatured();
      setFeatured(result);
    } catch (err) {
      logger.error('Failed to load featured servers', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const refreshCategories = useCallback(async () => {
    try {
      const result = await window.vyotiq.mcp.storeGetCategories();
      setCategories(result);
    } catch (err) {
      logger.error('Failed to load categories', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const refreshRegistry = useCallback(async () => {
    try {
      setLoading(true);
      await window.vyotiq.mcp.storeRefresh();
      // Refresh everything after registry refresh
      await Promise.all([refreshFeatured(), refreshCategories()]);
      // Get updated stats
      const stats = await window.vyotiq.mcp.registryGetStats();
      setRegistryStats(stats);
      // Update total from registry stats
      if (stats?.total) {
        setTotal(stats.total);
      }
      const sources = await window.vyotiq.mcp.registryGetSources();
      setEnabledSources(sources);
    } catch (err) {
      logger.error('Failed to refresh registry', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [refreshFeatured, refreshCategories]);

  const getDetails = useCallback(async (id: string) => {
    return window.vyotiq.mcp.storeGetDetails(id);
  }, []);

  const isInstalled = useCallback(async (listingId: string) => {
    return window.vyotiq.mcp.storeIsInstalled(listingId);
  }, []);

  const installFromStore = useCallback(
    async (
      listingId: string,
      options?: { env?: Record<string, string>; autoStart?: boolean }
    ) => {
      return window.vyotiq.mcp.installFromStore(listingId, options);
    },
    []
  );

  const setSourceEnabled = useCallback(async (source: string, enabled: boolean) => {
    try {
      await window.vyotiq.mcp.registrySetSourceEnabled(
        source as 'smithery' | 'npm' | 'pypi' | 'github' | 'glama',
        enabled
      );
      const sources = await window.vyotiq.mcp.registryGetSources();
      setEnabledSources(sources);
    } catch (err) {
      logger.error('Failed to set source enabled', {
        source,
        enabled,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Load featured, categories, and registry stats on mount
  useEffect(() => {
    const loadData = async () => {
      // Load featured
      const featuredResult = await window.vyotiq.mcp.storeGetFeatured();
      setFeatured(featuredResult);

      // If featured is empty, trigger a refresh
      if (featuredResult.length === 0) {
        logger.info('Featured empty, triggering registry refresh');
        try {
          await window.vyotiq.mcp.storeRefresh();
          const refreshedFeatured = await window.vyotiq.mcp.storeGetFeatured();
          setFeatured(refreshedFeatured);
        } catch (err) {
          logger.warn('Failed to refresh registry on mount', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Load categories
      try {
        const categoriesResult = await window.vyotiq.mcp.storeGetCategories();
        setCategories(categoriesResult);
      } catch {
        // ignore
      }

      // Load registry stats and set total
      try {
        const stats = await window.vyotiq.mcp.registryGetStats();
        setRegistryStats(stats);
        if (stats?.total) {
          setTotal(stats.total);
        }
      } catch {
        // ignore
      }

      window.vyotiq.mcp.registryGetSources().then(setEnabledSources).catch(() => { });
    };

    loadData();
  }, []);

  return {
    listings,
    featured,
    categories,
    total,
    hasMore,
    loading,
    error,
    filters,
    setFilters,
    search,
    loadAll,
    loadMore,
    refreshFeatured,
    refreshCategories,
    refreshRegistry,
    getDetails,
    isInstalled,
    installFromStore,
    registryStats,
    enabledSources,
    setSourceEnabled,
  };
}

// =============================================================================
// Combined useMCP Hook
// =============================================================================

export interface UseMCPResult {
  settings: UseMCPSettingsResult;
  servers: UseMCPServersResult;
  tools: UseMCPToolsResult;
  store: UseMCPStoreResult;
}

/**
 * Combined hook for all MCP functionality
 */
export function useMCP(): UseMCPResult {
  const settings = useMCPSettings();
  const servers = useMCPServers();
  const tools = useMCPTools();
  const store = useMCPStore();

  return { settings, servers, tools, store };
}

// =============================================================================
// Export Default
// =============================================================================

export default useMCP;
