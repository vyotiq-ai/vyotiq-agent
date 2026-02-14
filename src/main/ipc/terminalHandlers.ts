/**
 * Terminal IPC Handlers
 * 
 * Handles all terminal-related IPC operations including:
 * - Interactive terminal sessions
 * - Terminal I/O
 */

import { ipcMain } from 'electron';
import { homedir } from 'os';
import { createLogger } from '../logger';
import { validateIpcPayload } from './guards';
import { getWorkspacePath } from './fileHandlers';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Terminal');

// Store for managing interactive terminal sessions
const terminalSessions = new Map<string, {
  pty: ReturnType<typeof import('node-pty').spawn>;
  cwd: string;
}>();

// Terminal data output buffers — batch rapid PTY output to reduce IPC flood
const terminalDataBuffers = new Map<string, { data: string; timer: ReturnType<typeof setTimeout> | null }>();
const TERMINAL_BUFFER_FLUSH_MS = 16; // ~60fps - smooth enough for visual updates

const flushTerminalBuffer = (id: string, getMainWindow: () => Electron.BrowserWindow | null) => {
  const buffer = terminalDataBuffers.get(id);
  if (!buffer || !buffer.data) return;
  
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send('terminal:data', { id, data: buffer.data });
  }
  buffer.data = '';
  buffer.timer = null;
};

let nodePtyModule: typeof import('node-pty') | null = null;

const loadNodePty = async () => {
  if (!nodePtyModule) {
    nodePtyModule = await import('node-pty');
  }
  return nodePtyModule;
};

export function registerTerminalHandlers(context: IpcContext): void {
  const { getMainWindow } = context;
  const getActiveWorkspacePath = (): string => getWorkspacePath() || '';

  // ==========================================================================
  // Interactive Terminal Sessions
  // ==========================================================================

  ipcMain.handle('terminal:spawn', async (_event, options: { cwd?: string; id: string }) => {
    // Validate payload
    const validationError = validateIpcPayload('terminal:spawn', options);
    if (validationError) {
      logger.warn('terminal:spawn validation failed', { error: validationError.error });
      return validationError;
    }
    
    try {
      const pty = await loadNodePty();
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
      const shellArgs = isWindows ? ['-NoLogo'] : [];
      
      const cwd = options.cwd || getActiveWorkspacePath() || homedir();
      
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: { ...process.env } as Record<string, string>,
      });
      
      terminalSessions.set(options.id, { pty: ptyProcess, cwd });
      
      // Initialize data buffer for this terminal
      terminalDataBuffers.set(options.id, { data: '', timer: null });
      
      // Forward data to renderer — buffered at 16ms intervals to prevent IPC flooding
      // During heavy command output (e.g., npm install), PTY can emit thousands of events/sec
      ptyProcess.onData((data: string) => {
        const buffer = terminalDataBuffers.get(options.id);
        if (!buffer) return;
        
        buffer.data += data;
        
        if (!buffer.timer) {
          buffer.timer = setTimeout(() => {
            flushTerminalBuffer(options.id, getMainWindow);
          }, TERMINAL_BUFFER_FLUSH_MS);
        }
      });
      
      // Handle exit
      ptyProcess.onExit(({ exitCode }) => {
        // Flush any remaining buffered data before sending exit
        flushTerminalBuffer(options.id, getMainWindow);
        const bufferTimer = terminalDataBuffers.get(options.id)?.timer;
        if (bufferTimer) clearTimeout(bufferTimer);
        terminalDataBuffers.delete(options.id);
        
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('terminal:exit', { id: options.id, exitCode });
        }
        terminalSessions.delete(options.id);
      });
      
      logger.info('Terminal spawned', { id: options.id, cwd, shell });
      return { success: true, id: options.id, cwd };
    } catch (error) {
      logger.error('Failed to spawn terminal', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: error instanceof Error ? error.message : 'Spawn failed' };
    }
  });

  ipcMain.handle('terminal:write', async (_event, payload: { id: string; data: string }) => {
    // Validate payload
    const validationError = validateIpcPayload('terminal:write', payload);
    if (validationError) {
      logger.warn('terminal:write validation failed', { error: validationError.error });
      return validationError;
    }
    
    try {
      const session = terminalSessions.get(payload.id);
      if (!session) {
        return { success: false, error: 'Terminal session not found' };
      }
      session.pty.write(payload.data);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Write failed' };
    }
  });

  ipcMain.handle('terminal:resize', async (_event, payload: { id: string; cols: number; rows: number }) => {
    try {
      // Validate resize dimensions
      const cols = Math.max(1, Math.min(500, Math.floor(payload.cols || 80)));
      const rows = Math.max(1, Math.min(200, Math.floor(payload.rows || 24)));

      const session = terminalSessions.get(payload.id);
      if (!session) {
        return { success: false, error: 'Terminal session not found' };
      }
      session.pty.resize(cols, rows);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Resize failed' };
    }
  });

  ipcMain.handle('terminal:kill', async (_event, id: string) => {
    try {
      const session = terminalSessions.get(id);
      if (!session) {
        return { success: false, error: 'Terminal session not found' };
      }
      // Clean up buffer
      const bufferTimer = terminalDataBuffers.get(id)?.timer;
      if (bufferTimer) clearTimeout(bufferTimer);
      terminalDataBuffers.delete(id);
      
      session.pty.kill();
      terminalSessions.delete(id);
      logger.info('Terminal killed', { id });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Kill failed' };
    }
  });

  ipcMain.handle('terminal:list', async () => {
    return {
      success: true,
      terminals: Array.from(terminalSessions.entries()).map(([id, session]) => ({
        id,
        cwd: session.cwd,
      })),
    };
  });
}

/**
 * Cleanup all terminal sessions on app exit
 */
export function cleanupTerminalSessions(): void {
  for (const [id, session] of terminalSessions) {
    try {
      session.pty.kill();
      logger.info('Terminal cleaned up on exit', { id });
    } catch {
      // Ignore cleanup errors
    }
  }
  terminalSessions.clear();
}
