/**
 * Tool System Integration Tests
 *
 * End-to-end tests for tool execution with caching, parallel execution,
 * error recovery, session persistence, and output truncation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ToolResultCache,
  resetToolResultCache,
} from '../../main/agent/cache/ToolResultCache';
import {
  executeToolsParallel,
  analyzeToolDependencies,
  buildExecutionGroups,
  DEFAULT_PARALLEL_CONFIG,
  type ParallelExecutionConfig,
} from '../../main/tools/executor/ParallelExecutor';
import {
  ErrorRecoveryManager,
  getErrorRecoveryManager,
  resetErrorRecoveryManager,
  type RecoverySuggestion,
  type ErrorPatternCategory,
} from '../../main/agent/recovery/ErrorRecoveryManager';
import {
  getSessionToolState,
  addAgentRequestedTools,
  addDiscoveredTools,
  recordToolError,
  recordToolSuccess,
  getRecentToolErrors,
  getAgentControlledTools,
  getLoadedToolsInfo,
  clearSessionToolState,
  clearAllSessionToolStates,
  cleanupSession,
  cleanupAllSessions,
  getActiveSessionCount,
  getSessionMemoryEstimate,
  type SessionToolState,
  type SessionCleanupStats,
  type LoadedToolsInfo,
} from '../../main/agent/context/ToolContextManager';
import {
  OutputTruncator,
  createOutputTruncator,
  truncateToolOutput,
  needsTruncation,
} from '../../main/agent/output/OutputTruncator';
import type { ToolExecutionResult, ToolCallPayload } from '../../shared/types';
import type { EnhancedToolResult } from '../../main/tools/types';

// Type guard helpers for testing
function isSessionToolState(obj: unknown): obj is SessionToolState {
  return obj !== null && typeof obj === 'object' && 'requestedTools' in obj;
}

function isLoadedToolsInfo(obj: unknown): obj is LoadedToolsInfo {
  return obj !== null && typeof obj === 'object' && 'coreTools' in obj;
}

function isSessionCleanupStats(obj: unknown): obj is SessionCleanupStats {
  return obj !== null && typeof obj === 'object' && 'sessionId' in obj && 'requestedToolsCleared' in obj;
}

function isErrorPatternCategory(category: string): category is ErrorPatternCategory {
  const validCategories: ErrorPatternCategory[] = ['filesystem', 'permission', 'syntax', 'type', 'module', 'edit', 'terminal', 'browser', 'network', 'resource', 'unknown'];
  return validCategories.includes(category as ErrorPatternCategory);
}

// Helper to create OutputTruncator instance for testing
function createTestTruncator(maxTokens: number = 1000): OutputTruncator {
  return createOutputTruncator({ maxTokens });
}

describe('Tool System Integration', () => {
  describe('End-to-end tool execution with caching', () => {
    let cache: ToolResultCache;

    beforeEach(() => {
      vi.useFakeTimers();
      resetToolResultCache();
      cache = new ToolResultCache({
        maxAge: 60000,
        maxSize: 100,
        enableLRU: true,
        compressionThreshold: 100, // Low threshold for testing compression
        enableCompression: true,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      resetToolResultCache();
    });

    describe('Cache hit/miss scenarios', () => {
      it('should return cached result on second call with same arguments', () => {
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'file content here',
        };

        // First call - cache miss
        const firstGet = cache.get('read', { path: '/src/file.ts' });
        expect(firstGet).toBeNull();

        // Store result
        cache.set('read', { path: '/src/file.ts' }, result);

        // Second call - cache hit
        const secondGet = cache.get('read', { path: '/src/file.ts' });
        expect(secondGet).not.toBeNull();
        expect(secondGet?.output).toBe('file content here');
        expect(secondGet?.success).toBe(true);
      });

      it('should track cache statistics correctly', () => {
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'content',
        };

        cache.set('read', { path: '/file1.ts' }, result);
        cache.set('read', { path: '/file2.ts' }, result);

        // Generate hits
        cache.get('read', { path: '/file1.ts' }); // hit
        cache.get('read', { path: '/file1.ts' }); // hit
        cache.get('read', { path: '/file2.ts' }); // hit

        // Generate misses
        cache.get('read', { path: '/nonexistent.ts' }); // miss

        const stats = cache.getStats();
        expect(stats.hits).toBe(3);
        expect(stats.misses).toBe(1);
        expect(stats.hitRate).toBeCloseTo(75, 0);
        expect(stats.size).toBe(2);
        expect(stats.byTool.read).toBe(2);
      });

      it('should estimate token savings on cache hits', () => {
        const longContent = 'x'.repeat(1000); // ~250 tokens
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: longContent,
        };

        cache.set('read', { path: '/large-file.ts' }, result);

        // Multiple cache hits
        cache.get('read', { path: '/large-file.ts' });
        cache.get('read', { path: '/large-file.ts' });
        cache.get('read', { path: '/large-file.ts' });

        const stats = cache.getStats();
        expect(stats.estimatedTokensSaved).toBeGreaterThan(0);
        // Each hit saves ~250 tokens (1000 chars / 4)
        expect(stats.estimatedTokensSaved).toBeGreaterThanOrEqual(750);
      });

      it('should not cache failed results', () => {
        const failedResult: ToolExecutionResult = {
          toolName: 'read',
          success: false,
          output: 'Error: File not found',
        };

        cache.set('read', { path: '/missing.ts' }, failedResult);

        const cached = cache.get('read', { path: '/missing.ts' });
        expect(cached).toBeNull();
      });

      it('should not cache non-cacheable tools', () => {
        const result: ToolExecutionResult = {
          toolName: 'write',
          success: true,
          output: 'File written',
        };

        cache.set('write', { path: '/file.ts', content: 'data' }, result);

        const cached = cache.get('write', { path: '/file.ts', content: 'data' });
        expect(cached).toBeNull();
      });
    });

    describe('Cache invalidation', () => {
      it('should invalidate cache when file is modified', () => {
        const readResult: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'original content',
        };

        // Cache a read result
        cache.set('read', { path: '/src/app.ts' }, readResult);
        expect(cache.get('read', { path: '/src/app.ts' })).not.toBeNull();

        // Simulate file modification by invalidating path
        const invalidated = cache.invalidatePath('/src/app.ts');
        expect(invalidated).toBe(1);

        // Cache should be empty for this path
        expect(cache.get('read', { path: '/src/app.ts' })).toBeNull();
      });

      it('should invalidate all entries for a tool', () => {
        const result: ToolExecutionResult = {
          toolName: 'grep',
          success: true,
          output: 'matches',
        };

        cache.set('grep', { pattern: 'foo' }, result);
        cache.set('grep', { pattern: 'bar' }, result);
        cache.set('grep', { pattern: 'baz' }, result);

        const invalidated = cache.invalidateTool('grep');
        expect(invalidated).toBe(3);

        expect(cache.get('grep', { pattern: 'foo' })).toBeNull();
        expect(cache.get('grep', { pattern: 'bar' })).toBeNull();
        expect(cache.get('grep', { pattern: 'baz' })).toBeNull();
      });

      it('should expire entries after TTL', () => {
        const result: ToolExecutionResult = {
          toolName: 'diagnostics',
          success: true,
          output: '[]',
        };

        cache.set('diagnostics', { path: '/file.ts' }, result);
        expect(cache.get('diagnostics', { path: '/file.ts' })).not.toBeNull();

        // Diagnostics has 10s TTL
        vi.advanceTimersByTime(15000);

        expect(cache.get('diagnostics', { path: '/file.ts' })).toBeNull();
      });
    });

    describe('Cache compression', () => {
      it('should compress large outputs and decompress on retrieval', () => {
        const largeOutput = 'x'.repeat(500); // > 100 byte threshold
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: largeOutput,
        };

        cache.set('read', { path: '/large-file.ts' }, result);

        // Verify compression occurred
        const stats = cache.getStats();
        expect(stats.compressedEntries).toBe(1);
        expect(stats.compressionBytesSaved).toBeGreaterThan(0);

        // Verify decompression works correctly
        const cached = cache.get('read', { path: '/large-file.ts' });
        expect(cached).not.toBeNull();
        expect(cached?.output).toBe(largeOutput);
        expect(cached?.output.length).toBe(500);
      });

      it('should not compress small outputs', () => {
        const smallOutput = 'small content';
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: smallOutput,
        };

        cache.set('read', { path: '/small-file.ts' }, result);

        const stats = cache.getStats();
        expect(stats.compressedEntries).toBe(0);

        const cached = cache.get('read', { path: '/small-file.ts' });
        expect(cached?.output).toBe(smallOutput);
      });

      it('should handle JSON content compression correctly', () => {
        const jsonContent = JSON.stringify({
          data: Array(50).fill({ key: 'value', num: 123 }),
        });
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: jsonContent,
        };

        cache.set('read', { path: '/data.json' }, result);

        const cached = cache.get('read', { path: '/data.json' });
        expect(cached).not.toBeNull();
        expect(cached?.output).toBe(jsonContent);

        // JSON compresses well
        const stats = cache.getStats();
        expect(stats.averageCompressionRatio).toBeGreaterThan(1);
      });
    });

    describe('Session-scoped caching', () => {
      it('should track cache entries by session', () => {
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'content',
        };

        cache.set('read', { path: '/file1.ts' }, result, 'session-1');
        cache.set('read', { path: '/file2.ts' }, result, 'session-1');
        cache.set('read', { path: '/file3.ts' }, result, 'session-2');

        expect(cache.getSessionEntryCount('session-1')).toBe(2);
        expect(cache.getSessionEntryCount('session-2')).toBe(1);
        expect(cache.getSessionsWithCache()).toHaveLength(2);
      });

      it('should clear session cache on session end', () => {
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'content',
        };

        cache.set('read', { path: '/file1.ts' }, result, 'session-1');
        cache.set('read', { path: '/file2.ts' }, result, 'session-1');
        cache.set('read', { path: '/file3.ts' }, result, 'session-2');

        const cleanup = cache.clearSession('session-1');

        expect(cleanup.entriesCleared).toBe(2);
        expect(cleanup.bytesFreed).toBeGreaterThan(0);
        expect(cache.get('read', { path: '/file1.ts' })).toBeNull();
        expect(cache.get('read', { path: '/file2.ts' })).toBeNull();
        expect(cache.get('read', { path: '/file3.ts' })).not.toBeNull();
      });

      it('should update stats after session cleanup', () => {
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'content',
        };

        cache.set('read', { path: '/file1.ts' }, result, 'session-1');
        cache.set('read', { path: '/file2.ts' }, result, 'session-2');

        const statsBefore = cache.getStats();
        expect(statsBefore.sessionsWithCache).toBe(2);
        expect(statsBefore.size).toBe(2);

        cache.clearSession('session-1');

        const statsAfter = cache.getStats();
        expect(statsAfter.sessionsWithCache).toBe(1);
        expect(statsAfter.size).toBe(1);
      });
    });

    describe('LRU eviction', () => {
      it('should evict least recently used entries when cache is full', () => {
        const smallCache = new ToolResultCache({
          maxSize: 3,
          maxAge: 60000,
          enableLRU: true,
        });

        const createResult = (id: string): ToolExecutionResult => ({
          toolName: 'read',
          success: true,
          output: `content-${id}`,
        });

        // Fill cache
        smallCache.set('read', { path: '/file1.ts' }, createResult('1'));
        smallCache.set('read', { path: '/file2.ts' }, createResult('2'));
        smallCache.set('read', { path: '/file3.ts' }, createResult('3'));

        // Access file1 to make it recently used
        smallCache.get('read', { path: '/file1.ts' });

        // Add file4 - should evict file2 (oldest accessed)
        smallCache.set('read', { path: '/file4.ts' }, createResult('4'));

        // file1 should still be cached (recently accessed)
        expect(smallCache.get('read', { path: '/file1.ts' })).not.toBeNull();
        // file2 should be evicted (oldest)
        expect(smallCache.get('read', { path: '/file2.ts' })).toBeNull();
        // file3 and file4 should be cached
        expect(smallCache.get('read', { path: '/file3.ts' })).not.toBeNull();
        expect(smallCache.get('read', { path: '/file4.ts' })).not.toBeNull();
      });
    });

    describe('Argument normalization for cache keys', () => {
      it('should generate same cache key regardless of argument order', () => {
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'content',
        };

        cache.set('read', { path: '/file.ts', encoding: 'utf8' }, result);

        // Same args in different order should hit cache
        const cached = cache.get('read', { encoding: 'utf8', path: '/file.ts' });
        expect(cached).not.toBeNull();
        expect(cached?.output).toBe('content');
      });

      it('should differentiate cache entries by argument values', () => {
        const result1: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'content1',
        };
        const result2: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'content2',
        };

        cache.set('read', { path: '/file1.ts' }, result1);
        cache.set('read', { path: '/file2.ts' }, result2);

        expect(cache.get('read', { path: '/file1.ts' })?.output).toBe('content1');
        expect(cache.get('read', { path: '/file2.ts' })?.output).toBe('content2');
      });
    });

    describe('Statistics reset', () => {
      it('should reset statistics while preserving cache entries', () => {
        const result: ToolExecutionResult = {
          toolName: 'read',
          success: true,
          output: 'content',
        };

        cache.set('read', { path: '/file.ts' }, result);
        cache.get('read', { path: '/file.ts' }); // hit
        cache.get('read', { path: '/other.ts' }); // miss

        const statsBefore = cache.getStats();
        expect(statsBefore.hits).toBe(1);
        expect(statsBefore.misses).toBe(1);

        cache.resetStats();

        const statsAfter = cache.getStats();
        expect(statsAfter.hits).toBe(0);
        expect(statsAfter.misses).toBe(0);
        expect(statsAfter.estimatedTokensSaved).toBe(0);

        // Cache entries should still exist
        expect(statsAfter.size).toBe(1);
        expect(cache.get('read', { path: '/file.ts' })).not.toBeNull();
      });
    });

    describe('Cacheable tool identification', () => {
      it('should identify read operations as cacheable', () => {
        expect(cache.isCacheable('read')).toBe(true);
        expect(cache.isCacheable('read_file')).toBe(true);
        expect(cache.isCacheable('ls')).toBe(true);
        expect(cache.isCacheable('list_dir')).toBe(true);
        expect(cache.isCacheable('grep')).toBe(true);
        expect(cache.isCacheable('glob')).toBe(true);
        expect(cache.isCacheable('symbols')).toBe(true);
      });

      it('should identify write operations as non-cacheable', () => {
        expect(cache.isCacheable('write')).toBe(false);
        expect(cache.isCacheable('edit')).toBe(false);
        expect(cache.isCacheable('run')).toBe(false);
        expect(cache.isCacheable('delete')).toBe(false);
      });
    });

    describe('Cleanup of expired entries', () => {
      it('should remove expired entries on cleanup', () => {
        const result: ToolExecutionResult = {
          toolName: 'diagnostics',
          success: true,
          output: '[]',
        };

        cache.set('diagnostics', { path: '/file1.ts' }, result);
        cache.set('diagnostics', { path: '/file2.ts' }, result);

        // Fast forward past diagnostics TTL (10s)
        vi.advanceTimersByTime(15000);

        const removed = cache.cleanup();
        expect(removed).toBe(2);
        expect(cache.getStats().size).toBe(0);
      });
    });
  });

  describe('Parallel execution with dependencies', () => {
    // Helper to create a mock tool call
    function createToolCall(name: string, args: Record<string, unknown> = {}): ToolCallPayload {
      return {
        name,
        callId: `call-${name}-${Date.now()}-${Math.random()}`,
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

    describe('Dependency analysis', () => {
      it('should detect read-write dependencies on same file', () => {
        const tools = [
          createToolCall('read', { path: '/src/app.ts' }),
          createToolCall('write', { path: '/src/app.ts' }),
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);

        // First tool (read) has no dependencies
        expect(analyzed[0].dependencies).toHaveLength(0);
        expect(analyzed[0].canParallelize).toBe(true);

        // Second tool (write) depends on the read
        expect(analyzed[1].dependencies).toContain(0);
        expect(analyzed[1].canParallelize).toBe(false);
      });

      it('should detect write-write dependencies on same file', () => {
        const tools = [
          createToolCall('write', { path: '/src/config.ts' }),
          createToolCall('edit', { path: '/src/config.ts' }),
          createToolCall('write', { path: '/src/config.ts' }),
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);

        // First write has no dependencies
        expect(analyzed[0].dependencies).toHaveLength(0);

        // Second write (edit) depends on first write
        expect(analyzed[1].dependencies).toContain(0);

        // Third write depends on both previous writes
        expect(analyzed[2].dependencies).toContain(0);
        expect(analyzed[2].dependencies).toContain(1);
      });

      it('should allow parallel reads of different files', () => {
        const tools = [
          createToolCall('read', { path: '/src/file1.ts' }),
          createToolCall('read', { path: '/src/file2.ts' }),
          createToolCall('read', { path: '/src/file3.ts' }),
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);

        // All reads should be parallelizable with no dependencies
        for (const tool of analyzed) {
          expect(tool.dependencies).toHaveLength(0);
          expect(tool.canParallelize).toBe(true);
        }
      });

      it('should allow parallel writes to different files', () => {
        const tools = [
          createToolCall('write', { path: '/src/file1.ts' }),
          createToolCall('write', { path: '/src/file2.ts' }),
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);

        // Both writes should be parallelizable (different files)
        expect(analyzed[0].dependencies).toHaveLength(0);
        expect(analyzed[0].canParallelize).toBe(true);
        expect(analyzed[1].dependencies).toHaveLength(0);
        expect(analyzed[1].canParallelize).toBe(true);
      });

      it('should mark terminal commands as sequential', () => {
        const tools = [
          createToolCall('run', { command: 'npm install' }),
          createToolCall('run', { command: 'npm test' }),
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);

        // Terminal commands cannot parallelize
        expect(analyzed[0].canParallelize).toBe(false);
        expect(analyzed[1].canParallelize).toBe(false);
        // Second command depends on first
        expect(analyzed[1].dependencies).toContain(0);
      });

      it('should handle mixed read/write operations correctly', () => {
        const tools = [
          createToolCall('read', { path: '/src/a.ts' }),    // 0: read a
          createToolCall('read', { path: '/src/b.ts' }),    // 1: read b
          createToolCall('write', { path: '/src/a.ts' }),   // 2: write a (depends on 0)
          createToolCall('read', { path: '/src/c.ts' }),    // 3: read c (independent)
          createToolCall('write', { path: '/src/b.ts' }),   // 4: write b (depends on 1)
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);

        // Reads of a, b, c have no dependencies
        expect(analyzed[0].dependencies).toHaveLength(0);
        expect(analyzed[1].dependencies).toHaveLength(0);
        expect(analyzed[3].dependencies).toHaveLength(0);

        // Write to a depends on read of a
        expect(analyzed[2].dependencies).toContain(0);

        // Write to b depends on read of b
        expect(analyzed[4].dependencies).toContain(1);
      });
    });

    describe('Execution group building', () => {
      it('should group independent reads together', () => {
        const tools = [
          createToolCall('read', { path: '/file1.ts' }),
          createToolCall('read', { path: '/file2.ts' }),
          createToolCall('read', { path: '/file3.ts' }),
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);
        const groups = buildExecutionGroups(analyzed);

        // All reads should be in one parallel group
        expect(groups).toHaveLength(1);
        expect(groups[0].isParallel).toBe(true);
        expect(groups[0].tools).toHaveLength(3);
      });

      it('should separate dependent operations into sequential groups', () => {
        const tools = [
          createToolCall('read', { path: '/file.ts' }),
          createToolCall('write', { path: '/file.ts' }),
          createToolCall('read', { path: '/file.ts' }),
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);
        const groups = buildExecutionGroups(analyzed);

        // Should have multiple groups due to dependencies
        expect(groups.length).toBeGreaterThanOrEqual(2);
        
        // First group should contain the initial read
        expect(groups[0].tools.some(t => t.tool.name === 'read')).toBe(true);
      });

      it('should create mixed parallel and sequential groups', () => {
        const tools = [
          createToolCall('read', { path: '/a.ts' }),     // Can parallelize
          createToolCall('read', { path: '/b.ts' }),     // Can parallelize
          createToolCall('write', { path: '/a.ts' }),    // Sequential (depends on read a)
          createToolCall('read', { path: '/c.ts' }),     // Can parallelize
        ];

        const analyzed = analyzeToolDependencies(tools, DEFAULT_PARALLEL_CONFIG);
        const groups = buildExecutionGroups(analyzed);

        // Should have at least 2 groups
        expect(groups.length).toBeGreaterThanOrEqual(2);
        
        // First group should be parallel with reads
        expect(groups[0].isParallel).toBe(true);
      });
    });

    describe('Parallel execution integration', () => {
      it('should execute independent tools in parallel and report time savings', async () => {
        const tools = [
          createToolCall('read', { path: '/file1.ts' }),
          createToolCall('read', { path: '/file2.ts' }),
          createToolCall('read', { path: '/file3.ts' }),
        ];

        const executeFn = vi.fn(async (tool: ToolCallPayload) => {
          // Simulate 50ms execution time
          await new Promise(resolve => setTimeout(resolve, 50));
          return createSuccessResult(tool.name, `Content of ${(tool.arguments as Record<string, unknown>).path}`);
        });

        const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

        expect(result.results).toHaveLength(3);
        expect(result.succeeded).toHaveLength(3);
        expect(result.failed).toHaveLength(0);
        expect(result.wasParallel).toBe(true);
        
        // Time saved should be positive (parallel is faster than sequential)
        // Sequential would be ~150ms, parallel should be ~50ms
        expect(result.timeSavedMs).toBeGreaterThanOrEqual(0);
      });

      it('should execute dependent tools sequentially in correct order', async () => {
        const tools = [
          createToolCall('read', { path: '/config.ts' }),
          createToolCall('write', { path: '/config.ts' }),
        ];

        const executionOrder: string[] = [];
        const executeFn = vi.fn(async (tool: ToolCallPayload) => {
          const action = tool.name;
          executionOrder.push(`start-${action}`);
          await new Promise(resolve => setTimeout(resolve, 30));
          executionOrder.push(`end-${action}`);
          return createSuccessResult(tool.name, `${action} completed`);
        });

        const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

        expect(result.results).toHaveLength(2);
        expect(result.succeeded).toHaveLength(2);
        
        // Verify sequential execution: read must complete before write starts
        expect(executionOrder).toEqual([
          'start-read',
          'end-read',
          'start-write',
          'end-write',
        ]);
      });

      it('should handle failed tools without blocking independent tools', async () => {
        const tools = [
          createToolCall('read', { path: '/file1.ts' }),
          createToolCall('read', { path: '/file2.ts' }),
          createToolCall('read', { path: '/file3.ts' }),
        ];

        const executeFn = vi.fn(async (tool: ToolCallPayload) => {
          const path = (tool.arguments as Record<string, unknown>).path as string;
          
          // Simulate file2.ts failing
          if (path === '/file2.ts') {
            await new Promise(resolve => setTimeout(resolve, 10));
            return {
              toolName: tool.name,
              success: false,
              output: 'ENOENT: file not found',
              timing: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 10 },
            } as EnhancedToolResult;
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
      });

      it('should respect concurrency limits', async () => {
        const tools = Array.from({ length: 10 }, (_, i) => 
          createToolCall('read', { path: `/file${i}.ts` })
        );

        let maxConcurrent = 0;
        let currentConcurrent = 0;

        const executeFn = vi.fn(async (tool: ToolCallPayload) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          
          await new Promise(resolve => setTimeout(resolve, 50));
          
          currentConcurrent--;
          return createSuccessResult(tool.name, 'content');
        });

        const config: ParallelExecutionConfig = {
          ...DEFAULT_PARALLEL_CONFIG,
          maxConcurrency: 3,
        };

        await executeToolsParallel(tools, executeFn, config);

        // Should never exceed max concurrency
        expect(maxConcurrent).toBeLessThanOrEqual(3);
      });

      it('should preserve result order regardless of completion order', async () => {
        const tools = [
          createToolCall('read', { path: '/slow.ts' }),
          createToolCall('read', { path: '/fast.ts' }),
          createToolCall('read', { path: '/medium.ts' }),
        ];

        const executeFn = vi.fn(async (tool: ToolCallPayload) => {
          const path = (tool.arguments as Record<string, unknown>).path as string;
          
          // Different execution times
          const delays: Record<string, number> = {
            '/slow.ts': 100,
            '/fast.ts': 10,
            '/medium.ts': 50,
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

      it('should handle complex dependency chains correctly', async () => {
        // Scenario: read a, read b, write a (depends on read a), write b (depends on read b)
        const tools = [
          createToolCall('read', { path: '/a.ts' }),
          createToolCall('read', { path: '/b.ts' }),
          createToolCall('write', { path: '/a.ts' }),
          createToolCall('write', { path: '/b.ts' }),
        ];

        const executionLog: Array<{ action: string; path: string; phase: 'start' | 'end' }> = [];
        
        const executeFn = vi.fn(async (tool: ToolCallPayload) => {
          const path = (tool.arguments as Record<string, unknown>).path as string;
          const action = tool.name;
          
          executionLog.push({ action, path, phase: 'start' });
          await new Promise(resolve => setTimeout(resolve, 20));
          executionLog.push({ action, path, phase: 'end' });
          
          return createSuccessResult(tool.name, `${action} ${path}`);
        });

        const result = await executeToolsParallel(tools, executeFn, DEFAULT_PARALLEL_CONFIG);

        expect(result.results).toHaveLength(4);
        expect(result.succeeded).toHaveLength(4);

        // Verify write to /a.ts starts after read of /a.ts ends
        const readAEnd = executionLog.findIndex(e => e.action === 'read' && e.path === '/a.ts' && e.phase === 'end');
        const writeAStart = executionLog.findIndex(e => e.action === 'write' && e.path === '/a.ts' && e.phase === 'start');
        expect(writeAStart).toBeGreaterThan(readAEnd);

        // Verify write to /b.ts starts after read of /b.ts ends
        const readBEnd = executionLog.findIndex(e => e.action === 'read' && e.path === '/b.ts' && e.phase === 'end');
        const writeBStart = executionLog.findIndex(e => e.action === 'write' && e.path === '/b.ts' && e.phase === 'start');
        expect(writeBStart).toBeGreaterThan(readBEnd);
      });
    });
  });

  describe('Error recovery flow', () => {
    let errorRecoveryManager: ErrorRecoveryManager;

    beforeEach(() => {
      resetErrorRecoveryManager();
      errorRecoveryManager = getErrorRecoveryManager();
    });

    afterEach(() => {
      resetErrorRecoveryManager();
    });

    describe('Error pattern matching', () => {
      it('should match ENOENT errors and suggest filesystem tools', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'ENOENT: no such file or directory, open \'/src/missing.ts\'',
          'read'
        );

        expect(suggestion.errorPattern).toBe('ENOENT: no such file or directory');
        expect(suggestion.category).toBe('filesystem');
        expect(suggestion.suggestedTools).toContain('ls');
        expect(suggestion.suggestedTools).toContain('glob');
        expect(suggestion.confidence).toBeGreaterThan(0.5);
      });

      it('should match syntax errors and suggest diagnostic tools', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'SyntaxError: Unexpected token } at line 42',
          'run'
        );

        expect(suggestion.errorPattern).toBe('SyntaxError');
        expect(suggestion.category).toBe('syntax');
        expect(suggestion.suggestedTools).toContain('read');
        expect(suggestion.suggestedTools).toContain('lsp_diagnostics');
        expect(suggestion.confidence).toBeGreaterThan(0.5);
      });

      it('should match edit string not found errors', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'old_string not found in file',
          'edit'
        );

        expect(suggestion.errorPattern).toBe('old_string not found');
        expect(suggestion.category).toBe('edit');
        expect(suggestion.suggestedTools).toContain('read');
        expect(suggestion.suggestedTools).toContain('grep');
        expect(suggestion.confidence).toBeGreaterThan(0.8);
      });

      it('should match module not found errors', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'Cannot find module \'lodash\' or its corresponding type declarations',
          'run'
        );

        expect(suggestion.errorPattern).toBe('cannot find module');
        expect(suggestion.category).toBe('module');
        expect(suggestion.suggestedTools).toContain('ls');
        expect(suggestion.suggestedTools).toContain('run');
      });

      it('should return generic suggestion for unknown errors', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'Some completely unknown error that does not match any pattern',
          'unknown_tool'
        );

        expect(suggestion.errorPattern).toBe('unknown');
        expect(suggestion.category).toBe('unknown');
        expect(suggestion.confidence).toBeLessThan(0.5);
        expect(suggestion.suggestedTools).toContain('read');
        expect(suggestion.suggestedTools).toContain('ls');
      });
    });

    describe('Session error tracking', () => {
      const sessionId = 'test-session-123';

      it('should record errors in session history', () => {
        errorRecoveryManager.analyzeError(
          'ENOENT: no such file or directory',
          'read',
          sessionId
        );

        const stats = errorRecoveryManager.getSessionStats(sessionId);
        expect(stats).not.toBeNull();
        expect(stats!.totalErrors).toBe(1);
        expect(stats!.topPatterns).toHaveLength(1);
        expect(stats!.topPatterns[0].pattern).toBe('ENOENT: no such file or directory');
      });

      it('should track multiple errors and count patterns', () => {
        // Record multiple ENOENT errors
        errorRecoveryManager.analyzeError('ENOENT: file not found', 'read', sessionId);
        errorRecoveryManager.analyzeError('ENOENT: no such file', 'read', sessionId);
        errorRecoveryManager.analyzeError('SyntaxError: unexpected token', 'run', sessionId);

        const stats = errorRecoveryManager.getSessionStats(sessionId);
        expect(stats!.totalErrors).toBe(3);
        expect(stats!.topTools.find(t => t.tool === 'read')?.count).toBe(2);
      });

      it('should detect repeated errors', () => {
        // Record same error pattern multiple times
        errorRecoveryManager.analyzeError('ENOENT: no such file or directory, file1', 'read', sessionId);
        errorRecoveryManager.analyzeError('ENOENT: no such file or directory, file2', 'read', sessionId);

        // The pattern that gets matched is the more specific one
        const isRepeated = errorRecoveryManager.isRepeatedError(sessionId, 'ENOENT: no such file or directory');
        expect(isRepeated).toBe(true);
      });

      it('should clear session history', () => {
        errorRecoveryManager.analyzeError('ENOENT: file not found', 'read', sessionId);
        expect(errorRecoveryManager.getSessionStats(sessionId)).not.toBeNull();

        errorRecoveryManager.clearSession(sessionId);
        expect(errorRecoveryManager.getSessionStats(sessionId)).toBeNull();
      });
    });

    describe('Alternative approach suggestions', () => {
      const sessionId = 'test-session-alt';

      it('should suggest alternative approaches for repeated filesystem errors', () => {
        // Trigger repeated filesystem errors
        errorRecoveryManager.analyzeError('ENOENT: file not found', 'read', sessionId);
        errorRecoveryManager.analyzeError('ENOENT: another file not found', 'read', sessionId);

        // Third error should trigger alternative suggestion
        const suggestion = errorRecoveryManager.analyzeError(
          'ENOENT: yet another file not found',
          'read',
          sessionId
        );

        expect(suggestion.isAlternative).toBe(true);
        expect(suggestion.suggestedAction).toContain('Previous approach failed repeatedly');
      });

      it('should cycle through alternatives for repeated errors', () => {
        const alternatives: RecoverySuggestion[] = [];

        // Generate multiple repeated errors to cycle through alternatives
        for (let i = 0; i < 5; i++) {
          const suggestion = errorRecoveryManager.analyzeError(
            'ENOENT: file not found',
            'read',
            sessionId
          );
          if (suggestion.isAlternative) {
            alternatives.push(suggestion);
          }
        }

        // Should have received alternative suggestions after threshold
        expect(alternatives.length).toBeGreaterThan(0);
      });

      it('should get alternative approach for edit errors', () => {
        const alternative = errorRecoveryManager.getAlternativeApproach('edit');
        expect(alternative).not.toBeNull();
        expect(alternative!.tools).toContain('read');
      });
    });

    describe('Recovery suggestions for session', () => {
      const sessionId = 'test-session-recovery';

      it('should return recovery suggestions based on recent errors', () => {
        errorRecoveryManager.analyzeError('ENOENT: file not found', 'read', sessionId);
        errorRecoveryManager.analyzeError('SyntaxError: unexpected token', 'run', sessionId);

        const suggestions = errorRecoveryManager.getSessionRecovery(sessionId);
        expect(suggestions.length).toBeGreaterThan(0);
        
        // Should have suggestions for both error types
        const categories = suggestions.map(s => s.category);
        expect(categories).toContain('filesystem');
        expect(categories).toContain('syntax');
      });

      it('should deduplicate suggestions by pattern', () => {
        // Record same pattern multiple times
        errorRecoveryManager.analyzeError('ENOENT: file1 not found', 'read', sessionId);
        errorRecoveryManager.analyzeError('ENOENT: file2 not found', 'read', sessionId);
        errorRecoveryManager.analyzeError('ENOENT: file3 not found', 'read', sessionId);

        const suggestions = errorRecoveryManager.getSessionRecovery(sessionId);
        
        // Should only have one suggestion for ENOENT pattern
        const enoentSuggestions = suggestions.filter(s => s.errorPattern.includes('ENOENT'));
        expect(enoentSuggestions.length).toBe(1);
      });

      it('should return empty array for session with no errors', () => {
        const suggestions = errorRecoveryManager.getSessionRecovery('non-existent-session');
        expect(suggestions).toEqual([]);
      });
    });

    describe('Error pattern categories', () => {
      it('should categorize permission errors correctly', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'EACCES: permission denied',
          'write'
        );
        expect(suggestion.category).toBe('permission');
      });

      it('should categorize type errors correctly', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'TypeError: Cannot read property \'foo\' of undefined',
          'run'
        );
        expect(suggestion.category).toBe('type');
      });

      it('should categorize terminal errors correctly', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'command not found: npm',
          'run'
        );
        expect(suggestion.category).toBe('terminal');
      });

      it('should categorize browser errors correctly', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'navigation failed: net::ERR_CONNECTION_REFUSED',
          'browser_navigate'
        );
        expect(suggestion.category).toBe('browser');
      });

      it('should categorize network errors correctly', () => {
        const suggestion = errorRecoveryManager.analyzeError(
          'ECONNREFUSED: Connection refused',
          'run'
        );
        expect(suggestion.category).toBe('network');
      });
    });

    describe('Recovery tools retrieval', () => {
      it('should return appropriate tools for filesystem errors', () => {
        const tools = errorRecoveryManager.getRecoveryTools('ENOENT');
        expect(tools).toContain('ls');
        expect(tools).toContain('glob');
      });

      it('should return appropriate tools for syntax errors', () => {
        const tools = errorRecoveryManager.getRecoveryTools('syntax error');
        expect(tools).toContain('read');
        expect(tools).toContain('lsp_diagnostics');
      });

      it('should return default tools for unknown patterns', () => {
        const tools = errorRecoveryManager.getRecoveryTools('completely unknown pattern xyz');
        expect(tools).toContain('read');
        expect(tools).toContain('ls');
        expect(tools).toContain('grep');
      });
    });

    describe('All patterns retrieval', () => {
      it('should return all registered error patterns', () => {
        const patterns = errorRecoveryManager.getAllPatterns();
        expect(patterns.length).toBeGreaterThan(0);
        
        // Should have patterns for various categories
        const categories = new Set(patterns.map(p => p.category));
        expect(categories.has('filesystem')).toBe(true);
        expect(categories.has('syntax')).toBe(true);
        expect(categories.has('edit')).toBe(true);
      });
    });
  });

  describe('Session tool persistence', () => {
    const sessionId = 'test-session-persistence';
    const sessionId2 = 'test-session-persistence-2';

    beforeEach(() => {
      // Clear all session states before each test
      clearAllSessionToolStates();
    });

    afterEach(() => {
      // Clean up after each test
      clearAllSessionToolStates();
    });

    describe('Agent-requested tools persistence', () => {
      it('should persist tools requested by the agent for the entire session', () => {
        // Request tools
        addAgentRequestedTools(sessionId, ['browser_navigate', 'browser_click'], 'Need browser tools');
        
        // Verify tools are persisted
        const state = getSessionToolState(sessionId);
        expect(state.requestedTools.has('browser_navigate')).toBe(true);
        expect(state.requestedTools.has('browser_click')).toBe(true);
        
        // Request more tools later in the session
        addAgentRequestedTools(sessionId, ['lsp_hover', 'lsp_definition'], 'Need LSP tools');
        
        // All tools should still be available
        const agentTools = getAgentControlledTools(sessionId);
        expect(agentTools).toContain('browser_navigate');
        expect(agentTools).toContain('browser_click');
        expect(agentTools).toContain('lsp_hover');
        expect(agentTools).toContain('lsp_definition');
      });

      it('should track request history with timestamps and reasons', () => {
        addAgentRequestedTools(sessionId, ['read', 'write'], 'File operations');
        addAgentRequestedTools(sessionId, ['grep', 'glob'], 'Search operations');
        
        const state = getSessionToolState(sessionId);
        expect(state.requestHistory).toHaveLength(2);
        
        // Verify first request
        expect(state.requestHistory[0].tools).toEqual(['read', 'write']);
        expect(state.requestHistory[0].reason).toBe('File operations');
        expect(state.requestHistory[0].timestamp).toBeGreaterThan(0);
        
        // Verify second request
        expect(state.requestHistory[1].tools).toEqual(['grep', 'glob']);
        expect(state.requestHistory[1].reason).toBe('Search operations');
        expect(state.requestHistory[1].timestamp).toBeGreaterThanOrEqual(state.requestHistory[0].timestamp);
      });

      it('should not duplicate tools when requested multiple times', () => {
        addAgentRequestedTools(sessionId, ['read', 'write'], 'First request');
        addAgentRequestedTools(sessionId, ['read', 'grep'], 'Second request');
        
        const state = getSessionToolState(sessionId);
        // Set should only contain unique tools
        expect(state.requestedTools.size).toBe(3); // read, write, grep
        expect(state.requestedTools.has('read')).toBe(true);
        expect(state.requestedTools.has('write')).toBe(true);
        expect(state.requestedTools.has('grep')).toBe(true);
      });
    });

    describe('Discovered tools persistence', () => {
      it('should persist tools discovered via search', () => {
        addDiscoveredTools(sessionId, ['create_tool', 'bulk']);
        
        const state = getSessionToolState(sessionId);
        expect(state.discoveredTools.has('create_tool')).toBe(true);
        expect(state.discoveredTools.has('bulk')).toBe(true);
        
        // Discovered tools should be included in agent-controlled tools
        const agentTools = getAgentControlledTools(sessionId);
        expect(agentTools).toContain('create_tool');
        expect(agentTools).toContain('bulk');
      });

      it('should combine requested and discovered tools', () => {
        addAgentRequestedTools(sessionId, ['read', 'write'], 'File ops');
        addDiscoveredTools(sessionId, ['create_tool', 'bulk']);
        
        const agentTools = getAgentControlledTools(sessionId);
        expect(agentTools).toHaveLength(4);
        expect(agentTools).toContain('read');
        expect(agentTools).toContain('write');
        expect(agentTools).toContain('create_tool');
        expect(agentTools).toContain('bulk');
      });
    });

    describe('Tool success tracking', () => {
      it('should track successful tool executions', () => {
        recordToolSuccess(sessionId, 'read');
        recordToolSuccess(sessionId, 'write');
        recordToolSuccess(sessionId, 'read'); // Duplicate should not increase count
        
        const state = getSessionToolState(sessionId);
        expect(state.successfulTools.has('read')).toBe(true);
        expect(state.successfulTools.has('write')).toBe(true);
        expect(state.successfulTools.size).toBe(2);
      });

      it('should include successful tools in loaded tools info', () => {
        recordToolSuccess(sessionId, 'grep');
        recordToolSuccess(sessionId, 'glob');
        
        const info = getLoadedToolsInfo(sessionId);
        expect(info.successfulTools).toContain('grep');
        expect(info.successfulTools).toContain('glob');
      });
    });

    describe('Tool error tracking', () => {
      it('should record tool errors with timestamps', () => {
        recordToolError(sessionId, 'read', 'ENOENT: file not found');
        recordToolError(sessionId, 'write', 'EACCES: permission denied');
        
        const errors = getRecentToolErrors(sessionId);
        expect(errors).toHaveLength(2);
        expect(errors[0].toolName).toBe('read');
        expect(errors[0].error).toBe('ENOENT: file not found');
        expect(errors[1].toolName).toBe('write');
        expect(errors[1].error).toBe('EACCES: permission denied');
      });

      it('should limit error history to last 10 errors', () => {
        // Record 15 errors
        for (let i = 0; i < 15; i++) {
          recordToolError(sessionId, `tool${i}`, `Error ${i}`);
        }
        
        const state = getSessionToolState(sessionId);
        expect(state.recentErrors).toHaveLength(10);
        // Should keep the most recent errors (5-14)
        expect(state.recentErrors[0].error).toBe('Error 5');
        expect(state.recentErrors[9].error).toBe('Error 14');
      });

      it('should return empty array for session with no errors', () => {
        const errors = getRecentToolErrors('non-existent-session');
        expect(errors).toEqual([]);
      });
    });

    describe('Loaded tools info', () => {
      it('should return comprehensive loaded tools information', () => {
        addAgentRequestedTools(sessionId, ['browser_navigate', 'browser_click'], 'Browser tools');
        addDiscoveredTools(sessionId, ['create_tool']);
        recordToolSuccess(sessionId, 'read');
        
        const info = getLoadedToolsInfo(sessionId);
        
        // Check structure
        expect(info.coreTools).toBeDefined();
        expect(info.coreTools.length).toBeGreaterThan(0);
        expect(info.requestedTools).toEqual(['browser_navigate', 'browser_click']);
        expect(info.discoveredTools).toEqual(['create_tool']);
        expect(info.successfulTools).toEqual(['read']);
        expect(info.allTools.length).toBeGreaterThan(0);
        expect(info.totalCount).toBe(info.allTools.length);
      });

      it('should return sorted unique tools in allTools', () => {
        addAgentRequestedTools(sessionId, ['write', 'read'], 'File ops');
        
        const info = getLoadedToolsInfo(sessionId);
        
        // allTools should be sorted
        const sortedTools = [...info.allTools].sort();
        expect(info.allTools).toEqual(sortedTools);
        
        // Should not have duplicates
        const uniqueTools = new Set(info.allTools);
        expect(uniqueTools.size).toBe(info.allTools.length);
      });

      it('should return default info for non-existent session', () => {
        const info = getLoadedToolsInfo('non-existent-session');
        
        expect(info.coreTools.length).toBeGreaterThan(0);
        expect(info.requestedTools).toEqual([]);
        expect(info.discoveredTools).toEqual([]);
        expect(info.successfulTools).toEqual([]);
      });
    });

    describe('Session isolation', () => {
      it('should isolate tool state between different sessions', () => {
        addAgentRequestedTools(sessionId, ['read', 'write'], 'Session 1 tools');
        addAgentRequestedTools(sessionId2, ['grep', 'glob'], 'Session 2 tools');
        
        const tools1 = getAgentControlledTools(sessionId);
        const tools2 = getAgentControlledTools(sessionId2);
        
        expect(tools1).toContain('read');
        expect(tools1).toContain('write');
        expect(tools1).not.toContain('grep');
        expect(tools1).not.toContain('glob');
        
        expect(tools2).toContain('grep');
        expect(tools2).toContain('glob');
        expect(tools2).not.toContain('read');
        expect(tools2).not.toContain('write');
      });

      it('should track errors separately per session', () => {
        recordToolError(sessionId, 'read', 'Error in session 1');
        recordToolError(sessionId2, 'write', 'Error in session 2');
        
        const errors1 = getRecentToolErrors(sessionId);
        const errors2 = getRecentToolErrors(sessionId2);
        
        expect(errors1).toHaveLength(1);
        expect(errors1[0].error).toBe('Error in session 1');
        
        expect(errors2).toHaveLength(1);
        expect(errors2[0].error).toBe('Error in session 2');
      });
    });

    describe('Session cleanup', () => {
      it('should clear session state and return cleanup statistics', () => {
        addAgentRequestedTools(sessionId, ['read', 'write', 'edit'], 'Tools');
        addDiscoveredTools(sessionId, ['create_tool', 'bulk']);
        recordToolError(sessionId, 'read', 'Error 1');
        recordToolError(sessionId, 'write', 'Error 2');
        recordToolSuccess(sessionId, 'grep');
        
        const stats = cleanupSession(sessionId);
        
        expect(stats).not.toBeNull();
        expect(isSessionCleanupStats(stats)).toBe(true);
        expect(stats!.sessionId).toBe(sessionId);
        expect(stats!.requestedToolsCleared).toBe(3);
        expect(stats!.discoveredToolsCleared).toBe(2);
        expect(stats!.errorsCleared).toBe(2);
        expect(stats!.successfulToolsCleared).toBe(1);
        expect(stats!.requestHistoryCleared).toBe(1);
        expect(stats!.timestamp).toBeGreaterThan(0);
        
        // Verify session is actually cleared
        const tools = getAgentControlledTools(sessionId);
        expect(tools).toEqual([]);
      });

      it('should return null when cleaning up non-existent session', () => {
        const stats = cleanupSession('non-existent-session');
        expect(stats).toBeNull();
      });

      it('should not affect other sessions when cleaning up one session', () => {
        addAgentRequestedTools(sessionId, ['read'], 'Session 1');
        addAgentRequestedTools(sessionId2, ['write'], 'Session 2');
        
        cleanupSession(sessionId);
        
        // Session 1 should be cleared
        expect(getAgentControlledTools(sessionId)).toEqual([]);
        
        // Session 2 should still have its tools
        expect(getAgentControlledTools(sessionId2)).toContain('write');
      });

      it('should clean up all sessions at once', () => {
        addAgentRequestedTools(sessionId, ['read'], 'Session 1');
        addAgentRequestedTools(sessionId2, ['write'], 'Session 2');
        
        const allStats = cleanupAllSessions();
        
        expect(allStats).toHaveLength(2);
        expect(getActiveSessionCount()).toBe(0);
        expect(getAgentControlledTools(sessionId)).toEqual([]);
        expect(getAgentControlledTools(sessionId2)).toEqual([]);
      });
    });

    describe('Memory management', () => {
      it('should track active session count', () => {
        expect(getActiveSessionCount()).toBe(0);
        
        addAgentRequestedTools(sessionId, ['read'], 'Session 1');
        expect(getActiveSessionCount()).toBe(1);
        
        addAgentRequestedTools(sessionId2, ['write'], 'Session 2');
        expect(getActiveSessionCount()).toBe(2);
        
        clearSessionToolState(sessionId);
        expect(getActiveSessionCount()).toBe(1);
        
        clearSessionToolState(sessionId2);
        expect(getActiveSessionCount()).toBe(0);
      });

      it('should estimate memory usage for session states', () => {
        // Empty state should have minimal memory
        const emptyMemory = getSessionMemoryEstimate();
        expect(emptyMemory).toBe(0);
        
        // Add some data
        addAgentRequestedTools(sessionId, ['read', 'write', 'edit'], 'Tools');
        addDiscoveredTools(sessionId, ['create_tool', 'bulk']);
        recordToolError(sessionId, 'read', 'Error message');
        recordToolSuccess(sessionId, 'grep');
        
        const memoryWithData = getSessionMemoryEstimate();
        expect(memoryWithData).toBeGreaterThan(0);
        
        // Add more sessions should increase memory
        addAgentRequestedTools(sessionId2, ['glob', 'grep'], 'More tools');
        const memoryWithMoreSessions = getSessionMemoryEstimate();
        expect(memoryWithMoreSessions).toBeGreaterThan(memoryWithData);
      });

      it('should free memory on session cleanup', () => {
        addAgentRequestedTools(sessionId, ['read', 'write', 'edit', 'grep', 'glob'], 'Many tools');
        for (let i = 0; i < 10; i++) {
          recordToolError(sessionId, `tool${i}`, `Error ${i} with some longer message content`);
        }
        
        const memoryBefore = getSessionMemoryEstimate();
        expect(memoryBefore).toBeGreaterThan(0);
        
        cleanupSession(sessionId);
        
        const memoryAfter = getSessionMemoryEstimate();
        expect(memoryAfter).toBeLessThan(memoryBefore);
      });
    });

    describe('Session state initialization', () => {
      it('should create new session state on first access', () => {
        const state = getSessionToolState('new-session');
        
        expect(state).toBeDefined();
        expect(isSessionToolState(state)).toBe(true);
        expect(state.requestedTools).toBeInstanceOf(Set);
        expect(state.requestedTools.size).toBe(0);
        expect(state.discoveredTools).toBeInstanceOf(Set);
        expect(state.discoveredTools.size).toBe(0);
        expect(state.successfulTools).toBeInstanceOf(Set);
        expect(state.successfulTools.size).toBe(0);
        expect(state.recentErrors).toEqual([]);
        expect(state.requestHistory).toEqual([]);
        expect(state.lastRequestAt).toBe(0);
      });

      it('should return same state on subsequent accesses', () => {
        const state1 = getSessionToolState(sessionId);
        state1.requestedTools.add('test-tool');
        
        const state2 = getSessionToolState(sessionId);
        expect(state2.requestedTools.has('test-tool')).toBe(true);
        expect(state1).toBe(state2);
      });

      it('should validate loaded tools info structure', () => {
        addAgentRequestedTools(sessionId, ['read', 'write'], 'Test tools');
        const info = getLoadedToolsInfo(sessionId);
        
        expect(isLoadedToolsInfo(info)).toBe(true);
        expect(info.coreTools).toBeDefined();
        expect(info.allTools).toBeDefined();
      });

      it('should validate error pattern categories', () => {
        expect(isErrorPatternCategory('filesystem')).toBe(true);
        expect(isErrorPatternCategory('network')).toBe(true);
        expect(isErrorPatternCategory('permission')).toBe(true);
        expect(isErrorPatternCategory('syntax')).toBe(true);
        expect(isErrorPatternCategory('type')).toBe(true);
        expect(isErrorPatternCategory('module')).toBe(true);
        expect(isErrorPatternCategory('edit')).toBe(true);
        expect(isErrorPatternCategory('terminal')).toBe(true);
        expect(isErrorPatternCategory('browser')).toBe(true);
        expect(isErrorPatternCategory('resource')).toBe(true);
        expect(isErrorPatternCategory('unknown')).toBe(true);
        expect(isErrorPatternCategory('invalid')).toBe(false);
      });

      it('should create truncator with custom config', () => {
        const truncator = createTestTruncator(500);
        expect(truncator).toBeDefined();
        expect(truncator.getConfig().maxTokens).toBe(500);
      });
    });
  });
});


  describe('Output truncation', () => {

    describe('End-to-end truncation with tool execution', () => {
      it('should truncate large file read output using head-tail strategy', () => {
        // Simulate a large file read output (500 lines)
        const lines = Array.from({ length: 500 }, (_, i) => 
          `Line ${i + 1}: This is content from a large file that needs truncation.`
        );
        const largeOutput = lines.join('\n');
        
        // Create truncator with low token limit to force truncation
        const truncator = createOutputTruncator({ maxTokens: 500 });
        const result = truncator.truncate(largeOutput, 'read');
        
        expect(result.wasTruncated).toBe(true);
        expect(result.originalLines).toBe(500);
        expect(result.linesRemoved).toBeGreaterThan(0);
        expect(result.finalTokens).toBeLessThanOrEqual(500);
        
        // Head-tail strategy should preserve first and last sections
        expect(result.content).toContain('Line 1:');
        expect(result.content).toContain('[...');
        expect(result.content).toContain('truncated');
        expect(result.summary).toContain('truncated');
      });

      it('should truncate terminal output using tail strategy', () => {
        // Simulate terminal output (build log)
        const lines = Array.from({ length: 300 }, (_, i) => 
          `[${new Date().toISOString()}] Build step ${i + 1}: Processing...`
        );
        const terminalOutput = lines.join('\n');
        
        const truncator = createOutputTruncator({ maxTokens: 400 });
        const result = truncator.truncate(terminalOutput, 'run');
        
        expect(result.wasTruncated).toBe(true);
        expect(result.originalLines).toBe(300);
        
        // Tail strategy should preserve the end (most recent output)
        expect(result.content).toContain('earlier output truncated');
        // Should contain later lines, not earlier ones
        expect(result.content).toContain('Build step 300');
      });

      it('should truncate directory listing using count-summary strategy', () => {
        // Simulate a large directory listing
        const entries = [
          ...Array.from({ length: 30 }, (_, i) => `dir${i}/`),
          ...Array.from({ length: 200 }, (_, i) => `file${i}.ts`),
        ];
        const dirOutput = entries.join('\n');
        
        const truncator = createOutputTruncator({ maxTokens: 300 });
        const result = truncator.truncate(dirOutput, 'ls');
        
        expect(result.wasTruncated).toBe(true);
        
        // Count-summary strategy should show totals
        expect(result.content).toContain('Total entries:');
        expect(result.content).toContain('directories');
        expect(result.content).toContain('files');
      });

      it('should truncate search results using relevance strategy', () => {
        // Simulate grep search results
        const matches = Array.from({ length: 100 }, (_, i) => 
          `src/file${i}.ts:${i + 10}:  const result = processData(input);`
        );
        const searchOutput = matches.join('\n');
        
        const truncator = createOutputTruncator({ maxTokens: 400 });
        const result = truncator.truncate(searchOutput, 'grep');
        
        expect(result.wasTruncated).toBe(true);
        expect(result.originalLines).toBe(100);
        
        // Relevance strategy should indicate more matches exist
        expect(result.content).toContain('more matches');
        expect(result.summary).toContain('matches');
      });
    });

    describe('Section retrieval for truncated output', () => {
      it('should allow agent to request specific line ranges', () => {
        const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
        const output = lines.join('\n');
        
        const truncator = createOutputTruncator();
        
        // Get specific section
        const section = truncator.getSection(output, 50, 60);
        
        expect(section).toContain('Line 50');
        expect(section).toContain('Line 60');
        expect(section).not.toContain('Line 49');
        expect(section).not.toContain('Line 61');
      });

      it('should handle out-of-bounds line ranges gracefully', () => {
        const output = 'Line 1\nLine 2\nLine 3';
        
        const truncator = createOutputTruncator();
        
        // Request beyond file length
        const section = truncator.getSection(output, 1, 100);
        
        expect(section).toBe('Line 1\nLine 2\nLine 3');
      });

      it('should handle negative start line gracefully', () => {
        const output = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
        
        const truncator = createOutputTruncator();
        
        // Negative start should be treated as 0
        const section = truncator.getSection(output, -5, 3);
        
        expect(section).toContain('Line 1');
        expect(section).toContain('Line 2');
        expect(section).toContain('Line 3');
      });
    });

    describe('Truncation with different tool types', () => {
      it('should use simple truncation for unknown tools', () => {
        const lines = Array.from({ length: 200 }, (_, i) => `Data ${i + 1}`);
        const output = lines.join('\n');
        
        const truncator = createOutputTruncator({ maxTokens: 200 });
        const result = truncator.truncate(output, 'unknown_tool');
        
        expect(result.wasTruncated).toBe(true);
        expect(result.content).toContain('truncated');
      });

      it('should not truncate output within token limit', () => {
        const smallOutput = 'This is a small output that fits within limits.';
        
        const truncator = createOutputTruncator({ maxTokens: 1000 });
        const result = truncator.truncate(smallOutput, 'read');
        
        expect(result.wasTruncated).toBe(false);
        expect(result.content).toBe(smallOutput);
        expect(result.linesRemoved).toBe(0);
        expect(result.summary).toBe('');
      });

      it('should handle read_file tool same as read', () => {
        const lines = Array.from({ length: 300 }, (_, i) => `Content ${i + 1}`);
        const output = lines.join('\n');
        
        const truncator = createOutputTruncator({ maxTokens: 300 });
        
        const readResult = truncator.truncate(output, 'read');
        const readFileResult = truncator.truncate(output, 'read_file');
        
        // Both should use head-tail strategy
        expect(readResult.wasTruncated).toBe(true);
        expect(readFileResult.wasTruncated).toBe(true);
        expect(readResult.content).toContain('[...');
        expect(readFileResult.content).toContain('[...');
      });

      it('should handle check_terminal tool same as run', () => {
        const lines = Array.from({ length: 300 }, (_, i) => `Output ${i + 1}`);
        const output = lines.join('\n');
        
        const truncator = createOutputTruncator({ maxTokens: 300 });
        
        const runResult = truncator.truncate(output, 'run');
        const checkResult = truncator.truncate(output, 'check_terminal');
        
        // Both should use tail strategy
        expect(runResult.wasTruncated).toBe(true);
        expect(checkResult.wasTruncated).toBe(true);
        expect(runResult.content).toContain('earlier output truncated');
        expect(checkResult.content).toContain('earlier output truncated');
      });
    });

    describe('Convenience functions', () => {
      it('truncateToolOutput should work with singleton instance', () => {
        const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}`);
        const output = lines.join('\n');
        
        // Use convenience function with custom max tokens
        const result = truncateToolOutput(output, 'read', 300);
        
        expect(result.wasTruncated).toBe(true);
        expect(result.finalTokens).toBeLessThanOrEqual(300);
      });

      it('needsTruncation should correctly identify large outputs', () => {
        const smallOutput = 'Small content';
        const largeOutput = 'x'.repeat(50000); // ~12500 tokens
        
        expect(needsTruncation(smallOutput)).toBe(false);
        expect(needsTruncation(largeOutput)).toBe(true);
        
        // With custom limit - use values that make sense with ~4 chars/token ratio
        expect(needsTruncation('This is a longer test string with more content', 5)).toBe(true);
        expect(needsTruncation(largeOutput, 100000)).toBe(false);
      });
    });

    describe('Token counting accuracy', () => {
      it('should accurately estimate token counts', () => {
        // Create output that will definitely exceed 50 tokens
        // With ~4 chars per token, we need > 200 chars to exceed 50 tokens
        const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: Some content here`);
        const output = lines.join('\n'); // ~2500+ chars = ~600+ tokens
        
        const truncator = createOutputTruncator({ maxTokens: 50 });
        const result = truncator.truncate(output, 'read');
        
        expect(result.wasTruncated).toBe(true);
        expect(result.originalTokens).toBeGreaterThan(50);
        expect(result.finalTokens).toBeLessThanOrEqual(50);
      });

      it('should handle empty output', () => {
        const truncator = createOutputTruncator();
        const result = truncator.truncate('', 'read');
        
        expect(result.wasTruncated).toBe(false);
        expect(result.content).toBe('');
        expect(result.originalLines).toBe(1); // Empty string splits to ['']
        expect(result.linesRemoved).toBe(0);
      });

      it('should handle single line output', () => {
        const truncator = createOutputTruncator({ maxTokens: 1000 });
        const result = truncator.truncate('Single line content', 'read');
        
        expect(result.wasTruncated).toBe(false);
        expect(result.content).toBe('Single line content');
        expect(result.originalLines).toBe(1);
      });
    });

    describe('Configuration management', () => {
      it('should allow updating configuration', () => {
        const truncator = createOutputTruncator({ maxTokens: 1000 });
        
        expect(truncator.getConfig().maxTokens).toBe(1000);
        
        truncator.setConfig({ maxTokens: 500 });
        
        expect(truncator.getConfig().maxTokens).toBe(500);
      });

      it('should use updated configuration for truncation', () => {
        const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`);
        const output = lines.join('\n');
        
        const truncator = createOutputTruncator({ maxTokens: 10000 });
        
        // Should not truncate with high limit
        const result1 = truncator.truncate(output, 'read');
        expect(result1.wasTruncated).toBe(false);
        
        // Update to low limit
        truncator.setConfig({ maxTokens: 100 });
        
        // Should truncate with low limit
        const result2 = truncator.truncate(output, 'read');
        expect(result2.wasTruncated).toBe(true);
      });
    });
  });
