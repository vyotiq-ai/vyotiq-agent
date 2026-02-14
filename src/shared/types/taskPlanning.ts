/**
 * Task Planning Types
 *
 * Types for task analysis, decomposition, subtask management,
 * resource allocation, and execution planning.
 *
 * @module types/taskPlanning
 */

/**
 * Task intent type (mirrors canonical definition in types.ts)
 * Duplicated here to avoid circular dependency with parent module.
 */
type TaskIntentType = 'create' | 'modify' | 'fix' | 'explain' | 'understand' | 'research' | 'automate' | 'review' | 'test' | 'refactor' | 'document' | 'unknown';

// =============================================================================
// Phase 4: Task Analysis Types
// =============================================================================

/**
 * Requirements extracted from the task
 */
export interface TaskRequirements {
  /** Files that need to be read or modified */
  targetFiles: string[];
  /** Files that may need to be created */
  newFiles: string[];
  /** Expected output format */
  outputFormat?: 'code' | 'explanation' | 'both' | 'file-changes';
  /** User-specified constraints */
  constraints: string[];
  /** Quality requirements */
  qualityRequirements: string[];
  /** Inferred context from conversation */
  context: string[];
}

/**
 * Dependency relationship between subtasks
 */
export interface TaskDependency {
  /** ID of the dependent subtask */
  subtaskId: string;
  /** IDs of subtasks this depends on */
  dependsOn: string[];
  /** Type of dependency */
  type: 'sequential' | 'data' | 'resource';
  /** Whether this is a hard dependency (must complete) or soft (preferred) */
  isHard: boolean;
}

/**
 * Individual subtask in a decomposed task
 */
export interface SubTask {
  /** Unique identifier */
  id: string;
  /** Parent subtask ID (for hierarchical decomposition) */
  parentId?: string;
  /** Order within parent or root */
  order: number;
  /** Subtask name */
  name: string;
  /** Detailed description */
  description: string;
  /** Type of subtask */
  type: TaskIntentType;
  /** Target files for this subtask */
  targetFiles: string[];
  /** Estimated token cost */
  estimatedTokens: number;
  /** Estimated time in milliseconds */
  estimatedTimeMs: number;
  /** Current state */
  state: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  /** Result of execution */
  result?: {
    success: boolean;
    output?: string;
    error?: string;
    tokensUsed?: number;
    timeMs?: number;
  };
  /** Dependencies */
  dependencies: string[];
  /** Priority (lower = higher priority) */
  priority: number;
  /** Can be executed in parallel with other subtasks */
  canParallelize: boolean;
}

/**
 * Decomposition pattern type
 */
export type DecompositionPattern =
  | 'sequential'   // Tasks in order
  | 'parallel'     // Independent tasks
  | 'hierarchical' // Tasks with subtasks
  | 'iterative';   // Repeat until condition

/**
 * Execution plan for a decomposed task
 */
export interface TaskPlan {
  /** Unique identifier */
  id: string;
  /** Analysis that generated this plan */
  analysisId: string;
  /** Session this plan belongs to */
  sessionId: string;
  /** Root subtasks */
  subtasks: SubTask[];
  /** All dependencies */
  dependencies: TaskDependency[];
  /** Decomposition pattern used */
  pattern: DecompositionPattern;
  /** Total estimated tokens */
  totalEstimatedTokens: number;
  /** Total estimated time in milliseconds */
  totalEstimatedTimeMs: number;
  /** Plan creation timestamp */
  createdAt: number;
  /** Plan state */
  state: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';
  /** Progress percentage (0-100) */
  progress: number;
  /** Execution start time */
  startedAt?: number;
  /** Execution end time */
  completedAt?: number;
  /** Maximum parallel execution */
  maxParallelism: number;
  /** Whether plan was validated */
  isValidated: boolean;
  /** Validation errors if any */
  validationErrors: string[];
}

// =============================================================================
// Phase 4: Resource Types
// =============================================================================

/**
 * Types of resources that can be allocated
 */
export type ResourceType = 'tokens' | 'agents' | 'files' | 'terminals' | 'time' | 'api-calls';

/**
 * Strategy for resource allocation
 */
export type AllocationStrategy = 'fair-share' | 'priority' | 'fifo' | 'greedy' | 'reserved';

/**
 * Resource allocation record
 */
export interface ResourceAllocation {
  id: string;
  type: ResourceType;
  amount: number;
  used: number;
  holderId?: string;
  agentId?: string;
  holderType: 'session' | 'agent' | 'run';
  status: 'pending' | 'granted' | 'released' | 'expired';
  grantedAt: number;
  expiresAt?: number;
  isActive: boolean;
}

/**
 * Resource budget configuration
 */
export interface ResourceBudget {
  type: ResourceType;
  total: number;
  allocated: number;
  available: number;
  reserved: number;
}

/**
 * Resource budget item
 */
export interface ResourceBudgetItem {
  id: string;
  type: ResourceType;
  total: number;
  allocated: number;
  used: number;
  reserved: number;
  softLimit: number;
  hardLimit: number;
  isExhausted: boolean;
  percentUsed: number;
  ownerId: string;
  ownerType: 'session' | 'agent' | 'run';
}

/**
 * Resource usage tracking
 */
export interface ResourceUsage {
  type: ResourceType;
  current: number;
  peak: number;
  average: number;
  timestamp: number;
}

/**
 * Resource usage metrics
 */
export interface ResourceUsageMetrics {
  type: ResourceType;
  current: number;
  peak: number;
  average: number;
  history: Array<{ timestamp: number; value: number }>;
  allocationCount: number;
  releaseCount: number;
  waitTimeStats: {
    min: number;
    max: number;
    average: number;
  };
}

// =============================================================================
// Phase 4: Resource Allocation Types (Extended)
// =============================================================================

/**
 * Request for resource allocation
 */
export interface ResourceRequest {
  /** Unique request ID */
  id: string;
  /** Type of resource requested */
  type: ResourceType;
  /** Amount requested */
  amount: number;
  /** Requesting agent ID (null for main agent) */
  agentId?: string;
  /** Priority of the request */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** Reason for the request */
  reason: string;
  /** Maximum time to wait for allocation */
  timeoutMs?: number;
  /** Whether to queue if not immediately available */
  allowQueue: boolean;
  /** Timestamp of request */
  requestedAt: number;
}

/**
 * Result of an allocation attempt
 */
export interface AllocationResult {
  /** Whether allocation succeeded */
  success: boolean;
  /** Allocation if successful */
  allocation?: ResourceAllocation;
  /** Error message if failed */
  error?: string;
  /** Whether request was queued */
  queued: boolean;
  /** Position in queue if queued */
  queuePosition?: number;
  /** Estimated wait time if queued */
  estimatedWaitMs?: number;
}

/**
 * Resource pool status
 */
export interface ResourcePoolStatus {
  /** Pool type */
  type: ResourceType;
  /** Total capacity */
  capacity: number;
  /** Available amount */
  available: number;
  /** Active allocations count */
  activeAllocations: number;
  /** Queued requests count */
  queuedRequests: number;
  /** Pool health */
  health: 'healthy' | 'degraded' | 'exhausted';
  /** Last update timestamp */
  updatedAt: number;
}
