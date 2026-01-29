/**
 * MCP Server Discovery Service
 * 
 * Provides automatic discovery of MCP servers from:
 * - Local filesystem (node_modules, npx packages)
 * - Popular MCP server registries
 * - Environment variables and config files
 * - User-defined search paths
 * 
 * @see https://modelcontextprotocol.io/specification/2025-06-18
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { MCPStdioConfig, MCPHttpConfig } from '../../../../shared/types/mcp';
import { createLogger } from '../../../logger';

const execAsync = promisify(exec);
const logger = createLogger('MCPServerDiscovery');

// =============================================================================
// Types
// =============================================================================

/**
 * Discovered MCP server candidate
 */
export interface MCPServerCandidate {
  /** Suggested server name */
  name: string;
  /** Server description */
  description?: string;
  /** Discovery source */
  source: MCPDiscoverySource;
  /** Transport configuration */
  transport: MCPStdioConfig | MCPHttpConfig;
  /** Icon suggestion */
  icon?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Whether this is an official/verified server */
  verified?: boolean;
  /** Required environment variables */
  requiredEnv?: string[];
  /** Discovery confidence score (0-1) */
  confidence: number;
}

/**
 * Discovery source types
 */
export type MCPDiscoverySource = 
  | 'registry'      // Official MCP registry
  | 'npm'           // NPM global/local packages
  | 'workspace'     // Workspace node_modules
  | 'config'        // Config file (claude_desktop_config, mcp.json)
  | 'environment'   // Environment variables
  | 'path'          // System PATH
  | 'manual';       // User-provided

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  /** Workspace paths to search */
  workspacePaths?: string[];
  /** Include unverified servers */
  includeUnverified?: boolean;
  /** Maximum number of candidates to return */
  maxCandidates?: number;
  /** Discovery timeout in ms */
  timeout?: number;
}

/**
 * Registry server entry
 */
interface RegistryServerEntry {
  name: string;
  description: string;
  package: string;
  icon: string;
  tags: string[];
  requiredEnv?: string[];
  verified: boolean;
}

// =============================================================================
// Known MCP Servers Registry
// =============================================================================

/**
 * Registry of known official and community MCP servers
 * Updated for 2025/2026 best practices
 */
const KNOWN_MCP_SERVERS: RegistryServerEntry[] = [
  // Official Anthropic servers
  {
    name: 'Filesystem',
    description: 'Read, write, and manage local files with security controls',
    package: '@modelcontextprotocol/server-filesystem',
    icon: '📁',
    tags: ['official', 'filesystem', 'core'],
    verified: true,
  },
  {
    name: 'Fetch',
    description: 'Fetch and convert web pages to markdown for analysis',
    package: '@modelcontextprotocol/server-fetch',
    icon: '🌐',
    tags: ['official', 'web', 'core'],
    verified: true,
  },
  {
    name: 'GitHub',
    description: 'Access GitHub repositories, issues, PRs, and actions',
    package: '@modelcontextprotocol/server-github',
    icon: '🐙',
    tags: ['official', 'git', 'vcs'],
    requiredEnv: ['GITHUB_TOKEN'],
    verified: true,
  },
  {
    name: 'Git',
    description: 'Git operations including diff, log, and branch management',
    package: '@modelcontextprotocol/server-git',
    icon: '📊',
    tags: ['official', 'git', 'vcs'],
    verified: true,
  },
  {
    name: 'SQLite',
    description: 'Query and analyze SQLite databases',
    package: '@modelcontextprotocol/server-sqlite',
    icon: '🗃️',
    tags: ['official', 'database', 'sql'],
    verified: true,
  },
  {
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    package: '@modelcontextprotocol/server-postgres',
    icon: '🐘',
    tags: ['official', 'database', 'sql'],
    requiredEnv: ['POSTGRES_URL'],
    verified: true,
  },
  {
    name: 'Memory',
    description: 'Persistent knowledge graph for long-term memory',
    package: '@modelcontextprotocol/server-memory',
    icon: '🧠',
    tags: ['official', 'memory', 'knowledge'],
    verified: true,
  },
  {
    name: 'Brave Search',
    description: 'Web search using Brave Search API',
    package: '@modelcontextprotocol/server-brave-search',
    icon: '🔍',
    tags: ['official', 'search', 'web'],
    requiredEnv: ['BRAVE_API_KEY'],
    verified: true,
  },
  {
    name: 'Google Maps',
    description: 'Location search, directions, and place information',
    package: '@modelcontextprotocol/server-google-maps',
    icon: '🗺️',
    tags: ['official', 'maps', 'location'],
    requiredEnv: ['GOOGLE_MAPS_API_KEY'],
    verified: true,
  },
  {
    name: 'Puppeteer',
    description: 'Browser automation and web scraping with Puppeteer',
    package: '@modelcontextprotocol/server-puppeteer',
    icon: '🎭',
    tags: ['official', 'browser', 'automation'],
    verified: true,
  },
  {
    name: 'Slack',
    description: 'Access Slack channels, messages, and users',
    package: '@modelcontextprotocol/server-slack',
    icon: '💬',
    tags: ['official', 'communication', 'slack'],
    requiredEnv: ['SLACK_BOT_TOKEN'],
    verified: true,
  },
  {
    name: 'Sequential Thinking',
    description: 'Step-by-step reasoning and problem decomposition',
    package: '@modelcontextprotocol/server-sequential-thinking',
    icon: '🧩',
    tags: ['official', 'reasoning', 'thinking'],
    verified: true,
  },
  {
    name: 'Time',
    description: 'Time zone conversions and time-related utilities',
    package: '@modelcontextprotocol/server-time',
    icon: '⏰',
    tags: ['official', 'utility', 'time'],
    verified: true,
  },
  {
    name: 'Everything',
    description: 'Fast file search using Everything (Windows)',
    package: '@modelcontextprotocol/server-everything',
    icon: '🔎',
    tags: ['official', 'search', 'windows'],
    verified: true,
  },
  // Community servers
  {
    name: 'Obsidian',
    description: 'Access Obsidian vaults and notes',
    package: 'mcp-server-obsidian',
    icon: '📝',
    tags: ['community', 'notes', 'knowledge'],
    verified: false,
  },
  {
    name: 'Notion',
    description: 'Access Notion workspaces and databases',
    package: 'mcp-server-notion',
    icon: '📓',
    tags: ['community', 'notes', 'productivity'],
    requiredEnv: ['NOTION_API_KEY'],
    verified: false,
  },
  {
    name: 'Linear',
    description: 'Manage Linear issues and projects',
    package: 'mcp-server-linear',
    icon: '📐',
    tags: ['community', 'project-management'],
    requiredEnv: ['LINEAR_API_KEY'],
    verified: false,
  },
  {
    name: 'Raycast',
    description: 'Raycast extension integration',
    package: 'mcp-server-raycast',
    icon: '🔮',
    tags: ['community', 'productivity', 'macos'],
    verified: false,
  },
];

// =============================================================================
// MCP Server Discovery Class
// =============================================================================

export class MCPServerDiscovery {
  private discoveryCache: MCPServerCandidate[] = [];
  private cacheTimestamp = 0;
  private readonly cacheTTL = 300000; // 5 minutes

  /**
   * Discover available MCP servers
   */
  async discover(options: DiscoveryOptions = {}): Promise<MCPServerCandidate[]> {
    const {
      workspacePaths = [],
      includeUnverified = true,
      maxCandidates = 50,
      timeout = 10000,
    } = options;

    // Check cache
    if (Date.now() - this.cacheTimestamp < this.cacheTTL && this.discoveryCache.length > 0) {
      logger.debug('Using cached discovery results');
      return this.filterCandidates(this.discoveryCache, includeUnverified, maxCandidates);
    }

    logger.info('Starting MCP server discovery', { workspacePaths, timeout });

    const candidates: MCPServerCandidate[] = [];
    const discoveryTasks: Promise<MCPServerCandidate[]>[] = [];

    // Registry servers (always include)
    discoveryTasks.push(this.discoverFromRegistry());

    // Workspace discovery
    for (const workspacePath of workspacePaths) {
      discoveryTasks.push(this.discoverFromWorkspace(workspacePath));
    }

    // NPM global packages
    discoveryTasks.push(this.discoverFromNpmGlobal());

    // Config file discovery
    discoveryTasks.push(this.discoverFromConfigFiles());

    // Wait for all discovery tasks with timeout
    const results = await Promise.race([
      Promise.allSettled(discoveryTasks),
      new Promise<PromiseSettledResult<MCPServerCandidate[]>[]>((resolve) =>
        setTimeout(() => resolve([]), timeout)
      ),
    ]);

    // Aggregate results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        candidates.push(...result.value);
      } else {
        logger.warn('Discovery task failed', { reason: result.reason });
      }
    }

    // Deduplicate by name
    const uniqueCandidates = this.deduplicateCandidates(candidates);

    // Update cache
    this.discoveryCache = uniqueCandidates;
    this.cacheTimestamp = Date.now();

    logger.info('Discovery complete', { count: uniqueCandidates.length });

    return this.filterCandidates(uniqueCandidates, includeUnverified, maxCandidates);
  }

  /**
   * Discover servers from the known registry
   */
  private async discoverFromRegistry(): Promise<MCPServerCandidate[]> {
    return KNOWN_MCP_SERVERS.map((entry): MCPServerCandidate => ({
      name: entry.name,
      description: entry.description,
      source: 'registry',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', entry.package],
      },
      icon: entry.icon,
      tags: entry.tags,
      verified: entry.verified,
      requiredEnv: entry.requiredEnv,
      confidence: entry.verified ? 1.0 : 0.8,
    }));
  }

  /**
   * Discover MCP servers from workspace node_modules
   */
  private async discoverFromWorkspace(workspacePath: string): Promise<MCPServerCandidate[]> {
    const candidates: MCPServerCandidate[] = [];

    try {
      const nodeModulesPath = path.join(workspacePath, 'node_modules');
      if (!existsSync(nodeModulesPath)) {
        return candidates;
      }

      // Look for @modelcontextprotocol packages
      const mcpPath = path.join(nodeModulesPath, '@modelcontextprotocol');
      if (existsSync(mcpPath)) {
        const packages = readdirSync(mcpPath, { withFileTypes: true })
          .filter(d => d.isDirectory() && d.name.startsWith('server-'))
          .map(d => d.name);

        for (const pkg of packages) {
          const pkgJsonPath = path.join(mcpPath, pkg, 'package.json');
          if (existsSync(pkgJsonPath)) {
            try {
              const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
              candidates.push({
                name: this.formatPackageName(pkg),
                description: pkgJson.description || `MCP Server: ${pkg}`,
                source: 'workspace',
                transport: {
                  type: 'stdio',
                  command: 'npx',
                  args: ['-y', `@modelcontextprotocol/${pkg}`],
                  cwd: workspacePath,
                },
                tags: ['workspace', 'installed'],
                verified: true,
                confidence: 0.95,
              });
            } catch {
              // Skip invalid package.json
            }
          }
        }
      }

      // Look for mcp-server-* packages
      const entries = readdirSync(nodeModulesPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('mcp-server-')) {
          const pkgJsonPath = path.join(nodeModulesPath, entry.name, 'package.json');
          if (existsSync(pkgJsonPath)) {
            try {
              const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
              candidates.push({
                name: this.formatPackageName(entry.name.replace('mcp-server-', '')),
                description: pkgJson.description || `MCP Server: ${entry.name}`,
                source: 'workspace',
                transport: {
                  type: 'stdio',
                  command: 'npx',
                  args: ['-y', entry.name],
                  cwd: workspacePath,
                },
                tags: ['workspace', 'community'],
                verified: false,
                confidence: 0.7,
              });
            } catch {
              // Skip invalid package.json
            }
          }
        }
      }
    } catch (error) {
      logger.debug('Workspace discovery failed', { 
        workspacePath, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    return candidates;
  }

  /**
   * Discover globally installed MCP servers via npm
   */
  private async discoverFromNpmGlobal(): Promise<MCPServerCandidate[]> {
    const candidates: MCPServerCandidate[] = [];

    try {
      const { stdout } = await execAsync('npm list -g --json --depth=0', { timeout: 5000 });
      const globalPackages = JSON.parse(stdout);
      const deps = globalPackages.dependencies || {};

      for (const [name, info] of Object.entries(deps)) {
        if (name.includes('mcp-server') || name.startsWith('@modelcontextprotocol/server-')) {
          const pkgInfo = info as { version?: string };
          candidates.push({
            name: this.formatPackageName(name.replace(/^@modelcontextprotocol\/server-|^mcp-server-/, '')),
            description: `Globally installed MCP server (v${pkgInfo.version || 'unknown'})`,
            source: 'npm',
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['-y', name],
            },
            tags: ['global', 'installed'],
            verified: name.startsWith('@modelcontextprotocol/'),
            confidence: 0.9,
          });
        }
      }
    } catch (error) {
      logger.debug('NPM global discovery failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    return candidates;
  }

  /**
   * Discover servers from config files
   */
  private async discoverFromConfigFiles(): Promise<MCPServerCandidate[]> {
    const candidates: MCPServerCandidate[] = [];

    // Common config file locations
    const configPaths = [
      // Claude Desktop config
      process.platform === 'win32'
        ? path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json')
        : process.platform === 'darwin'
        ? path.join(process.env.HOME || '', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
        : path.join(process.env.HOME || '', '.config', 'claude', 'claude_desktop_config.json'),
      // MCP config in home directory
      path.join(process.env.HOME || process.env.USERPROFILE || '', '.mcp', 'config.json'),
      path.join(process.env.HOME || process.env.USERPROFILE || '', '.mcp.json'),
    ];

    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          const servers = config.mcpServers || config.servers || {};

          for (const [name, serverConfig] of Object.entries(servers)) {
            const cfg = serverConfig as { command?: string; args?: string[]; url?: string; env?: Record<string, string> };
            
            if (cfg.command) {
              candidates.push({
                name: this.formatPackageName(name),
                description: `Imported from ${path.basename(configPath)}`,
                source: 'config',
                transport: {
                  type: 'stdio',
                  command: cfg.command,
                  args: cfg.args,
                  env: cfg.env,
                },
                tags: ['imported', 'config'],
                verified: false,
                confidence: 0.85,
              });
            } else if (cfg.url) {
              candidates.push({
                name: this.formatPackageName(name),
                description: `Imported from ${path.basename(configPath)}`,
                source: 'config',
                transport: {
                  type: 'http',
                  url: cfg.url,
                },
                tags: ['imported', 'config', 'remote'],
                verified: false,
                confidence: 0.85,
              });
            }
          }
        } catch (error) {
          logger.debug('Config file parsing failed', { 
            configPath, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Format package name to display name
   */
  private formatPackageName(name: string): string {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Deduplicate candidates by name
   */
  private deduplicateCandidates(candidates: MCPServerCandidate[]): MCPServerCandidate[] {
    const seen = new Map<string, MCPServerCandidate>();

    for (const candidate of candidates) {
      const key = candidate.name.toLowerCase();
      const existing = seen.get(key);

      if (!existing || candidate.confidence > existing.confidence) {
        seen.set(key, candidate);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Filter candidates based on options
   */
  private filterCandidates(
    candidates: MCPServerCandidate[],
    includeUnverified: boolean,
    maxCandidates: number
  ): MCPServerCandidate[] {
    let filtered = candidates;

    if (!includeUnverified) {
      filtered = filtered.filter(c => c.verified);
    }

    // Sort by confidence, then by verified status
    filtered.sort((a, b) => {
      if (a.verified !== b.verified) {
        return a.verified ? -1 : 1;
      }
      return b.confidence - a.confidence;
    });

    return filtered.slice(0, maxCandidates);
  }

  /**
   * Check if a server candidate's required environment variables are set
   */
  checkEnvRequirements(candidate: MCPServerCandidate): { satisfied: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const envVar of candidate.requiredEnv || []) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * Get cached candidates without triggering a new discovery
   */
  getCachedCandidates(): MCPServerCandidate[] {
    return [...this.discoveryCache];
  }

  /**
   * Convert a discovered candidate to a server configuration
   */
  candidateToConfig(candidate: MCPServerCandidate): Omit<import('../../../../shared/types/mcp').MCPServerConfig, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: candidate.name,
      description: candidate.description,
      transport: candidate.transport as import('../../../../shared/types/mcp').MCPTransportConfig,
      enabled: true,
      autoConnect: false,
      timeout: 30000,
      maxReconnectAttempts: 3,
      icon: candidate.icon,
      tags: candidate.tags,
    };
  }

  /**
   * Clear the discovery cache
   */
  clearCache(): void {
    this.discoveryCache = [];
    this.cacheTimestamp = 0;
  }
}

// Singleton instance
let discoveryInstance: MCPServerDiscovery | null = null;

/**
 * Get the MCP server discovery instance
 */
export function getMCPServerDiscovery(): MCPServerDiscovery {
  if (!discoveryInstance) {
    discoveryInstance = new MCPServerDiscovery();
  }
  return discoveryInstance;
}
