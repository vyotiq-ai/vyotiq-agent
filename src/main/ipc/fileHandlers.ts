/**
 * File Operations IPC Handlers
 * 
 * Handles all file-related IPC operations including:
 * - File CRUD operations
 * - Directory listing
 * - File selection dialogs
 * - File tree management
 */

import { ipcMain, dialog, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { minimatch } from 'minimatch';
import { guessMimeType } from '../utils/mime';
import { resolvePath } from '../utils/fileSystem';
import { createLogger } from '../logger';
import type { AttachmentPayload } from '../../shared/types';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Files');

/**
 * Get the language identifier from a file path
 */
function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'javascript';
    case '.json':
      return 'json';
    case '.md':
    case '.mdx':
      return 'markdown';
    case '.css':
      return 'css';
    case '.html':
    case '.htm':
      return 'html';
    case '.yml':
    case '.yaml':
      return 'yaml';
    default:
      return ext.replace(/^\./, '') || 'text';
  }
}

/**
 * Check if a file path matches an ignore pattern
 */
function matchesIgnorePattern(filePath: string, patterns: string[]): boolean {
  return patterns.some(pattern => minimatch(filePath, pattern, { dot: true }));
}

// Notify diagnostics service when needed
let diagnosticsNotifier: ((filePath: string, changeType: 'create' | 'change' | 'delete') => void) | null = null;

export function setDiagnosticsNotifier(notifier: (filePath: string, changeType: 'create' | 'change' | 'delete') => void): void {
  diagnosticsNotifier = notifier;
}

export function registerFileHandlers(context: IpcContext): void {
  const { getMainWindow, getActiveWorkspacePath } = context;

  /**
   * Emit file change event to renderer for real-time file tree updates
   */
  const emitFileChange = (type: 'create' | 'write' | 'delete' | 'rename' | 'createDir', filePath: string, oldPath?: string) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;
    
    mainWindow.webContents.send('files:changed', {
      type,
      path: filePath,
      ...(oldPath && { oldPath }),
    });
    
    logger.debug('File change event emitted', { type, path: filePath, oldPath });
  };

  // ==========================================================================
  // File Selection
  // ==========================================================================

  ipcMain.handle('files:select', async (_event, options?: { filters?: Electron.FileFilter[] }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters,
    });
    if (result.canceled) return [];
    const files: AttachmentPayload[] = await Promise.all(
      result.filePaths.map(async (filePath) => {
        const buffer = await fs.readFile(filePath);
        return {
          id: randomUUID(),
          name: path.basename(filePath),
          path: filePath,
          size: buffer.byteLength,
          mimeType: guessMimeType(filePath),
          encoding: 'base64',
          content: buffer.toString('base64'),
        };
      }),
    );
    return files;
  });

  ipcMain.handle('files:read', async (_event, filePaths: string[]) => {
    const files: AttachmentPayload[] = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const mimeType = guessMimeType(filePath);
          const isTextFile = mimeType.startsWith('text/') || 
            ['application/json', 'application/javascript', 'application/typescript', 
             'application/xml', 'application/yaml', 'application/x-yaml'].includes(mimeType) ||
            /\.(ts|tsx|js|jsx|json|md|mdx|txt|css|scss|less|html|htm|xml|yaml|yml|toml|ini|cfg|conf|sh|bash|zsh|fish|ps1|bat|cmd|py|rb|go|rs|java|kt|swift|c|cpp|h|hpp|cs|php|sql|graphql|vue|svelte|astro)$/i.test(filePath);
          
          if (isTextFile) {
            // Read text files directly as UTF-8 for proper encoding
            const content = await fs.readFile(filePath, 'utf-8');
            return {
              id: randomUUID(),
              name: path.basename(filePath),
              path: filePath,
              size: Buffer.byteLength(content, 'utf-8'),
              mimeType,
              encoding: 'utf-8' as const,
              content,
            };
          } else {
            // Read binary files as base64
            const buffer = await fs.readFile(filePath);
            return {
              id: randomUUID(),
              name: path.basename(filePath),
              path: filePath,
              size: buffer.byteLength,
              mimeType,
              encoding: 'base64' as const,
              content: buffer.toString('base64'),
            };
          }
        } catch (error) {
          logger.error('Failed to read file', { path: filePath, error });
          return {
            id: randomUUID(),
            name: path.basename(filePath),
            path: filePath,
            size: 0,
            mimeType: 'text/plain',
            encoding: 'utf-8' as const,
            content: '',
            error: (error as Error).message,
          };
        }
      }),
    );
    return files;
  });

  ipcMain.handle('files:open', async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('files:reveal', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
    return { success: true };
  });

  ipcMain.handle('files:saveAs', async (_event, content: string, options?: {
    defaultPath?: string;
    filters?: Electron.FileFilter[];
    title?: string;
  }) => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return { success: false, error: 'No main window available' };

    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: options?.title ?? 'Save File',
        defaultPath: options?.defaultPath,
        filters: options?.filters ?? [
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Save cancelled' };
      }

      await fs.writeFile(result.filePath, content, 'utf-8');
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // File CRUD Operations
  // ==========================================================================

  ipcMain.handle('files:create', async (_event, filePath: string, content: string = '') => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : resolvePath(filePath, getActiveWorkspacePath() ?? undefined);

      try {
        await fs.access(resolvedPath);
        return { success: false, error: `File already exists: ${filePath}` };
      } catch {
        // File doesn't exist, we can create it
      }

      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(resolvedPath, content, 'utf-8');
      const stats = await fs.stat(resolvedPath);

      logger.info('File created', { path: resolvedPath });
      emitFileChange('create', resolvedPath);
      diagnosticsNotifier?.(resolvedPath, 'create');

      return {
        success: true,
        path: resolvedPath,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        language: languageFromPath(resolvedPath),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create file', { error: err.message, filePath });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('files:write', async (_event, filePath: string, content: string = '') => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : resolvePath(filePath, getActiveWorkspacePath() ?? undefined);

      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(resolvedPath, content, 'utf-8');
      const stats = await fs.stat(resolvedPath);

      logger.info('File written', { path: resolvedPath });
      emitFileChange('write', resolvedPath);
      diagnosticsNotifier?.(resolvedPath, 'change');

      return {
        success: true,
        path: resolvedPath,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        language: languageFromPath(resolvedPath),
      };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to write file', { error: err.message, filePath });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('files:createDir', async (_event, dirPath: string) => {
    try {
      const resolvedPath = path.isAbsolute(dirPath)
        ? dirPath
        : resolvePath(dirPath, getActiveWorkspacePath() ?? undefined);

      await fs.mkdir(resolvedPath, { recursive: true });
      logger.info('Directory created', { path: resolvedPath });
      emitFileChange('createDir', resolvedPath);

      return { success: true, path: resolvedPath };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create directory', { error: err.message, dirPath });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('files:delete', async (_event, filePath: string) => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : resolvePath(filePath, getActiveWorkspacePath() ?? undefined);

      const stats = await fs.stat(resolvedPath);

      if (stats.isDirectory()) {
        await fs.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.unlink(resolvedPath);
      }

      logger.info('File/directory deleted', { path: resolvedPath, isDirectory: stats.isDirectory() });
      emitFileChange('delete', resolvedPath);
      
      if (!stats.isDirectory()) {
        diagnosticsNotifier?.(resolvedPath, 'delete');
      }

      return { success: true, path: resolvedPath };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `File not found: ${filePath}` };
      }
      logger.error('Failed to delete file', { error: err.message, filePath });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('files:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      const resolvedOldPath = path.isAbsolute(oldPath)
        ? oldPath
        : resolvePath(oldPath, getActiveWorkspacePath() ?? undefined);
      const resolvedNewPath = path.isAbsolute(newPath)
        ? newPath
        : resolvePath(newPath, getActiveWorkspacePath() ?? undefined);

      await fs.rename(resolvedOldPath, resolvedNewPath);

      logger.info('File/directory renamed', { from: resolvedOldPath, to: resolvedNewPath });
      emitFileChange('rename', resolvedNewPath, resolvedOldPath);
      diagnosticsNotifier?.(resolvedOldPath, 'delete');
      diagnosticsNotifier?.(resolvedNewPath, 'create');

      return { success: true, oldPath: resolvedOldPath, newPath: resolvedNewPath };
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to rename file', { error: err.message, oldPath, newPath });
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('files:stat', async (_event, filePath: string) => {
    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : resolvePath(filePath, getActiveWorkspacePath() ?? undefined);

      const stats = await fs.stat(resolvedPath);

      return {
        success: true,
        path: resolvedPath,
        name: path.basename(resolvedPath),
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        createdAt: stats.birthtimeMs,
        modifiedAt: stats.mtimeMs,
        language: stats.isFile() ? languageFromPath(resolvedPath) : undefined,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return { success: false, error: `Path not found: ${filePath}` };
      }
      return { success: false, error: err.message };
    }
  });

  // ==========================================================================
  // File Tree
  // ==========================================================================

  ipcMain.handle('files:list-dir', async (_event, dirPath: string, options?: {
    showHidden?: boolean;
    recursive?: boolean;
    maxDepth?: number;
    ignorePatterns?: string[];
  }) => {
    try {
      const resolvedPath = path.isAbsolute(dirPath) 
        ? dirPath 
        : resolvePath(dirPath, getActiveWorkspacePath() ?? undefined);

      try {
        const stat = await fs.stat(resolvedPath);
        if (!stat.isDirectory()) {
          return { success: false, error: `Path is not a directory: ${resolvedPath}`, files: [] };
        }
      } catch (statError) {
        const errorCode = (statError as NodeJS.ErrnoException).code;
        if (errorCode === 'ENOENT') {
          return { success: false, error: `Directory does not exist: ${resolvedPath}`, files: [] };
        }
        throw statError;
      }

      const showHidden = options?.showHidden ?? false;
      const recursive = options?.recursive ?? false;
      const maxDepth = options?.maxDepth ?? 10;
      const ignorePatterns = options?.ignorePatterns ?? [];

      const defaultIgnorePatterns = ['node_modules', '__pycache__', '.git', 'dist', 'build', '.next', '.cache'];
      const allIgnorePatterns = [...defaultIgnorePatterns, ...ignorePatterns];

      interface FileNode {
        name: string;
        path: string;
        type: 'file' | 'directory';
        language?: string;
        children?: FileNode[];
      }

      const listDir = async (dir: string, depth: number): Promise<FileNode[]> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const results: FileNode[] = [];

        for (const entry of entries) {
          if (!showHidden && entry.name.startsWith('.')) continue;
          if (matchesIgnorePattern(entry.name, allIgnorePatterns)) continue;

          const fullPath = path.join(dir, entry.name);
          const isDirectory = entry.isDirectory();

          const node: FileNode = {
            name: entry.name,
            path: fullPath,
            type: isDirectory ? 'directory' : 'file',
            language: isDirectory ? undefined : languageFromPath(fullPath),
          };

          if (isDirectory && recursive && depth < maxDepth) {
            try {
              node.children = await listDir(fullPath, depth + 1);
            } catch (err) {
              logger.debug('Cannot read subdirectory', {
                path: fullPath,
                error: err instanceof Error ? err.message : String(err)
              });
              node.children = [];
            }
          }

          results.push(node);
        }

        return results.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      };

      const files = await listDir(resolvedPath, 0);
      return { success: true, files };
    } catch (error) {
      logger.error('Failed to list directory', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, files: [] };
    }
  });
}
