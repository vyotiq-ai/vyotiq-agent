/**
 * Workspace File Watcher
 *
 * Native filesystem watcher using chokidar that monitors the active workspace
 * for external file changes (from terminal, git, other editors, etc.) and
 * forwards them to the renderer as `files:changed` events.
 *
 * This bridges the gap between IPC-only file change events (which only fire
 * when the app itself performs operations) and true real-time file monitoring.
 *
 * Architecture:
 * - Single watcher per workspace (swapped when workspace changes)
 * - Debounced events to avoid flooding during bulk operations (npm install, git checkout)
 * - Ignores common build output / dependency directories
 * - Coalesces rapid changes to the same file into a single event
 */

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { createLogger } from '../logger';

const logger = createLogger('WorkspaceWatcher');

/** Debounce window for coalescing rapid file changes (ms) */
const DEBOUNCE_MS = 200;

/** Maximum pending events before forcing a flush */
const MAX_PENDING_EVENTS = 500;

/** Directories to always ignore */
const IGNORED_DIRS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.git',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.cache/**',
  '**/__pycache__/**',
  '**/target/debug/**',
  '**/target/release/**',
  '**/target/incremental/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.pyc',
];

/** File change event type matching the existing `files:changed` IPC event shape */
interface FileChangeEvent {
  type: 'create' | 'write' | 'delete' | 'rename' | 'createDir';
  path: string;
  oldPath?: string;
}

/**
 * Manages native filesystem watching for the active workspace.
 * Emits `files:changed` events to the renderer via IPC.
 */
export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null;
  private currentPath: string | null = null;
  private mainWindow: BrowserWindow | null = null;
  private pendingEvents = new Map<string, FileChangeEvent>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;
  private additionalIgnored: string[] = [];

  /**
   * Set the main window reference for emitting IPC events.
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Set additional ignore patterns from user settings.
   */
  setIgnorePatterns(patterns: string[]): void {
    this.additionalIgnored = patterns;
    // If watcher is active, restart with new patterns
    if (this.currentPath) {
      const currentPath = this.currentPath;
      this.stop();
      this.start(currentPath);
    }
  }

  /**
   * Start watching a workspace directory.
   * Stops any existing watcher before starting a new one.
   */
  start(workspacePath: string): void {
    if (this.isDisposed) return;

    // Already watching this path
    if (this.currentPath === workspacePath && this.watcher) {
      return;
    }

    // Stop existing watcher
    this.stop();

    if (!workspacePath) return;

    this.currentPath = workspacePath;

    const ignored = [...IGNORED_DIRS, ...this.additionalIgnored];

    try {
      this.watcher = chokidarWatch(workspacePath, {
        ignored,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 150,
          pollInterval: 50,
        },
        depth: 20,
        // Don't follow symlinks to avoid infinite loops
        followSymlinks: false,
        // Use polling as fallback on systems with limited native watchers
        usePolling: false,
        // Increase the atomic write detection threshold on Windows
        atomic: process.platform === 'win32' ? 200 : 100,
      });

      this.watcher.on('add', (filePath: string) => this.handleEvent('create', filePath));
      this.watcher.on('change', (filePath: string) => this.handleEvent('write', filePath));
      this.watcher.on('unlink', (filePath: string) => this.handleEvent('delete', filePath));
      this.watcher.on('addDir', (dirPath: string) => this.handleEvent('createDir', dirPath));
      this.watcher.on('unlinkDir', (dirPath: string) => this.handleEvent('delete', dirPath));
      this.watcher.on('error', (error: Error) => {
        logger.warn('Watcher error', { error: error.message });
      });
      this.watcher.on('ready', () => {
        logger.info('Workspace watcher ready', { path: workspacePath });
      });
    } catch (err) {
      logger.error('Failed to start workspace watcher', {
        path: workspacePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Stop the current file watcher.
   */
  stop(): void {
    this.flushPending();

    if (this.watcher) {
      this.watcher.close().catch((err: Error) => {
        logger.debug('Error closing watcher', { error: err.message });
      });
      this.watcher = null;
    }

    this.currentPath = null;
  }

  /**
   * Dispose the watcher (for app shutdown).
   */
  dispose(): void {
    this.isDisposed = true;
    this.stop();
  }

  /**
   * Get the currently watched workspace path.
   */
  getWatchedPath(): string | null {
    return this.currentPath;
  }

  /**
   * Handle a raw filesystem event, debounce and coalesce.
   */
  private handleEvent(type: FileChangeEvent['type'], filePath: string): void {
    if (this.isDisposed || !this.mainWindow) return;

    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Coalesce: last event type wins for each path
    this.pendingEvents.set(normalizedPath, {
      type,
      path: normalizedPath,
    });

    // Force flush if too many pending events (bulk operations)
    if (this.pendingEvents.size >= MAX_PENDING_EVENTS) {
      this.flushPending();
      return;
    }

    // Debounce: schedule flush
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPending();
    }, DEBOUNCE_MS);
  }

  /**
   * Flush all pending events to the renderer.
   */
  private flushPending(): void {
    if (this.pendingEvents.size === 0) return;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    // Send each event individually to match the existing `files:changed` IPC protocol
    for (const event of this.pendingEvents.values()) {
      try {
        this.mainWindow.webContents.send('files:changed', event);
      } catch (err) {
        logger.debug('Failed to emit file change event', { 
          path: event.path, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    logger.debug('Flushed file change events', { count: this.pendingEvents.size });
    this.pendingEvents.clear();

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

/** Singleton instance */
export const workspaceWatcher = new WorkspaceWatcher();
