/**
 * Todo Task System Types
 * 
 * Extended type definitions for the enhanced agent todo/task tracking system.
 * Supports persistent storage, plan verification, and auto-continuation.
 */
import type { TodoItem, TodoStatus, TodoStats } from './todo';

/**
 * User's original plan/request that spawned the task list
 */
export interface UserPlan {
  /** Unique identifier for the plan */
  id: string;
  /** Original user message/request */
  originalRequest: string;
  /** Parsed requirements from the request */
  requirements: string[];
  /** Session ID this plan belongs to */
  sessionId: string;
  /** Run ID when plan was created */
  runId: string;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp when last updated */
  updatedAt: number;
  /** Whether the plan has been fully completed */
  isCompleted: boolean;
  /** Completion percentage (0-100) */
  completionPercentage: number;
}

/**
 * Task with extended metadata for persistence and verification
 */
export interface TaskItem extends TodoItem {
  /** Reference to parent plan ID */
  planId: string;
  /** Detailed description of what needs to be done */
  description?: string;
  /** Files that need to be modified for this task */
  targetFiles?: string[];
  /** Files that were actually modified */
  modifiedFiles?: string[];
  /** Verification status */
  verificationStatus?: 'pending' | 'verified' | 'failed';
  /** Verification notes */
  verificationNotes?: string;
  /** Subtasks for complex tasks */
  subtasks?: TaskItem[];
  /** Dependencies on other task IDs */
  dependencies?: string[];
  /** Estimated complexity (1-5) */
  complexity?: number;
  /** Actual time spent in ms */
  timeSpentMs?: number;
  /** Error encountered during execution */
  error?: string;
}

/**
 * Complete task session state for persistence
 */
export interface TaskSession {
  /** Unique session identifier */
  id: string;
  /** Task name/title for folder naming */
  taskName: string;
  /** Sanitized folder name */
  folderName: string;
  /** User's original plan */
  plan: UserPlan;
  /** All tasks in this session */
  tasks: TaskItem[];
  /** Session statistics */
  stats: TaskStats;
  /** Workspace path where this session is stored */
  workspacePath: string;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp when last updated */
  updatedAt: number;
  /** Number of iterations/attempts */
  iterationCount: number;
  /** History of verification attempts */
  verificationHistory: VerificationAttempt[];
}

/**
 * Extended statistics for task tracking
 */
export interface TaskStats extends TodoStats {
  /** Number of verified tasks */
  verified: number;
  /** Number of failed verifications */
  failed: number;
  /** Total time spent on all tasks */
  totalTimeSpentMs: number;
  /** Average task completion time */
  avgTaskTimeMs: number;
  /** Number of iterations needed */
  iterations: number;
}

/**
 * Verification attempt record
 */
export interface VerificationAttempt {
  /** Attempt ID */
  id: string;
  /** Timestamp of attempt */
  timestamp: number;
  /** Tasks that passed verification */
  passedTasks: string[];
  /** Tasks that failed verification */
  failedTasks: string[];
  /** New tasks created after verification */
  newTasksCreated: string[];
  /** Overall result */
  result: 'success' | 'partial' | 'failed';
  /** Notes about the verification */
  notes: string;
}

/**
 * Arguments for creating a new task plan
 */
export interface CreatePlanArgs {
  /** The user's original request */
  userRequest: string;
  /** Parsed requirements (optional, will be auto-parsed if not provided) */
  requirements?: string[];
  /** Task name for folder naming */
  taskName: string;
}

/**
 * Arguments for updating tasks
 */
export interface UpdateTasksArgs {
  /** Plan ID to update */
  planId: string;
  /** Tasks to update */
  tasks: Array<{
    id: string;
    content: string;
    status: TodoStatus;
    description?: string;
    targetFiles?: string[];
    complexity?: number;
    dependencies?: string[];
  }>;
}

/**
 * Arguments for verifying tasks against the plan
 */
export interface VerifyTasksArgs {
  /** Plan ID to verify */
  planId: string;
  /** Optional specific task IDs to verify (verifies all if not provided) */
  taskIds?: string[];
}

/**
 * Result of task verification
 */
export interface VerificationResult {
  /** Overall success */
  success: boolean;
  /** Plan completion percentage */
  completionPercentage: number;
  /** Tasks that passed */
  passedTasks: TaskItem[];
  /** Tasks that failed */
  failedTasks: TaskItem[];
  /** Unmet requirements from original plan */
  unmetRequirements: string[];
  /** Suggested new tasks to address failures */
  suggestedTasks: Array<{
    content: string;
    description: string;
    targetFiles?: string[];
  }>;
  /** Verification notes */
  notes: string;
}

/**
 * Calculate extended task statistics
 */
export function calculateTaskStats(tasks: TaskItem[]): TaskStats {
  const total = tasks.length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const verified = tasks.filter(t => t.verificationStatus === 'verified').length;
  const failed = tasks.filter(t => t.verificationStatus === 'failed').length;
  const completionPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  const totalTimeSpentMs = tasks.reduce((sum, t) => sum + (t.timeSpentMs || 0), 0);
  const completedWithTime = tasks.filter(t => t.status === 'completed' && t.timeSpentMs);
  const avgTaskTimeMs = completedWithTime.length > 0 
    ? Math.round(totalTimeSpentMs / completedWithTime.length) 
    : 0;

  return {
    total,
    pending,
    inProgress,
    completed,
    verified,
    failed,
    completionPercentage,
    totalTimeSpentMs,
    avgTaskTimeMs,
    iterations: 0, // Set by TaskSession
  };
}

/**
 * Sanitize a string for use as a folder name
 */
export function sanitizeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .substring(0, 50) // Limit length
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a unique plan ID
 */
export function generatePlanId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
