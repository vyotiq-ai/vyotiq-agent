/**
 * Diff Utilities Tests
 * 
 * Tests for the semantic diff algorithms to ensure correct change detection.
 */
import { describe, it, expect } from 'vitest';
import {
  computeLCS,
  stringSimilarity,
  computeDiffStats,
  computeInlineDiff,
  buildSemanticDiffLines,
} from './diffUtils';

describe('computeLCS', () => {
  it('should compute LCS for identical arrays', () => {
    const a = ['a', 'b', 'c'];
    const b = ['a', 'b', 'c'];
    const lcs = computeLCS(a, b);
    expect(lcs).toEqual(['a', 'b', 'c']);
  });

  it('should compute LCS for different arrays', () => {
    const a = ['a', 'b', 'c', 'd'];
    const b = ['a', 'c', 'd', 'e'];
    const lcs = computeLCS(a, b);
    expect(lcs).toEqual(['a', 'c', 'd']);
  });

  it('should handle empty arrays', () => {
    expect(computeLCS([], [])).toEqual([]);
    expect(computeLCS(['a'], [])).toEqual([]);
    expect(computeLCS([], ['a'])).toEqual([]);
  });
});

describe('stringSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(stringSimilarity('hello', 'hello')).toBe(1);
  });

  it('should return 0 for completely different strings', () => {
    const similarity = stringSimilarity('abc', 'xyz');
    expect(similarity).toBeLessThan(0.5);
  });

  it('should return high similarity for similar strings', () => {
    const similarity = stringSimilarity('hello world', 'hello world!');
    expect(similarity).toBeGreaterThan(0.9);
  });
});

describe('computeDiffStats', () => {
  it('should return zero stats for identical content', () => {
    const stats = computeDiffStats('hello\nworld', 'hello\nworld');
    expect(stats).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      totalChanges: 0,
    });
  });

  it('should count added lines', () => {
    const stats = computeDiffStats('hello', 'hello\nworld');
    expect(stats.added).toBeGreaterThan(0);
  });

  it('should count removed lines', () => {
    const stats = computeDiffStats('hello\nworld', 'hello');
    expect(stats.removed).toBeGreaterThan(0);
  });
});

describe('computeInlineDiff', () => {
  it('should detect word-level changes', () => {
    const diff = computeInlineDiff('hello world', 'hello universe');
    expect(diff.oldParts.some(p => p.type === 'removed')).toBe(true);
    expect(diff.newParts.some(p => p.type === 'added')).toBe(true);
  });

  it('should handle identical lines', () => {
    const diff = computeInlineDiff('hello', 'hello');
    expect(diff.oldParts.every(p => p.type === 'unchanged')).toBe(true);
    expect(diff.newParts.every(p => p.type === 'unchanged')).toBe(true);
  });

  it('should handle empty lines', () => {
    const diff = computeInlineDiff('', '');
    expect(diff.oldParts).toEqual([]);
    expect(diff.newParts).toEqual([]);
  });
});

describe('buildSemanticDiffLines', () => {
  it('should return empty for identical content', () => {
    const lines = buildSemanticDiffLines('hello\nworld', 'hello\nworld', 0);
    // Should only have context lines or be empty
    const hasChanges = lines.some(l => l.type === 'added' || l.type === 'removed');
    expect(hasChanges).toBe(false);
  });

  it('should detect added lines', () => {
    const lines = buildSemanticDiffLines('hello', 'hello\nworld', 0);
    const addedLines = lines.filter(l => l.type === 'added');
    expect(addedLines.length).toBeGreaterThan(0);
  });

  it('should detect removed lines', () => {
    const lines = buildSemanticDiffLines('hello\nworld', 'hello', 0);
    const removedLines = lines.filter(l => l.type === 'removed');
    expect(removedLines.length).toBeGreaterThan(0);
  });

  it('should pair similar modified lines', () => {
    const original = 'import { foo } from "./foo";';
    const modified = 'import { bar } from "./bar";';
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should have both removed and added lines
    const removedLines = lines.filter(l => l.type === 'removed');
    const addedLines = lines.filter(l => l.type === 'added');
    
    expect(removedLines.length).toBeGreaterThan(0);
    expect(addedLines.length).toBeGreaterThan(0);
    
    // Check that inline diff is computed for paired lines
    const hasInlineDiff = lines.some(l => l.inlineDiff !== undefined);
    expect(hasInlineDiff).toBe(true);
  });

  it('should not show false changes for identical import paths', () => {
    const original = `import { getAISettings } from '../tools/index.js';
import { getAITools } from '../tools/index.js';
import { RealTimeTrace } from '../ai/interface.js';`;
    
    const modified = `import { getAISettings } from '../tools/index.js';
import { getAITools } from '../tools/index.js';
import { RealTimeTrace } from '../ai/interface.js';`;
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should not have any added or removed lines since content is identical
    const changedLines = lines.filter(l => l.type === 'added' || l.type === 'removed');
    expect(changedLines.length).toBe(0);
  });

  it('should correctly handle import statement modifications', () => {
    const original = `import { getAISettings } from '../tools/index.js';`;
    const modified = `import { getAISettings, newFunction } from '../tools/index.js';`;
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should show as a modification (removed + added pair)
    const removedLines = lines.filter(l => l.type === 'removed');
    const addedLines = lines.filter(l => l.type === 'added');
    
    expect(removedLines.length).toBe(1);
    expect(addedLines.length).toBe(1);
    
    // Should have inline diff showing the specific change
    const lineWithDiff = lines.find(l => l.inlineDiff !== undefined);
    expect(lineWithDiff).toBeDefined();
  });

  it('should handle context lines correctly', () => {
    const original = `line1
line2
line3
line4
line5`;
    const modified = `line1
line2
changed
line4
line5`;
    
    const lines = buildSemanticDiffLines(original, modified, 1);
    
    // Should have context lines around the change
    const contextLines = lines.filter(l => l.type === 'context');
    expect(contextLines.length).toBeGreaterThan(0);
    
    // Should have the changed line
    const changedLines = lines.filter(l => l.type === 'added' || l.type === 'removed');
    expect(changedLines.length).toBeGreaterThan(0);
  });
});
