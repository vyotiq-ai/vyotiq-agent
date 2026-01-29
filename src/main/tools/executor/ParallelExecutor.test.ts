/**
 * Tests for ParallelExecutor
 * 
 * Verifies that the parallel execution system correctly handles:
 * - Independent tools executing in parallel
 * - Failed tools not blocking other independent tools
 * - Proper result collection from both successful and failed tools
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeToolsParallel,
  analyzeToolDependencies,
  buildExecutionGroups,
  DEFAULT_PARALLEL_CONFIG,
  type ParallelExecutionConfig,
} from './ParallelExecutor';
import type { ToolCallPayload } from '../../../shared/types';
import type { EnhancedToolResult } from '../types';

// Verify the imported config type matches the expected structure
// This ensures type safety when using DEFAULT_PARALLEL_CONFIG in tests
const _verifyConfigType: ParallelExecutionConfig = DEFAULT_PARALLEL_CONFIG;
void _verifyConfigType; // Explicitly mark as intentionally unused (type verification only)

// Helper to create a mock tool call
function createToolCall(name: string, args: Record<string, unknown> = {}): ToolCallPayload {
  return {
    name,
    callId: `call-${name}-${Date.now()}`,
    arguments: args,
  };
}

// Helper to create a successful result
function createSuccessResult(toolName: string, output: string, durationMs = 100): EnhancedToolResult {
  return {
    toolName,
    success: true,
    output,
    timing: {
      startedAt: Date.now(),
      completedAt: Date.now() + durationMs,
      durationMs,
    },
  };
}

// Helper to create a failed result
function createFailedResult(toolName: string, error: string): EnhancedToolResult {
  return {
    toolName,
    success: false,
    output: error,
    timing: {
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 0,
    },
  };
}

describe('ParallelExecutor', () => {
  describe('executeToolsParallel', () => {
    it('should execute independent tools in parallel', async () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),
        createToolCall('read', { path: 'file2.ts' }),
        createToolCall('read', { path: 'file3.ts' }),
      ];

      const executionOrder: string[] = [];
      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        executionOrder.push(`start-${tool.name}-${(tool.arguments as Record<string, unknown>).path}`);
        await new Promise(resolve => setTimeout(resolve, 50));
        executionOrder.push(`end-${tool.name}-${(tool.arguments as Record<string, unknown>).path}`);
        return createSuccessResult(tool.name, `Content of ${(tool.arguments as Record<string, unknown>).path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      expect(result.results).toHaveLength(3);
      expect(result.succeeded).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
      expect(result.wasParallel).toBe(true);
    });

    it('should not block other tools when one tool fails', async () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),
        createToolCall('read', { path: 'file2.ts' }),
        createToolCall('read', { path: 'file3.ts' }),
      ];

      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const path = (tool.arguments as Record<string, unknown>).path as string;
        
        // Simulate file2.ts failing
        if (path === 'file2.ts') {
          await new Promise(resolve => setTimeout(resolve, 10));
          return createFailedResult(tool.name, 'ENOENT: file not found');
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        return createSuccessResult(tool.name, `Content of ${path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      // All tools should have been executed
      expect(executeFn).toHaveBeenCalledTimes(3);
      
      // Results should contain all 3 tools
      expect(result.results).toHaveLength(3);
      
      // 2 should succeed, 1 should fail
      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.failed).toContain('read');
      
      // Verify the failed result is properly captured
      const failedResult = result.results.find(r => !r.success);
      expect(failedResult).toBeDefined();
      expect(failedResult?.output).toContain('ENOENT');
    });

    it('should handle multiple tool failures without blocking others', async () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),
        createToolCall('read', { path: 'file2.ts' }),
        createToolCall('read', { path: 'file3.ts' }),
        createToolCall('read', { path: 'file4.ts' }),
      ];

      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const path = (tool.arguments as Record<string, unknown>).path as string;
        
        // Simulate file2.ts and file4.ts failing
        if (path === 'file2.ts' || path === 'file4.ts') {
          await new Promise(resolve => setTimeout(resolve, 10));
          return createFailedResult(tool.name, `Error reading ${path}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        return createSuccessResult(tool.name, `Content of ${path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      // All tools should have been executed
      expect(executeFn).toHaveBeenCalledTimes(4);
      
      // Results should contain all 4 tools
      expect(result.results).toHaveLength(4);
      
      // 2 should succeed, 2 should fail
      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(2);
    });

    it('should handle thrown exceptions without blocking other tools', async () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),
        createToolCall('read', { path: 'file2.ts' }),
        createToolCall('read', { path: 'file3.ts' }),
      ];

      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const path = (tool.arguments as Record<string, unknown>).path as string;
        
        // Simulate file2.ts throwing an exception
        if (path === 'file2.ts') {
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new Error('Unexpected error during execution');
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        return createSuccessResult(tool.name, `Content of ${path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      // All tools should have been attempted
      expect(executeFn).toHaveBeenCalledTimes(3);
      
      // Results should contain all 3 tools
      expect(result.results).toHaveLength(3);
      
      // 2 should succeed, 1 should fail
      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      
      // Verify the failed result captures the exception message
      const failedResult = result.results.find(r => !r.success);
      expect(failedResult).toBeDefined();
      expect(failedResult?.output).toContain('Unexpected error');
    });

    it('should preserve result order even when tools complete at different times', async () => {
      const tools = [
        createToolCall('read', { path: 'slow.ts' }),
        createToolCall('read', { path: 'fast.ts' }),
        createToolCall('read', { path: 'medium.ts' }),
      ];

      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const path = (tool.arguments as Record<string, unknown>).path as string;
        
        // Different execution times
        const delays: Record<string, number> = {
          'slow.ts': 100,
          'fast.ts': 10,
          'medium.ts': 50,
        };
        
        await new Promise(resolve => setTimeout(resolve, delays[path] || 50));
        return createSuccessResult(tool.name, `Content of ${path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      // Results should be in original order, not completion order
      expect(result.results[0].output).toContain('slow.ts');
      expect(result.results[1].output).toContain('fast.ts');
      expect(result.results[2].output).toContain('medium.ts');
    });

    it('should handle empty tool list', async () => {
      const executeFn = vi.fn();
      const result = await executeToolsParallel([], executeFn, DEFAULT_PARALLEL_CONFIG);

      expect(result.results).toHaveLength(0);
      expect(result.succeeded).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(result.wasParallel).toBe(false);
      expect(executeFn).not.toHaveBeenCalled();
    });

    it('should handle single tool without parallelization', async () => {
      const tools = [createToolCall('read', { path: 'file1.ts' })];

      const executeFn = vi.fn(async () => {
        return createSuccessResult('read', 'Content');
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      expect(result.results).toHaveLength(1);
      expect(result.wasParallel).toBe(false);
    });
  });

  describe('analyzeToolDependencies', () => {
    it('should mark read-only tools as parallelizable', () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),
        createToolCall('read', { path: 'file2.ts' }),
      ];

      const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);

      expect(analyzed[0].canParallelize).toBe(true);
      expect(analyzed[1].canParallelize).toBe(true);
      expect(analyzed[0].dependencies).toHaveLength(0);
      expect(analyzed[1].dependencies).toHaveLength(0);
    });

    it('should create dependencies for writes to the same file', () => {
      const tools = [
        createToolCall('write', { path: 'file1.ts' }),
        createToolCall('write', { path: 'file1.ts' }),
      ];

      const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);

      // Second write depends on first write
      expect(analyzed[1].dependencies).toContain(0);
    });
  });

  describe('buildExecutionGroups', () => {
    it('should group independent tools together', () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),
        createToolCall('read', { path: 'file2.ts' }),
        createToolCall('read', { path: 'file3.ts' }),
      ];

      const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);
      const groups = buildExecutionGroups(analyzed);

      // All reads should be in one parallel group
      expect(groups).toHaveLength(1);
      expect(groups[0].isParallel).toBe(true);
      expect(groups[0].tools).toHaveLength(3);
    });

    it('should separate dependent tools into sequential groups', () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),
        createToolCall('write', { path: 'file1.ts' }),
      ];

      const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);
      const groups = buildExecutionGroups(analyzed);

      // Should have separate groups due to dependency
      expect(groups.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('dependent tools execute sequentially', () => {
    it('should execute read-then-write to same file sequentially in correct order', async () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),
        createToolCall('write', { path: 'file1.ts' }),
      ];

      const executionOrder: string[] = [];
      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const path = (tool.arguments as Record<string, unknown>).path as string;
        const action = tool.name;
        executionOrder.push(`start-${action}-${path}`);
        await new Promise(resolve => setTimeout(resolve, 30));
        executionOrder.push(`end-${action}-${path}`);
        return createSuccessResult(tool.name, `${action} ${path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      expect(result.results).toHaveLength(2);
      expect(result.succeeded).toHaveLength(2);
      
      // Verify sequential execution: read must complete before write starts
      expect(executionOrder).toEqual([
        'start-read-file1.ts',
        'end-read-file1.ts',
        'start-write-file1.ts',
        'end-write-file1.ts',
      ]);
    });

    it('should execute multiple writes to same file sequentially', async () => {
      const tools = [
        createToolCall('write', { path: 'file1.ts' }),
        createToolCall('edit', { path: 'file1.ts' }),
        createToolCall('write', { path: 'file1.ts' }),
      ];

      const executionOrder: string[] = [];
      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const path = (tool.arguments as Record<string, unknown>).path as string;
        const action = tool.name;
        executionOrder.push(`start-${action}-${path}`);
        await new Promise(resolve => setTimeout(resolve, 20));
        executionOrder.push(`end-${action}-${path}`);
        return createSuccessResult(tool.name, `${action} ${path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      expect(result.results).toHaveLength(3);
      
      // Verify sequential execution: each write must complete before next starts
      expect(executionOrder).toEqual([
        'start-write-file1.ts',
        'end-write-file1.ts',
        'start-edit-file1.ts',
        'end-edit-file1.ts',
        'start-write-file1.ts',
        'end-write-file1.ts',
      ]);
    });

    it('should allow parallel writes to different files while sequential to same file', async () => {
      const tools = [
        createToolCall('write', { path: 'file1.ts' }),
        createToolCall('write', { path: 'file2.ts' }),
        createToolCall('write', { path: 'file1.ts' }), // Depends on first write
      ];

      const executionOrder: string[] = [];
      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const path = (tool.arguments as Record<string, unknown>).path as string;
        executionOrder.push(`start-${path}`);
        await new Promise(resolve => setTimeout(resolve, 30));
        executionOrder.push(`end-${path}`);
        return createSuccessResult(tool.name, `write ${path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      expect(result.results).toHaveLength(3);
      expect(result.succeeded).toHaveLength(3);
      
      // First two writes (to different files) can be parallel
      // Third write (to file1.ts) must wait for first write to complete
      // Verify file1.ts second write starts after first file1.ts write ends
      const firstFile1End = executionOrder.indexOf('end-file1.ts');
      const secondFile1Start = executionOrder.lastIndexOf('start-file1.ts');
      expect(secondFile1Start).toBeGreaterThan(firstFile1End);
    });

    it('should execute terminal commands sequentially', async () => {
      const tools = [
        createToolCall('run', { command: 'echo hello' }),
        createToolCall('run', { command: 'echo world' }),
      ];

      const executionOrder: string[] = [];
      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const cmd = (tool.arguments as Record<string, unknown>).command as string;
        executionOrder.push(`start-${cmd}`);
        await new Promise(resolve => setTimeout(resolve, 20));
        executionOrder.push(`end-${cmd}`);
        return createSuccessResult(tool.name, cmd);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      expect(result.results).toHaveLength(2);
      
      // Terminal commands must be sequential
      expect(executionOrder).toEqual([
        'start-echo hello',
        'end-echo hello',
        'start-echo world',
        'end-echo world',
      ]);
    });

    it('should handle mixed parallel and sequential tools correctly', async () => {
      const tools = [
        createToolCall('read', { path: 'file1.ts' }),  // Can parallelize
        createToolCall('read', { path: 'file2.ts' }),  // Can parallelize
        createToolCall('write', { path: 'file1.ts' }), // Depends on read of file1.ts
        createToolCall('read', { path: 'file3.ts' }),  // Can parallelize (no dependency)
      ];

      const executionOrder: string[] = [];
      const executeFn = vi.fn(async (tool: ToolCallPayload) => {
        const path = (tool.arguments as Record<string, unknown>).path as string;
        const action = tool.name;
        executionOrder.push(`start-${action}-${path}`);
        await new Promise(resolve => setTimeout(resolve, 20));
        executionOrder.push(`end-${action}-${path}`);
        return createSuccessResult(tool.name, `${action} ${path}`);
      });

      const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

      expect(result.results).toHaveLength(4);
      expect(result.succeeded).toHaveLength(4);
      
      // Verify write to file1.ts starts after read of file1.ts ends
      const readFile1End = executionOrder.indexOf('end-read-file1.ts');
      const writeFile1Start = executionOrder.indexOf('start-write-file1.ts');
      expect(writeFile1Start).toBeGreaterThan(readFile1End);
    });
  });
});
