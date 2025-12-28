/**
 * Workflow Builder
 *
 * Fluent API for constructing composition workflows.
 */
import { randomUUID } from 'node:crypto';
import type {
  CompositionWorkflow,
  WorkflowStep,
  DataBinding,
  DataTransformType,
} from '../../../shared/types';
import type { SecurityActor } from '../../agent/security/SecurityAuditLog';

/**
 * Workflow Builder class
 */
export class WorkflowBuilder {
  private workflow: Partial<CompositionWorkflow>;
  private steps: WorkflowStep[] = [];
  private lastStepId: string | null = null;

  constructor(name: string, description?: string) {
    this.workflow = {
      id: randomUUID(),
      name,
      description: description || name,
      createdAt: Date.now(),
    };
  }

  /**
   * Set workflow ID
   */
  withId(id: string): this {
    this.workflow.id = id;
    return this;
  }

  /**
   * Set workflow description
   */
  withDescription(description: string): this {
    this.workflow.description = description;
    return this;
  }

  /**
   * Set input schema
   */
  withInputSchema(schema: Record<string, unknown>): this {
    this.workflow.inputSchema = schema;
    return this;
  }

  /**
   * Set timeout
   */
  withTimeout(timeoutMs: number): this {
    this.workflow.timeoutMs = timeoutMs;
    return this;
  }

  /**
   * Set token budget
   */
  withTokenBudget(budget: number): this {
    this.workflow.tokenBudget = budget;
    return this;
  }

  /**
   * Set creator info
   */
  createdBy(actor: SecurityActor): this {
    this.workflow.createdBy = {
      sessionId: actor.sessionId,
      runId: actor.runId,
      agentId: actor.agentId,
    };
    return this;
  }

  /**
   * Add a step that starts the workflow (no dependencies)
   */
  start(toolName: string, stepId?: string): StepBuilder {
    const id = stepId || `step_${this.steps.length + 1}`;
    const step: WorkflowStep = {
      id,
      toolName,
      dependsOn: [],
      onError: 'abort',
    };
    this.steps.push(step);
    this.lastStepId = id;
    return new StepBuilder(this, step);
  }

  /**
   * Add a step that depends on the previous step
   */
  then(toolName: string, stepId?: string): StepBuilder {
    const id = stepId || `step_${this.steps.length + 1}`;
    const step: WorkflowStep = {
      id,
      toolName,
      dependsOn: this.lastStepId ? [this.lastStepId] : [],
      onError: 'abort',
    };
    this.steps.push(step);
    this.lastStepId = id;
    return new StepBuilder(this, step);
  }

  /**
   * Add a step that depends on specific steps
   */
  after(dependsOn: string[], toolName: string, stepId?: string): StepBuilder {
    const id = stepId || `step_${this.steps.length + 1}`;
    const step: WorkflowStep = {
      id,
      toolName,
      dependsOn,
      onError: 'abort',
    };
    this.steps.push(step);
    this.lastStepId = id;
    return new StepBuilder(this, step);
  }

  /**
   * Add multiple steps that can run in parallel (all depend on the same step)
   */
  parallel(steps: Array<{ toolName: string; stepId?: string }>): StepBuilder[] {
    const dependsOn = this.lastStepId ? [this.lastStepId] : [];
    const builders: StepBuilder[] = [];
    const parallelIds: string[] = [];

    for (const { toolName, stepId } of steps) {
      const id = stepId || `step_${this.steps.length + 1}`;
      const step: WorkflowStep = {
        id,
        toolName,
        dependsOn: [...dependsOn],
        onError: 'abort',
      };
      this.steps.push(step);
      parallelIds.push(id);
      builders.push(new StepBuilder(this, step));
    }

    // Set lastStepId to null so next step must explicitly depend
    this.lastStepId = null;
    return builders;
  }

  /**
   * Add a step that waits for all parallel steps to complete
   */
  join(parallelStepIds: string[], toolName: string, stepId?: string): StepBuilder {
    const id = stepId || `step_${this.steps.length + 1}`;
    const step: WorkflowStep = {
      id,
      toolName,
      dependsOn: parallelStepIds,
      onError: 'abort',
    };
    this.steps.push(step);
    this.lastStepId = id;
    return new StepBuilder(this, step);
  }

  /**
   * Add a conditional step
   */
  when(condition: string, toolName: string, stepId?: string): StepBuilder {
    const id = stepId || `step_${this.steps.length + 1}`;
    const step: WorkflowStep = {
      id,
      toolName,
      dependsOn: this.lastStepId ? [this.lastStepId] : [],
      condition,
      onError: 'skip',
    };
    this.steps.push(step);
    // Don't update lastStepId for conditional steps
    return new StepBuilder(this, step);
  }

  /**
   * Set output extraction
   */
  output(extraction: DataBinding[]): this {
    this.workflow.outputExtraction = extraction;
    return this;
  }

  /**
   * Build the workflow
   */
  build(): CompositionWorkflow {
    if (!this.workflow.createdBy) {
      this.workflow.createdBy = {
        sessionId: 'unknown',
      };
    }

    return {
      id: this.workflow.id!,
      name: this.workflow.name!,
      description: this.workflow.description!,
      steps: this.steps,
      inputSchema: this.workflow.inputSchema,
      outputExtraction: this.workflow.outputExtraction,
      timeoutMs: this.workflow.timeoutMs,
      tokenBudget: this.workflow.tokenBudget,
      createdBy: this.workflow.createdBy,
      createdAt: this.workflow.createdAt!,
    };
  }

  /**
   * Get the current steps
   */
  getSteps(): WorkflowStep[] {
    return [...this.steps];
  }

  /**
   * Get the last step ID
   */
  getLastStepId(): string | null {
    return this.lastStepId;
  }
}

/**
 * Step Builder for configuring individual steps
 */
export class StepBuilder {
  constructor(
    private workflowBuilder: WorkflowBuilder,
    private step: WorkflowStep
  ) {}

  /**
   * Set static arguments
   */
  withArgs(args: Record<string, unknown>): this {
    this.step.staticArgs = args;
    return this;
  }

  /**
   * Add a data binding
   */
  bind(target: string, source: string, sourcePath: string, transform?: DataTransformType): this {
    if (!this.step.bindings) {
      this.step.bindings = [];
    }
    this.step.bindings.push({
      source,
      sourcePath,
      target,
      transform,
    });
    return this;
  }

  /**
   * Bind from input
   */
  bindInput(target: string, sourcePath: string, transform?: DataTransformType): this {
    return this.bind(target, 'input', sourcePath, transform);
  }

  /**
   * Bind from a previous step
   */
  bindFrom(target: string, stepId: string, sourcePath: string, transform?: DataTransformType): this {
    return this.bind(target, stepId, sourcePath, transform);
  }

  /**
   * Set the output key for this step
   */
  outputAs(key: string): this {
    this.step.outputAs = key;
    return this;
  }

  /**
   * Set error handling to abort
   */
  onErrorAbort(): this {
    this.step.onError = 'abort';
    return this;
  }

  /**
   * Set error handling to skip
   */
  onErrorSkip(): this {
    this.step.onError = 'skip';
    return this;
  }

  /**
   * Set error handling to retry
   */
  onErrorRetry(count: number = 3): this {
    this.step.onError = 'retry';
    this.step.retryCount = count;
    return this;
  }

  /**
   * Set error handling to fallback
   */
  onErrorFallback(value: unknown): this {
    this.step.onError = 'fallback';
    this.step.fallbackValue = value;
    return this;
  }

  /**
   * Set condition for this step
   */
  condition(expr: string): this {
    this.step.condition = expr;
    return this;
  }

  /**
   * Chain to next step
   */
  then(toolName: string, stepId?: string): StepBuilder {
    return this.workflowBuilder.then(toolName, stepId);
  }

  /**
   * Add parallel steps
   */
  parallel(steps: Array<{ toolName: string; stepId?: string }>): StepBuilder[] {
    return this.workflowBuilder.parallel(steps);
  }

  /**
   * Build the workflow
   */
  build(): CompositionWorkflow {
    return this.workflowBuilder.build();
  }

  /**
   * Get the step
   */
  getStep(): WorkflowStep {
    return this.step;
  }

  /**
   * Get the workflow builder
   */
  getWorkflowBuilder(): WorkflowBuilder {
    return this.workflowBuilder;
  }
}

/**
 * Create a new workflow builder
 */
export function workflow(name: string, description?: string): WorkflowBuilder {
  return new WorkflowBuilder(name, description);
}
