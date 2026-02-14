/**
 * GitOperationManager
 *
 * Coordinates git operations, ensuring safe
 * concurrent access and preventing conflicts during autonomous workflows.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../../logger';
import { getGitService } from '../../git';
// LockManager import removed - system no longer exists

// =============================================================================
// Types
// =============================================================================

export type GitAccessLevel = 'read' | 'branch' | 'commit' | 'push';

export interface GitOperationRequest {
  id: string;
  agentId: string;
  operation: GitOperationType;
  params: Record<string, unknown>;
  accessLevel: GitAccessLevel;
  requestedAt: number;
  priority: number;
}

export type GitOperationType =
  | 'status'
  | 'log'
  | 'blame'
  | 'branch-list'
  | 'branch-create'
  | 'branch-delete'
  | 'checkout'
  | 'stage'
  | 'unstage'
  | 'commit'
  | 'stash'
  | 'stash-pop'
  | 'merge'
  | 'fetch'
  | 'pull'
  | 'push';

export interface GitOperationResult {
  success: boolean;
  operationId: string;
  data?: unknown;
  error?: string;
  duration: number;
  queued?: boolean;
}

export interface GitOperationEvent {
  type: 'operation-started' | 'operation-completed' | 'operation-failed' | 'access-denied';
  operationId: string;
  agentId: string;
  operation: GitOperationType;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface AgentGitPermissions {
  allowCommit: boolean;
  allowBranch: boolean;
  allowMerge: boolean;
  allowPush: boolean;
  requireConfirmation: GitOperationType[];
}

export interface GitOperationManagerConfig {
  defaultPermissions: AgentGitPermissions;
  operationTimeoutMs: number;
  maxConcurrentOperations: number;
  enableAuditLog: boolean;
  protectedBranches: string[];
}

export const DEFAULT_GIT_OPERATION_MANAGER_CONFIG: GitOperationManagerConfig = {
  defaultPermissions: {
    allowCommit: true,
    allowBranch: true,
    allowMerge: false,
    allowPush: false,
    requireConfirmation: ['push', 'merge'],
  },
  operationTimeoutMs: 60000,
  maxConcurrentOperations: 5,
  enableAuditLog: true,
  protectedBranches: ['main', 'master', 'develop'],
};

interface AuditLogEntry {
  id: string;
  agentId: string;
  operation: GitOperationType;
  params: Record<string, unknown>;
  result: 'success' | 'failure' | 'denied';
  error?: string;
  timestamp: number;
  duration: number;
}

// =============================================================================
// GitOperationManager
// =============================================================================

export class GitOperationManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: GitOperationManagerConfig;
  private readonly agentPermissions = new Map<string, AgentGitPermissions>();
  private readonly activeOperations = new Map<string, GitOperationRequest>();
  private readonly auditLog: AuditLogEntry[] = [];
  private readonly operationQueue: GitOperationRequest[] = [];
  private isProcessingQueue = false;

  constructor(
    logger: Logger,
    config: Partial<GitOperationManagerConfig> = {}
  ) {
    super();
    this.logger = logger;
    this.config = { ...DEFAULT_GIT_OPERATION_MANAGER_CONFIG, ...config };
  }

  /**
   * Request access to perform a git operation
   */
  async requestAccess(
    agentId: string,
    operation: GitOperationType,
    params: Record<string, unknown> = {},
    priority: number = 5
  ): Promise<GitOperationResult> {
    const startTime = Date.now();
    const operationId = randomUUID();

    // Check permissions
    const permissions = this.getAgentPermissions(agentId);
    const accessLevel = this.getRequiredAccessLevel(operation);

    if (!this.hasPermission(permissions, accessLevel, operation)) {
      this.logAudit(agentId, operation, params, 'denied', undefined, Date.now() - startTime);
      this.emitEvent('access-denied', operationId, agentId, operation);
      return {
        success: false,
        operationId,
        error: `Agent ${agentId} does not have permission for ${operation}`,
        duration: Date.now() - startTime,
      };
    }

    // Check protected branches for certain operations
    if (this.isProtectedBranchOperation(operation, params)) {
      this.logAudit(agentId, operation, params, 'denied', 'Protected branch', Date.now() - startTime);
      return {
        success: false,
        operationId,
        error: 'Operation on protected branch requires user confirmation',
        duration: Date.now() - startTime,
      };
    }

    // Check concurrent operation limit
    if (this.activeOperations.size >= this.config.maxConcurrentOperations) {
      // Queue the operation
      const request: GitOperationRequest = {
        id: operationId,
        agentId,
        operation,
        params,
        accessLevel,
        requestedAt: Date.now(),
        priority,
      };
      this.operationQueue.push(request);
      this.operationQueue.sort((a, b) => b.priority - a.priority);

      this.logger.debug('Git operation queued', { operationId, agentId, operation });
      return {
        success: true,
        operationId,
        queued: true,
        error: undefined,
        duration: Date.now() - startTime,
      };
    }

    // Execute operation
    const request: GitOperationRequest = {
      id: operationId,
      agentId,
      operation,
      params,
      accessLevel,
      requestedAt: Date.now(),
      priority,
    };
    this.activeOperations.set(operationId, request);
    this.emitEvent('operation-started', operationId, agentId, operation);

    try {
      const result = await this.executeOperation(operation, params);
      const duration = Date.now() - startTime;

      this.logAudit(agentId, operation, params, 'success', undefined, duration);
      this.emitEvent('operation-completed', operationId, agentId, operation, { result });

      return {
        success: true,
        operationId,
        data: result,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.logAudit(agentId, operation, params, 'failure', errorMsg, duration);
      this.emitEvent('operation-failed', operationId, agentId, operation, { error: errorMsg });

      return {
        success: false,
        operationId,
        error: errorMsg,
        duration,
      };
    } finally {
      this.activeOperations.delete(operationId);

      // Process queue
      this.processQueue();
    }
  }

  /**
   * Set permissions for an agent
   */
  setAgentPermissions(agentId: string, permissions: Partial<AgentGitPermissions>): void {
    const current = this.getAgentPermissions(agentId);
    this.agentPermissions.set(agentId, { ...current, ...permissions });
    this.logger.debug('Agent git permissions updated', { agentId, permissions });
  }

  /**
   * Get permissions for an agent
   */
  getAgentPermissions(agentId: string): AgentGitPermissions {
    return this.agentPermissions.get(agentId) || { ...this.config.defaultPermissions };
  }

  /**
   * Get operation history for an agent
   */
  getOperationHistory(agentId?: string, limit: number = 100): AuditLogEntry[] {
    let entries = this.auditLog;
    if (agentId) {
      entries = entries.filter(e => e.agentId === agentId);
    }
    return entries.slice(-limit);
  }

  /**
   * Get active operations
   */
  getActiveOperations(): GitOperationRequest[] {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Get queued operations
   */
  getQueuedOperations(): GitOperationRequest[] {
    return [...this.operationQueue];
  }

  /**
   * Cancel a queued operation
   */
  cancelQueuedOperation(operationId: string): boolean {
    const idx = this.operationQueue.findIndex(op => op.id === operationId);
    if (idx !== -1) {
      this.operationQueue.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all agent permissions and reset
   */
  reset(): void {
    this.agentPermissions.clear();
    this.activeOperations.clear();
    this.operationQueue.length = 0;
    this.auditLog.length = 0;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async executeOperation(
    operation: GitOperationType,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const git = getGitService();

    switch (operation) {
      case 'status':
        return git.status();

      case 'log':
        return git.log({
          maxCount: params.maxCount as number | undefined,
          skip: params.skip as number | undefined,
          filePath: params.filePath as string | undefined,
        });

      case 'blame':
        return git.blame(params.filePath as string);

      case 'branch-list':
        return git.branches(params.all as boolean | undefined);

      case 'branch-create':
        return git.createBranch(params.name as string, params.startPoint as string | undefined);

      case 'branch-delete':
        return git.deleteBranch(params.name as string, params.force as boolean | undefined);

      case 'checkout':
        return git.checkout(params.ref as string, { create: params.create as boolean | undefined });

      case 'stage':
        return git.stage(params.paths as string[]);

      case 'unstage':
        return git.unstage(params.paths as string[]);

      case 'commit':
        return git.commit(params.message as string, {
          amend: params.amend as boolean | undefined,
          all: params.all as boolean | undefined,
        });

      case 'stash':
        return git.stash(params.message as string | undefined);

      case 'stash-pop':
        return git.stashPop(params.index as number | undefined);

      case 'merge':
        return git.merge(params.branch as string, {
          noFf: params.noFf as boolean | undefined,
          squash: params.squash as boolean | undefined,
        });

      case 'fetch':
        return git.fetch(params.remote as string | undefined, params.prune as boolean | undefined);

      case 'pull':
        return git.pull(params.remote as string | undefined, params.branch as string | undefined);

      case 'push':
        return git.push(
          params.remote as string | undefined,
          params.branch as string | undefined,
          {
            force: params.force as boolean | undefined,
            setUpstream: params.setUpstream as boolean | undefined,
          }
        );

      default:
        throw new Error(`Unknown git operation: ${operation}`);
    }
  }

  private getRequiredAccessLevel(operation: GitOperationType): GitAccessLevel {
    switch (operation) {
      case 'status':
      case 'log':
      case 'blame':
      case 'branch-list':
        return 'read';

      case 'branch-create':
      case 'branch-delete':
      case 'checkout':
        return 'branch';

      case 'stage':
      case 'unstage':
      case 'commit':
      case 'stash':
      case 'stash-pop':
      case 'merge':
        return 'commit';

      case 'fetch':
      case 'pull':
      case 'push':
        return 'push';

      default:
        return 'read';
    }
  }

  private hasPermission(
    permissions: AgentGitPermissions,
    accessLevel: GitAccessLevel,
    operation: GitOperationType
  ): boolean {
    // Check if operation requires confirmation
    if (permissions.requireConfirmation.includes(operation)) {
      return false; // Requires user confirmation
    }

    switch (accessLevel) {
      case 'read':
        return true;
      case 'branch':
        return permissions.allowBranch;
      case 'commit':
        return permissions.allowCommit;
      case 'push':
        return permissions.allowPush;
      default:
        return false;
    }
  }

  private isProtectedBranchOperation(
    operation: GitOperationType,
    params: Record<string, unknown>
  ): boolean {
    const protectedOps: GitOperationType[] = ['branch-delete', 'push', 'merge'];
    if (!protectedOps.includes(operation)) return false;

    const branchName = (params.branch || params.name || params.ref) as string | undefined;
    if (!branchName) return false;

    return this.config.protectedBranches.some(
      protectedBranch => branchName === protectedBranch || branchName.endsWith(`/${protectedBranch}`)
    );
  }

  private logAudit(
    agentId: string,
    operation: GitOperationType,
    params: Record<string, unknown>,
    result: 'success' | 'failure' | 'denied',
    error: string | undefined,
    duration: number
  ): void {
    if (!this.config.enableAuditLog) return;

    const entry: AuditLogEntry = {
      id: randomUUID(),
      agentId,
      operation,
      params,
      result,
      error,
      timestamp: Date.now(),
      duration,
    };

    this.auditLog.push(entry);

    // Keep audit log bounded
    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, 100);
    }
  }

  private emitEvent(
    type: GitOperationEvent['type'],
    operationId: string,
    agentId: string,
    operation: GitOperationType,
    details?: Record<string, unknown>
  ): void {
    const event: GitOperationEvent = {
      type,
      operationId,
      agentId,
      operation,
      timestamp: Date.now(),
      details,
    };
    this.emit('git-operation', event);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    if (this.operationQueue.length === 0) return;
    if (this.activeOperations.size >= this.config.maxConcurrentOperations) return;

    this.isProcessingQueue = true;

    try {
      while (
        this.operationQueue.length > 0 &&
        this.activeOperations.size < this.config.maxConcurrentOperations
      ) {
        const request = this.operationQueue.shift();
        if (!request) break;

        // Re-execute the request
        await this.requestAccess(
          request.agentId,
          request.operation,
          request.params,
          request.priority
        );
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }
}
