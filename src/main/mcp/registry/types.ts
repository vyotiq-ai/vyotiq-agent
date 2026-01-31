/**
 * MCP Registry Types
 * 
 * Type definitions for dynamic MCP server registry system.
 * Supports multiple registry sources with unified interface.
 * 
 * @module main/mcp/registry/types
 */

import type { MCPServerCategory, MCPServerSource, MCPTransportConfig } from '../../../shared/types/mcp';

// =============================================================================
// Registry Source Types
// =============================================================================

/**
 * Supported registry sources for MCP server discovery
 */
export type MCPRegistrySource = 
  | 'smithery'     // Smithery.ai - largest MCP marketplace
  | 'npm'          // NPM registry - @modelcontextprotocol packages
  | 'pypi'         // PyPI - mcp-server-* packages
  | 'github'       // GitHub - modelcontextprotocol/servers repo
  | 'glama'        // Glama.ai MCP directory
  | 'custom';      // User-defined registry URLs

/**
 * Registry source configuration
 */
export interface MCPRegistryConfig {
  /** Source identifier */
  source: MCPRegistrySource;
  /** Whether this source is enabled */
  enabled: boolean;
  /** Priority for search results (lower = higher priority) */
  priority: number;
  /** Base URL for API calls */
  baseUrl?: string;
  /** API key for authenticated sources */
  apiKey?: string;
  /** Rate limit (requests per minute) */
  rateLimitPerMinute?: number;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

// =============================================================================
// Registry Listing Types
// =============================================================================

/**
 * Environment variable requirement
 */
export interface MCPEnvRequirement {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  example?: string;
}

/**
 * Unified registry listing format
 */
export interface MCPRegistryListing {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Long description (markdown) */
  longDescription?: string;
  /** Version */
  version: string;
  /** Author/maintainer */
  author: string;
  /** Author URL */
  authorUrl?: string;
  /** Homepage */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** License */
  license?: string;
  /** Icon URL */
  icon?: string;
  /** Category */
  category: MCPServerCategory;
  /** Tags for search */
  tags: string[];
  /** Installation source */
  source: MCPServerSource;
  /** Installation command/package */
  installCommand: string;
  /** Transport configuration template */
  transportTemplate?: Partial<MCPTransportConfig>;
  /** Required environment variables */
  requiredEnv?: MCPEnvRequirement[];
  /** Download/install count */
  downloads?: number;
  /** Star/rating count */
  stars?: number;
  /** Last updated timestamp */
  updatedAt: string;
  /** Is verified/official */
  verified: boolean;
  /** Example tools */
  exampleTools?: string[];
  /** Which registry this came from */
  registrySource: MCPRegistrySource;
  /** Raw source data for reference */
  _rawData?: Record<string, unknown>;
}

// =============================================================================
// Registry API Response Types
// =============================================================================

/**
 * Smithery API response format
 */
export interface SmitheryAPIResponse {
  items: Array<{
    qualifiedName: string;
    displayName: string;
    description: string;
    iconUrl?: string;
    homepage?: string;
    useCount?: number;
    isDeployed?: boolean;
    createdAt: string;
    tools?: Array<{ name: string; description: string }>;
    connections?: Array<{
      type: 'stdio' | 'sse' | 'streamable-http';
      configSchema?: Record<string, unknown>;
    }>;
  }>;
  nextCursor?: string;
  total?: number;
}

/**
 * NPM registry search response
 */
export interface NPMSearchResponse {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description: string;
      keywords?: string[];
      author?: { name: string; url?: string };
      links?: {
        npm?: string;
        homepage?: string;
        repository?: string;
      };
      publisher?: { username: string };
    };
    score?: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
  }>;
  total: number;
}

/**
 * PyPI search response
 */
export interface PyPISearchResponse {
  info: {
    name: string;
    version: string;
    summary: string;
    description: string;
    author: string;
    author_email: string;
    home_page?: string;
    project_urls?: Record<string, string>;
    keywords?: string;
    license?: string;
  };
  releases: Record<string, Array<{
    upload_time: string;
    downloads?: number;
  }>>;
}

/**
 * GitHub contents API response
 */
export interface GitHubContentsResponse {
  name: string;
  path: string;
  type: 'file' | 'dir';
  url: string;
  html_url: string;
}

// =============================================================================
// Cache Types
// =============================================================================

/**
 * Cached registry data
 */
export interface MCPRegistryCache {
  /** Cached listings */
  listings: MCPRegistryListing[];
  /** When the cache was created */
  cachedAt: number;
  /** Source of this cache */
  source: MCPRegistrySource;
  /** Hash for cache invalidation */
  hash?: string;
}

/**
 * Combined cache with all sources
 */
export interface MCPRegistryCacheStore {
  /** Cache per source */
  sources: Record<MCPRegistrySource, MCPRegistryCache>;
  /** Last full refresh timestamp */
  lastFullRefresh: number;
}

// =============================================================================
// Fetch Options
// =============================================================================

/**
 * Options for registry fetch operations
 */
export interface MCPRegistryFetchOptions {
  /** Maximum results per source */
  limit?: number;
  /** Search query */
  query?: string;
  /** Category filter */
  category?: MCPServerCategory;
  /** Tags filter */
  tags?: string[];
  /** Skip cache and force refresh */
  forceRefresh?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Sources to fetch from */
  sources?: MCPRegistrySource[];
}

/**
 * Result of a registry fetch operation
 */
export interface MCPRegistryFetchResult {
  /** Fetched listings */
  listings: MCPRegistryListing[];
  /** Sources that were fetched */
  fetchedSources: MCPRegistrySource[];
  /** Sources that failed */
  failedSources: Array<{ source: MCPRegistrySource; error: string }>;
  /** Total count across all sources */
  total: number;
  /** Whether more results are available */
  hasMore: boolean;
  /** Was this from cache */
  fromCache: boolean;
}
