/**
 * Workflow Validator
 *
 * Validates workflow definitions for correctness and safety.
 */
import type { CompositionWorkflow, WorkflowStep } from '../../../shared/types';
import type { WorkflowValidationResult, WorkflowValidationError } from './types';
import { createLogger } from '../../logger';

const logger = createLogger('WorkflowValidator');

/**
 * Maximum allowed workflow depth
 */
const MAX_WORKFLOW_DEPTH = 50;

/**
 * Maximum allowed parallel branches
 */
const MAX_PARALLEL_BRANCHES = 10;

/**
 * Maximum allowed loop iterations (exported for external use)
 */
export const MAX_LOOP_ITERATIONS = 100;

// Log initialization for debugging
logger.debug('WorkflowValidator initialized', { MAX_WORKFLOW_DEPTH, MAX_PARALLEL_BRANCHES, MAX_LOOP_ITERATIONS });

/**
 * Workflow Validator class
 */
export class WorkflowValidator {
  /**
   * Validate a workflow definition
   */
  validate(workflow: CompositionWorkflow): WorkflowValidationResult {
    const errors: WorkflowValidationError[] = [];
    const warnings: WorkflowValidationError[] = [];

    // Basic field validation
    this.validateBasicFields(workflow, errors, warnings);

    // Validate steps
    this.validateSteps(workflow.steps, errors, warnings);

    // Check for circular dependencies
    this.checkCircularDependencies(workflow.steps, errors);

    // Compute execution order
    let executionOrder: string[][] | undefined;
    if (errors.length === 0) {
      executionOrder = this.computeExecutionOrder(workflow.steps);
      if (!executionOrder) {
        errors.push({
          code: 'EXECUTION_ORDER_FAILED',
          message: 'Failed to compute valid execution order (possible circular dependencies)',
        });
      }
    }

    // Validate depth and complexity
    this.validateComplexity(workflow, executionOrder, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      executionOrder,
    };
  }

  /**
   * Validate basic workflow fields
   */
  private validateBasicFields(
    workflow: CompositionWorkflow,
    errors: WorkflowValidationError[],
    warnings: WorkflowValidationError[]
  ): void {
    if (!workflow.id || workflow.id.trim() === '') {
      errors.push({
        code: 'MISSING_ID',
        message: 'Workflow must have an ID',
        field: 'id',
      });
    }

    if (!workflow.name || workflow.name.trim() === '') {
      errors.push({
        code: 'MISSING_NAME',
        message: 'Workflow must have a name',
        field: 'name',
      });
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      errors.push({
        code: 'NO_STEPS',
        message: 'Workflow must have at least one step',
        field: 'steps',
      });
    }

    if (workflow.steps && workflow.steps.length > MAX_WORKFLOW_DEPTH) {
      errors.push({
        code: 'TOO_MANY_STEPS',
        message: `Workflow has too many steps (max: ${MAX_WORKFLOW_DEPTH})`,
        field: 'steps',
      });
    }

    if (!workflow.description || workflow.description.length < 5) {
      warnings.push({
        code: 'SHORT_DESCRIPTION',
        message: 'Consider adding a more detailed description',
        field: 'description',
      });
    }
  }

  /**
   * Validate individual steps
   */
  private validateSteps(
    steps: WorkflowStep[],
    errors: WorkflowValidationError[],
    warnings: WorkflowValidationError[]
  ): void {
    const stepIds = new Set<string>();

    for (const step of steps) {
      // Check for duplicate IDs
      if (stepIds.has(step.id)) {
        errors.push({
          code: 'DUPLICATE_STEP_ID',
          message: `Duplicate step ID: ${step.id}`,
          stepId: step.id,
          field: 'id',
        });
      }
      stepIds.add(step.id);

      // Validate step fields
      this.validateStep(step, stepIds, errors, warnings);
    }
  }

  /**
   * Validate a single step
   */
  private validateStep(
    step: WorkflowStep,
    allStepIds: Set<string>,
    errors: WorkflowValidationError[],
    warnings: WorkflowValidationError[]
  ): void {
    if (!step.id || step.id.trim() === '') {
      errors.push({
        code: 'MISSING_STEP_ID',
        message: 'Step must have an ID',
        field: 'id',
      });
    }

    if (!step.toolName || step.toolName.trim() === '') {
      errors.push({
        code: 'MISSING_TOOL_NAME',
        message: 'Step must specify a tool',
        stepId: step.id,
        field: 'toolName',
      });
    }

    // Validate dependencies exist
    for (const depId of step.dependsOn) {
      // Can't check future steps yet, but we can check format
      if (!depId || depId.trim() === '') {
        errors.push({
          code: 'INVALID_DEPENDENCY',
          message: 'Empty dependency reference',
          stepId: step.id,
          field: 'dependsOn',
        });
      }
    }

    // Validate bindings
    if (step.bindings) {
      for (const binding of step.bindings) {
        if (!binding.source || !binding.target) {
          errors.push({
            code: 'INVALID_BINDING',
            message: 'Binding must have source and target',
            stepId: step.id,
            field: 'bindings',
          });
        }

        // Source should reference 'input' or a step ID
        if (binding.source !== 'input' && !step.dependsOn.includes(binding.source)) {
          warnings.push({
            code: 'BINDING_SOURCE_NOT_DEPENDENCY',
            message: `Binding source "${binding.source}" is not in dependsOn`,
            stepId: step.id,
            field: 'bindings',
          });
        }
      }
    }

    // Validate error handling
    const validErrorHandlers = ['abort', 'skip', 'retry', 'fallback'];
    if (!validErrorHandlers.includes(step.onError)) {
      errors.push({
        code: 'INVALID_ERROR_HANDLER',
        message: `Invalid onError value: ${step.onError}`,
        stepId: step.id,
        field: 'onError',
      });
    }

    if (step.onError === 'retry' && (!step.retryCount || step.retryCount < 1)) {
      warnings.push({
        code: 'MISSING_RETRY_COUNT',
        message: 'Retry error handler should specify retryCount',
        stepId: step.id,
        field: 'retryCount',
      });
    }

    if (step.onError === 'fallback' && step.fallbackValue === undefined) {
      warnings.push({
        code: 'MISSING_FALLBACK_VALUE',
        message: 'Fallback error handler should specify fallbackValue',
        stepId: step.id,
        field: 'fallbackValue',
      });
    }
  }

  /**
   * Check for circular dependencies
   */
  private checkCircularDependencies(
    steps: WorkflowStep[],
    errors: WorkflowValidationError[]
  ): void {
    const stepMap = new Map<string, WorkflowStep>();
    for (const step of steps) {
      stepMap.set(step.id, step);
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stepId: string): boolean => {
      if (recursionStack.has(stepId)) {
        return true;
      }
      if (visited.has(stepId)) {
        return false;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        for (const depId of step.dependsOn) {
          if (hasCycle(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of steps) {
      if (hasCycle(step.id)) {
        errors.push({
          code: 'CIRCULAR_DEPENDENCY',
          message: `Circular dependency detected involving step: ${step.id}`,
          stepId: step.id,
        });
        break; // One error is enough
      }
    }
  }

  /**
   * Compute execution order (levels for parallel execution)
   */
  computeExecutionOrder(steps: WorkflowStep[]): string[][] | null {
    const stepMap = new Map<string, WorkflowStep>();
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    // Initialize
    for (const step of steps) {
      stepMap.set(step.id, step);
      inDegree.set(step.id, step.dependsOn.length);
      dependents.set(step.id, []);
    }

    // Build dependency graph
    for (const step of steps) {
      for (const depId of step.dependsOn) {
        const deps = dependents.get(depId);
        if (deps) {
          deps.push(step.id);
        }
      }
    }

    // Kahn's algorithm for topological sort with levels
    const levels: string[][] = [];
    const ready: string[] = [];

    // Find initial ready steps (no dependencies)
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        ready.push(id);
      }
    }

    while (ready.length > 0) {
      // All steps in 'ready' can execute in parallel
      const level = [...ready];
      levels.push(level);
      ready.length = 0;

      // Process this level
      for (const stepId of level) {
        const deps = dependents.get(stepId) || [];
        for (const depId of deps) {
          const newDegree = (inDegree.get(depId) || 1) - 1;
          inDegree.set(depId, newDegree);
          if (newDegree === 0) {
            ready.push(depId);
          }
        }
      }
    }

    // Check if all steps were processed
    const processedCount = levels.reduce((sum, level) => sum + level.length, 0);
    if (processedCount !== steps.length) {
      return null; // Circular dependency
    }

    return levels;
  }

  /**
   * Validate workflow complexity
   */
  private validateComplexity(
    workflow: CompositionWorkflow,
    executionOrder: string[][] | undefined,
    errors: WorkflowValidationError[],
    warnings: WorkflowValidationError[]
  ): void {
    // Check maximum depth
    if (executionOrder && executionOrder.length > MAX_WORKFLOW_DEPTH) {
      errors.push({
        code: 'TOO_DEEP',
        message: `Workflow is too deep (${executionOrder.length} levels, max: ${MAX_WORKFLOW_DEPTH})`,
      });
    }

    // Check maximum parallelism
    if (executionOrder) {
      for (const level of executionOrder) {
        if (level.length > MAX_PARALLEL_BRANCHES) {
          warnings.push({
            code: 'HIGH_PARALLELISM',
            message: `Level has ${level.length} parallel steps (max recommended: ${MAX_PARALLEL_BRANCHES})`,
          });
        }
      }
    }

    // Check for potential infinite loops (steps depending on themselves)
    for (const step of workflow.steps) {
      if (step.dependsOn.includes(step.id)) {
        errors.push({
          code: 'SELF_DEPENDENCY',
          message: `Step "${step.id}" depends on itself`,
          stepId: step.id,
        });
      }
    }
  }

  /**
   * Validate dependencies exist
   */
  validateDependenciesExist(
    steps: WorkflowStep[],
    availableTools: Set<string>
  ): WorkflowValidationError[] {
    const errors: WorkflowValidationError[] = [];
    const stepIds = new Set(steps.map(s => s.id));

    for (const step of steps) {
      // Check tool exists
      if (!availableTools.has(step.toolName)) {
        errors.push({
          code: 'TOOL_NOT_FOUND',
          message: `Tool "${step.toolName}" not found`,
          stepId: step.id,
          field: 'toolName',
        });
      }

      // Check dependencies exist
      for (const depId of step.dependsOn) {
        if (!stepIds.has(depId)) {
          errors.push({
            code: 'DEPENDENCY_NOT_FOUND',
            message: `Dependency "${depId}" not found in workflow`,
            stepId: step.id,
            field: 'dependsOn',
          });
        }
      }
    }

    return errors;
  }
}

// Singleton instance
let validatorInstance: WorkflowValidator | null = null;

/**
 * Get or create the workflow validator singleton
 */
export function getWorkflowValidator(): WorkflowValidator {
  if (!validatorInstance) {
    validatorInstance = new WorkflowValidator();
  }
  return validatorInstance;
}
