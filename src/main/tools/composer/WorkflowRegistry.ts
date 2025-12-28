/**
 * WorkflowRegistry
 *
 * Stores and manages registered composition workflows.
 * Provides a centralized registry for workflow lookup and management.
 */

import type { CompositionWorkflow } from './types';
import { getGlobalLogger } from '../../logger';

const logger = getGlobalLogger();

// =============================================================================
// Workflow Registry
// =============================================================================

/**
 * Registry for composition workflows
 */
export class WorkflowRegistry {
  private readonly workflows = new Map<string, CompositionWorkflow>();

  /**
   * Register a workflow
   */
  register(workflow: CompositionWorkflow): void {
    this.workflows.set(workflow.id, workflow);
    logger.debug('Workflow registered', { 
      workflowId: workflow.id, 
      name: workflow.name 
    });
  }

  /**
   * Unregister a workflow
   */
  unregister(workflowId: string): boolean {
    const deleted = this.workflows.delete(workflowId);
    if (deleted) {
      logger.debug('Workflow unregistered', { workflowId });
    }
    return deleted;
  }

  /**
   * Get a workflow by ID
   */
  getWorkflow(workflowId: string): CompositionWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * List all workflows
   */
  listWorkflows(): CompositionWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Check if a workflow exists
   */
  hasWorkflow(workflowId: string): boolean {
    return this.workflows.has(workflowId);
  }

  /**
   * Get workflow count
   */
  count(): number {
    return this.workflows.size;
  }

  /**
   * Clear all workflows
   */
  clear(): void {
    this.workflows.clear();
    logger.debug('Workflow registry cleared');
  }
}

// =============================================================================
// Singleton Access
// =============================================================================

let registryInstance: WorkflowRegistry | null = null;

/**
 * Get the singleton WorkflowRegistry instance
 */
export function getWorkflowRegistry(): WorkflowRegistry {
  if (!registryInstance) {
    registryInstance = new WorkflowRegistry();
  }
  return registryInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetWorkflowRegistry(): void {
  registryInstance?.clear();
  registryInstance = null;
}
