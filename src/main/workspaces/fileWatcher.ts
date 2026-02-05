import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { createLogger } from '../logger';

const logger = createLogger('FileWatcher');

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
];

// LSP-relevant file extensions
const LSP_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs',
  '.py', '.pyi', '.rs', '.go', '.java', '.cs', '.cpp', '.c', '.h',
  '.rb', '.php', '.swift', '.kt', '.scala', '.html', '.css', '.scss',
  '.json', '.yaml', '.yml', '.md', '.mdx',
]);

let watcher: FSWatcher | null = null;
let mainWindow: BrowserWindow | null = null;
let currentWorkspacePath: string | null = null;
let lspChangeHandler: ((filePath: string, changeType: 'create' | 'change' | 'delete') => void) | null = null;
let fileCacheChangeHandler: ((workspacePath: string, changeType: 'create' | 'write' | 'delete' | 'rename' | 'createDir', filePath: string, oldPath?: string) => void) | null = null;

const isLSPRelevantFile = (filePath: string): boolean => {
  const ext = path.extname(filePath).toLowerCase();
  return LSP_EXTENSIONS.has(ext);
};

const emitFileChange = (
  type: 'create' | 'write' | 'delete' | 'rename' | 'createDir',
  filePath: string,
  oldPath?: string
) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.webContents.send('files:changed', { type, path: filePath, oldPath });
  logger.debug('File change emitted', { type, path: filePath, oldPath });

  // Notify LSP of file changes for real-time diagnostics
  if (lspChangeHandler && isLSPRelevantFile(filePath)) {
    const lspChangeType = type === 'create' ? 'create' : type === 'delete' ? 'delete' : 'change';
    lspChangeHandler(filePath, lspChangeType);
  }

  // Notify file cache for instant tree updates
  if (fileCacheChangeHandler && currentWorkspacePath) {
    fileCacheChangeHandler(currentWorkspacePath, type, filePath, oldPath);
  }
};

export const initFileWatcher = (window: BrowserWindow): void => {
  mainWindow = window;
};

export const watchWorkspace = async (workspacePath: string): Promise<void> => {
  if (currentWorkspacePath === workspacePath && watcher) return;

  await stopWatching();
  currentWorkspacePath = workspacePath;

  logger.info('Starting file watcher', { workspacePath });

  watcher = chokidar.watch(workspacePath, {
    ignored: IGNORED_PATTERNS,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    depth: undefined,
    // Use polling on Windows for better EPERM handling
    usePolling: process.platform === 'win32' ? false : false,
    // Atomic writes can cause temporary permission issues
    atomic: true,
  });

  watcher
    .on('add', (filePath) => emitFileChange('create', path.resolve(filePath)))
    .on('change', (filePath) => emitFileChange('write', path.resolve(filePath)))
    .on('unlink', (filePath) => emitFileChange('delete', path.resolve(filePath)))
    .on('addDir', (filePath) => emitFileChange('createDir', path.resolve(filePath)))
    .on('unlinkDir', (filePath) => emitFileChange('delete', path.resolve(filePath)))
    .on('error', (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // EPERM errors are common on Windows when files are temporarily locked
      // (e.g., during antivirus scans, or when editors hold locks)
      // Log at debug level for transient permission errors
      if (errorMessage.includes('EPERM') || errorMessage.includes('EACCES')) {
        logger.debug('File watcher permission error (transient)', { 
          error: errorMessage,
          info: 'This is usually caused by temporary file locks and can be safely ignored',
        });
      } else if (errorMessage.includes('ENOSPC')) {
        logger.warn('File watcher limit reached', { 
          error: errorMessage,
          suggestion: 'Consider increasing inotify watchers limit on Linux',
        });
      } else {
        logger.error('File watcher error', { error: errorMessage });
      }
    })
    .on('ready', () => logger.info('File watcher ready', { workspacePath }));
};

export const stopWatching = async (): Promise<void> => {
  if (watcher) {
    await watcher.close();
    watcher = null;
    currentWorkspacePath = null;
    logger.info('File watcher stopped');
  }
};

export const getFileWatcher = (): FSWatcher | null => watcher;

export const getCurrentWorkspacePath = (): string | null => currentWorkspacePath;

/**
 * Register a handler for LSP-relevant file changes.
 * This enables real-time LSP updates when files change on disk.
 */
export const setLSPChangeHandler = (
  handler: ((filePath: string, changeType: 'create' | 'change' | 'delete') => void) | null
): void => {
  lspChangeHandler = handler;
  logger.debug('LSP change handler registered', { hasHandler: !!handler });
};

/**
 * Register a handler for file cache updates.
 * This enables instant file tree updates when files change.
 */
export const setFileCacheChangeHandler = (
  handler: ((workspacePath: string, changeType: 'create' | 'write' | 'delete' | 'rename' | 'createDir', filePath: string, oldPath?: string) => void) | null
): void => {
  fileCacheChangeHandler = handler;
  logger.debug('File cache change handler registered', { hasHandler: !!handler });
};
