/**
 * Workspace Integration Module
 *
 * Provides workspace management including:
 * - Workspace context management
 * - Basic file system operations
 * - Path resolution
 * - AGENTS.md file discovery and parsing
 */

import type { Logger } from '../../logger';
import type { WorkspaceManager } from '../../workspaces/workspaceManager';

// Re-export AgentsMdReader
export { AgentsMdReader, getAgentsMdReader } from './AgentsMdReader';

let workspaceManagerInstance: WorkspaceManager | null = null;

/**
 * Initialize workspace integration
 */
export async function initWorkspace(
  logger: Logger,
  workspaceManager: WorkspaceManager
): Promise<void> {
  workspaceManagerInstance = workspaceManager;
  logger.info('Workspace integration initialized');
}

/**
 * Get workspace manager instance
 */
export function getWorkspaceManager(): WorkspaceManager | null {
  return workspaceManagerInstance;
}

/**
 * Reset workspace integration
 */
export function resetWorkspace(): void {
  workspaceManagerInstance = null;
}