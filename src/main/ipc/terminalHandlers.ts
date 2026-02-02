/**
 * Terminal IPC Handlers
 * 
 * Handles all terminal-related IPC operations including:
 * - Interactive terminal sessions
 * - Terminal I/O
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import { validateIpcPayload } from './guards';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Terminal');

// Store for managing interactive terminal sessions
const terminalSessions = new Map<string, {
  pty: ReturnType<typeof import('node-pty').spawn>;
  cwd: string;
}>();

let nodePtyModule: typeof import('node-pty') | null = null;

const loadNodePty = async () => {
  if (!nodePtyModule) {
    nodePtyModule = await import('node-pty');
  }
  return nodePtyModule;
};

export function registerTerminalHandlers(context: IpcContext): void {
  const { getMainWindow, getActiveWorkspacePath } = context;

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
      
      const cwd = options.cwd || getActiveWorkspacePath() || process.cwd();
      
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: { ...process.env } as Record<string, string>,
      });
      
      terminalSessions.set(options.id, { pty: ptyProcess, cwd });
      
      // Forward data to renderer
      ptyProcess.onData((data: string) => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send('terminal:data', { id: options.id, data });
        }
      });
      
      // Handle exit
      ptyProcess.onExit(({ exitCode }) => {
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
      const session = terminalSessions.get(payload.id);
      if (!session) {
        return { success: false, error: 'Terminal session not found' };
      }
      session.pty.resize(payload.cols, payload.rows);
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
