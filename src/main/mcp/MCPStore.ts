/**
 * MCP Store
 *
 * Handles MCP server discovery, installation, and registry management.
 * Supports npm, pypi, git, local, and remote server sources.
 *
 * @module main/mcp/MCPStore
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { createLogger } from '../logger';
import { MCPServerManager } from './MCPServerManager';
import { getMCPDynamicRegistry, initializeMCPDynamicRegistry, MCPDynamicRegistry } from './registry';
import type {
  MCPServerConfig,
  MCPServerSource,
  MCPServerCategory,
  MCPStoreListing,
  MCPStoreFilters,
  MCPStoreSearchResult,
  MCPInstallRequest,
  MCPInstallResult,
  MCPTransportConfig,
} from '../../shared/types/mcp';

const execAsync = promisify(exec);
const logger = createLogger('MCPStore');

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate if a source is a valid MCPServerSource
 */
function isValidServerSource(source: string): source is MCPServerSource {
  const validSources: MCPServerSource[] = ['npm', 'pypi', 'git', 'local', 'remote', 'mcpb'];
  return validSources.includes(source as MCPServerSource);
}

/**
 * Execute a command with spawn for streaming output
 * Used for installations that need real-time progress feedback
 */
function spawnWithLogs(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
  log: (msg: string) => void
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      // Log each line for real-time feedback
      text.split('\n').filter(Boolean).forEach((line) => log(`  ${line}`));
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      // Log stderr as warnings
      text.split('\n').filter(Boolean).forEach((line) => log(`  [stderr] ${line}`));
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
  });
}

// =============================================================================
// MCP Store Implementation
// =============================================================================

export class MCPStore {
  private serverManager: MCPServerManager;
  private dynamicRegistry: MCPDynamicRegistry;
  private registryCache: MCPStoreListing[] = [];
  private registryCacheTime = 0;
  private registryCacheTtl = 1800000; // 30 minutes (reduced for dynamic updates)
  private customRegistries: string[] = [];
  private mcpServersPath: string;
  private initialized = false;

  constructor(serverManager: MCPServerManager) {
    this.serverManager = serverManager;
    this.dynamicRegistry = getMCPDynamicRegistry();
    this.mcpServersPath = path.join(app.getPath('userData'), 'mcp-servers');
  }

  /**
   * Initialize the store and dynamic registry
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await initializeMCPDynamicRegistry();
      this.initialized = true;
      logger.info('MCP Store initialized with dynamic registry');

      // Trigger initial fetch if cache is empty
      const stats = this.dynamicRegistry.getCacheStats();
      if (stats.total === 0) {
        logger.info('Cache empty, triggering initial fetch');
        // Don't await - let it happen in background
        this.refreshRegistry().catch((err) => {
          logger.warn('Background registry refresh failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (error) {
      logger.error('Failed to initialize MCP Store', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Registry Management
  // ---------------------------------------------------------------------------

  setCustomRegistries(registries: string[]): void {
    this.customRegistries = registries;
    this.dynamicRegistry.setCustomRegistries(registries);
    this.registryCacheTime = 0; // Invalidate cache
  }

  /**
   * Refresh registry from all dynamic sources
   */
  async refreshRegistry(): Promise<MCPStoreListing[]> {
    await this.initialize();

    try {
      logger.info('Refreshing MCP registry from dynamic sources');

      // Fetch from dynamic registry (Smithery, NPM, PyPI, GitHub, etc.)
      const result = await this.dynamicRegistry.refresh({ force: true });

      // Convert registry listings to store listings
      const dynamicListings = result.listings.map((listing) =>
        this.dynamicRegistry.toStoreListing(listing)
      );

      // Use dynamic listings directly (no hardcoded fallback)
      const allListings = dynamicListings;

      // Deduplicate by installCommand
      const uniqueListings = new Map<string, MCPStoreListing>();
      for (const listing of allListings) {
        const key = listing.installCommand.toLowerCase();
        if (!uniqueListings.has(key)) {
          uniqueListings.set(key, listing);
        }
      }

      this.registryCache = Array.from(uniqueListings.values());
      this.registryCacheTime = Date.now();

      logger.info('Registry refreshed', {
        total: this.registryCache.length,
        sources: result.fetchedSources,
        failed: result.failedSources.length,
      });

      return this.registryCache;
    } catch (error) {
      logger.error('Failed to refresh registry, using cached data', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return cached data or empty (dynamic system has no hardcoded fallback)
      return this.registryCache;
    }
  }

  /**
   * Get registry with cache support
   */
  async getRegistry(): Promise<MCPStoreListing[]> {
    // Return cached if fresh
    if (Date.now() - this.registryCacheTime < this.registryCacheTtl && this.registryCache.length > 0) {
      return this.registryCache;
    }

    await this.initialize();

    // Try to get from dynamic registry cache first (faster)
    const cached = this.dynamicRegistry.getCacheStats();
    if (cached.total > 0) {
      const result = await this.dynamicRegistry.search({ forceRefresh: false });
      if (result.listings.length > 0) {
        this.registryCache = result.listings.map((l) => this.dynamicRegistry.toStoreListing(l));
        this.registryCacheTime = Date.now();
        return this.registryCache;
      }
    }

    // Full refresh if no cache
    return this.refreshRegistry();
  }

  // ---------------------------------------------------------------------------
  // Store Search
  // ---------------------------------------------------------------------------

  async search(filters: MCPStoreFilters): Promise<MCPStoreSearchResult> {
    const registry = await this.getRegistry();
    let results = [...registry];

    // Text search
    if (filters.query) {
      const query = filters.query.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    // Category filter
    if (filters.category) {
      results = results.filter((s) => s.category === filters.category);
    }

    // Source filter
    if (filters.source) {
      results = results.filter((s) => s.source === filters.source);
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      results = results.filter((s) =>
        filters.tags!.some((tag) => s.tags.includes(tag))
      );
    }

    // Verified filter
    if (filters.verifiedOnly) {
      results = results.filter((s) => s.verified);
    }

    // Sort
    const sortBy = filters.sortBy || 'relevance';
    const sortOrder = filters.sortOrder || 'desc';
    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'downloads':
          comparison = (a.downloads || 0) - (b.downloads || 0);
          break;
        case 'stars':
          comparison = (a.stars || 0) - (b.stars || 0);
          break;
        case 'updated':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'relevance':
        default:
          // Prioritize verified, then featured
          if (a.verified !== b.verified) return a.verified ? -1 : 1;
          comparison = (a.downloads || 0) - (b.downloads || 0);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || 100; // Increased default to show more servers
    const total = results.length;
    const items = results.slice(offset, offset + limit);

    return {
      total,
      items,
      hasMore: offset + limit < total,
    };
  }

  async getFeatured(): Promise<MCPStoreListing[]> {
    await this.initialize();

    try {
      // Get featured from dynamic registry
      const featured = await this.dynamicRegistry.getFeatured(20);
      if (featured.length > 0) {
        return featured.map((l) => this.dynamicRegistry.toStoreListing(l));
      }

      // If no featured found, try refreshing first
      logger.info('No featured servers found, triggering refresh');
      await this.refreshRegistry();

      // Try again after refresh
      const refreshedFeatured = await this.dynamicRegistry.getFeatured(20);
      if (refreshedFeatured.length > 0) {
        return refreshedFeatured.map((l) => this.dynamicRegistry.toStoreListing(l));
      }
    } catch (error) {
      logger.warn('Failed to get dynamic featured', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Return empty if dynamic fetch fails (no hardcoded servers)
    return [];
  }

  /**
   * Clear all registry caches and force refresh
   */
  async clearRegistryCache(): Promise<void> {
    this.registryCache = [];
    this.registryCacheTime = 0;
    this.dynamicRegistry.clearCache();
    logger.info('Registry cache cleared');
  }

  /**
   * Get registry source statistics
   */
  getRegistryStats(): {
    sources: Record<string, { count: number; age: number; fresh: boolean }>;
    total: number;
    lastFullRefresh: number;
  } {
    return this.dynamicRegistry.getCacheStats();
  }

  /**
   * Enable/disable a registry source
   */
  setSourceEnabled(source: 'smithery' | 'npm' | 'pypi' | 'github' | 'glama', enabled: boolean): void {
    this.dynamicRegistry.setSourceEnabled(source, enabled);
  }

  /**
   * Get enabled registry sources
   */
  getEnabledSources(): string[] {
    return this.dynamicRegistry.getEnabledSources();
  }

  async getCategories(): Promise<{ category: MCPServerCategory; count: number }[]> {
    const registry = await this.getRegistry();
    const counts = new Map<MCPServerCategory, number>();
    for (const server of registry) {
      counts.set(server.category, (counts.get(server.category) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getServerDetails(id: string): Promise<MCPStoreListing | null> {
    const registry = await this.getRegistry();
    return registry.find((s) => s.id === id) || null;
  }

  // ---------------------------------------------------------------------------
  // Server Installation
  // ---------------------------------------------------------------------------

  async installServer(request: MCPInstallRequest): Promise<MCPInstallResult> {
    const logs: string[] = [];
    const logStep = (msg: string) => {
      logs.push(msg);
      logger.info(msg);
    };

    try {
      // Validate source type
      if (!isValidServerSource(request.source)) {
        throw new Error(`Invalid server source: ${request.source}. Valid sources are: npm, pypi, git, local, remote, mcpb`);
      }

      logStep(`Installing MCP server from ${request.source}: ${request.packageId}`);

      // Ensure mcp-servers directory exists
      await fs.mkdir(this.mcpServersPath, { recursive: true });

      let config: MCPServerConfig;

      switch (request.source) {
        case 'npm':
          config = await this.installFromNpm(request, logStep);
          break;
        case 'pypi':
          config = await this.installFromPypi(request, logStep);
          break;
        case 'local':
          config = await this.installFromLocal(request, logStep);
          break;
        case 'git':
          config = await this.installFromGit(request, logStep);
          break;
        case 'mcpb':
          config = await this.installFromMCPB(request, logStep);
          break;
        default:
          throw new Error(`Unsupported source: ${request.source}`);
      }

      // Register the server
      this.serverManager.registerServer(config);
      logStep(`Server registered: ${config.id}`);

      // Auto-start if requested
      if (request.autoStart !== false) {
        logStep('Connecting to server...');
        await this.serverManager.connectServer(config.id);
        logStep('Server connected successfully');
      }

      return {
        success: true,
        server: config,
        logs,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logs.push(`Error: ${err.message}`);
      logger.error('Server installation failed', { error: err.message, request });
      return {
        success: false,
        error: err.message,
        logs,
      };
    }
  }

  private async installFromNpm(
    request: MCPInstallRequest,
    log: (msg: string) => void
  ): Promise<MCPServerConfig> {
    const packageName = request.packageId;
    log(`Installing npm package: ${packageName}`);

    // Check if npm is available
    try {
      await execAsync('npm --version');
    } catch {
      throw new Error('npm is not available. Please install Node.js.');
    }

    // Check from store listing for pre-configured transport
    const listing = await this.getServerDetails(packageName);
    let transport: MCPTransportConfig;

    if (listing?.transportTemplate) {
      transport = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', packageName],
        env: request.env,
        ...listing.transportTemplate,
      } as MCPTransportConfig;
    } else {
      // Default npx transport
      transport = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', packageName],
        env: request.env,
      };
    }

    // Apply transport overrides
    if (request.transportConfig) {
      transport = { ...transport, ...request.transportConfig } as MCPTransportConfig;
    }

    const serverId = this.generateServerId(packageName);
    const config: MCPServerConfig = {
      id: serverId,
      name: request.name || listing?.name || packageName.split('/').pop() || packageName,
      description: listing?.description,
      version: listing?.version || '1.0.0',
      author: listing?.author,
      icon: listing?.icon,
      category: request.category || listing?.category || 'other',
      source: 'npm',
      sourceId: packageName,
      transport,
      enabled: true,
      installedAt: Date.now(),
      tags: request.tags || listing?.tags || [],
      autoStart: request.autoStart !== false,
      priority: 0,
    };

    log(`Created server config: ${config.name}`);
    return config;
  }

  private async installFromPypi(
    request: MCPInstallRequest,
    log: (msg: string) => void
  ): Promise<MCPServerConfig> {
    const packageName = request.packageId;
    log(`Installing Python package: ${packageName}`);

    // Check if Python is available
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    try {
      await execAsync(`${pythonCmd} --version`);
    } catch {
      throw new Error('Python is not available. Please install Python 3.');
    }

    // Install package via uvx (preferred) or pip
    let command: string;
    let args: string[];

    try {
      await execAsync('uvx --version');
      command = 'uvx';
      args = [packageName];
      log('Using uvx to run package');
    } catch {
      // Fall back to pip + python
      log('Installing via pip...');
      await execAsync(`${pythonCmd} -m pip install ${packageName}`);
      command = pythonCmd;
      args = ['-m', packageName];
    }

    const baseTransport = request.transportConfig || {};
    const envFromConfig = 'env' in baseTransport ? (baseTransport as { env?: Record<string, string> }).env : {};
    const transport: MCPTransportConfig = {
      type: 'stdio' as const,
      command,
      args,
      env: { ...request.env, ...envFromConfig },
    };

    const serverId = this.generateServerId(packageName);
    const config: MCPServerConfig = {
      id: serverId,
      name: request.name || packageName,
      category: request.category || 'other',
      source: 'pypi',
      sourceId: packageName,
      transport,
      enabled: true,
      installedAt: Date.now(),
      tags: request.tags || [],
      autoStart: request.autoStart !== false,
      priority: 0,
    };

    log(`Created server config: ${config.name}`);
    return config;
  }

  private async installFromLocal(
    request: MCPInstallRequest,
    log: (msg: string) => void
  ): Promise<MCPServerConfig> {
    const localPath = request.packageId;
    log(`Installing from local path: ${localPath}`);

    // Verify path exists
    try {
      await fs.access(localPath);
    } catch {
      throw new Error(`Path not found: ${localPath}`);
    }

    const stat = await fs.stat(localPath);
    let transport: MCPTransportConfig;

    if (stat.isFile()) {
      // Determine how to run based on extension
      const ext = path.extname(localPath).toLowerCase();
      if (ext === '.js' || ext === '.mjs') {
        transport = {
          type: 'stdio',
          command: 'node',
          args: [localPath],
          env: request.env,
        };
      } else if (ext === '.py') {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        transport = {
          type: 'stdio',
          command: pythonCmd,
          args: [localPath],
          env: request.env,
        };
      } else if (ext === '.exe' || ext === '') {
        transport = {
          type: 'stdio',
          command: localPath,
          args: [],
          env: request.env,
        };
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }
    } else if (stat.isDirectory()) {
      // Check for package.json or setup.py
      const packageJsonPath = path.join(localPath, 'package.json');
      const setupPyPath = path.join(localPath, 'setup.py');
      const pyprojectPath = path.join(localPath, 'pyproject.toml');

      try {
        await fs.access(packageJsonPath);
        log('Found package.json, treating as Node.js project');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        const mainFile = packageJson.main || 'index.js';
        transport = {
          type: 'stdio',
          command: 'node',
          args: [path.join(localPath, mainFile)],
          env: request.env,
          cwd: localPath,
        };
      } catch {
        try {
          await fs.access(setupPyPath);
          log('Found setup.py, treating as Python project');
        } catch {
          await fs.access(pyprojectPath);
          log('Found pyproject.toml, treating as Python project');
        }
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        transport = {
          type: 'stdio',
          command: pythonCmd,
          args: ['-m', path.basename(localPath)],
          env: request.env,
          cwd: localPath,
        };
      }
    } else {
      throw new Error('Path must be a file or directory');
    }

    // Apply transport overrides
    if (request.transportConfig) {
      transport = { ...transport, ...request.transportConfig } as MCPTransportConfig;
    }

    const serverId = this.generateServerId(path.basename(localPath));
    const config: MCPServerConfig = {
      id: serverId,
      name: request.name || path.basename(localPath),
      category: request.category || 'other',
      source: 'local',
      sourceId: localPath,
      transport,
      enabled: true,
      installedAt: Date.now(),
      tags: request.tags || [],
      autoStart: request.autoStart !== false,
      priority: 0,
    };

    log(`Created server config: ${config.name}`);
    return config;
  }

  private async installFromGit(
    request: MCPInstallRequest,
    log: (msg: string) => void
  ): Promise<MCPServerConfig> {
    const gitUrl = request.packageId;
    log(`Cloning from git: ${gitUrl}`);

    // Check if git is available
    try {
      await execAsync('git --version');
    } catch {
      throw new Error('git is not available. Please install Git.');
    }

    // Generate local path for clone
    const repoName = gitUrl.split('/').pop()?.replace('.git', '') || 'mcp-server';
    const localPath = path.join(this.mcpServersPath, `git-${this.generateServerId(repoName)}`);

    // Clone repository with streaming output for real-time progress
    log(`Cloning to ${localPath}...`);
    const cloneResult = await spawnWithLogs('git', ['clone', '--progress', gitUrl, localPath], {}, log);
    
    if (cloneResult.code !== 0) {
      throw new Error(`Git clone failed with exit code ${cloneResult.code}`);
    }

    // Install dependencies and configure
    return this.installFromLocal(
      {
        ...request,
        source: 'local',
        packageId: localPath,
      },
      log
    );
  }

  /**
   * Install from MCPB bundle (MCP Bundle format)
   * 
   * MCPB bundles are zip archives containing:
   * - manifest.json: Bundle metadata and configuration
   * - Server code and dependencies
   * 
   * Based on MCP Bundle specification (2025-2026)
   */
  private async installFromMCPB(
    request: MCPInstallRequest,
    log: (msg: string) => void
  ): Promise<MCPServerConfig> {
    const bundlePath = request.packageId;
    log(`Installing MCPB bundle: ${bundlePath}`);

    // Verify bundle exists
    try {
      await fs.access(bundlePath);
    } catch {
      throw new Error(`Bundle not found: ${bundlePath}`);
    }

    // Create extraction directory
    const bundleName = path.basename(bundlePath, '.mcpb');
    const extractPath = path.join(this.mcpServersPath, `mcpb-${this.generateServerId(bundleName)}`);
    await fs.mkdir(extractPath, { recursive: true });

    log(`Extracting bundle to ${extractPath}...`);

    // Extract the bundle (it's a zip file)
    try {
      // Use unzip command for extraction
      const unzipCmd = process.platform === 'win32'
        ? `powershell -Command "Expand-Archive -Path '${bundlePath}' -DestinationPath '${extractPath}' -Force"`
        : `unzip -o "${bundlePath}" -d "${extractPath}"`;

      await execAsync(unzipCmd);
    } catch (err) {
      throw new Error(`Failed to extract bundle: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Read manifest.json
    const manifestPath = path.join(extractPath, 'manifest.json');
    let manifest: {
      name?: string;
      version?: string;
      description?: string;
      author?: string;
      homepage?: string;
      icon?: string;
      category?: MCPServerCategory;
      tags?: string[];
      server?: {
        runtime?: 'node' | 'python' | 'binary';
        entry_point?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
      };
      config_schema?: Record<string, unknown>;
    };

    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);
      log(`Manifest loaded: ${manifest.name || bundleName} v${manifest.version || '1.0.0'}`);
    } catch (err) {
      throw new Error(`Invalid or missing manifest.json: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Determine transport based on runtime
    let transport: MCPTransportConfig;
    const serverConfig = manifest.server || {};
    const runtime = serverConfig.runtime || 'node';

    switch (runtime) {
      case 'node': {
        const entryPoint = serverConfig.entry_point || 'index.js';
        transport = {
          type: 'stdio',
          command: 'node',
          args: [path.join(extractPath, entryPoint)],
          env: { ...request.env, ...serverConfig.env },
          cwd: extractPath,
        };

        // Install node dependencies if package.json exists
        const packageJsonPath = path.join(extractPath, 'package.json');
        try {
          await fs.access(packageJsonPath);
          log('Installing Node.js dependencies...');
          const npmResult = await spawnWithLogs('npm', ['install', '--production'], { cwd: extractPath }, log);
          if (npmResult.code !== 0) {
            log(`Warning: npm install exited with code ${npmResult.code}`);
          }
        } catch {
          // No package.json - continue anyway
        }
        break;
      }
      case 'python': {
        const entryPoint = serverConfig.entry_point || 'main.py';
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        transport = {
          type: 'stdio',
          command: pythonCmd,
          args: [path.join(extractPath, entryPoint)],
          env: { ...request.env, ...serverConfig.env },
          cwd: extractPath,
        };

        // Install python dependencies if requirements.txt exists
        const requirementsPath = path.join(extractPath, 'requirements.txt');
        try {
          await fs.access(requirementsPath);
          log('Installing Python dependencies...');
          const pipResult = await spawnWithLogs(pythonCmd, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: extractPath }, log);
          if (pipResult.code !== 0) {
            log(`Warning: pip install exited with code ${pipResult.code}`);
          }
        } catch {
          // No requirements.txt - continue anyway
        }
        break;
      }
      case 'binary': {
        const entryPoint = serverConfig.entry_point || (process.platform === 'win32' ? 'server.exe' : 'server');
        transport = {
          type: 'stdio',
          command: path.join(extractPath, entryPoint),
          args: serverConfig.args || [],
          env: { ...request.env, ...serverConfig.env },
          cwd: extractPath,
        };
        break;
      }
      default:
        throw new Error(`Unsupported runtime: ${runtime}`);
    }

    // Apply transport overrides
    if (request.transportConfig) {
      transport = { ...transport, ...request.transportConfig } as MCPTransportConfig;
    }

    const serverId = this.generateServerId(manifest.name || bundleName);
    const config: MCPServerConfig = {
      id: serverId,
      name: request.name || manifest.name || bundleName,
      description: manifest.description,
      version: manifest.version,
      author: manifest.author,
      homepage: manifest.homepage,
      icon: manifest.icon,
      category: request.category || manifest.category || 'other',
      source: 'mcpb',
      sourceId: bundlePath,
      transport,
      enabled: true,
      installedAt: Date.now(),
      tags: request.tags || manifest.tags || [],
      autoStart: request.autoStart !== false,
      priority: 0,
    };

    log(`Created server config: ${config.name}`);
    return config;
  }

  async uninstallServer(serverId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const config = this.serverManager.getServer(serverId);
      if (!config) {
        return { success: false, error: 'Server not found' };
      }

      // Disconnect and unregister
      await this.serverManager.disconnectServer(serverId);
      this.serverManager.unregisterServer(serverId);

      // Clean up git clones
      if (config.source === 'git' && config.sourceId) {
        const localPath = path.join(this.mcpServersPath, `git-${serverId}`);
        try {
          await fs.rm(localPath, { recursive: true, force: true });
        } catch (err) {
          logger.warn('Failed to clean up git clone', { path: localPath, error: err });
        }
      }

      // Clean up MCPB bundles
      if (config.source === 'mcpb') {
        // Find and clean up extracted bundle directory
        const mcpbDirs = await fs.readdir(this.mcpServersPath);
        for (const dir of mcpbDirs) {
          if (dir.startsWith('mcpb-') && dir.includes(serverId.split('-')[0])) {
            const extractPath = path.join(this.mcpServersPath, dir);
            try {
              await fs.rm(extractPath, { recursive: true, force: true });
              logger.info('Cleaned up MCPB bundle', { path: extractPath });
            } catch (err) {
              logger.warn('Failed to clean up MCPB bundle', { path: extractPath, error: err });
            }
          }
        }
      }

      logger.info('Server uninstalled', { serverId });
      return { success: true };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: err.message };
    }
  }

  // ---------------------------------------------------------------------------
  // Quick Install from Store
  // ---------------------------------------------------------------------------

  async installFromStore(
    listingId: string,
    options?: {
      env?: Record<string, string>;
      autoStart?: boolean;
    }
  ): Promise<MCPInstallResult> {
    const listing = await this.getServerDetails(listingId);
    if (!listing) {
      return {
        success: false,
        error: `Server not found in store: ${listingId}`,
      };
    }

    return this.installServer({
      source: listing.source,
      packageId: listing.installCommand,
      name: listing.name,
      category: listing.category,
      tags: listing.tags,
      env: options?.env,
      autoStart: options?.autoStart,
      transportConfig: listing.transportTemplate,
    });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private generateServerId(baseName: string): string {
    const sanitized = baseName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const timestamp = Date.now().toString(36);
    return `${sanitized}-${timestamp}`;
  }

  getInstalledServers(): MCPServerConfig[] {
    return this.serverManager.getAllServers();
  }

  isInstalled(listingId: string): boolean {
    const servers = this.serverManager.getAllServers();
    return servers.some(
      (s) => s.id === listingId || s.sourceId === listingId
    );
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let storeInstance: MCPStore | null = null;

export function getMCPStore(serverManager: MCPServerManager): MCPStore {
  if (!storeInstance) {
    storeInstance = new MCPStore(serverManager);
  }
  return storeInstance;
}

export function shutdownMCPStore(): void {
  storeInstance = null;
}
