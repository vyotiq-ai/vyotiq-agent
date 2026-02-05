/**
 * Workspace File Cache
 * 
 * High-performance caching layer for workspace file trees.
 * Enables instant file tree loading by caching directory structures
 * and using incremental updates via file watcher events.
 * 
 * Features:
 * - Instant file tree retrieval from cache
 * - Incremental updates from file watcher events
 * - Memory-efficient tree representation
 * - Per-workspace isolated caches
 * - Background pre-warming for workspace tabs
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger';

const logger = createLogger('WorkspaceFileCache');

// =============================================================================
// Types
// =============================================================================

export interface CachedFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: number;
  language?: string;
  children?: CachedFileNode[];
}

export interface WorkspaceCache {
  workspacePath: string;
  rootNode: CachedFileNode | null;
  lastUpdated: number;
  isComplete: boolean;
  fileCount: number;
  directoryCount: number;
}

export interface CacheConfig {
  /** Maximum cached workspaces (LRU eviction) */
  maxCachedWorkspaces: number;
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs: number;
  /** Maximum depth for recursive loading */
  maxDepth: number;
  /** Directories to ignore */
  ignoreDirs: Set<string>;
  /** Show hidden files */
  showHidden: boolean;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: CacheConfig = {
  maxCachedWorkspaces: 10,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  maxDepth: 20,
  ignoreDirs: new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '.cache',
    '__pycache__', '.vite', 'out', '.turbo', 'coverage', '.nyc_output',
    'vendor', 'target', '.gradle', '.idea', '.vscode', '.angular',
  ]),
  showHidden: false,
};

// =============================================================================
// Language Detection
// =============================================================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.mts': 'typescript', '.cts': 'typescript',
  '.mjs': 'javascript', '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown', '.mdx': 'markdown',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.htm': 'html',
  '.xml': 'xml', '.svg': 'xml',
  '.yml': 'yaml', '.yaml': 'yaml',
  '.py': 'python', '.pyi': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sql': 'sql',
  '.sh': 'shellscript', '.bash': 'shellscript',
  '.ps1': 'powershell',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

function getLanguage(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext];
}

// =============================================================================
// Workspace File Cache
// =============================================================================

export class WorkspaceFileCache {
  private config: CacheConfig;
  private caches = new Map<string, WorkspaceCache>();
  private accessOrder: string[] = []; // For LRU tracking
  private pendingUpdates = new Map<string, Array<{ type: string; path: string }>>();
  private updateTimers = new Map<string, NodeJS.Timeout>();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get file tree from cache or load it
   * Returns immediately from cache if available
   */
  async getFileTree(
    workspacePath: string,
    options?: { forceRefresh?: boolean; showHidden?: boolean; maxDepth?: number }
  ): Promise<CachedFileNode | null> {
    const normalizedPath = path.normalize(workspacePath);
    const showHidden = options?.showHidden ?? this.config.showHidden;
    const maxDepth = options?.maxDepth ?? this.config.maxDepth;

    // Check cache first
    const cached = this.caches.get(normalizedPath);
    if (cached && !options?.forceRefresh) {
      const age = Date.now() - cached.lastUpdated;
      if (age < this.config.cacheTtlMs && cached.isComplete) {
        this.updateAccessOrder(normalizedPath);
        logger.debug('File tree served from cache', {
          workspace: normalizedPath,
          fileCount: cached.fileCount,
          age: Math.round(age / 1000),
        });
        return cached.rootNode;
      }
    }

    // Load and cache
    return this.loadAndCacheFileTree(normalizedPath, showHidden, maxDepth);
  }

  /**
   * Load file tree and cache it
   */
  private async loadAndCacheFileTree(
    workspacePath: string,
    showHidden: boolean,
    maxDepth: number
  ): Promise<CachedFileNode | null> {
    const startTime = Date.now();

    try {
      const stats = { fileCount: 0, directoryCount: 0 };
      const rootNode = await this.scanDirectory(workspacePath, 0, maxDepth, showHidden, stats);

      if (!rootNode) {
        return null;
      }

      // Cache the result
      const cache: WorkspaceCache = {
        workspacePath,
        rootNode,
        lastUpdated: Date.now(),
        isComplete: true,
        fileCount: stats.fileCount,
        directoryCount: stats.directoryCount,
      };

      this.caches.set(workspacePath, cache);
      this.updateAccessOrder(workspacePath);
      this.evictIfNeeded();

      logger.info('File tree loaded and cached', {
        workspace: workspacePath,
        fileCount: stats.fileCount,
        directoryCount: stats.directoryCount,
        durationMs: Date.now() - startTime,
      });

      return rootNode;
    } catch (error) {
      logger.error('Failed to load file tree', {
        workspace: workspacePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Scan directory recursively
   */
  private async scanDirectory(
    dirPath: string,
    depth: number,
    maxDepth: number,
    showHidden: boolean,
    stats: { fileCount: number; directoryCount: number }
  ): Promise<CachedFileNode | null> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const children: CachedFileNode[] = [];

      // Process entries in parallel for speed
      const processedEntries = await Promise.all(
        entries.map(async (entry) => {
          // Skip hidden files unless enabled
          if (!showHidden && entry.name.startsWith('.')) {
            return null;
          }

          // Skip ignored directories
          if (entry.isDirectory() && this.config.ignoreDirs.has(entry.name)) {
            return null;
          }

          const fullPath = path.join(dirPath, entry.name);
          const isDirectory = entry.isDirectory();

          const node: CachedFileNode = {
            name: entry.name,
            path: fullPath,
            type: isDirectory ? 'directory' : 'file',
          };

          if (isDirectory) {
            stats.directoryCount++;
            // Recursively scan subdirectories
            if (depth < maxDepth) {
              const result = await this.scanDirectory(
                fullPath,
                depth + 1,
                maxDepth,
                showHidden,
                stats
              );
              if (result?.children) {
                node.children = result.children;
              } else {
                node.children = [];
              }
            } else {
              node.children = []; // Don't scan deeper
            }
          } else {
            stats.fileCount++;
            node.language = getLanguage(fullPath);
            // Optionally get file stats (can be slow for large directories)
            // Disabled by default for performance
          }

          return node;
        })
      );

      // Filter nulls and sort
      for (const entry of processedEntries) {
        if (entry) {
          children.push(entry);
        }
      }

      // Sort: directories first, then alphabetically
      children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      return {
        name: path.basename(dirPath),
        path: dirPath,
        type: 'directory',
        children,
      };
    } catch (error) {
      logger.debug('Cannot read directory', {
        path: dirPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Handle file change event from file watcher
   * Updates cache incrementally
   */
  handleFileChange(
    workspacePath: string,
    changeType: 'create' | 'write' | 'delete' | 'rename' | 'createDir',
    filePath: string,
    _oldPath?: string
  ): void {
    const normalizedWorkspace = path.normalize(workspacePath);
    const cache = this.caches.get(normalizedWorkspace);
    
    if (!cache || !cache.rootNode) {
      return;
    }

    // Queue update for debounced processing
    const pending = this.pendingUpdates.get(normalizedWorkspace) ?? [];
    pending.push({ type: changeType, path: filePath });
    this.pendingUpdates.set(normalizedWorkspace, pending);

    // Debounce updates
    const existingTimer = this.updateTimers.get(normalizedWorkspace);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.processPendingUpdates(normalizedWorkspace);
    }, 100); // 100ms debounce

    this.updateTimers.set(normalizedWorkspace, timer);
  }

  /**
   * Process pending file updates
   */
  private processPendingUpdates(workspacePath: string): void {
    const updates = this.pendingUpdates.get(workspacePath) ?? [];
    this.pendingUpdates.delete(workspacePath);
    this.updateTimers.delete(workspacePath);

    if (updates.length === 0) {
      return;
    }

    const cache = this.caches.get(workspacePath);
    if (!cache || !cache.rootNode) {
      return;
    }

    // Apply updates to cache
    for (const update of updates) {
      this.applyUpdate(cache.rootNode, update.type, update.path, workspacePath);
    }

    cache.lastUpdated = Date.now();

    logger.debug('Applied incremental cache updates', {
      workspace: workspacePath,
      updateCount: updates.length,
    });
  }

  /**
   * Apply a single update to the cached tree
   */
  private applyUpdate(
    root: CachedFileNode,
    changeType: string,
    filePath: string,
    workspacePath: string
  ): void {
    const relativePath = path.relative(workspacePath, filePath);
    const parts = relativePath.split(path.sep).filter(p => p.length > 0);

    if (parts.length === 0) {
      return;
    }

    const fileName = parts[parts.length - 1];
    const parentParts = parts.slice(0, -1);

    // Find parent node
    let current = root;
    for (const part of parentParts) {
      if (!current.children) {
        return; // Parent doesn't exist in cache
      }
      const child = current.children.find(c => c.name === part);
      if (!child || child.type !== 'directory') {
        return; // Path not found
      }
      current = child;
    }

    if (!current.children) {
      current.children = [];
    }

    switch (changeType) {
      case 'create':
      case 'write': {
        // Add or update file
        const existingIndex = current.children.findIndex(c => c.name === fileName);
        const newNode: CachedFileNode = {
          name: fileName,
          path: filePath,
          type: 'file',
          language: getLanguage(filePath),
        };
        if (existingIndex >= 0) {
          current.children[existingIndex] = newNode;
        } else {
          current.children.push(newNode);
          this.sortChildren(current.children);
        }
        break;
      }
      case 'createDir': {
        // Add directory
        const existingIndex = current.children.findIndex(c => c.name === fileName);
        if (existingIndex < 0) {
          current.children.push({
            name: fileName,
            path: filePath,
            type: 'directory',
            children: [],
          });
          this.sortChildren(current.children);
        }
        break;
      }
      case 'delete': {
        // Remove file or directory
        const index = current.children.findIndex(c => c.name === fileName);
        if (index >= 0) {
          current.children.splice(index, 1);
        }
        break;
      }
      case 'rename': {
        // Rename handled as delete + create
        const index = current.children.findIndex(c => c.name === fileName);
        if (index >= 0) {
          current.children.splice(index, 1);
        }
        break;
      }
    }
  }

  /**
   * Sort children array (directories first, then alphabetically)
   */
  private sortChildren(children: CachedFileNode[]): void {
    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  /**
   * Pre-warm cache for a workspace (called when tab is opened)
   */
  async prewarmCache(workspacePath: string): Promise<void> {
    const normalizedPath = path.normalize(workspacePath);
    
    // Only prewarm if not already cached
    if (!this.caches.has(normalizedPath)) {
      logger.debug('Pre-warming cache for workspace', { workspace: normalizedPath });
      await this.getFileTree(normalizedPath);
    }
  }

  /**
   * Invalidate cache for a workspace
   */
  invalidateCache(workspacePath: string): void {
    const normalizedPath = path.normalize(workspacePath);
    this.caches.delete(normalizedPath);
    
    const timer = this.updateTimers.get(normalizedPath);
    if (timer) {
      clearTimeout(timer);
      this.updateTimers.delete(normalizedPath);
    }
    
    this.pendingUpdates.delete(normalizedPath);
    
    // Remove from access order
    const index = this.accessOrder.indexOf(normalizedPath);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }

    logger.debug('Cache invalidated', { workspace: normalizedPath });
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(workspacePath: string): void {
    const index = this.accessOrder.indexOf(workspacePath);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(workspacePath);
  }

  /**
   * Evict least recently used caches if over limit
   */
  private evictIfNeeded(): void {
    while (this.caches.size > this.config.maxCachedWorkspaces && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.caches.delete(oldest);
        logger.debug('Evicted cache (LRU)', { workspace: oldest });
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    cachedWorkspaces: number;
    totalFiles: number;
    totalDirectories: number;
  } {
    let totalFiles = 0;
    let totalDirectories = 0;

    for (const cache of this.caches.values()) {
      totalFiles += cache.fileCount;
      totalDirectories += cache.directoryCount;
    }

    return {
      cachedWorkspaces: this.caches.size,
      totalFiles,
      totalDirectories,
    };
  }

  /**
   * Check if workspace has valid cache
   */
  hasValidCache(workspacePath: string): boolean {
    const cache = this.caches.get(path.normalize(workspacePath));
    if (!cache) return false;
    
    const age = Date.now() - cache.lastUpdated;
    return age < this.config.cacheTtlMs && cache.isComplete;
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.caches.clear();
    this.accessOrder = [];
    
    for (const timer of this.updateTimers.values()) {
      clearTimeout(timer);
    }
    this.updateTimers.clear();
    this.pendingUpdates.clear();

    logger.info('All caches cleared');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let cacheInstance: WorkspaceFileCache | null = null;

/**
 * Get the singleton cache instance
 */
export function getWorkspaceFileCache(config?: Partial<CacheConfig>): WorkspaceFileCache {
  if (!cacheInstance) {
    cacheInstance = new WorkspaceFileCache(config);
  }
  return cacheInstance;
}

/**
 * Reset the cache (for testing)
 */
export function resetWorkspaceFileCache(): void {
  if (cacheInstance) {
    cacheInstance.clear();
    cacheInstance = null;
  }
}

export default WorkspaceFileCache;
