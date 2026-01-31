/**
 * MCP Registry Fetchers
 * 
 * Implementations for fetching MCP server listings from various sources.
 * Each fetcher transforms source-specific data into unified MCPRegistryListing format.
 * 
 * @module main/mcp/registry/fetchers
 */

import { createLogger } from '../../logger';
import type {
  MCPRegistrySource,
  MCPRegistryListing,
  MCPEnvRequirement,
  SmitheryAPIResponse,
  NPMSearchResponse,
  GitHubContentsResponse,
} from './types';

// Re-export types for external consumers
export type { MCPRegistrySource, MCPEnvRequirement };
import type { MCPServerCategory, MCPTransportConfig } from '../../../shared/types/mcp';

const logger = createLogger('MCPRegistryFetchers');

// =============================================================================
// Constants
// =============================================================================

/** Default timeout for fetch operations */
const DEFAULT_TIMEOUT = 15000;

/** User agent for API requests */
const USER_AGENT = 'Vyotiq-Agent/1.0 (MCP Registry Fetcher)';

/** Valid registry sources for validation */
const VALID_REGISTRY_SOURCES: MCPRegistrySource[] = ['smithery', 'npm', 'pypi', 'github', 'glama', 'custom'];

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Validate if a source is a valid MCPRegistrySource
 */
export function isValidRegistrySource(source: string): source is MCPRegistrySource {
  return VALID_REGISTRY_SOURCES.includes(source as MCPRegistrySource);
}

/**
 * Parse environment requirements from package metadata
 */
export function parseEnvRequirements(
  envConfig: Record<string, unknown> | undefined
): MCPEnvRequirement[] {
  if (!envConfig) return [];
  
  const requirements: MCPEnvRequirement[] = [];
  for (const [name, config] of Object.entries(envConfig)) {
    const conf = config as Record<string, unknown> | undefined;
    requirements.push({
      name,
      description: String(conf?.description || `Environment variable: ${name}`),
      required: Boolean(conf?.required),
      defaultValue: conf?.default ? String(conf.default) : undefined,
      example: conf?.example ? String(conf.example) : undefined,
    });
  }
  return requirements;
}

/**
 * Fetch with timeout and proper error handling
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Infer category from package name and description
 */
function inferCategory(name: string, description: string, tags: string[]): MCPServerCategory {
  const text = `${name} ${description} ${tags.join(' ')}`.toLowerCase();

  if (text.includes('postgres') || text.includes('mysql') || text.includes('sqlite') ||
    text.includes('mongo') || text.includes('database') || text.includes('sql')) {
    return 'database';
  }
  if (text.includes('github') || text.includes('git') || text.includes('npm') ||
    text.includes('docker') || text.includes('sentry') || text.includes('debug')) {
    return 'developer-tools';
  }
  if (text.includes('browser') || text.includes('puppeteer') || text.includes('playwright') ||
    text.includes('selenium') || text.includes('chrome')) {
    return 'browser';
  }
  if (text.includes('file') || text.includes('filesystem') || text.includes('directory')) {
    return 'file-system';
  }
  if (text.includes('slack') || text.includes('discord') || text.includes('email') ||
    text.includes('message') || text.includes('notification')) {
    return 'communication';
  }
  if (text.includes('aws') || text.includes('azure') || text.includes('gcp') ||
    text.includes('cloud') || text.includes('s3') || text.includes('drive')) {
    return 'cloud';
  }
  if (text.includes('llm') || text.includes('ai') || text.includes('openai') ||
    text.includes('anthropic') || text.includes('thinking') || text.includes('image')) {
    return 'ai';
  }
  if (text.includes('api') || text.includes('http') || text.includes('fetch') ||
    text.includes('search') || text.includes('brave') || text.includes('google')) {
    return 'api';
  }
  if (text.includes('todo') || text.includes('notes') || text.includes('memory') ||
    text.includes('productivity') || text.includes('calendar')) {
    return 'productivity';
  }
  if (text.includes('analytics') || text.includes('metrics') || text.includes('monitor')) {
    return 'analytics';
  }
  if (text.includes('security') || text.includes('auth') || text.includes('encrypt')) {
    return 'security';
  }

  return 'other';
}

// =============================================================================
// Smithery Fetcher
// =============================================================================

/**
 * Fetch MCP servers from Smithery.ai
 * Smithery is the largest MCP marketplace with 3,800+ servers
 */
export async function fetchFromSmithery(options?: {
  limit?: number;
  query?: string;
  cursor?: string;
  timeoutMs?: number;
}): Promise<{ listings: MCPRegistryListing[]; nextCursor?: string; total: number }> {
  const limit = options?.limit ?? 50;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;

  try {
    // Build query URL
    let url = `https://registry.smithery.ai/servers?pageSize=${limit}`;
    if (options?.query) {
      url += `&q=${encodeURIComponent(options.query)}`;
    }
    if (options?.cursor) {
      url += `&cursor=${encodeURIComponent(options.cursor)}`;
    }

    logger.debug('Fetching from Smithery', { url });

    const response = await fetchWithTimeout(url, {}, timeoutMs);

    if (!response.ok) {
      throw new Error(`Smithery API error: ${response.status}`);
    }

    const data = await response.json() as SmitheryAPIResponse;

    // Transform to unified format
    const listings: MCPRegistryListing[] = data.items.map((item) => {
      const tags = extractSmitheryTags(item);
      const category = inferCategory(item.displayName, item.description || '', tags);

      return {
        id: `smithery-${item.qualifiedName.replace(/[^a-zA-Z0-9-]/g, '-')}`,
        name: item.displayName,
        description: item.description || 'No description',
        version: '1.0.0',
        author: item.qualifiedName.split('/')[0] || 'Unknown',
        authorUrl: `https://smithery.ai/@${item.qualifiedName.split('/')[0]}`,
        homepage: item.homepage || `https://smithery.ai/server/${item.qualifiedName}`,
        icon: item.iconUrl,
        category,
        tags,
        source: 'remote' as const,
        installCommand: `smithery://${item.qualifiedName}`,
        transportTemplate: buildSmitheryTransport(item),
        downloads: item.useCount,
        updatedAt: item.createdAt,
        verified: item.isDeployed ?? false,
        exampleTools: item.tools?.slice(0, 5).map((t) => t.name),
        registrySource: 'smithery',
        _rawData: item as unknown as Record<string, unknown>,
      };
    });

    return {
      listings,
      nextCursor: data.nextCursor,
      total: data.total ?? listings.length,
    };
  } catch (error) {
    logger.error('Failed to fetch from Smithery', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function extractSmitheryTags(item: SmitheryAPIResponse['items'][0]): string[] {
  const tags: string[] = [];

  // Extract from tools
  if (item.tools) {
    for (const tool of item.tools.slice(0, 3)) {
      tags.push(tool.name);
    }
  }

  // Extract from qualified name
  const parts = item.qualifiedName.split('/');
  if (parts.length > 1) {
    tags.push(parts[0]); // Publisher
  }

  return [...new Set(tags)];
}

function buildSmitheryTransport(item: SmitheryAPIResponse['items'][0]): Partial<MCPTransportConfig> {
  if (item.connections && item.connections.length > 0) {
    const conn = item.connections[0];
    if (conn.type === 'sse' || conn.type === 'streamable-http') {
      return {
        type: conn.type,
        url: `https://server.smithery.ai/${item.qualifiedName}`,
      };
    }
  }

  // Default to Smithery remote endpoint
  return {
    type: 'sse',
    url: `https://server.smithery.ai/${item.qualifiedName}`,
  };
}

// =============================================================================
// NPM Registry Fetcher
// =============================================================================

/**
 * Fetch MCP servers from NPM registry
 * Searches for @modelcontextprotocol and mcp-server packages
 */
export async function fetchFromNPM(options?: {
  limit?: number;
  query?: string;
  offset?: number;
  timeoutMs?: number;
}): Promise<{ listings: MCPRegistryListing[]; total: number; hasMore: boolean }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;

  try {
    // Search for MCP packages
    const searchTerms = options?.query
      ? `mcp ${options.query}`
      : 'keywords:mcp-server @modelcontextprotocol mcp-server-';

    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchTerms)}&size=${limit}&from=${offset}`;

    logger.debug('Fetching from NPM', { url });

    const response = await fetchWithTimeout(url, {}, timeoutMs);

    if (!response.ok) {
      throw new Error(`NPM API error: ${response.status}`);
    }

    const data = await response.json() as NPMSearchResponse;

    // Filter to only MCP-related packages
    const mcpPackages = data.objects.filter((obj) => {
      const name = obj.package.name.toLowerCase();
      const keywords = obj.package.keywords?.map((k) => k.toLowerCase()) ?? [];
      const desc = (obj.package.description || '').toLowerCase();

      return (
        name.includes('mcp') ||
        name.includes('@modelcontextprotocol') ||
        keywords.includes('mcp') ||
        keywords.includes('model-context-protocol') ||
        desc.includes('mcp server') ||
        desc.includes('model context protocol')
      );
    });

    // Transform to unified format
    const listings: MCPRegistryListing[] = mcpPackages.map((obj) => {
      const pkg = obj.package;
      const tags = pkg.keywords ?? [];
      const category = inferCategory(pkg.name, pkg.description || '', tags);

      return {
        id: `npm-${pkg.name.replace(/[^a-zA-Z0-9-]/g, '-')}`,
        name: formatNPMPackageName(pkg.name),
        description: pkg.description || 'No description',
        version: pkg.version,
        author: pkg.author?.name || pkg.publisher?.username || 'Unknown',
        authorUrl: pkg.author?.url,
        homepage: pkg.links?.homepage,
        repository: pkg.links?.repository,
        category,
        tags,
        source: 'npm' as const,
        installCommand: pkg.name,
        transportTemplate: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', pkg.name],
        },
        stars: Math.round((obj.score?.detail.popularity ?? 0) * 1000),
        updatedAt: new Date().toISOString(),
        verified: pkg.name.startsWith('@modelcontextprotocol/'),
        registrySource: 'npm',
        _rawData: obj as unknown as Record<string, unknown>,
      };
    });

    return {
      listings,
      total: data.total,
      hasMore: offset + limit < data.total,
    };
  } catch (error) {
    logger.error('Failed to fetch from NPM', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function formatNPMPackageName(name: string): string {
  // Remove scope and format nicely
  let display = name.replace('@modelcontextprotocol/', '').replace('mcp-server-', '');
  display = display.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return display;
}

// =============================================================================
// PyPI Fetcher
// =============================================================================

/**
 * Fetch MCP servers from PyPI
 * Searches for mcp-server-* and related packages
 */
export async function fetchFromPyPI(options?: {
  limit?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<{ listings: MCPRegistryListing[]; total: number }> {
  const limit = options?.limit ?? 30;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;

  try {
    // PyPI doesn't have a great search API, so we use the simple index
    // and search for known MCP package prefixes
    const searchTerms = [
      'mcp-server',
      'mcp_server',
      'modelcontextprotocol',
    ];

    if (options?.query) {
      searchTerms.push(options.query);
    }

    // Use PyPI JSON API for individual packages
    // Note: For a real implementation, you might want to use PyPI's XML-RPC search
    // or maintain a curated list of known MCP Python packages

    const knownPyPIPackages = [
      'mcp-server-fetch',
      'mcp-server-sqlite-npx',
      'mcp-server-git',
      'uvx',
    ];

    const listings: MCPRegistryListing[] = [];

    for (const pkgName of knownPyPIPackages.slice(0, limit)) {
      try {
        const url = `https://pypi.org/pypi/${pkgName}/json`;
        const response = await fetchWithTimeout(url, {}, timeoutMs);

        if (!response.ok) continue;

        const data = await response.json() as { info: { name: string; version: string; summary: string; author: string; home_page?: string; keywords?: string; license?: string } };
        const info = data.info;
        const tags = (info.keywords || '').split(',').map((k) => k.trim()).filter(Boolean);
        const category = inferCategory(info.name, info.summary || '', tags);

        listings.push({
          id: `pypi-${info.name.replace(/[^a-zA-Z0-9-]/g, '-')}`,
          name: formatPyPIPackageName(info.name),
          description: info.summary || 'No description',
          version: info.version,
          author: info.author || 'Unknown',
          homepage: info.home_page,
          license: info.license,
          category,
          tags,
          source: 'pypi' as const,
          installCommand: info.name,
          transportTemplate: {
            type: 'stdio',
            command: 'uvx',
            args: [info.name],
          },
          updatedAt: new Date().toISOString(),
          verified: false,
          registrySource: 'pypi',
        });
      } catch (err) {
        // Skip packages that fail to parse, but log for debugging
        logger.debug('Failed to parse PyPI package', { 
          pkgName, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    return {
      listings,
      total: listings.length,
    };
  } catch (error) {
    logger.error('Failed to fetch from PyPI', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function formatPyPIPackageName(name: string): string {
  let display = name.replace('mcp-server-', '').replace('mcp_server_', '');
  display = display.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return display;
}

// =============================================================================
// GitHub Fetcher
// =============================================================================

/**
 * Fetch MCP servers from GitHub modelcontextprotocol/servers repository
 */
export async function fetchFromGitHub(options?: {
  limit?: number;
  timeoutMs?: number;
}): Promise<{ listings: MCPRegistryListing[] }> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;

  try {
    // Fetch the src directory of the official MCP servers repo
    const url = 'https://api.github.com/repos/modelcontextprotocol/servers/contents/src';

    logger.debug('Fetching from GitHub', { url });

    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    }, timeoutMs);

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const contents = await response.json() as GitHubContentsResponse[];

    // Filter to directories (each is a server)
    const serverDirs = contents.filter((item) => item.type === 'dir');

    // Transform to unified format
    const listings: MCPRegistryListing[] = serverDirs.map((dir) => {
      const name = formatGitHubServerName(dir.name);
      const category = inferCategory(dir.name, '', []);

      return {
        id: `github-mcp-${dir.name}`,
        name,
        description: `Official MCP ${name} server`,
        version: '1.0.0',
        author: 'Anthropic',
        authorUrl: 'https://anthropic.com',
        homepage: dir.html_url,
        repository: 'https://github.com/modelcontextprotocol/servers',
        category,
        tags: [dir.name, 'official', 'anthropic'],
        source: 'npm' as const,
        installCommand: `@modelcontextprotocol/server-${dir.name}`,
        transportTemplate: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', `@modelcontextprotocol/server-${dir.name}`],
        },
        updatedAt: new Date().toISOString(),
        verified: true,
        registrySource: 'github',
      };
    });

    return { listings };
  } catch (error) {
    logger.error('Failed to fetch from GitHub', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function formatGitHubServerName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// =============================================================================
// Glama Fetcher
// =============================================================================

/**
 * Fetch MCP servers from Glama.ai
 */
export async function fetchFromGlama(options?: {
  limit?: number;
  query?: string;
  timeoutMs?: number;
}): Promise<{ listings: MCPRegistryListing[] }> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;

  try {
    // Glama MCP directory API
    const url = 'https://glama.ai/api/mcp/servers';

    logger.debug('Fetching from Glama', { url });

    const response = await fetchWithTimeout(url, {}, timeoutMs);

    if (!response.ok) {
      // Glama might not have a public API, return empty
      logger.warn('Glama API not available', { status: response.status });
      return { listings: [] };
    }

    const data = await response.json() as Array<{
      id: string;
      name: string;
      description: string;
      author?: string;
      homepage?: string;
      tags?: string[];
      installCommand?: string;
    }>;

    const listings: MCPRegistryListing[] = data.map((item) => {
      const tags = item.tags ?? [];
      const category = inferCategory(item.name, item.description, tags);

      return {
        id: `glama-${item.id}`,
        name: item.name,
        description: item.description,
        version: '1.0.0',
        author: item.author || 'Unknown',
        homepage: item.homepage,
        category,
        tags,
        source: 'npm' as const,
        installCommand: item.installCommand || item.id,
        transportTemplate: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', item.installCommand || item.id],
        },
        updatedAt: new Date().toISOString(),
        verified: false,
        registrySource: 'glama',
      };
    });

    return { listings };
  } catch (error) {
    logger.error('Failed to fetch from Glama', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Glama is optional, don't throw
    return { listings: [] };
  }
}

// =============================================================================
// Custom Registry Fetcher
// =============================================================================

/**
 * Fetch from a custom registry URL
 * Expects JSON array of listings or { servers: [...] } format
 */
export async function fetchFromCustomRegistry(
  registryUrl: string,
  options?: {
    limit?: number;
    timeoutMs?: number;
  }
): Promise<{ listings: MCPRegistryListing[] }> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT;

  try {
    logger.debug('Fetching from custom registry', { url: registryUrl });

    const response = await fetchWithTimeout(registryUrl, {}, timeoutMs);

    if (!response.ok) {
      throw new Error(`Custom registry error: ${response.status}`);
    }

    const data = await response.json() as Array<Record<string, unknown>> | { servers: Array<Record<string, unknown>> };

    // Handle both array and { servers: [...] } formats
    const rawListings = Array.isArray(data) ? data : (data.servers ?? []);

    const listings: MCPRegistryListing[] = rawListings.map((item, index) => {
      const name = String(item.name || item.displayName || `Server ${index + 1}`);
      const description = String(item.description || 'No description');
      const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
      const category = inferCategory(name, description, tags);

      return {
        id: `custom-${String(item.id || name).replace(/[^a-zA-Z0-9-]/g, '-')}`,
        name,
        description,
        version: String(item.version || '1.0.0'),
        author: String(item.author || 'Unknown'),
        homepage: item.homepage ? String(item.homepage) : undefined,
        category,
        tags,
        source: (item.source as 'npm' | 'pypi' | 'local' | 'git') || 'npm',
        installCommand: String(item.installCommand || item.package || name),
        transportTemplate: item.transport as Partial<MCPTransportConfig>,
        updatedAt: String(item.updatedAt || new Date().toISOString()),
        verified: Boolean(item.verified),
        registrySource: 'custom',
        _rawData: item,
      };
    });

    return { listings };
  } catch (error) {
    logger.error('Failed to fetch from custom registry', {
      url: registryUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
