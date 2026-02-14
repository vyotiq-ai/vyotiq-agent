/**
 * Git IPC Handlers
 * 
 * Handles all git-related IPC operations including:
 * - Basic git operations (status, commit, push, pull)
 * - Branch management
 * - Advanced git integration (agents, conflict resolution)
 */

import { ipcMain } from 'electron';
import { getGitService } from '../git';
import { createLogger } from '../logger';
import { withErrorGuard } from './guards';
import type { IpcContext } from './types';

const logger = createLogger('IPC:Git');

export function registerGitHandlers(context: IpcContext): void {
  const { getMainWindow } = context;

  // Helper to emit git events to renderer
  const emitGitEvent = (channel: string, data: unknown) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  };

  // Helper to emit status change after git operations
  const emitStatusChanged = async () => {
    try {
      const status = await getGitService().status();
      emitGitEvent('git:status-changed', status);
    } catch (error) {
      logger.debug('Failed to emit status change', { error: error instanceof Error ? error.message : String(error) });
    }
  };

  // Initialize git for the active workspace directory
  const initGitForWorkspace = async () => {
    const { getWorkspacePath } = await import('./fileHandlers');
    const cwd = getWorkspacePath();
    if (cwd) {
      await getGitService().init(cwd);
    }
  };

  // Initialize git on startup
  initGitForWorkspace();

  // ==========================================================================
  // Basic Git Operations
  // ==========================================================================

  ipcMain.handle('git:status', async () => 
    withErrorGuard('git:status', () => getGitService().status())
  );
  
  ipcMain.handle('git:is-repo', async () => 
    withErrorGuard('git:is-repo', () => getGitService().isRepo())
  );
  
  ipcMain.handle('git:current-branch', async () => 
    withErrorGuard('git:current-branch', () => getGitService().currentBranch())
  );
  
  ipcMain.handle('git:show-file', async (_event, filePath: string, ref?: string) => 
    withErrorGuard('git:show-file', () => getGitService().showFile(filePath, ref))
  );
  
  ipcMain.handle('git:stage', async (_event, paths: string[]) => {
    return withErrorGuard('git:stage', async () => {
      const result = await getGitService().stage(paths);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'stage', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:unstage', async (_event, paths: string[]) => {
    return withErrorGuard('git:unstage', async () => {
      const result = await getGitService().unstage(paths);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'unstage', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:discard', async (_event, filePath: string) => {
    return withErrorGuard('git:discard', async () => {
      const result = await getGitService().discard(filePath);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'discard', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:commit', async (_event, message: string, options?: { amend?: boolean; all?: boolean }) => {
    return withErrorGuard('git:commit', async () => {
      const result = await getGitService().commit(message, options);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'commit', success: true, message: `Committed: ${message.substring(0, 50)}` });
      return result;
    });
  });
  
  ipcMain.handle('git:log', async (_event, options?: { maxCount?: number; skip?: number; filePath?: string }) =>
    withErrorGuard('git:log', () => getGitService().log(options))
  );

  // ==========================================================================
  // Branch Operations
  // ==========================================================================

  ipcMain.handle('git:branches', async (_event, all?: boolean) => 
    withErrorGuard('git:branches', () => getGitService().branches(all))
  );
  
  ipcMain.handle('git:create-branch', async (_event, name: string, startPoint?: string) => {
    return withErrorGuard('git:create-branch', async () => {
      const result = await getGitService().createBranch(name, startPoint);
      emitGitEvent('git:operation-complete', { operation: 'create-branch', success: true, message: `Created branch: ${name}` });
      return result;
    });
  });
  
  ipcMain.handle('git:delete-branch', async (_event, name: string, force?: boolean) => {
    return withErrorGuard('git:delete-branch', async () => {
      const result = await getGitService().deleteBranch(name, force);
      emitGitEvent('git:operation-complete', { operation: 'delete-branch', success: true, message: `Deleted branch: ${name}` });
      return result;
    });
  });
  
  ipcMain.handle('git:checkout', async (_event, ref: string, options?: { create?: boolean }) => {
    return withErrorGuard('git:checkout', async () => {
      const previousBranch = await getGitService().currentBranch();
      const result = await getGitService().checkout(ref, options);
      emitStatusChanged();
      emitGitEvent('git:branch-changed', { from: previousBranch || 'unknown', to: ref });
      emitGitEvent('git:operation-complete', { operation: 'checkout', success: true, message: `Checked out: ${ref}` });
      return result;
    });
  });

  // ==========================================================================
  // Remote Operations
  // ==========================================================================

  ipcMain.handle('git:remotes', async () => 
    withErrorGuard('git:remotes', () => getGitService().remotes())
  );
  
  ipcMain.handle('git:fetch', async (_event, remote?: string, prune?: boolean) => {
    return withErrorGuard('git:fetch', async () => {
      const result = await getGitService().fetch(remote, prune);
      emitGitEvent('git:operation-complete', { operation: 'fetch', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:pull', async (_event, remote?: string, branch?: string) => {
    return withErrorGuard('git:pull', async () => {
      const result = await getGitService().pull(remote, branch);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'pull', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:push', async (_event, remote?: string, branch?: string, options?: { force?: boolean; setUpstream?: boolean }) => {
    return withErrorGuard('git:push', async () => {
      const result = await getGitService().push(remote, branch, options);
      emitGitEvent('git:operation-complete', { operation: 'push', success: true });
      return result;
    });
  });

  // ==========================================================================
  // Stash Operations
  // ==========================================================================

  ipcMain.handle('git:stash', async (_event, message?: string) => {
    return withErrorGuard('git:stash', async () => {
      const result = await getGitService().stash(message);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'stash', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:stash-pop', async (_event, index?: number) => {
    return withErrorGuard('git:stash-pop', async () => {
      const result = await getGitService().stashPop(index);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'stash-pop', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:stash-apply', async (_event, index?: number) => {
    return withErrorGuard('git:stash-apply', async () => {
      const result = await getGitService().stashApply(index);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'stash-apply', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:stash-drop', async (_event, index?: number) => {
    return withErrorGuard('git:stash-drop', async () => {
      const result = await getGitService().stashDrop(index);
      emitGitEvent('git:operation-complete', { operation: 'stash-drop', success: true });
      return result;
    });
  });
  
  ipcMain.handle('git:stash-list', async () => 
    withErrorGuard('git:stash-list', () => getGitService().stashList())
  );

  // ==========================================================================
  // Advanced Git Operations
  // ==========================================================================

  ipcMain.handle('git:blame', async (_event, filePath: string) => 
    withErrorGuard('git:blame', () => getGitService().blame(filePath))
  );
  
  ipcMain.handle('git:merge', async (_event, branch: string, options?: { noFf?: boolean; squash?: boolean }) => {
    return withErrorGuard('git:merge', async () => {
      const result = await getGitService().merge(branch, options);
      emitStatusChanged();
      emitGitEvent('git:operation-complete', { operation: 'merge', success: true, message: `Merged: ${branch}` });
      return result;
    });
  });

  // Re-initialize git when workspace changes
  ipcMain.on('workspace:changed', () => {
    initGitForWorkspace();
  });
}
