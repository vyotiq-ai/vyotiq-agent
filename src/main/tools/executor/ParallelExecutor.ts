/**
 * Parallel Tool Executor
 * 
 * Enables concurrent execution of independent tools following 2025 best practices:
 * - Fan-out/Fan-in pattern for parallel execution
 * - Dependency analysis to identify parallelizable tools
 * - Semaphore-based concurrency control
 * - Promise.allSettled for graceful partial failure handling
 * 
 * @see https://getathenic.com/blog/ai-agent-orchestration-patterns-enterprise
 * @see https://skywork.ai/blog/agent/parallel-execution
 */

import type { ToolCallPayload } from '../../../shared/types';
import { categorizeToolName } from '../../../shared/utils/toolUtils';
import type { EnhancedToolResult, ToolCategory } from '../types';

// =============================================================================
// Types
// =============================================================================

/** Result of parallel tool execution */
export interface ParallelExecutionResult {
  /** All results in original order */
  results: EnhancedToolResult[];
  /** Tools that succeeded */
  succeeded: string[];
  /** Tools that failed */
  failed: string[];
  /** Total execution time (wall clock) */
  totalDurationMs: number;
  /** Time saved compared to sequential execution */
  timeSavedMs: number;
  /** Whether any tool was executed in parallel */
  wasParallel: boolean;
}

/** Tool with dependency information */
export interface ToolWithDependencies {
  tool: ToolCallPayload;
  index: number;
  dependencies: number[]; // Indices of tools this depends on
  canParallelize: boolean;
  targetPath?: string;
  category: ToolCategory;
  action?: string; // Tool action type (create, edit, read, etc.)
}

/** Execution group - tools that can run together */
export interface ExecutionGroup {
  tools: ToolWithDependencies[];
  isParallel: boolean;
}

/** Configuration for parallel execution */
export interface ParallelExecutionConfig {
  /** Maximum concurrent tool executions (default: 5) */
  maxConcurrency: number;
  /** Enable parallel execution (default: true) */
  enabled: boolean;
  /** Timeout per tool in ms (default: 120000) */
  toolTimeoutMs: number;
  /** Categories that can never run in parallel */
  sequentialCategories: ToolCategory[];
}

export const DEFAULT_PARALLEL_CONFIG: ParallelExecutionConfig = {
  maxConcurrency: 5,
  enabled: true,
  toolTimeoutMs: 120000,
  sequentialCategories: ['terminal'], // Terminal commands should be sequential
};

// =============================================================================
// Tool Dependency Analyzer
// =============================================================================

/**
 * Analyzes tool calls to determine which can run in parallel.
 * 
 * Rules for parallelization:
 * 1. Read-only tools (file-read, file-search) can always run in parallel
 * 2. Write tools to DIFFERENT files can run in parallel
 * 3. Write tools to the SAME file must be sequential
 * 4. Terminal commands are sequential (shared state)
 * 5. A write tool depends on any prior read of the same file
 */
export function analyzeToolDependencies(
  tools: ToolCallPayload[],
  config: ParallelExecutionConfig = DEFAULT_PARALLEL_CONFIG
): ToolWithDependencies[] {
  const analyzed: ToolWithDependencies[] = [];
  
  // Track file access for dependency detection
  const fileReads = new Map<string, number[]>(); // path -> indices that read it
  const fileWrites = new Map<string, number[]>(); // path -> indices that write it
  
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const { category, action } = categorizeToolName(tool.name);
    const targetPath = extractTargetPath(tool);
    
    const dependencies: number[] = [];
    let canParallelize = config.enabled;
    
    // Sequential categories can never parallelize
    if (config.sequentialCategories.includes(category)) {
      canParallelize = false;
      // Depends on all previous tools
      for (let j = 0; j < i; j++) {
        dependencies.push(j);
      }
    } else if (category === 'file-write' && targetPath) {
      // Write operations depend on:
      // 1. Any previous write to the same file
      // 2. Any previous read of the same file (read-before-write pattern)
      const prevWrites = fileWrites.get(targetPath) || [];
      const prevReads = fileReads.get(targetPath) || [];
      
      dependencies.push(...prevWrites, ...prevReads);
      
      // Track this write
      if (!fileWrites.has(targetPath)) {
        fileWrites.set(targetPath, []);
      }
      fileWrites.get(targetPath)!.push(i);
    } else if ((category === 'file-read' || category === 'file-search') && targetPath) {
      // Read operations depend on any previous write to the same file
      const prevWrites = fileWrites.get(targetPath) || [];
      dependencies.push(...prevWrites);
      
      // Track this read
      if (!fileReads.has(targetPath)) {
        fileReads.set(targetPath, []);
      }
      fileReads.get(targetPath)!.push(i);
    }
    
    // Remove duplicates and sort
    const uniqueDeps = [...new Set(dependencies)].sort((a, b) => a - b);
    
    analyzed.push({
      tool,
      index: i,
      dependencies: uniqueDeps,
      canParallelize: canParallelize && uniqueDeps.length === 0,
      targetPath,
      category,
      action,
    });
  }
  
  return analyzed;
}

/**
 * Extract target file path from tool arguments
 */
function extractTargetPath(tool: ToolCallPayload): string | undefined {
  const args = tool.arguments as Record<string, unknown>;
  return (args.path || args.filePath || args.file || args.directory) as string | undefined;
}

// =============================================================================
// Execution Group Builder
// =============================================================================

/**
 * Groups tools into execution batches based on dependencies.
 * Tools in the same group can run in parallel.
 * 
 * Uses topological sorting to respect dependencies while maximizing parallelism.
 */
export function buildExecutionGroups(
  analyzedTools: ToolWithDependencies[]
): ExecutionGroup[] {
  const groups: ExecutionGroup[] = [];
  const completed = new Set<number>();
  const remaining = new Set(analyzedTools.map(t => t.index));
  
  while (remaining.size > 0) {
    // Find all tools whose dependencies are satisfied
    const ready: ToolWithDependencies[] = [];
    
    for (const index of remaining) {
      const tool = analyzedTools[index];
      const depsCompleted = tool.dependencies.every(d => completed.has(d));
      
      if (depsCompleted) {
        ready.push(tool);
      }
    }
    
    if (ready.length === 0) {
      // Circular dependency or bug - execute remaining sequentially
      const next = analyzedTools[Math.min(...remaining)];
      groups.push({ tools: [next], isParallel: false });
      completed.add(next.index);
      remaining.delete(next.index);
      continue;
    }
    
    // Separate parallelizable from sequential
    const parallelizable = ready.filter(t => t.canParallelize);
    const sequential = ready.filter(t => !t.canParallelize);
    
    // Add parallel group if we have multiple parallelizable tools
    if (parallelizable.length > 1) {
      groups.push({ tools: parallelizable, isParallel: true });
      for (const t of parallelizable) {
        completed.add(t.index);
        remaining.delete(t.index);
      }
    } else if (parallelizable.length === 1) {
      // Single tool - no benefit from parallel
      groups.push({ tools: parallelizable, isParallel: false });
      completed.add(parallelizable[0].index);
      remaining.delete(parallelizable[0].index);
    }
    
    // Add sequential tools one at a time
    for (const t of sequential) {
      groups.push({ tools: [t], isParallel: false });
      completed.add(t.index);
      remaining.delete(t.index);
    }
  }
  
  return groups;
}

// =============================================================================
// Semaphore for Concurrency Control
// =============================================================================

/**
 * Simple semaphore for limiting concurrent operations.
 * Based on 2025 best practices for TypeScript concurrency control.
 */
export class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];
  
  constructor(permits: number) {
    this.permits = permits;
  }
  
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    
    return new Promise<void>(resolve => {
      this.waiting.push(resolve);
    });
  }
  
  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
  
  /** Execute a function with semaphore protection */
  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// =============================================================================
// Parallel Executor
// =============================================================================

export type ToolExecuteFn = (tool: ToolCallPayload) => Promise<EnhancedToolResult>;

/**
 * Execute tools with parallel optimization.
 * 
 * @param tools - Array of tool calls to execute
 * @param executeFn - Function to execute a single tool
 * @param config - Parallel execution configuration
 * @param signal - Optional abort signal for cancellation
 */
export async function executeToolsParallel(
  tools: ToolCallPayload[],
  executeFn: ToolExecuteFn,
  config: ParallelExecutionConfig = DEFAULT_PARALLEL_CONFIG,
  signal?: AbortSignal
): Promise<ParallelExecutionResult> {
  const startTime = Date.now();
  
  if (tools.length === 0) {
    return {
      results: [],
      succeeded: [],
      failed: [],
      totalDurationMs: 0,
      timeSavedMs: 0,
      wasParallel: false,
    };
  }
  
  // Single tool - no parallelization needed
  if (tools.length === 1 || !config.enabled) {
    const results: EnhancedToolResult[] = [];
    let sequentialTime = 0;
    
    for (const tool of tools) {
      if (signal?.aborted) break;
      
      const toolStart = Date.now();
      const result = await executeFn(tool);
      const toolDuration = Date.now() - toolStart;
      sequentialTime += toolDuration;
      
      // Add timing info if not present
      if (!result.timing) {
        result.timing = {
          startedAt: toolStart,
          completedAt: Date.now(),
          durationMs: toolDuration,
        };
      }
      results.push(result);
    }
    
    // Use sequentialTime as the total duration for accurate tracking
    const totalDuration = sequentialTime > 0 ? sequentialTime : Date.now() - startTime;
    
    return {
      results,
      succeeded: results.filter(r => r.success).map((_, i) => tools[i].name),
      failed: results.filter(r => !r.success).map((_, i) => tools[i].name),
      totalDurationMs: totalDuration,
      timeSavedMs: 0, // No time saved in sequential mode
      wasParallel: false,
    };
  }
  
  // Analyze dependencies and build execution groups
  const analyzed = analyzeToolDependencies(tools, config);
  const groups = buildExecutionGroups(analyzed);
  
  // Track results in original order
  const results: EnhancedToolResult[] = new Array(tools.length);
  const semaphore = new Semaphore(config.maxConcurrency);
  let estimatedSequentialTime = 0;
  let wasParallel = false;
  
  // Execute groups
  for (const group of groups) {
    if (signal?.aborted) break;
    
    if (group.isParallel && group.tools.length > 1) {
      wasParallel = true;
      
      // Execute in parallel with semaphore control
      const groupResults = await Promise.allSettled(
        group.tools.map(t => 
          semaphore.withPermit(async () => {
            if (signal?.aborted) {
              return {
                toolName: t.tool.name,
                success: false,
                output: 'Execution cancelled',
              } as EnhancedToolResult;
            }
            return executeFn(t.tool);
          })
        )
      );
      
      // Store results and estimate sequential time
      let maxGroupTime = 0;
      for (let i = 0; i < group.tools.length; i++) {
        const toolIndex = group.tools[i].index;
        const settled = groupResults[i];
        
        if (settled.status === 'fulfilled') {
          results[toolIndex] = settled.value;
          const duration = settled.value.timing?.durationMs || 0;
          estimatedSequentialTime += duration;
          maxGroupTime = Math.max(maxGroupTime, duration);
        } else {
          results[toolIndex] = {
            toolName: group.tools[i].tool.name,
            success: false,
            output: settled.reason?.message || 'Unknown error',
          };
        }
      }
    } else {
      // Execute sequentially
      for (const t of group.tools) {
        if (signal?.aborted) break;
        
        const result = await executeFn(t.tool);
        results[t.index] = result;
        estimatedSequentialTime += result.timing?.durationMs || 0;
      }
    }
  }
  
  const totalDurationMs = Date.now() - startTime;
  const timeSavedMs = Math.max(0, estimatedSequentialTime - totalDurationMs);
  
  return {
    results,
    succeeded: results.filter(r => r?.success).map((r) => r.toolName),
    failed: results.filter(r => r && !r.success).map((r) => r.toolName),
    totalDurationMs,
    timeSavedMs,
    wasParallel,
  };
}

/**
 * Check if a set of tools can benefit from parallel execution.
 * Quick check without full dependency analysis.
 */
export function canBenefitFromParallel(
  tools: ToolCallPayload[],
  config: ParallelExecutionConfig = DEFAULT_PARALLEL_CONFIG
): boolean {
  if (!config.enabled || tools.length < 2) return false;
  
  // Count parallelizable tools
  let parallelizable = 0;
  const writtenPaths = new Set<string>();
  
  for (const tool of tools) {
    const { category } = categorizeToolName(tool.name);
    
    // Sequential categories can't parallelize
    if (config.sequentialCategories.includes(category)) continue;
    
    const targetPath = extractTargetPath(tool);
    
    if (category === 'file-read' || category === 'file-search') {
      // Reads can parallelize if no prior write to same path
      if (!targetPath || !writtenPaths.has(targetPath)) {
        parallelizable++;
      }
    } else if (category === 'file-write' && targetPath) {
      // Writes to different paths can parallelize
      if (!writtenPaths.has(targetPath)) {
        parallelizable++;
        writtenPaths.add(targetPath);
      }
    }
  }
  
  return parallelizable >= 2;
}
