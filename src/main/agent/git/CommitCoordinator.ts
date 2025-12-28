/**
 * Commit Coordinator
 *
 * Coordinates commits, ensuring atomic commits,
 * meaningful commit messages, and proper change aggregation.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';
import { getGitService } from '../../git';
import type { GitCommit as _GitCommit } from '../../../shared/types';

// Re-export for potential external use
export type GitCommit = _GitCommit;

// =============================================================================
// Types
// =============================================================================

export interface PendingChange {
  id: string;
  agentId: string;
  filePath: string;
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  description?: string;
  queuedAt: number;
  priority: number;
}

export interface CommitRequest {
  id: string;
  agentId: string;
  files: string[];
  message: string;
  description?: string;
  requestedAt: number;
  status: 'pending' | 'staged' | 'committed' | 'failed';
  commitHash?: string;
}

export interface CommitEvent {
  type: 'change-queued' | 'commit-created' | 'commit-failed' | 'batch-committed';
  agentId: string;
  commitHash?: string;
  files?: string[];
  message?: string;
  timestamp: number;
}

export interface CommitCoordinatorConfig {
  enableAutoCommit: boolean;
  autoCommitIntervalMs: number;
  minChangesForAutoCommit: number;
  maxPendingChanges: number;
  commitMessageStyle: 'conventional' | 'descriptive' | 'simple';
  includeAgentAttribution: boolean;
}

export const DEFAULT_COMMIT_COORDINATOR_CONFIG: CommitCoordinatorConfig = {
  enableAutoCommit: false,
  autoCommitIntervalMs: 300000, // 5 minutes
  minChangesForAutoCommit: 3,
  maxPendingChanges: 100,
  commitMessageStyle: 'conventional',
  includeAgentAttribution: true,
};

// =============================================================================
// CommitCoordinator
// =============================================================================

export class CommitCoordinator extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: CommitCoordinatorConfig;
  private readonly pendingChanges = new Map<string, PendingChange>();
  private readonly commitHistory: CommitRequest[] = [];
  private readonly agentChanges = new Map<string, Set<string>>(); // agentId -> changeIds
  private autoCommitInterval?: NodeJS.Timeout;

  constructor(logger: Logger, config: Partial<CommitCoordinatorConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_COMMIT_COORDINATOR_CONFIG, ...config };
  }

  /**
   * Initialize the coordinator
   */
  initialize(): void {
    if (this.config.enableAutoCommit) {
      this.startAutoCommitInterval();
    }
    this.logger.info('CommitCoordinator initialized');
  }

  /**
   * Shutdown the coordinator
   */
  shutdown(): void {
    if (this.autoCommitInterval) {
      clearInterval(this.autoCommitInterval);
    }
  }

  /**
   * Queue a file change for commit
   */
  queueChange(
    agentId: string,
    filePath: string,
    changeType: PendingChange['changeType'],
    description?: string,
    priority: number = 5
  ): string {
    // Check limit
    if (this.pendingChanges.size >= this.config.maxPendingChanges) {
      // Remove oldest low-priority change
      const oldest = this.findOldestLowPriorityChange();
      if (oldest) {
        this.pendingChanges.delete(oldest.id);
      }
    }

    const change: PendingChange = {
      id: randomUUID(),
      agentId,
      filePath,
      changeType,
      description,
      queuedAt: Date.now(),
      priority,
    };

    this.pendingChanges.set(change.id, change);

    // Track by agent
    let agentChangeSet = this.agentChanges.get(agentId);
    if (!agentChangeSet) {
      agentChangeSet = new Set();
      this.agentChanges.set(agentId, agentChangeSet);
    }
    agentChangeSet.add(change.id);

    this.emitEvent('change-queued', agentId, undefined, [filePath]);
    return change.id;
  }

  /**
   * Create a commit with queued changes
   */
  async createCommit(
    agentId: string,
    message: string,
    options: { files?: string[]; all?: boolean } = {}
  ): Promise<{ success: boolean; commitHash?: string; error?: string }> {
    const git = getGitService();

    try {
      // Determine files to commit
      let filesToCommit: string[];
      if (options.files) {
        filesToCommit = options.files;
      } else if (options.all) {
        filesToCommit = this.getAgentPendingFiles(agentId);
      } else {
        filesToCommit = this.getAgentPendingFiles(agentId);
      }

      if (filesToCommit.length === 0) {
        return { success: false, error: 'No files to commit' };
      }

      // Stage files
      const staged = await git.stage(filesToCommit);
      if (!staged) {
        return { success: false, error: 'Failed to stage files' };
      }

      // Generate commit message
      const finalMessage = this.formatCommitMessage(agentId, message, filesToCommit);

      // Create commit
      const result = await git.commit(finalMessage);
      if (!result.success) {
        return { success: false, error: result.error || 'Commit failed' };
      }

      // Clear pending changes for committed files
      this.clearPendingChanges(agentId, filesToCommit);

      // Record in history
      const commitRequest: CommitRequest = {
        id: randomUUID(),
        agentId,
        files: filesToCommit,
        message: finalMessage,
        requestedAt: Date.now(),
        status: 'committed',
        commitHash: result.commit?.hash,
      };
      this.commitHistory.push(commitRequest);

      this.emitEvent('commit-created', agentId, result.commit?.hash, filesToCommit, finalMessage);
      this.logger.info('Commit created', {
        agentId,
        hash: result.commit?.hash,
        files: filesToCommit.length,
      });

      return { success: true, commitHash: result.commit?.hash };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitEvent('commit-failed', agentId);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create an atomic commit with specific files
   */
  async createAtomicCommit(
    agentId: string,
    files: string[],
    message: string
  ): Promise<{ success: boolean; commitHash?: string; error?: string }> {
    const git = getGitService();

    try {
      // Stash any other changes first
      const status = await git.status();
      const otherModified = status?.modified.filter(f => !files.includes(f)) || [];

      if (otherModified.length > 0) {
        await git.stash('Temporary stash for atomic commit');
      }

      // Stage only specified files
      await git.stage(files);

      // Commit
      const finalMessage = this.formatCommitMessage(agentId, message, files);
      const result = await git.commit(finalMessage);

      // Restore stash if we created one
      if (otherModified.length > 0) {
        await git.stashPop();
      }

      if (!result.success) {
        return { success: false, error: result.error };
      }

      this.clearPendingChanges(agentId, files);
      this.emitEvent('commit-created', agentId, result.commit?.hash, files, finalMessage);

      return { success: true, commitHash: result.commit?.hash };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Batch commit changes from different sessions
   */
  async batchCommit(
    message: string,
    options: { agentIds?: string[]; minPriority?: number } = {}
  ): Promise<{ success: boolean; commitHash?: string; agentCount: number; fileCount: number; error?: string }> {
    const git = getGitService();

    // Collect changes
    const changes: PendingChange[] = [];
    for (const change of this.pendingChanges.values()) {
      if (options.agentIds && !options.agentIds.includes(change.agentId)) continue;
      if (options.minPriority && change.priority < options.minPriority) continue;
      changes.push(change);
    }

    if (changes.length === 0) {
      return { success: false, agentCount: 0, fileCount: 0, error: 'No changes to commit' };
    }

    const files = [...new Set(changes.map(c => c.filePath))];
    const agents = [...new Set(changes.map(c => c.agentId))];

    try {
      await git.stage(files);

      const finalMessage = this.formatBatchCommitMessage(message, agents, changes);
      const result = await git.commit(finalMessage);

      if (!result.success) {
        return { success: false, agentCount: 0, fileCount: 0, error: result.error };
      }

      // Clear all committed changes
      for (const change of changes) {
        this.pendingChanges.delete(change.id);
        const agentSet = this.agentChanges.get(change.agentId);
        agentSet?.delete(change.id);
      }

      this.emitEvent('batch-committed', 'system', result.commit?.hash, files, finalMessage);

      return {
        success: true,
        commitHash: result.commit?.hash,
        agentCount: agents.length,
        fileCount: files.length,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, agentCount: 0, fileCount: 0, error: errorMsg };
    }
  }

  /**
   * Generate a commit message from changes
   */
  generateCommitMessage(changes: PendingChange[]): string {
    const byType = new Map<string, PendingChange[]>();

    for (const change of changes) {
      const list = byType.get(change.changeType) || [];
      list.push(change);
      byType.set(change.changeType, list);
    }

    const parts: string[] = [];

    if (byType.has('create')) {
      const created = byType.get('create')!;
      parts.push(`Add ${created.length} file(s)`);
    }
    if (byType.has('modify')) {
      const modified = byType.get('modify')!;
      parts.push(`Update ${modified.length} file(s)`);
    }
    if (byType.has('delete')) {
      const deleted = byType.get('delete')!;
      parts.push(`Remove ${deleted.length} file(s)`);
    }

    return parts.join(', ') || 'Update files';
  }

  /**
   * Get pending changes for an agent
   */
  getAgentPendingChanges(agentId: string): PendingChange[] {
    const changeIds = this.agentChanges.get(agentId);
    if (!changeIds) return [];

    return Array.from(changeIds)
      .map(id => this.pendingChanges.get(id))
      .filter((c): c is PendingChange => c !== undefined);
  }

  /**
   * Get all pending changes
   */
  getAllPendingChanges(): PendingChange[] {
    return Array.from(this.pendingChanges.values());
  }

  /**
   * Get commit history
   */
  getCommitHistory(agentId?: string, limit: number = 50): CommitRequest[] {
    let history = this.commitHistory;
    if (agentId) {
      history = history.filter(c => c.agentId === agentId);
    }
    return history.slice(-limit);
  }

  /**
   * Clear pending changes for an agent
   */
  clearAgentChanges(agentId: string): number {
    const changeIds = this.agentChanges.get(agentId);
    if (!changeIds) return 0;

    let cleared = 0;
    for (const id of changeIds) {
      if (this.pendingChanges.delete(id)) {
        cleared++;
      }
    }
    this.agentChanges.delete(agentId);

    return cleared;
  }

  /**
   * Clear all pending changes
   */
  clearAllChanges(): void {
    this.pendingChanges.clear();
    this.agentChanges.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getAgentPendingFiles(agentId: string): string[] {
    const changes = this.getAgentPendingChanges(agentId);
    return [...new Set(changes.map(c => c.filePath))];
  }

  private clearPendingChanges(agentId: string, files: string[]): void {
    const fileSet = new Set(files);
    const changeIds = this.agentChanges.get(agentId);
    if (!changeIds) return;

    for (const id of changeIds) {
      const change = this.pendingChanges.get(id);
      if (change && fileSet.has(change.filePath)) {
        this.pendingChanges.delete(id);
        changeIds.delete(id);
      }
    }
  }

  private formatCommitMessage(agentId: string, message: string, files: string[]): string {
    let finalMessage = message;

    if (this.config.commitMessageStyle === 'conventional') {
      // Detect type from files
      const type = this.detectConventionalType(files);
      if (!message.match(/^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?:/)) {
        finalMessage = `${type}: ${message}`;
      }
    }

    if (this.config.includeAgentAttribution) {
      finalMessage += `\n\n[Agent: ${agentId.slice(0, 8)}]`;
    }

    return finalMessage;
  }

  private formatBatchCommitMessage(
    message: string,
    agents: string[],
    changes: PendingChange[]
  ): string {
    let finalMessage = message;

    if (this.config.commitMessageStyle === 'conventional') {
      finalMessage = `chore: ${message}`;
    }

    if (this.config.includeAgentAttribution && agents.length > 0) {
      const agentList = agents.map(a => a.slice(0, 8)).join(', ');
      finalMessage += `\n\n[Agents: ${agentList}]`;
      finalMessage += `\n[Files: ${changes.length}]`;
    }

    return finalMessage;
  }

  private detectConventionalType(files: string[]): string {
    const hasTests = files.some(f => f.includes('test') || f.includes('spec'));
    const hasDocs = files.some(f => f.endsWith('.md') || f.includes('docs'));
    const hasConfig = files.some(f =>
      f.includes('config') || f.endsWith('.json') || f.endsWith('.yaml')
    );

    if (hasTests) return 'test';
    if (hasDocs) return 'docs';
    if (hasConfig) return 'chore';
    return 'feat';
  }

  private findOldestLowPriorityChange(): PendingChange | undefined {
    let oldest: PendingChange | undefined;

    for (const change of this.pendingChanges.values()) {
      if (change.priority <= 3) {
        if (!oldest || change.queuedAt < oldest.queuedAt) {
          oldest = change;
        }
      }
    }

    return oldest;
  }

  private startAutoCommitInterval(): void {
    this.autoCommitInterval = setInterval(async () => {
      if (this.pendingChanges.size >= this.config.minChangesForAutoCommit) {
        const message = this.generateCommitMessage(Array.from(this.pendingChanges.values()));
        await this.batchCommit(`Auto-commit: ${message}`);
      }
    }, this.config.autoCommitIntervalMs);
  }

  private emitEvent(
    type: CommitEvent['type'],
    agentId: string,
    commitHash?: string,
    files?: string[],
    message?: string
  ): void {
    const event: CommitEvent = {
      type,
      agentId,
      commitHash,
      files,
      message,
      timestamp: Date.now(),
    };
    this.emit('commit', event);
  }
}
