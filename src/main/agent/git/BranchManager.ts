/**
 * Branch Manager
 *
 * Manages branches for parallel agent work, providing isolation
 * strategies and branch lifecycle management.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';
import { getGitService, type GitBranch as _GitBranch } from '../../git';

// Re-export for potential external use
export type GitBranch = _GitBranch;

// =============================================================================
// Types
// =============================================================================

export type BranchStrategy =
  | 'main-only'        // All work on current branch
  | 'feature-per-task' // New branch per major task
  | 'checkpoint'       // Auto-branches for recovery
  | 'agent-isolation'; // Isolated branch per agent

export interface AgentBranch {
  id: string;
  branchName: string;
  agentId: string;
  taskId?: string;
  strategy: BranchStrategy;
  baseBranch: string;
  createdAt: number;
  lastActivity: number;
  status: 'active' | 'merged' | 'abandoned' | 'deleted';
  commitCount: number;
}

export interface BranchEvent {
  type: 'branch-created' | 'branch-switched' | 'branch-merged' | 'branch-deleted' | 'checkpoint-created';
  branchName: string;
  agentId?: string;
  taskId?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface BranchManagerConfig {
  defaultStrategy: BranchStrategy;
  branchPrefix: string;
  checkpointPrefix: string;
  autoCleanupMergedBranches: boolean;
  maxBranchesPerAgent: number;
  checkpointIntervalMs: number;
}

export const DEFAULT_BRANCH_MANAGER_CONFIG: BranchManagerConfig = {
  defaultStrategy: 'main-only',
  branchPrefix: 'agent/',
  checkpointPrefix: 'checkpoint/',
  autoCleanupMergedBranches: true,
  maxBranchesPerAgent: 5,
  checkpointIntervalMs: 300000, // 5 minutes
};

// =============================================================================
// BranchManager
// =============================================================================

export class BranchManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: BranchManagerConfig;
  private readonly agentBranches = new Map<string, AgentBranch>();
  private readonly checkpoints: Map<string, string[]> = new Map(); // agentId -> checkpoint branches
  private currentStrategy: BranchStrategy;
  private checkpointInterval?: NodeJS.Timeout;

  constructor(logger: Logger, config: Partial<BranchManagerConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_BRANCH_MANAGER_CONFIG, ...config };
    this.currentStrategy = this.config.defaultStrategy;
  }

  /**
   * Initialize branch manager
   */
  async initialize(): Promise<void> {
    // Scan existing agent branches
    await this.scanExistingBranches();

    // Start checkpoint interval if using checkpoint strategy
    if (this.currentStrategy === 'checkpoint') {
      this.startCheckpointInterval();
    }

    this.logger.info('BranchManager initialized', { strategy: this.currentStrategy });
  }

  /**
   * Shutdown branch manager
   */
  shutdown(): void {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }
  }

  /**
   * Set the branch strategy
   */
  setStrategy(strategy: BranchStrategy): void {
    const oldStrategy = this.currentStrategy;
    this.currentStrategy = strategy;

    if (strategy === 'checkpoint' && oldStrategy !== 'checkpoint') {
      this.startCheckpointInterval();
    } else if (strategy !== 'checkpoint' && oldStrategy === 'checkpoint') {
      if (this.checkpointInterval) {
        clearInterval(this.checkpointInterval);
      }
    }

    this.logger.info('Branch strategy changed', { from: oldStrategy, to: strategy });
  }

  /**
   * Get current strategy
   */
  getStrategy(): BranchStrategy {
    return this.currentStrategy;
  }

  /**
   * Create a branch for a task
   */
  async createTaskBranch(
    taskId: string,
    agentId: string,
    description?: string
  ): Promise<{ success: boolean; branchName?: string; error?: string }> {
    const git = getGitService();

    // Check agent branch limit
    const agentBranchCount = this.getAgentBranchCount(agentId);
    if (agentBranchCount >= this.config.maxBranchesPerAgent) {
      return {
        success: false,
        error: `Agent ${agentId} has reached maximum branch limit (${this.config.maxBranchesPerAgent})`,
      };
    }

    // Get current branch as base
    const currentBranch = await git.currentBranch();
    if (!currentBranch) {
      return { success: false, error: 'Could not determine current branch' };
    }

    // Generate branch name
    const safeName = this.sanitizeBranchName(description || taskId);
    const branchName = `${this.config.branchPrefix}${agentId.slice(0, 8)}/${safeName}`;

    try {
      const created = await git.createBranch(branchName);
      if (!created) {
        return { success: false, error: 'Failed to create branch' };
      }

      // Track the branch
      const agentBranch: AgentBranch = {
        id: randomUUID(),
        branchName,
        agentId,
        taskId,
        strategy: 'feature-per-task',
        baseBranch: currentBranch,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'active',
        commitCount: 0,
      };
      this.agentBranches.set(branchName, agentBranch);

      // Switch to the new branch
      await git.checkout(branchName);

      this.emitEvent('branch-created', branchName, agentId, taskId);
      this.logger.info('Task branch created', { branchName, agentId, taskId });

      return { success: true, branchName };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to create task branch', { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create an isolated branch for an agent
   */
  async createAgentBranch(
    agentId: string,
    baseBranch?: string
  ): Promise<{ success: boolean; branchName?: string; error?: string }> {
    const git = getGitService();

    const base = baseBranch || (await git.currentBranch()) || 'main';
    const branchName = `${this.config.branchPrefix}${agentId.slice(0, 8)}/workspace`;

    try {
      // Check if branch already exists
      const branches = await git.branches();
      if (branches.some(b => b.name === branchName)) {
        // Switch to existing branch
        await git.checkout(branchName);
        return { success: true, branchName };
      }

      const created = await git.createBranch(branchName, base);
      if (!created) {
        return { success: false, error: 'Failed to create agent branch' };
      }

      const agentBranch: AgentBranch = {
        id: randomUUID(),
        branchName,
        agentId,
        strategy: 'agent-isolation',
        baseBranch: base,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'active',
        commitCount: 0,
      };
      this.agentBranches.set(branchName, agentBranch);

      await git.checkout(branchName);

      this.emitEvent('branch-created', branchName, agentId);
      return { success: true, branchName };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create a checkpoint branch
   */
  async createCheckpoint(
    agentId: string,
    description?: string
  ): Promise<{ success: boolean; branchName?: string; error?: string }> {
    const git = getGitService();

    const timestamp = Date.now();
    const safeName = description ? this.sanitizeBranchName(description) : timestamp.toString();
    const branchName = `${this.config.checkpointPrefix}${agentId.slice(0, 8)}/${safeName}`;

    try {
      const created = await git.createBranch(branchName);
      if (!created) {
        return { success: false, error: 'Failed to create checkpoint' };
      }

      // Track checkpoint
      let agentCheckpoints = this.checkpoints.get(agentId);
      if (!agentCheckpoints) {
        agentCheckpoints = [];
        this.checkpoints.set(agentId, agentCheckpoints);
      }
      agentCheckpoints.push(branchName);

      // Keep only last 10 checkpoints per agent
      if (agentCheckpoints.length > 10) {
        const oldCheckpoint = agentCheckpoints.shift();
        if (oldCheckpoint) {
          await git.deleteBranch(oldCheckpoint, true).catch(err => {
            this.logger.debug('BranchManager: failed to delete old checkpoint branch', {
              branch: oldCheckpoint,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }

      this.emitEvent('checkpoint-created', branchName, agentId);
      this.logger.debug('Checkpoint created', { branchName, agentId });

      return { success: true, branchName };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Merge a branch back to its base
   */
  async mergeBranch(
    branchName: string,
    agentId: string,
    options: { squash?: boolean; deleteAfter?: boolean } = {}
  ): Promise<{ success: boolean; error?: string }> {
    const git = getGitService();
    const agentBranch = this.agentBranches.get(branchName);

    if (!agentBranch) {
      return { success: false, error: 'Branch not tracked' };
    }

    if (agentBranch.agentId !== agentId) {
      return { success: false, error: 'Agent does not own this branch' };
    }

    try {
      // Switch to base branch
      await git.checkout(agentBranch.baseBranch);

      // Merge
      const merged = await git.merge(branchName, { squash: options.squash });
      if (!merged) {
        return { success: false, error: 'Merge failed - conflicts may exist' };
      }

      // Update status
      agentBranch.status = 'merged';

      // Delete if requested
      if (options.deleteAfter || this.config.autoCleanupMergedBranches) {
        await git.deleteBranch(branchName, true);
        agentBranch.status = 'deleted';
        this.agentBranches.delete(branchName);
        this.emitEvent('branch-deleted', branchName, agentId);
      }

      this.emitEvent('branch-merged', branchName, agentId);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Switch to a branch
   */
  async switchBranch(
    branchName: string,
    agentId: string
  ): Promise<{ success: boolean; error?: string }> {
    const git = getGitService();

    try {
      const switched = await git.checkout(branchName);
      if (!switched) {
        return { success: false, error: 'Failed to switch branch' };
      }

      // Update last activity
      const agentBranch = this.agentBranches.get(branchName);
      if (agentBranch) {
        agentBranch.lastActivity = Date.now();
      }

      this.emitEvent('branch-switched', branchName, agentId);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(
    branchName: string,
    agentId: string,
    force: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    const git = getGitService();
    const agentBranch = this.agentBranches.get(branchName);

    if (agentBranch && agentBranch.agentId !== agentId) {
      return { success: false, error: 'Agent does not own this branch' };
    }

    try {
      const deleted = await git.deleteBranch(branchName, force);
      if (!deleted) {
        return { success: false, error: 'Failed to delete branch' };
      }

      if (agentBranch) {
        agentBranch.status = 'deleted';
        this.agentBranches.delete(branchName);
      }

      this.emitEvent('branch-deleted', branchName, agentId);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Cleanup stale branches
   */
  async cleanupStaleBranches(maxAgeMs: number = 86400000): Promise<number> {
    const git = getGitService();
    const now = Date.now();
    let cleaned = 0;

    for (const [branchName, agentBranch] of this.agentBranches) {
      if (agentBranch.status !== 'active') continue;
      if (now - agentBranch.lastActivity < maxAgeMs) continue;

      try {
        await git.deleteBranch(branchName, true);
        agentBranch.status = 'abandoned';
        this.agentBranches.delete(branchName);
        cleaned++;
      } catch {
        // Ignore deletion errors
      }
    }

    if (cleaned > 0) {
      this.logger.info('Cleaned up stale branches', { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Get branches for an agent
   */
  getAgentBranches(agentId: string): AgentBranch[] {
    return Array.from(this.agentBranches.values()).filter(b => b.agentId === agentId);
  }

  /**
   * Get all tracked branches
   */
  getAllBranches(): AgentBranch[] {
    return Array.from(this.agentBranches.values());
  }

  /**
   * Get checkpoints for an agent
   */
  getCheckpoints(agentId: string): string[] {
    return this.checkpoints.get(agentId) || [];
  }

  /**
   * Record a commit on a branch
   */
  recordCommit(branchName: string): void {
    const agentBranch = this.agentBranches.get(branchName);
    if (agentBranch) {
      agentBranch.commitCount++;
      agentBranch.lastActivity = Date.now();
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async scanExistingBranches(): Promise<void> {
    const git = getGitService();
    const branches = await git.branches();

    for (const branch of branches) {
      if (branch.name.startsWith(this.config.branchPrefix)) {
        // Parse agent ID from branch name
        const parts = branch.name.replace(this.config.branchPrefix, '').split('/');
        const agentIdPrefix = parts[0];

        const agentBranch: AgentBranch = {
          id: randomUUID(),
          branchName: branch.name,
          agentId: agentIdPrefix,
          strategy: 'agent-isolation',
          baseBranch: 'main',
          createdAt: Date.now(),
          lastActivity: Date.now(),
          status: 'active',
          commitCount: 0,
        };
        this.agentBranches.set(branch.name, agentBranch);
      }
    }
  }

  private startCheckpointInterval(): void {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }

    this.checkpointInterval = setInterval(async () => {
      // Create checkpoints for all active agents
      for (const [, agentBranch] of this.agentBranches) {
        if (agentBranch.status === 'active') {
          await this.createCheckpoint(agentBranch.agentId, 'auto');
        }
      }
    }, this.config.checkpointIntervalMs);
    if (this.checkpointInterval && typeof this.checkpointInterval === 'object' && 'unref' in this.checkpointInterval) {
      (this.checkpointInterval as NodeJS.Timeout).unref();
    }
  }

  private getAgentBranchCount(agentId: string): number {
    return Array.from(this.agentBranches.values()).filter(
      b => b.agentId === agentId && b.status === 'active'
    ).length;
  }

  private sanitizeBranchName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  private emitEvent(
    type: BranchEvent['type'],
    branchName: string,
    agentId?: string,
    taskId?: string,
    details?: Record<string, unknown>
  ): void {
    const event: BranchEvent = {
      type,
      branchName,
      agentId,
      taskId,
      timestamp: Date.now(),
      details,
    };
    this.emit('branch', event);
  }
}
