/**
 * Multi-Workspace File Watcher
 * 
 * Manages file watching across multiple workspaces concurrently.
 * Features:
 * - Per-workspace file watchers with isolation
 * - Efficient event batching per workspace
 * - Memory-optimized watcher management
 * - Automatic cleanup on workspace removal
 */

import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { EventEmitter } from 'node:events';
import { createLogger } from '../logger';

const logger = createLogger('MultiWorkspaceFileWatcher');

// =============================================================================
// Constants
// =============================================================================

const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.cache/**',
  '**/__pycache__/**',
  '**/.vite/**',
  '**/out/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.nyc_output/**',
];

const LSP_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs',
  '.py', '.pyi', '.rs', '.go', '.java', '.cs', '.cpp', '.c', '.h',
  '.rb', '.php', '.swift', '.kt', '.scala', '.html', '.css', '.scss',
  '.json', '.yaml', '.yml', '.md', '.mdx',
]);

// =============================================================================
// Types
// =============================================================================

export interface WorkspaceWatcherState {
  workspaceId: string;
  workspacePath: string;
  watcher: FSWatcher | null;
  isReady: boolean;
  fileCount: number;
  lastEventTime: number;
  pendingEvents: Map<string, { type: FileChangeType; time: number }>;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

export type FileChangeType = 'create' | 'change' | 'delete' | 'createDir';

export interface FileChangeEvent {
  workspaceId: string;
  workspacePath: string;
  filePath: string;
  changeType: FileChangeType;
  isLSPRelevant: boolean;
}

export interface MultiWatcherConfig {
  /** Debounce time for file changes (ms) */
  debounceMs: number;
  /** Maximum pending events before force flush */
  maxPendingEvents: number;
  /** Watch depth limit (undefined = unlimited) */
  watchDepth?: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: MultiWatcherConfig = {
  debounceMs: 100,
  maxPendingEvents: 100,
  watchDepth: undefined,
};

// =============================================================================
// Multi-Workspace File Watcher
// =============================================================================

export class MultiWorkspaceFileWatcher extends EventEmitter {
  private readonly config: MultiWatcherConfig;
  private readonly watchers = new Map<string, WorkspaceWatcherState>();
  private mainWindow: BrowserWindow | null = null;
  
  // Global handlers (for backward compatibility)
  private lspChangeHandler: ((filePath: string, changeType: 'create' | 'change' | 'delete') => void) | null = null;

  constructor(config: Partial<MultiWatcherConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize with the main window
   */
  init(window: BrowserWindow): void {
    this.mainWindow = window;
    logger.info('MultiWorkspaceFileWatcher initialized');
  }

  // ===========================================================================
  // Workspace Management
  // ===========================================================================

  /**
   * Start watching a workspace
   */
  async watchWorkspace(workspaceId: string, workspacePath: string): Promise<void> {
    // Check if already watching this workspace
    const existing = this.watchers.get(workspaceId);
    if (existing && existing.workspacePath === workspacePath) {
      logger.debug('Already watching workspace', { workspaceId, workspacePath });
      return;
    }

    // Stop existing watcher if path changed
    if (existing) {
      await this.stopWatchingWorkspace(workspaceId);
    }

    logger.info('Starting file watcher for workspace', { workspaceId, workspacePath });

    const state: WorkspaceWatcherState = {
      workspaceId,
      workspacePath,
      watcher: null,
      isReady: false,
      fileCount: 0,
      lastEventTime: Date.now(),
      pendingEvents: new Map(),
      flushTimer: null,
    };

    // Create watcher
    const watcher = chokidar.watch(workspacePath, {
      ignored: IGNORED_PATTERNS,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      depth: this.config.watchDepth,
    });

    state.watcher = watcher;

    // Setup event handlers
    watcher
      .on('add', (filePath) => this.handleFileEvent(state, 'create', path.resolve(filePath)))
      .on('change', (filePath) => this.handleFileEvent(state, 'change', path.resolve(filePath)))
      .on('unlink', (filePath) => this.handleFileEvent(state, 'delete', path.resolve(filePath)))
      .on('addDir', (filePath) => this.handleFileEvent(state, 'createDir', path.resolve(filePath)))
      .on('unlinkDir', (filePath) => this.handleFileEvent(state, 'delete', path.resolve(filePath)))
      .on('error', (error) => {
        logger.error('File watcher error', {
          workspaceId,
          error: error instanceof Error ? error.message : String(error),
        });
        this.emit('error', { workspaceId, error });
      })
      .on('ready', () => {
        state.isReady = true;
        logger.info('File watcher ready', { workspaceId, workspacePath });
        this.emit('ready', { workspaceId, workspacePath });
      });

    this.watchers.set(workspaceId, state);
  }

  /**
   * Stop watching a workspace
   */
  async stopWatchingWorkspace(workspaceId: string): Promise<void> {
    const state = this.watchers.get(workspaceId);
    if (!state) return;

    // Flush pending events
    this.flushPendingEvents(state);

    // Clear flush timer
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
    }

    // Close watcher
    if (state.watcher) {
      try {
        await state.watcher.close();
      } catch (error) {
        logger.warn('Error closing file watcher', {
          workspaceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.watchers.delete(workspaceId);
    logger.info('Stopped watching workspace', { workspaceId });
  }

  /**
   * Stop watching all workspaces
   */
  async stopAll(): Promise<void> {
    const workspaceIds = Array.from(this.watchers.keys());
    await Promise.all(workspaceIds.map(id => this.stopWatchingWorkspace(id)));
    logger.info('All file watchers stopped');
  }

  /**
   * Check if a workspace is being watched
   */
  isWatching(workspaceId: string): boolean {
    return this.watchers.has(workspaceId);
  }

  /**
   * Get watched workspace paths
   */
  getWatchedWorkspaces(): Array<{ workspaceId: string; workspacePath: string; isReady: boolean }> {
    return Array.from(this.watchers.values()).map(state => ({
      workspaceId: state.workspaceId,
      workspacePath: state.workspacePath,
      isReady: state.isReady,
    }));
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Handle a file event with debouncing
   */
  private handleFileEvent(state: WorkspaceWatcherState, type: FileChangeType, filePath: string): void {
    state.lastEventTime = Date.now();

    // Debounce events for the same file
    const existing = state.pendingEvents.get(filePath);
    if (existing) {
      // Keep the most significant change type
      if (type === 'delete' || (type === 'create' && existing.type !== 'delete')) {
        existing.type = type;
      }
      existing.time = Date.now();
    } else {
      state.pendingEvents.set(filePath, { type, time: Date.now() });
    }

    // Schedule flush
    this.scheduleFlush(state);

    // Force flush if too many pending events
    if (state.pendingEvents.size >= this.config.maxPendingEvents) {
      this.flushPendingEvents(state);
    }
  }

  /**
   * Schedule a debounced flush
   */
  private scheduleFlush(state: WorkspaceWatcherState): void {
    if (state.flushTimer) return;

    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      this.flushPendingEvents(state);
    }, this.config.debounceMs);
  }

  /**
   * Flush pending events for a workspace
   */
  private flushPendingEvents(state: WorkspaceWatcherState): void {
    if (state.pendingEvents.size === 0) return;

    const events = Array.from(state.pendingEvents.entries());
    state.pendingEvents.clear();

    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }

    // Process events
    for (const [filePath, { type }] of events) {
      this.processFileEvent(state, type, filePath);
    }

    state.fileCount += events.length;
  }

  /**
   * Process a single file event
   */
  private processFileEvent(state: WorkspaceWatcherState, type: FileChangeType, filePath: string): void {
    const isLSPRelevant = this.isLSPRelevantFile(filePath);

    const event: FileChangeEvent = {
      workspaceId: state.workspaceId,
      workspacePath: state.workspacePath,
      filePath,
      changeType: type,
      isLSPRelevant,
    };

    // Emit to listeners
    this.emit('change', event);

    // Send to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('files:changed', {
        type,
        path: filePath,
        workspaceId: state.workspaceId,
      });
    }

    // Call legacy handlers
    if (isLSPRelevant && this.lspChangeHandler) {
      const lspType = type === 'create' ? 'create' : type === 'delete' ? 'delete' : 'change';
      this.lspChangeHandler(filePath, lspType);
    }

    logger.debug('File change processed', {
      workspaceId: state.workspaceId,
      type,
      path: filePath,
      isLSPRelevant,
    });
  }

  // ===========================================================================
  // Handler Registration (Backward Compatibility)
  // ===========================================================================

  /**
   * Register LSP change handler
   */
  setLSPChangeHandler(
    handler: ((filePath: string, changeType: 'create' | 'change' | 'delete') => void) | null
  ): void {
    this.lspChangeHandler = handler;
    logger.debug('LSP change handler registered', { hasHandler: !!handler });
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private isLSPRelevantFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return LSP_EXTENSIONS.has(ext);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalWatcher: MultiWorkspaceFileWatcher | null = null;

/**
 * Get the global multi-workspace file watcher
 */
export function getMultiWorkspaceFileWatcher(): MultiWorkspaceFileWatcher {
  if (!globalWatcher) {
    globalWatcher = new MultiWorkspaceFileWatcher();
  }
  return globalWatcher;
}

/**
 * Initialize the global multi-workspace file watcher
 */
export function initMultiWorkspaceFileWatcher(
  window: BrowserWindow,
  config?: Partial<MultiWatcherConfig>
): MultiWorkspaceFileWatcher {
  if (!globalWatcher) {
    globalWatcher = new MultiWorkspaceFileWatcher(config);
  }
  globalWatcher.init(window);
  return globalWatcher;
}

/**
 * Dispose the global multi-workspace file watcher
 */
export async function disposeMultiWorkspaceFileWatcher(): Promise<void> {
  if (globalWatcher) {
    await globalWatcher.stopAll();
    globalWatcher = null;
  }
}

export default MultiWorkspaceFileWatcher;
