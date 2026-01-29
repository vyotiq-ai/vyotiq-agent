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
import type { IpcContext } from './types';

const logger = createLogger('IPC:Git');

export function registerGitHandlers(context: IpcContext): void {
  const { getWorkspaceManager } = context;

  // Initialize git for active workspace
  const initGitForWorkspace = async () => {
    const workspaces = getWorkspaceManager().list();
    const active = workspaces.find(w => w.isActive);
    if (active) {
      await getGitService().init(active.path);
    }
  };

  // Initialize git on startup
  initGitForWorkspace();

  // ==========================================================================
  // Basic Git Operations
  // ==========================================================================

  ipcMain.handle('git:status', async () => getGitService().status());
  ipcMain.handle('git:is-repo', async () => getGitService().isRepo());
  ipcMain.handle('git:current-branch', async () => getGitService().currentBranch());
  ipcMain.handle('git:show-file', async (_event, filePath: string, ref?: string) => 
    getGitService().showFile(filePath, ref)
  );
  
  ipcMain.handle('git:stage', async (_event, paths: string[]) => getGitService().stage(paths));
  ipcMain.handle('git:unstage', async (_event, paths: string[]) => getGitService().unstage(paths));
  ipcMain.handle('git:discard', async (_event, filePath: string) => getGitService().discard(filePath));
  
  ipcMain.handle('git:commit', async (_event, message: string, options?: { amend?: boolean; all?: boolean }) =>
    getGitService().commit(message, options)
  );
  
  ipcMain.handle('git:log', async (_event, options?: { maxCount?: number; skip?: number; filePath?: string }) =>
    getGitService().log(options)
  );

  // ==========================================================================
  // Branch Operations
  // ==========================================================================

  ipcMain.handle('git:branches', async (_event, all?: boolean) => getGitService().branches(all));
  
  ipcMain.handle('git:create-branch', async (_event, name: string, startPoint?: string) =>
    getGitService().createBranch(name, startPoint)
  );
  
  ipcMain.handle('git:delete-branch', async (_event, name: string, force?: boolean) =>
    getGitService().deleteBranch(name, force)
  );
  
  ipcMain.handle('git:checkout', async (_event, ref: string, options?: { create?: boolean }) =>
    getGitService().checkout(ref, options)
  );

  // ==========================================================================
  // Remote Operations
  // ==========================================================================

  ipcMain.handle('git:remotes', async () => getGitService().remotes());
  
  ipcMain.handle('git:fetch', async (_event, remote?: string, prune?: boolean) =>
    getGitService().fetch(remote, prune)
  );
  
  ipcMain.handle('git:pull', async (_event, remote?: string, branch?: string) =>
    getGitService().pull(remote, branch)
  );
  
  ipcMain.handle('git:push', async (_event, remote?: string, branch?: string, options?: { force?: boolean; setUpstream?: boolean }) =>
    getGitService().push(remote, branch, options)
  );

  // ==========================================================================
  // Stash Operations
  // ==========================================================================

  ipcMain.handle('git:stash', async (_event, message?: string) => getGitService().stash(message));
  ipcMain.handle('git:stash-pop', async (_event, index?: number) => getGitService().stashPop(index));
  ipcMain.handle('git:stash-apply', async (_event, index?: number) => getGitService().stashApply(index));
  ipcMain.handle('git:stash-drop', async (_event, index?: number) => getGitService().stashDrop(index));
  ipcMain.handle('git:stash-list', async () => getGitService().stashList());

  // ==========================================================================
  // Advanced Git Operations
  // ==========================================================================

  ipcMain.handle('git:blame', async (_event, filePath: string) => getGitService().blame(filePath));
  
  ipcMain.handle('git:merge', async (_event, branch: string, options?: { noFf?: boolean; squash?: boolean }) =>
    getGitService().merge(branch, options)
  );

  // ==========================================================================
  // Git Operation Manager (Agent Access Control)
  // ==========================================================================

  ipcMain.handle('git:request-access', async (_event, agentId: string, operation: string, params?: Record<string, unknown>, priority?: number) => {
    try {
      const { getGitOperationManager } = await import('../agent/git');
      const manager = getGitOperationManager();
      if (!manager) {
        return { success: false, error: 'Git operation manager not initialized' };
      }
      return await manager.requestAccess(agentId, operation as import('../agent/git').GitOperationType, params, priority);
    } catch (error) {
      logger.error('Failed to request git access', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:set-agent-permissions', async (_event, agentId: string, permissions: Partial<import('../agent/git').AgentGitPermissions>) => {
    try {
      const { getGitOperationManager } = await import('../agent/git');
      const manager = getGitOperationManager();
      if (!manager) {
        return { success: false, error: 'Git operation manager not initialized' };
      }
      manager.setAgentPermissions(agentId, permissions);
      return { success: true };
    } catch (error) {
      logger.error('Failed to set agent permissions', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:get-operation-history', async (_event, agentId?: string, limit?: number) => {
    try {
      const { getGitOperationManager } = await import('../agent/git');
      const manager = getGitOperationManager();
      if (!manager) return [];
      return manager.getOperationHistory(agentId, limit);
    } catch (error) {
      logger.error('Failed to get operation history', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // ==========================================================================
  // Branch Manager (Task/Agent Branches)
  // ==========================================================================

  ipcMain.handle('git:create-task-branch', async (_event, taskId: string, agentId: string, description?: string) => {
    try {
      const { getBranchManager } = await import('../agent/git');
      const manager = getBranchManager();
      if (!manager) {
        return { success: false, error: 'Branch manager not initialized' };
      }
      return await manager.createTaskBranch(taskId, agentId, description);
    } catch (error) {
      logger.error('Failed to create task branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:create-agent-branch', async (_event, agentId: string, baseBranch?: string) => {
    try {
      const { getBranchManager } = await import('../agent/git');
      const manager = getBranchManager();
      if (!manager) {
        return { success: false, error: 'Branch manager not initialized' };
      }
      return await manager.createAgentBranch(agentId, baseBranch);
    } catch (error) {
      logger.error('Failed to create agent branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:merge-branch', async (_event, branchName: string, agentId: string, options?: { squash?: boolean; deleteAfter?: boolean }) => {
    try {
      const { getBranchManager } = await import('../agent/git');
      const manager = getBranchManager();
      if (!manager) {
        return { success: false, error: 'Branch manager not initialized' };
      }
      return await manager.mergeBranch(branchName, agentId, options);
    } catch (error) {
      logger.error('Failed to merge branch', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:get-agent-branches', async (_event, agentId: string) => {
    try {
      const { getBranchManager } = await import('../agent/git');
      const manager = getBranchManager();
      if (!manager) return [];
      return manager.getAgentBranches(agentId);
    } catch (error) {
      logger.error('Failed to get agent branches', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // ==========================================================================
  // Commit Coordinator
  // ==========================================================================

  ipcMain.handle('git:queue-change', async (_event, agentId: string, filePath: string, changeType: string, description?: string, priority?: number) => {
    try {
      const { getCommitCoordinator } = await import('../agent/git');
      const coordinator = getCommitCoordinator();
      if (!coordinator) return null;
      return coordinator.queueChange(agentId, filePath, changeType as import('../agent/git').PendingChange['changeType'], description, priority);
    } catch (error) {
      logger.error('Failed to queue change', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  ipcMain.handle('git:create-commit', async (_event, agentId: string, message: string, options?: { files?: string[]; all?: boolean }) => {
    try {
      const { getCommitCoordinator } = await import('../agent/git');
      const coordinator = getCommitCoordinator();
      if (!coordinator) {
        return { success: false, error: 'Commit coordinator not initialized' };
      }
      return await coordinator.createCommit(agentId, message, options);
    } catch (error) {
      logger.error('Failed to create commit', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:get-pending-changes', async (_event, agentId?: string) => {
    try {
      const { getCommitCoordinator } = await import('../agent/git');
      const coordinator = getCommitCoordinator();
      if (!coordinator) return [];
      return agentId ? coordinator.getAgentPendingChanges(agentId) : coordinator.getAllPendingChanges();
    } catch (error) {
      logger.error('Failed to get pending changes', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // ==========================================================================
  // Conflict Resolver
  // ==========================================================================

  ipcMain.handle('git:detect-conflicts', async () => {
    try {
      const { getGitConflictResolver } = await import('../agent/git');
      const resolver = getGitConflictResolver();
      if (!resolver) return [];
      return await resolver.detectConflicts();
    } catch (error) {
      logger.error('Failed to detect conflicts', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('git:resolve-conflict', async (_event, conflictId: string, agentId: string, strategy?: string) => {
    try {
      const { getGitConflictResolver } = await import('../agent/git');
      const resolver = getGitConflictResolver();
      if (!resolver) {
        return { success: false, error: 'Conflict resolver not initialized' };
      }
      return await resolver.resolveConflict(conflictId, agentId, strategy as import('../agent/git').ConflictResolutionType);
    } catch (error) {
      logger.error('Failed to resolve conflict', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:get-active-conflicts', async () => {
    try {
      const { getGitConflictResolver } = await import('../agent/git');
      const resolver = getGitConflictResolver();
      if (!resolver) return [];
      return resolver.getActiveConflicts();
    } catch (error) {
      logger.error('Failed to get active conflicts', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  // Re-initialize git when workspace changes
  ipcMain.on('workspace:changed', () => {
    initGitForWorkspace();
  });
}
