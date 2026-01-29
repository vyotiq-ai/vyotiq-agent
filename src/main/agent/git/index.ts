/**
 * Git Integration Module
 *
 * Provides git integration including:
 * - Operation management and access control
 * - Conflict detection and resolution
 * - Branch management for agent isolation
 * - Commit management for agents
 */

export {
  GitOperationManager,
  type GitAccessLevel,
  type GitOperationRequest,
  type GitOperationType,
  type GitOperationResult,
  type GitOperationEvent,
  type AgentGitPermissions,
  type GitOperationManagerConfig,
  DEFAULT_GIT_OPERATION_MANAGER_CONFIG,
} from './GitOperationManager';

export {
  GitConflictResolver,
  type GitConflict,
  type ConflictResolutionType,
  type ConflictResolutionStrategy,
  type ConflictEvent,
  type GitConflictResolverConfig,
  DEFAULT_GIT_CONFLICT_RESOLVER_CONFIG,
} from './ConflictResolver';

export {
  BranchManager,
  type BranchStrategy,
  type AgentBranch,
  type BranchEvent,
  type BranchManagerConfig,
  DEFAULT_BRANCH_MANAGER_CONFIG,
} from './BranchManager';

export {
  CommitCoordinator,
  type PendingChange,
  type CommitRequest,
  type CommitEvent,
  type CommitCoordinatorConfig,
  DEFAULT_COMMIT_COORDINATOR_CONFIG,
} from './CommitCoordinator';

// =============================================================================
// Singleton Access
// =============================================================================

import type { Logger } from '../../logger';
// LockManager import removed - system no longer exists
import { GitOperationManager } from './GitOperationManager';
import { GitConflictResolver } from './ConflictResolver';
import { BranchManager } from './BranchManager';
import { CommitCoordinator } from './CommitCoordinator';

let gitOperationManagerInstance: GitOperationManager | null = null;
let gitConflictResolverInstance: GitConflictResolver | null = null;
let branchManagerInstance: BranchManager | null = null;
let commitCoordinatorInstance: CommitCoordinator | null = null;

/**
 * Initialize all git integration components
 */
export function initGitIntegration(
  logger: Logger
): {
  operationManager: GitOperationManager;
  conflictResolver: GitConflictResolver;
  branchManager: BranchManager;
  commitCoordinator: CommitCoordinator;
} {
  gitOperationManagerInstance = new GitOperationManager(logger);
  gitConflictResolverInstance = new GitConflictResolver(logger);
  branchManagerInstance = new BranchManager(logger);
  commitCoordinatorInstance = new CommitCoordinator(logger);

  // Initialize async components
  branchManagerInstance.initialize().catch(err => {
    logger.error('Failed to initialize BranchManager', { error: err });
  });
  commitCoordinatorInstance.initialize();

  logger.info('Git integration initialized');

  return {
    operationManager: gitOperationManagerInstance,
    conflictResolver: gitConflictResolverInstance,
    branchManager: branchManagerInstance,
    commitCoordinator: commitCoordinatorInstance,
  };
}

/**
 * Get the GitOperationManager instance
 */
export function getGitOperationManager(): GitOperationManager | null {
  return gitOperationManagerInstance;
}

/**
 * Get the GitConflictResolver instance
 */
export function getGitConflictResolver(): GitConflictResolver | null {
  return gitConflictResolverInstance;
}

/**
 * Get the BranchManager instance
 */
export function getBranchManager(): BranchManager | null {
  return branchManagerInstance;
}

/**
 * Get the CommitCoordinator instance
 */
export function getCommitCoordinator(): CommitCoordinator | null {
  return commitCoordinatorInstance;
}

/**
 * Shutdown all git integration components
 */
export function shutdownGitIntegration(): void {
  branchManagerInstance?.shutdown();
  commitCoordinatorInstance?.shutdown();
  gitOperationManagerInstance?.reset();
  gitConflictResolverInstance?.clear();

  gitOperationManagerInstance = null;
  gitConflictResolverInstance = null;
  branchManagerInstance = null;
  commitCoordinatorInstance = null;
}
