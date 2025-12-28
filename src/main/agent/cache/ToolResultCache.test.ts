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
