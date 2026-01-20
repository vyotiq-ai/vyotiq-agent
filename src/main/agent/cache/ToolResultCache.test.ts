/**
 * Tool Result Cache Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ToolResultCache,
  getToolResultCache,
  resetToolResultCache,
} from './ToolResultCache';
import type { ToolExecutionResult } from '../../../shared/types';

describe('ToolResultCache', () => {
  let cache: ToolResultCache;

  beforeEach(() => {
    vi.useFakeTimers();
    resetToolResultCache();
    cache = new ToolResultCache({
      maxAge: 60000,
      maxSize: 10,
      enableLRU: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isCacheable', () => {
    it('should return true for read operations', () => {
      expect(cache.isCacheable('read')).toBe(true);
      expect(cache.isCacheable('read_file')).toBe(true);
    });

    it('should return true for search operations', () => {
      expect(cache.isCacheable('grep')).toBe(true);
      expect(cache.isCacheable('glob')).toBe(true);
    });

    it('should return false for mutating operations', () => {
      expect(cache.isCacheable('write')).toBe(false);
      expect(cache.isCacheable('edit')).toBe(false);
      expect(cache.isCacheable('run')).toBe(false);
    });
  });

  describe('get and set', () => {
    it('should cache and retrieve results', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'file content',
      };

      cache.set('read', { path: '/file.ts' }, result);
      const cached = cache.get('read', { path: '/file.ts' });
      
      expect(cached).toEqual(result);
    });

    it('should return null for uncached items', () => {
      const cached = cache.get('read', { path: '/nonexistent.ts' });
      expect(cached).toBeNull();
    });

    it('should not cache non-cacheable tools', () => {
      const result: ToolExecutionResult = {
        toolName: 'write',
        success: true,
        output: 'written',
      };

      cache.set('write', { path: '/file.ts' }, result);
      const cached = cache.get('write', { path: '/file.ts' });
      
      expect(cached).toBeNull();
    });

    it('should not cache failed results', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: false,
        output: 'Error: File not found',
      };

      cache.set('read', { path: '/file.ts' }, result);
      const cached = cache.get('read', { path: '/file.ts' });
      
      expect(cached).toBeNull();
    });

    it('should handle different argument orders', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file.ts', encoding: 'utf8' }, result);
      
      // Same args in different order should return same cached result
      const cached = cache.get('read', { encoding: 'utf8', path: '/file.ts' });
      expect(cached).toEqual(result);
    });
  });

  describe('expiration', () => {
    it('should expire entries after TTL', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file.ts' }, result);
      
      // Fast forward past default TTL (60s for read is 120s actually)
      vi.advanceTimersByTime(130000);
      
      const cached = cache.get('read', { path: '/file.ts' });
      expect(cached).toBeNull();
    });

    it('should use tool-specific TTLs', () => {
      const result: ToolExecutionResult = {
        toolName: 'diagnostics',
        success: true,
        output: '[]',
      };

      cache.set('diagnostics', { path: '/file.ts' }, result);
      
      // Diagnostics has 10s TTL
      vi.advanceTimersByTime(15000);
      
      const cached = cache.get('diagnostics', { path: '/file.ts' });
      expect(cached).toBeNull();
    });
  });

  describe('invalidation', () => {
    it('should invalidate by path', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/src/file.ts' }, result);
      cache.set('read', { path: '/src/other.ts' }, result);
      
      const invalidated = cache.invalidatePath('/src/file.ts');
      
      expect(invalidated).toBe(1);
      expect(cache.get('read', { path: '/src/file.ts' })).toBeNull();
      expect(cache.get('read', { path: '/src/other.ts' })).not.toBeNull();
    });

    it('should invalidate by tool', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };
      const grepResult: ToolExecutionResult = {
        toolName: 'grep',
        success: true,
        output: 'matches',
      };

      cache.set('read', { path: '/file1.ts' }, result);
      cache.set('read', { path: '/file2.ts' }, result);
      cache.set('grep', { pattern: 'test' }, grepResult);
      
      const invalidated = cache.invalidateTool('read');
      
      expect(invalidated).toBe(2);
      expect(cache.get('grep', { pattern: 'test' })).not.toBeNull();
    });

    it('should invalidate all', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file1.ts' }, result);
      cache.set('read', { path: '/file2.ts' }, result);
      
      cache.invalidateAll();
      
      expect(cache.get('read', { path: '/file1.ts' })).toBeNull();
      expect(cache.get('read', { path: '/file2.ts' })).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when full', () => {
      const smallCache = new ToolResultCache({
        maxSize: 3,
        maxAge: 60000,
        enableLRU: true,
      });

      const createResult = (name: string): ToolExecutionResult => ({
        toolName: 'read',
        success: true,
        output: name,
      });

      smallCache.set('read', { path: '/file1.ts' }, createResult('1'));
      smallCache.set('read', { path: '/file2.ts' }, createResult('2'));
      smallCache.set('read', { path: '/file3.ts' }, createResult('3'));
      
      // Access file1 to make it recently used
      smallCache.get('read', { path: '/file1.ts' });
      
      // Add file4, should evict file2 (oldest accessed)
      smallCache.set('read', { path: '/file4.ts' }, createResult('4'));
      
      // file1 should still be cached (recently accessed)
      expect(smallCache.get('read', { path: '/file1.ts' })).not.toBeNull();
      // file2 should be evicted
      expect(smallCache.get('read', { path: '/file2.ts' })).toBeNull();
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file.ts' }, result);
      
      // Hit
      cache.get('read', { path: '/file.ts' });
      cache.get('read', { path: '/file.ts' });
      
      // Miss
      cache.get('read', { path: '/other.ts' });
      
      const stats = cache.getStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should track entries by tool', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file1.ts' }, result);
      cache.set('read', { path: '/file2.ts' }, result);
      cache.set('grep', { pattern: 'test' }, { toolName: 'grep', success: true, output: 'matches' });
      
      const stats = cache.getStats();
      
      expect(stats.byTool.read).toBe(2);
      expect(stats.byTool.grep).toBe(1);
    });

    it('should reset statistics counters', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file.ts' }, result);
      
      // Generate some hits and misses
      cache.get('read', { path: '/file.ts' }); // hit
      cache.get('read', { path: '/file.ts' }); // hit
      cache.get('read', { path: '/other.ts' }); // miss
      
      const statsBefore = cache.getStats();
      expect(statsBefore.hits).toBe(2);
      expect(statsBefore.misses).toBe(1);
      expect(statsBefore.estimatedTokensSaved).toBeGreaterThan(0);
      
      // Reset statistics
      cache.resetStats();
      
      const statsAfter = cache.getStats();
      expect(statsAfter.hits).toBe(0);
      expect(statsAfter.misses).toBe(0);
      expect(statsAfter.hitRate).toBe(0);
      expect(statsAfter.estimatedTokensSaved).toBe(0);
      
      // Cache entries should still exist
      expect(statsAfter.size).toBe(1);
      expect(cache.get('read', { path: '/file.ts' })).not.toBeNull();
    });

    it('should preserve cache entries after stats reset', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file1.ts' }, result);
      cache.set('read', { path: '/file2.ts' }, result);
      
      // Generate some activity
      cache.get('read', { path: '/file1.ts' });
      
      const sizeBefore = cache.getStats().size;
      
      // Reset statistics
      cache.resetStats();
      
      // Cache entries should be preserved
      const sizeAfter = cache.getStats().size;
      expect(sizeAfter).toBe(sizeBefore);
      expect(cache.get('read', { path: '/file1.ts' })).not.toBeNull();
      expect(cache.get('read', { path: '/file2.ts' })).not.toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      const result: ToolExecutionResult = {
        toolName: 'diagnostics',
        success: true,
        output: '[]',
      };

      cache.set('diagnostics', { path: '/file.ts' }, result);
      
      // Fast forward past diagnostics TTL (10s)
      vi.advanceTimersByTime(15000);
      
      const removed = cache.cleanup();
      
      expect(removed).toBe(1);
    });
  });

  describe('compression', () => {
    it('should compress outputs larger than threshold', () => {
      const compressCache = new ToolResultCache({
        maxSize: 10,
        maxAge: 60000,
        enableLRU: true,
        compressionThreshold: 100, // Low threshold for testing
        enableCompression: true,
      });

      // Create a large output (> 100 bytes)
      const largeOutput = 'x'.repeat(500);
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: largeOutput,
      };

      compressCache.set('read', { path: '/large-file.ts' }, result);
      
      // Retrieve and verify decompression works
      const cached = compressCache.get('read', { path: '/large-file.ts' });
      expect(cached).not.toBeNull();
      expect(cached!.output).toBe(largeOutput);
      
      // Check stats show compression
      const stats = compressCache.getStats();
      expect(stats.compressedEntries).toBe(1);
      expect(stats.compressionBytesSaved).toBeGreaterThan(0);
      expect(stats.averageCompressionRatio).toBeGreaterThan(1);
    });

    it('should not compress outputs smaller than threshold', () => {
      const compressCache = new ToolResultCache({
        maxSize: 10,
        maxAge: 60000,
        enableLRU: true,
        compressionThreshold: 4096, // Default 4KB
        enableCompression: true,
      });

      // Create a small output (< 4KB)
      const smallOutput = 'small content';
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: smallOutput,
      };

      compressCache.set('read', { path: '/small-file.ts' }, result);
      
      // Retrieve and verify
      const cached = compressCache.get('read', { path: '/small-file.ts' });
      expect(cached).not.toBeNull();
      expect(cached!.output).toBe(smallOutput);
      
      // Check stats show no compression
      const stats = compressCache.getStats();
      expect(stats.compressedEntries).toBe(0);
    });

    it('should not compress when compression is disabled', () => {
      const noCompressCache = new ToolResultCache({
        maxSize: 10,
        maxAge: 60000,
        enableLRU: true,
        compressionThreshold: 100,
        enableCompression: false, // Disabled
      });

      const largeOutput = 'x'.repeat(500);
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: largeOutput,
      };

      noCompressCache.set('read', { path: '/large-file.ts' }, result);
      
      const cached = noCompressCache.get('read', { path: '/large-file.ts' });
      expect(cached).not.toBeNull();
      expect(cached!.output).toBe(largeOutput);
      
      const stats = noCompressCache.getStats();
      expect(stats.compressedEntries).toBe(0);
    });

    it('should handle compression of various content types', () => {
      const compressCache = new ToolResultCache({
        maxSize: 10,
        maxAge: 60000,
        enableLRU: true,
        compressionThreshold: 100,
        enableCompression: true,
      });

      // Test with JSON-like content (compresses well)
      const jsonContent = JSON.stringify({ data: Array(100).fill({ key: 'value', num: 123 }) });
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: jsonContent,
      };

      compressCache.set('read', { path: '/data.json' }, result);
      
      const cached = compressCache.get('read', { path: '/data.json' });
      expect(cached).not.toBeNull();
      expect(cached!.output).toBe(jsonContent);
    });
  });
});

describe('session management', () => {
  let cache: ToolResultCache;

  beforeEach(() => {
    vi.useFakeTimers();
    resetToolResultCache();
    cache = new ToolResultCache({
      maxAge: 60000,
      maxSize: 100,
      enableLRU: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('clearSession', () => {
    it('should clear all cache entries for a specific session', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      // Add entries for session-1
      cache.set('read', { path: '/file1.ts' }, result, 'session-1');
      cache.set('read', { path: '/file2.ts' }, result, 'session-1');
      
      // Add entries for session-2
      cache.set('read', { path: '/file3.ts' }, result, 'session-2');

      // Clear session-1
      const cleanup = cache.clearSession('session-1');

      expect(cleanup.entriesCleared).toBe(2);
      expect(cleanup.bytesFreed).toBeGreaterThan(0);
      
      // Session-1 entries should be gone
      expect(cache.get('read', { path: '/file1.ts' })).toBeNull();
      expect(cache.get('read', { path: '/file2.ts' })).toBeNull();
      
      // Session-2 entries should remain
      expect(cache.get('read', { path: '/file3.ts' })).not.toBeNull();
    });

    it('should return zero stats when clearing non-existent session', () => {
      const cleanup = cache.clearSession('non-existent-session');
      
      expect(cleanup.entriesCleared).toBe(0);
      expect(cleanup.bytesFreed).toBe(0);
    });

    it('should handle entries without session ID', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      // Add entry without session ID
      cache.set('read', { path: '/file1.ts' }, result);
      
      // Add entry with session ID
      cache.set('read', { path: '/file2.ts' }, result, 'session-1');

      // Clear session-1
      const cleanup = cache.clearSession('session-1');

      expect(cleanup.entriesCleared).toBe(1);
      
      // Entry without session should remain
      expect(cache.get('read', { path: '/file1.ts' })).not.toBeNull();
      // Session-1 entry should be gone
      expect(cache.get('read', { path: '/file2.ts' })).toBeNull();
    });

    it('should update cache stats after clearing session', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file1.ts' }, result, 'session-1');
      cache.set('read', { path: '/file2.ts' }, result, 'session-1');
      cache.set('read', { path: '/file3.ts' }, result, 'session-2');

      const statsBefore = cache.getStats();
      expect(statsBefore.size).toBe(3);
      expect(statsBefore.sessionsWithCache).toBe(2);

      cache.clearSession('session-1');

      const statsAfter = cache.getStats();
      expect(statsAfter.size).toBe(1);
      expect(statsAfter.sessionsWithCache).toBe(1);
    });

    it('should correctly report bytes freed for compressed entries', () => {
      const compressCache = new ToolResultCache({
        maxSize: 100,
        maxAge: 60000,
        enableLRU: true,
        compressionThreshold: 100,
        enableCompression: true,
      });

      // Create a large output that will be compressed
      const largeOutput = 'x'.repeat(500);
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: largeOutput,
      };

      compressCache.set('read', { path: '/large-file.ts' }, result, 'session-1');

      const cleanup = compressCache.clearSession('session-1');

      expect(cleanup.entriesCleared).toBe(1);
      // Bytes freed should be the compressed size, not original
      expect(cleanup.bytesFreed).toBeGreaterThan(0);
      expect(cleanup.bytesFreed).toBeLessThan(largeOutput.length);
    });
  });

  describe('getSessionEntryCount', () => {
    it('should return correct count for session entries', () => {
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
      expect(cache.getSessionEntryCount('non-existent')).toBe(0);
    });
  });

  describe('getSessionsWithCache', () => {
    it('should return all session IDs with cache entries', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file1.ts' }, result, 'session-1');
      cache.set('read', { path: '/file2.ts' }, result, 'session-2');
      cache.set('read', { path: '/file3.ts' }, result, 'session-3');

      const sessions = cache.getSessionsWithCache();

      expect(sessions).toHaveLength(3);
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
      expect(sessions).toContain('session-3');
    });

    it('should return empty array when no sessions have cache', () => {
      const sessions = cache.getSessionsWithCache();
      expect(sessions).toHaveLength(0);
    });
  });

  describe('bySession stats', () => {
    it('should track entries by session in stats', () => {
      const result: ToolExecutionResult = {
        toolName: 'read',
        success: true,
        output: 'content',
      };

      cache.set('read', { path: '/file1.ts' }, result, 'session-1');
      cache.set('read', { path: '/file2.ts' }, result, 'session-1');
      cache.set('read', { path: '/file3.ts' }, result, 'session-2');

      const stats = cache.getStats();

      expect(stats.bySession['session-1']).toBe(2);
      expect(stats.bySession['session-2']).toBe(1);
    });
  });
});

describe('getToolResultCache singleton', () => {
  afterEach(() => {
    resetToolResultCache();
  });

  it('should return same instance', () => {
    const cache1 = getToolResultCache();
    const cache2 = getToolResultCache();
    expect(cache1).toBe(cache2);
  });

  it('should create new instance after reset', () => {
    const cache1 = getToolResultCache();
    resetToolResultCache();
    const cache2 = getToolResultCache();
    expect(cache1).not.toBe(cache2);
  });
});
