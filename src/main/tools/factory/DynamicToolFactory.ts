/**
 * DynamicToolFactory - Creates composite tools that chain existing tools
 *
 * Focused on the only use case that matters: composing existing tools together.
 * Removed: templates, sandboxing, rate limiting, anomaly detection (never used).
 */

import { createLogger } from '../../logger';
import type { ToolRegistry } from '../registry/ToolRegistry';
import type { ToolCategory, ToolExecutionContext } from '../types';

const logger = createLogger('DynamicToolFactory');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolCreationOptions {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description */
  description: string;
  /** Chain of tool calls to execute */
  steps: CompositeStep[];
  /** Optional category for organization */
  category?: ToolCategory;
}

export interface CompositeStep {
  /** Name of existing tool to call */
  toolName: string;
  /** Input to pass (can reference previous step outputs via $stepN) */
  input: Record<string, unknown>;
  /** Optional: only run if condition is met */
  condition?: string;
  /** How to handle errors: 'stop' (default) or 'continue' */
  onError?: 'stop' | 'continue';
}

export interface ToolCreationResult {
  success: boolean;
  toolName?: string;
  error?: string;
}

interface StepResult {
  success: boolean;
  output: unknown;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export class DynamicToolFactory {
  private registry: ToolRegistry;
  private createdTools: Map<string, ToolCreationOptions> = new Map();

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  /**
   * Create a composite tool from a chain of existing tools
   */
  async createTool(options: ToolCreationOptions): Promise<ToolCreationResult> {
    const { name, description, steps, category } = options;

    // Validate
    if (!name || !description || !steps?.length) {
      return {
        success: false,
        error: 'Missing required fields: name, description, and steps',
      };
    }

    // Check for duplicate
    if (this.createdTools.has(name)) {
      return {
        success: false,
        error: `Tool "${name}" already exists`,
      };
    }

    // Validate all referenced tools exist
    for (const step of steps) {
      if (!this.registry.has(step.toolName)) {
        return {
          success: false,
          error: `Step references unknown tool: ${step.toolName}`,
        };
      }
    }

    // Store the definition
    this.createdTools.set(name, options);

    // Register the composite tool
    this.registry.register({
      name,
      description,
      category: category ?? 'other',
      requiresApproval: false,
      riskLevel: 'safe',
      schema: {
        type: 'object' as const,
        properties: {
          input: {
            type: 'object',
            description: 'Input data for the composite tool',
          },
        },
      },
      execute: async (params: Record<string, unknown>, context: ToolExecutionContext) => {
        const result = await this.executeComposite(options, params, context);
        return {
          toolName: name,
          success: true,
          output: typeof result === 'string' ? result : JSON.stringify(result),
        };
      },
    });

    logger.info(`Created composite tool: ${name}`, { steps: steps.length });

    return {
      success: true,
      toolName: name,
    };
  }

  /**
   * Execute a composite tool by running its steps in sequence
   */
  private async executeComposite(
    options: ToolCreationOptions,
    initialInput: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<unknown> {
    const stepResults: StepResult[] = [];
    let currentInput = initialInput;

    for (let i = 0; i < options.steps.length; i++) {
      const step = options.steps[i];

      // Check condition if present
      if (step.condition && !this.evaluateCondition(step.condition, stepResults)) {
        logger.debug(`Skipping step ${i + 1} (condition not met)`);
        stepResults.push({ success: true, output: null });
        continue;
      }

      // Get the tool
      const tool = this.registry.getDefinition(step.toolName);
      if (!tool) {
        const error = `Tool not found: ${step.toolName}`;
        logger.error(error);
        if (step.onError === 'continue') {
          stepResults.push({ success: false, output: null, error });
          continue;
        }
        throw new Error(error);
      }

      // Resolve input (replace $stepN references)
      const resolvedInput = this.resolveInput(step.input, stepResults, currentInput);

      try {
        // Execute the step with proper context
        const result = await tool.execute(resolvedInput, context);
        stepResults.push({ success: true, output: result });
        currentInput = { ...currentInput, [`step${i + 1}`]: result };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error(`Step ${i + 1} failed`, { tool: step.toolName, error });

        if (step.onError === 'continue') {
          stepResults.push({ success: false, output: null, error });
          continue;
        }
        throw err;
      }
    }

    // Return the last successful result
    const lastResult = stepResults.filter((r) => r.success).pop();
    return lastResult?.output ?? null;
  }

  /**
   * Resolve $stepN references in input
   */
  private resolveInput(
    input: Record<string, unknown>,
    stepResults: StepResult[],
    initialInput: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        // Handle $stepN.path references
        const match = value.match(/^\$step(\d+)(\..*)?$/);
        if (match) {
          const stepNum = parseInt(match[1], 10) - 1;
          const path = match[2]?.slice(1); // Remove leading dot

          if (stepNum >= 0 && stepNum < stepResults.length) {
            let result = stepResults[stepNum].output;
            if (path && result && typeof result === 'object') {
              result = this.getNestedValue(result as Record<string, unknown>, path);
            }
            resolved[key] = result;
            continue;
          }
        }

        // Handle $input.path references
        const inputMatch = value.match(/^\$input(\..*)?$/);
        if (inputMatch) {
          const path = inputMatch[1]?.slice(1);
          resolved[key] = path
            ? this.getNestedValue(initialInput, path)
            : initialInput;
          continue;
        }
      }

      resolved[key] = value;
    }

    return resolved;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj as unknown);
  }

  /**
   * Evaluate a simple condition (supports $stepN.success checks)
   */
  private evaluateCondition(condition: string, stepResults: StepResult[]): boolean {
    // Simple pattern: $stepN.success
    const match = condition.match(/^\$step(\d+)\.success$/);
    if (match) {
      const stepNum = parseInt(match[1], 10) - 1;
      return stepNum >= 0 && stepNum < stepResults.length && stepResults[stepNum].success;
    }

    // Default to true for unknown conditions
    return true;
  }

  /**
   * Get a created tool definition
   */
  getTool(name: string): ToolCreationOptions | undefined {
    return this.createdTools.get(name);
  }

  /**
   * List all created tools
   */
  listTools(): string[] {
    return Array.from(this.createdTools.keys());
  }

  /**
   * Remove a created tool
   */
  removeTool(name: string): boolean {
    if (!this.createdTools.has(name)) {
      return false;
    }
    this.createdTools.delete(name);
    // Note: Can't unregister from ToolRegistry, but the definition is gone
    logger.info(`Removed composite tool: ${name}`);
    return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Access
// ─────────────────────────────────────────────────────────────────────────────

let factoryInstance: DynamicToolFactory | null = null;

export function initDynamicToolFactory(registry: ToolRegistry): DynamicToolFactory {
  factoryInstance = new DynamicToolFactory(registry);
  return factoryInstance;
}

export function getDynamicToolFactory(): DynamicToolFactory {
  if (!factoryInstance) {
    throw new Error('DynamicToolFactory not initialized. Call initDynamicToolFactory first.');
  }
  return factoryInstance;
}
