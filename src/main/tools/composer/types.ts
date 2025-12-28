/**
 * Composer Types
 *
 * Type definitions for the tool composition system.
 */
import type {
  WorkflowStep,
  CompositionWorkflow,
  WorkflowContext,
  WorkflowExecutionResult,
  DataBinding,
  DataTransformType,
} from '../../../shared/types';
import type { ToolExecutionContext } from '../types';

// Re-export shared types for convenience
export type {
  WorkflowStep,
  CompositionWorkflow,
  WorkflowContext,
  WorkflowExecutionResult,
  DataBinding,
  DataTransformType,
};

/**
 * Step execution result
 */
export interface StepExecutionResult {
  /** Step ID */
  stepId: string;
  /** Whether step succeeded */
  success: boolean;
  /** Step output */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Whether step was skipped */
  skipped?: boolean;
  /** Skip reason */
  skipReason?: string;
}

/**
 * Workflow execution options
 */
export interface WorkflowExecutionOptions {
  /** Session ID */
  sessionId: string;
  /** Run ID */
  runId?: string;
  /** Agent ID */
  agentId?: string;
  /** Override timeout */
  timeoutMs?: number;
  /** Override token budget */
  tokenBudget?: number;
  /** Continue on step failure */
  continueOnError?: boolean;
  /** Maximum parallel steps */
  maxParallel?: number;
  /** Tool execution context (for tool execution) */
  toolContext?: ToolExecutionContext;
  /** Progress callback */
  onProgress?: (stepId: string, status: string, result?: unknown) => void;
}

/**
 * Validation error for workflows
 */
export interface WorkflowValidationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Related step ID */
  stepId?: string;
  /** Related field */
  field?: string;
}

/**
 * Workflow validation result
 */
export interface WorkflowValidationResult {
  /** Whether workflow is valid */
  valid: boolean;
  /** Validation errors */
  errors: WorkflowValidationError[];
  /** Validation warnings */
  warnings: WorkflowValidationError[];
  /** Computed execution order */
  executionOrder?: string[][];
}

/**
 * Workflow execution progress
 */
export interface WorkflowProgress {
  /** Workflow ID */
  workflowId: string;
  /** Total steps */
  totalSteps: number;
  /** Completed steps */
  completedSteps: number;
  /** Current step ID */
  currentStep?: string;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Elapsed time in ms */
  elapsedMs: number;
  /** Estimated remaining time in ms */
  estimatedRemainingMs?: number;
}
