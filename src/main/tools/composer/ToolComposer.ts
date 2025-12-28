/**
 * Tool Composer
 *
 * Executes composition workflows - chains of tools with data transformation.
 */
import type {
  CompositionWorkflow,
  WorkflowContext,
  WorkflowExecutionResult,
  WorkflowStep,
} from '../../../shared/types';
import type {
  WorkflowExecutionOptions,
  StepExecutionResult,
  WorkflowProgress,
} from './types';
import { createLogger } from '../../logger';
import { getDataTransformer } from './DataTransformer';
import { getWorkflowValidator } from './WorkflowValidator';
import type { ToolRegistry } from '../registry/ToolRegistry';

const logger = createLogger('ToolComposer');

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: WorkflowProgress) => void;

/**
 * Tool Composer class
 */
export class ToolComposer {
  private activeWorkflows = new Map<string, {
    context: WorkflowContext;
    startTime: number;
    aborted: boolean;
  }>();

  constructor(private toolRegistry: ToolRegistry) {}

  /**
   * Execute a composition workflow
   */
  async execute(
    workflow: CompositionWorkflow,
    input: Record<string, unknown>,
    options: WorkflowExecutionOptions,
    onProgress?: ProgressCallback
  ): Promise<WorkflowExecutionResult> {
    const startTime = Date.now();
    const transformer = getDataTransformer();
    const validator = getWorkflowValidator();

    // Validate workflow
    const validation = validator.validate(workflow);
    if (!validation.valid) {
      logger.error('Workflow validation failed', { 
        workflowId: workflow.id, 
        errors: validation.errors 
      });
      return {
        workflowId: workflow.id,
        success: false,
        error: validation.errors.map(e => e.message).join('; '),
        stepResults: [],
        totalDurationMs: Date.now() - startTime,
        tokensUsed: 0,
      };
    }

    // Validate tools exist
    const availableTools = new Set(this.toolRegistry.list().map(t => t.name));
    const toolErrors = validator.validateDependenciesExist(workflow.steps, availableTools);
    if (toolErrors.length > 0) {
      logger.error('Workflow tool validation failed', { 
        workflowId: workflow.id, 
        errors: toolErrors 
      });
      return {
        workflowId: workflow.id,
        success: false,
        error: toolErrors.map(e => e.message).join('; '),
        stepResults: [],
        totalDurationMs: Date.now() - startTime,
        tokensUsed: 0,
      };
    }

    // Initialize context
    const context: WorkflowContext = {
      workflowId: workflow.id,
      input,
      variables: { input },
      stepOutputs: new Map(),
      startedAt: startTime,
      tokensUsed: 0,
    };

    // Track active workflow
    this.activeWorkflows.set(workflow.id, {
      context,
      startTime,
      aborted: false,
    });

    const stepResults: StepExecutionResult[] = [];
    const executionOrder = validation.executionOrder!;
    let lastOutput: unknown;

    try {
      // Execute each level
      for (let levelIndex = 0; levelIndex < executionOrder.length; levelIndex++) {
        const level = executionOrder[levelIndex];
        
        // Check timeout
        if (workflow.timeoutMs && Date.now() - startTime > workflow.timeoutMs) {
          throw new Error('Workflow timeout exceeded');
        }

        // Check if aborted
        const active = this.activeWorkflows.get(workflow.id);
        if (active?.aborted) {
          throw new Error('Workflow was aborted');
        }

        // Report progress
        if (onProgress) {
          const completedSteps = stepResults.length;
          onProgress({
            workflowId: workflow.id,
            totalSteps: workflow.steps.length,
            completedSteps,
            currentStep: level[0],
            percentage: Math.round((completedSteps / workflow.steps.length) * 100),
            elapsedMs: Date.now() - startTime,
            estimatedRemainingMs: completedSteps > 0 
              ? Math.round(((Date.now() - startTime) / completedSteps) * (workflow.steps.length - completedSteps))
              : undefined,
          });
        }

        // Execute steps in parallel if multiple in level
        const maxParallel = options.maxParallel ?? 5;
        const levelResults: StepExecutionResult[] = [];

        for (let i = 0; i < level.length; i += maxParallel) {
          const batch = level.slice(i, i + maxParallel);
          const batchPromises = batch.map(stepId => {
            const step = workflow.steps.find(s => s.id === stepId)!;
            return this.executeStep(step, context, transformer, options);
          });

          const batchResults = await Promise.all(batchPromises);
          levelResults.push(...batchResults);

          // Update context with results
          for (const result of batchResults) {
            if (result.success && result.output !== undefined) {
              const step = workflow.steps.find(s => s.id === result.stepId)!;
              const outputKey = step.outputAs || step.id;
              context.variables[outputKey] = result.output;
              context.stepOutputs.set(result.stepId, result.output);
              lastOutput = result.output;
            }
          }

          // Check for abort errors
          for (const result of batchResults) {
            if (!result.success && !result.skipped) {
              const step = workflow.steps.find(s => s.id === result.stepId)!;
              if (step.onError === 'abort' && !options.continueOnError) {
                stepResults.push(...levelResults);
                throw new Error(`Step ${result.stepId} failed: ${result.error}`);
              }
            }
          }
        }

        stepResults.push(...levelResults);
      }

      // Extract final output
      let finalOutput: unknown;
      if (workflow.outputExtraction && workflow.outputExtraction.length > 0) {
        const extracted: Record<string, unknown> = {};
        for (const binding of workflow.outputExtraction) {
          extracted[binding.target] = transformer.applyBinding(
            binding,
            context.variables
          );
        }
        finalOutput = extracted;
      } else {
        finalOutput = lastOutput;
      }

      logger.info('Workflow completed', {
        workflowId: workflow.id,
        stepsExecuted: stepResults.length,
        durationMs: Date.now() - startTime,
      });

      return {
        workflowId: workflow.id,
        success: true,
        output: finalOutput,
        stepResults,
        totalDurationMs: Date.now() - startTime,
        tokensUsed: context.tokensUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Workflow failed', {
        workflowId: workflow.id,
        error: errorMessage,
        stepsExecuted: stepResults.length,
      });

      return {
        workflowId: workflow.id,
        success: false,
        error: errorMessage,
        stepResults,
        totalDurationMs: Date.now() - startTime,
        tokensUsed: context.tokensUsed,
      };
    } finally {
      this.activeWorkflows.delete(workflow.id);
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: WorkflowStep,
    context: WorkflowContext,
    transformer: ReturnType<typeof getDataTransformer>,
    options: WorkflowExecutionOptions
  ): Promise<StepExecutionResult> {
    const startTime = Date.now();

    // Check condition
    if (step.condition) {
      const conditionMet = transformer.evaluateCondition(step.condition, context.variables);
      if (!conditionMet) {
        return {
          stepId: step.id,
          success: true,
          skipped: true,
          skipReason: `Condition not met: ${step.condition}`,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Resolve bindings
    let args = step.staticArgs ? transformer.deepCopy(step.staticArgs) : {};
    if (step.bindings && step.bindings.length > 0) {
      const resolved = transformer.resolveBindings(step.bindings, context.variables);
      args = transformer.mergeArgs(args, resolved);
    }

    // Get tool
    const tool = this.toolRegistry.getDefinition(step.toolName);
    if (!tool) {
      return {
        stepId: step.id,
        success: false,
        error: `Tool not found: ${step.toolName}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Use provided toolContext or throw if not available
    if (!options.toolContext) {
      return {
        stepId: step.id,
        success: false,
        error: 'Tool execution context required for workflow execution',
        durationMs: Date.now() - startTime,
      };
    }

    const toolContext = options.toolContext;

    // Execute with retry if needed
    let lastError: string | undefined;
    const maxAttempts = step.onError === 'retry' ? (step.retryCount ?? 3) : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await tool.execute(args, toolContext);

        if (result.success) {
          // Parse output if it's JSON
          let output: unknown = result.output;
          if (typeof output === 'string') {
            try {
              output = JSON.parse(output);
            } catch {
              // Keep as string
            }
          }

          return {
            stepId: step.id,
            success: true,
            output,
            durationMs: Date.now() - startTime,
          };
        } else {
          lastError = result.output;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      // Wait before retry
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    // Handle failure
    if (step.onError === 'fallback') {
      return {
        stepId: step.id,
        success: true,
        output: step.fallbackValue,
        durationMs: Date.now() - startTime,
      };
    }

    if (step.onError === 'skip') {
      return {
        stepId: step.id,
        success: true,
        skipped: true,
        skipReason: `Step failed and was skipped: ${lastError}`,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      stepId: step.id,
      success: false,
      error: lastError,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Abort a running workflow
   */
  abort(workflowId: string): boolean {
    const active = this.activeWorkflows.get(workflowId);
    if (active) {
      active.aborted = true;
      logger.info('Workflow aborted', { workflowId });
      return true;
    }
    return false;
  }

  /**
   * Get status of an active workflow
   */
  getStatus(workflowId: string): WorkflowProgress | null {
    const active = this.activeWorkflows.get(workflowId);
    if (!active) return null;

    return {
      workflowId,
      totalSteps: 0, // Would need workflow reference
      completedSteps: active.context.stepOutputs.size,
      currentStep: active.context.currentStep,
      percentage: 0,
      elapsedMs: Date.now() - active.startTime,
    };
  }

  /**
   * Check if a workflow is active
   */
  isActive(workflowId: string): boolean {
    return this.activeWorkflows.has(workflowId);
  }

  /**
   * Get all active workflow IDs
   */
  getActiveWorkflowIds(): string[] {
    return Array.from(this.activeWorkflows.keys());
  }
}

// Factory function to create composer with registry
let composerInstance: ToolComposer | null = null;

/**
 * Create or get the tool composer
 */
export function getToolComposer(toolRegistry: ToolRegistry): ToolComposer {
  if (!composerInstance) {
    composerInstance = new ToolComposer(toolRegistry);
  }
  return composerInstance;
}

/**
 * Create a new tool composer instance
 */
export function createToolComposer(toolRegistry: ToolRegistry): ToolComposer {
  return new ToolComposer(toolRegistry);
}
