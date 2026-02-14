/**
 * Git Conflict Resolver
 *
 * Handles merge conflicts, providing
 * automatic resolution strategies and conflict detection.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';
import { getGitService } from '../../git';

// =============================================================================
// Types
// =============================================================================

export interface GitConflict {
  id: string;
  filePath: string;
  conflictType: 'merge' | 'rebase' | 'cherry-pick' | 'stash';
  ourChanges: string;
  theirChanges: string;
  baseContent?: string;
  detectedAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
  resolution?: ConflictResolutionType;
}

export type ConflictResolutionType =
  | 'ours'           // Keep our changes
  | 'theirs'         // Keep their changes
  | 'merge'          // Attempt automatic merge
  | 'manual'         // Requires manual resolution
  | 'abort';         // Abort the operation

export interface ConflictResolutionStrategy {
  type: ConflictResolutionType;
  priority: number;
  canAutoResolve: (conflict: GitConflict) => boolean;
  resolve: (conflict: GitConflict) => Promise<string>;
}

export interface ConflictEvent {
  type: 'conflict-detected' | 'conflict-resolved' | 'resolution-failed';
  conflictId: string;
  filePath: string;
  agentId?: string;
  resolution?: ConflictResolutionType;
  timestamp: number;
}

export interface GitConflictResolverConfig {
  enableAutoResolution: boolean;
  defaultStrategy: ConflictResolutionType;
  maxAutoResolveAttempts: number;
  conflictMarkerPattern: RegExp;
}

export const DEFAULT_GIT_CONFLICT_RESOLVER_CONFIG: GitConflictResolverConfig = {
  enableAutoResolution: true,
  defaultStrategy: 'manual',
  maxAutoResolveAttempts: 3,
  conflictMarkerPattern: /^<{7}|^={7}|^>{7}/m,
};

// =============================================================================
// GitConflictResolver
// =============================================================================

export class GitConflictResolver extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: GitConflictResolverConfig;
  private readonly activeConflicts = new Map<string, GitConflict>();
  private readonly resolvedConflicts: GitConflict[] = [];
  private readonly strategies = new Map<ConflictResolutionType, ConflictResolutionStrategy>();

  constructor(logger: Logger, config: Partial<GitConflictResolverConfig> = {}) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_GIT_CONFLICT_RESOLVER_CONFIG, ...config };
    this.registerDefaultStrategies();
  }

  /**
   * Detect conflicts in the current repository state
   */
  async detectConflicts(): Promise<GitConflict[]> {
    const git = getGitService();
    const status = await git.status();

    if (!status) return [];

    const conflicts: GitConflict[] = [];

    for (const filePath of status.conflicted) {
      const conflict = await this.analyzeConflict(filePath);
      if (conflict) {
        conflicts.push(conflict);
        this.activeConflicts.set(conflict.id, conflict);
        this.emitEvent('conflict-detected', conflict.id, filePath);
      }
    }

    return conflicts;
  }

  /**
   * Analyze a specific file for conflicts
   */
  async analyzeConflict(filePath: string): Promise<GitConflict | null> {
    try {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');

      if (!this.config.conflictMarkerPattern.test(content)) {
        return null;
      }

      const { ourChanges, theirChanges, baseContent } = this.parseConflictMarkers(content);

      return {
        id: randomUUID(),
        filePath,
        conflictType: 'merge',
        ourChanges,
        theirChanges,
        baseContent,
        detectedAt: Date.now(),
      };
    } catch (error) {
      this.logger.error('Failed to analyze conflict', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Attempt to resolve a conflict
   */
  async resolveConflict(
    conflictId: string,
    agentId: string,
    preferredStrategy?: ConflictResolutionType
  ): Promise<{ success: boolean; resolution?: ConflictResolutionType; error?: string }> {
    const conflict = this.activeConflicts.get(conflictId);
    if (!conflict) {
      return { success: false, error: 'Conflict not found' };
    }

    const strategy = preferredStrategy || this.config.defaultStrategy;

    // Check if auto-resolution is enabled
    if (!this.config.enableAutoResolution && strategy !== 'manual') {
      return { success: false, error: 'Auto-resolution is disabled' };
    }

    const resolver = this.strategies.get(strategy);
    if (!resolver) {
      return { success: false, error: `Unknown resolution strategy: ${strategy}` };
    }

    // Check if strategy can auto-resolve
    if (!resolver.canAutoResolve(conflict)) {
      return {
        success: false,
        error: `Strategy ${strategy} cannot auto-resolve this conflict`,
        resolution: 'manual',
      };
    }

    try {
      const resolvedContent = await resolver.resolve(conflict);

      // Write resolved content
      const fs = await import('node:fs/promises');
      await fs.writeFile(conflict.filePath, resolvedContent, 'utf-8');

      // Stage the resolved file
      const git = getGitService();
      await git.stage([conflict.filePath]);

      // Update conflict state
      conflict.resolvedAt = Date.now();
      conflict.resolvedBy = agentId;
      conflict.resolution = strategy;

      this.activeConflicts.delete(conflictId);
      this.resolvedConflicts.push(conflict);

      this.emitEvent('conflict-resolved', conflictId, conflict.filePath, agentId, strategy);
      this.logger.info('Conflict resolved', { conflictId, filePath: conflict.filePath, strategy });

      return { success: true, resolution: strategy };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitEvent('resolution-failed', conflictId, conflict.filePath, agentId);
      this.logger.error('Failed to resolve conflict', { conflictId, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Resolve all active conflicts with a strategy
   */
  async resolveAllConflicts(
    agentId: string,
    strategy: ConflictResolutionType = 'ours'
  ): Promise<{ resolved: number; failed: number; errors: string[] }> {
    const results = { resolved: 0, failed: 0, errors: [] as string[] };

    for (const [conflictId] of this.activeConflicts) {
      const result = await this.resolveConflict(conflictId, agentId, strategy);
      if (result.success) {
        results.resolved++;
      } else {
        results.failed++;
        if (result.error) {
          results.errors.push(result.error);
        }
      }
    }

    return results;
  }

  /**
   * Abort the current merge/operation
   */
  async abortOperation(): Promise<boolean> {
    const git = getGitService();

    try {
      // Use checkout HEAD to reset working tree state
      // GitService doesn't expose raw() — checkout is the best available method
      await git.checkout('HEAD');
      this.activeConflicts.clear();
      return true;
    } catch (error) {
      this.logger.error('Failed to abort operation', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get active conflicts
   */
  getActiveConflicts(): GitConflict[] {
    return Array.from(this.activeConflicts.values());
  }

  /**
   * Get conflict by ID
   */
  getConflict(conflictId: string): GitConflict | undefined {
    return this.activeConflicts.get(conflictId);
  }

  /**
   * Get resolved conflicts history
   */
  getResolvedConflicts(limit: number = 50): GitConflict[] {
    return this.resolvedConflicts.slice(-limit);
  }

  /**
   * Register a custom resolution strategy
   */
  registerStrategy(strategy: ConflictResolutionStrategy): void {
    this.strategies.set(strategy.type, strategy);
  }

  /**
   * Check if there are active conflicts
   */
  hasConflicts(): boolean {
    return this.activeConflicts.size > 0;
  }

  /**
   * Clear all tracked conflicts
   */
  clear(): void {
    this.activeConflicts.clear();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private registerDefaultStrategies(): void {
    // "Ours" strategy - keep our changes
    this.strategies.set('ours', {
      type: 'ours',
      priority: 1,
      canAutoResolve: () => true,
      resolve: async (conflict) => conflict.ourChanges,
    });

    // "Theirs" strategy - keep their changes
    this.strategies.set('theirs', {
      type: 'theirs',
      priority: 1,
      canAutoResolve: () => true,
      resolve: async (conflict) => conflict.theirChanges,
    });

    // "Merge" strategy - attempt automatic merge
    this.strategies.set('merge', {
      type: 'merge',
      priority: 2,
      canAutoResolve: (conflict) => this.canAutoMerge(conflict),
      resolve: async (conflict) => this.autoMerge(conflict),
    });

    // "Manual" strategy - requires user intervention
    this.strategies.set('manual', {
      type: 'manual',
      priority: 0,
      canAutoResolve: () => false,
      resolve: async () => {
        throw new Error('Manual resolution required');
      },
    });

    // "Abort" strategy - abort the operation
    this.strategies.set('abort', {
      type: 'abort',
      priority: 0,
      canAutoResolve: () => true,
      resolve: async () => {
        await this.abortOperation();
        throw new Error('Operation aborted');
      },
    });
  }

  private parseConflictMarkers(content: string): {
    ourChanges: string;
    theirChanges: string;
    baseContent?: string;
  } {
    const lines = content.split('\n');
    let ourChanges = '';
    let theirChanges = '';
    let baseContent = '';
    let section: 'none' | 'ours' | 'base' | 'theirs' = 'none';

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        section = 'ours';
        continue;
      }
      if (line.startsWith('|||||||')) {
        section = 'base';
        continue;
      }
      if (line.startsWith('=======')) {
        section = 'theirs';
        continue;
      }
      if (line.startsWith('>>>>>>>')) {
        section = 'none';
        continue;
      }

      switch (section) {
        case 'ours':
          ourChanges += line + '\n';
          break;
        case 'base':
          baseContent += line + '\n';
          break;
        case 'theirs':
          theirChanges += line + '\n';
          break;
        case 'none':
          // Content outside conflict markers
          ourChanges += line + '\n';
          theirChanges += line + '\n';
          break;
      }
    }

    return {
      ourChanges: ourChanges.trimEnd(),
      theirChanges: theirChanges.trimEnd(),
      baseContent: baseContent ? baseContent.trimEnd() : undefined,
    };
  }

  private canAutoMerge(conflict: GitConflict): boolean {
    // Simple heuristic: can auto-merge if changes don't overlap
    const ourLines = new Set(conflict.ourChanges.split('\n'));
    const theirLines = new Set(conflict.theirChanges.split('\n'));

    // Check for overlapping changes
    let overlapping = 0;
    for (const line of ourLines) {
      if (theirLines.has(line) && line.trim() !== '') {
        overlapping++;
      }
    }

    // If most lines are unique, we can try to merge
    const totalUnique = ourLines.size + theirLines.size - overlapping;
    return overlapping / totalUnique < 0.3;
  }

  private autoMerge(conflict: GitConflict): string {
    // Simple line-based merge
    const ourLines = conflict.ourChanges.split('\n');
    const theirLines = conflict.theirChanges.split('\n');
    const baseLines = conflict.baseContent?.split('\n') || [];

    const merged: string[] = [];
    const maxLen = Math.max(ourLines.length, theirLines.length, baseLines.length);

    for (let i = 0; i < maxLen; i++) {
      const ourLine = ourLines[i];
      const theirLine = theirLines[i];
      const baseLine = baseLines[i];

      if (ourLine === theirLine) {
        // Same change or no change
        if (ourLine !== undefined) merged.push(ourLine);
      } else if (ourLine === baseLine) {
        // We didn't change, they did
        if (theirLine !== undefined) merged.push(theirLine);
      } else if (theirLine === baseLine) {
        // They didn't change, we did
        if (ourLine !== undefined) merged.push(ourLine);
      } else {
        // Both changed differently - include both
        if (ourLine !== undefined) merged.push(ourLine);
        if (theirLine !== undefined && theirLine !== ourLine) {
          merged.push(theirLine);
        }
      }
    }

    return merged.join('\n');
  }

  private emitEvent(
    type: ConflictEvent['type'],
    conflictId: string,
    filePath: string,
    agentId?: string,
    resolution?: ConflictResolutionType
  ): void {
    const event: ConflictEvent = {
      type,
      conflictId,
      filePath,
      agentId,
      resolution,
      timestamp: Date.now(),
    };
    this.emit('conflict', event);
  }
}
