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

const isLSPRelevantFile = (filePath: string): boolean => {
  const ext = path.extname(filePath).toLowerCase();
  return LSP_EXTENSIONS.has(ext);
};

const emitFileChange = (
  type: 'create' | 'write' | 'delete' | 'rename' | 'createDir',
  filePath: string
) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  mainWindow.webContents.send('files:changed', { type, path: filePath });
  logger.debug('File change emitted', { type, path: filePath });
  
  // Notify LSP of file changes for real-time diagnostics
  if (lspChangeHandler && isLSPRelevantFile(filePath)) {
    const lspChangeType = type === 'create' ? 'create' : type === 'delete' ? 'delete' : 'change';
    lspChangeHandler(filePath, lspChangeType);
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
  });
  
  watcher
    .on('add', (filePath) => emitFileChange('create', path.resolve(filePath)))
    .on('change', (filePath) => emitFileChange('write', path.resolve(filePath)))
    .on('unlink', (filePath) => emitFileChange('delete', path.resolve(filePath)))
    .on('addDir', (filePath) => emitFileChange('createDir', path.resolve(filePath)))
    .on('unlinkDir', (filePath) => emitFileChange('delete', path.resolve(filePath)))
    .on('error', (error) => logger.error('File watcher error', { error: error instanceof Error ? error.message : String(error) }))
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
