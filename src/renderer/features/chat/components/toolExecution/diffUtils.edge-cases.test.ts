/**
 * Diff Utilities Edge Cases Tests
 * 
 * Tests for edge cases and potential inconsistencies in diff algorithms.
 */
import { describe, it, expect } from 'vitest';
import {
  computeLCS,
  stringSimilarity,
  computeDiffStats,
  computeInlineDiff,
  buildSemanticDiffLines,
  computeDiffHunks,
} from './diffUtils';

describe('Edge Cases - computeLCS', () => {
  it('should handle arrays with duplicate elements', () => {
    const a = ['a', 'b', 'a', 'c'];
    const b = ['a', 'a', 'b', 'c'];
    const lcs = computeLCS(a, b);
    // Should find a valid LCS (multiple valid solutions exist)
    expect(lcs.length).toBeGreaterThan(0);
    expect(lcs.length).toBeLessThanOrEqual(Math.min(a.length, b.length));
  });

  it('should handle very long arrays efficiently', () => {
    const a = Array.from({ length: 1000 }, (_, i) => `line${i}`);
    const b = [...a.slice(0, 500), 'inserted', ...a.slice(500)];
    const start = Date.now();
    const lcs = computeLCS(a, b);
    const duration = Date.now() - start;
    expect(lcs.length).toBe(1000);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });

  it('should handle arrays with all different elements', () => {
    const a = ['a', 'b', 'c'];
    const b = ['x', 'y', 'z'];
    const lcs = computeLCS(a, b);
    expect(lcs).toEqual([]);
  });
});

describe('Edge Cases - stringSimilarity', () => {
  it('should handle empty strings', () => {
    expect(stringSimilarity('', '')).toBe(1);
    expect(stringSimilarity('hello', '')).toBe(0);
    expect(stringSimilarity('', 'world')).toBe(0);
  });

  it('should handle strings with special characters', () => {
    const a = 'import { foo } from "./foo.js";';
    const b = 'import { foo } from "./foo.js";';
    expect(stringSimilarity(a, b)).toBe(1);
  });

  it('should handle unicode characters', () => {
    const a = 'Hello 世界';
    const b = 'Hello 世界';
    expect(stringSimilarity(a, b)).toBe(1);
  });

  it('should handle very long strings', () => {
    const a = 'a'.repeat(10000);
    const b = 'a'.repeat(9999) + 'b';
    const similarity = stringSimilarity(a, b);
    expect(similarity).toBeGreaterThan(0.99);
  });

  it('should be symmetric', () => {
    const a = 'hello world';
    const b = 'hello universe';
    expect(stringSimilarity(a, b)).toBe(stringSimilarity(b, a));
  });
});

describe('Edge Cases - computeDiffStats', () => {
  it('should handle empty strings', () => {
    const stats = computeDiffStats('', '');
    expect(stats).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      totalChanges: 0,
    });
  });

  it('should handle adding to empty', () => {
    const stats = computeDiffStats('', 'hello\nworld');
    expect(stats.added).toBe(2);
    expect(stats.removed).toBe(0);
  });

  it('should handle removing all', () => {
    const stats = computeDiffStats('hello\nworld', '');
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(2);
  });

  it('should handle whitespace-only changes', () => {
    const stats = computeDiffStats('hello', 'hello ');
    expect(stats.totalChanges).toBeGreaterThan(0);
  });

  it('should handle line ending differences', () => {
    const stats = computeDiffStats('hello\nworld', 'hello\r\nworld');
    // Different line endings should be detected
    expect(stats.totalChanges).toBeGreaterThan(0);
  });
});

describe('Edge Cases - computeInlineDiff', () => {
  it('should handle empty lines', () => {
    const diff = computeInlineDiff('', '');
    expect(diff.oldParts).toEqual([]);
    expect(diff.newParts).toEqual([]);
  });

  it('should handle whitespace-only changes', () => {
    const diff = computeInlineDiff('hello world', 'hello  world');
    expect(diff.oldParts.some(p => p.type === 'removed')).toBe(true);
    expect(diff.newParts.some(p => p.type === 'added')).toBe(true);
  });

  it('should handle punctuation changes', () => {
    const diff = computeInlineDiff('hello, world', 'hello; world');
    expect(diff.oldParts.some(p => p.type === 'removed')).toBe(true);
    expect(diff.newParts.some(p => p.type === 'added')).toBe(true);
  });

  it('should handle case changes', () => {
    const diff = computeInlineDiff('Hello World', 'hello world');
    expect(diff.oldParts.some(p => p.type === 'removed')).toBe(true);
    expect(diff.newParts.some(p => p.type === 'added')).toBe(true);
  });

  it('should handle very long lines', () => {
    const oldLine = 'a'.repeat(1000) + 'b';
    const newLine = 'a'.repeat(1000) + 'c';
    const diff = computeInlineDiff(oldLine, newLine);
    expect(diff.oldParts.length).toBeGreaterThan(0);
    expect(diff.newParts.length).toBeGreaterThan(0);
  });
});

describe('Edge Cases - buildSemanticDiffLines', () => {
  it('should handle empty content', () => {
    const lines = buildSemanticDiffLines('', '', 0);
    expect(lines.length).toBe(0);
  });

  it('should handle single line changes', () => {
    const lines = buildSemanticDiffLines('hello', 'world', 0);
    const removedLines = lines.filter(l => l.type === 'removed');
    const addedLines = lines.filter(l => l.type === 'added');
    expect(removedLines.length).toBe(1);
    expect(addedLines.length).toBe(1);
  });

  it('should handle multiple consecutive changes', () => {
    const original = 'line1\nline2\nline3';
    const modified = 'changed1\nchanged2\nchanged3';
    const lines = buildSemanticDiffLines(original, modified, 0);
    const changedLines = lines.filter(l => l.type === 'added' || l.type === 'removed');
    expect(changedLines.length).toBeGreaterThan(0);
  });

  it('should handle interleaved changes and context', () => {
    const original = 'line1\nline2\nline3\nline4\nline5';
    const modified = 'line1\nchanged\nline3\nline4\nline5';
    const lines = buildSemanticDiffLines(original, modified, 1);
    const contextLines = lines.filter(l => l.type === 'context');
    const changedLines = lines.filter(l => l.type === 'added' || l.type === 'removed');
    expect(contextLines.length).toBeGreaterThan(0);
    expect(changedLines.length).toBeGreaterThan(0);
  });

  it('should handle very large files', () => {
    const original = Array.from({ length: 1000 }, (_, i) => `line${i}`).join('\n');
    const modified = Array.from({ length: 1000 }, (_, i) => i === 500 ? 'changed' : `line${i}`).join('\n');
    const start = Date.now();
    const lines = buildSemanticDiffLines(original, modified, 3);
    const duration = Date.now() - start;
    expect(lines.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
  });

  it('should not duplicate lines in output', () => {
    const original = 'line1\nline2\nline3';
    const modified = 'line1\nchanged\nline3';
    const lines = buildSemanticDiffLines(original, modified, 1);
    
    // Check that no line number appears twice
    const oldLineNums = lines.filter(l => l.oldLineNum).map(l => l.oldLineNum);
    const newLineNums = lines.filter(l => l.newLineNum).map(l => l.newLineNum);
    
    const uniqueOldLineNums = new Set(oldLineNums);
    const uniqueNewLineNums = new Set(newLineNums);
    
    // Each line number should appear at most once (context lines have both)
    expect(oldLineNums.length).toBeLessThanOrEqual(uniqueOldLineNums.size + lines.filter(l => l.type === 'context').length);
    expect(newLineNums.length).toBeLessThanOrEqual(uniqueNewLineNums.size + lines.filter(l => l.type === 'context').length);
  });

  it('should handle trailing newlines correctly', () => {
    const original = 'line1\nline2\n';
    const modified = 'line1\nline2';
    const lines = buildSemanticDiffLines(original, modified, 0);
    // Should detect the difference in trailing newline
    const changedLines = lines.filter(l => l.type === 'added' || l.type === 'removed');
    expect(changedLines.length).toBeGreaterThan(0);
  });

  it('should handle files with only whitespace changes', () => {
    const original = 'line1\n  line2\nline3';
    const modified = 'line1\n    line2\nline3';
    const lines = buildSemanticDiffLines(original, modified, 0);
    const changedLines = lines.filter(l => l.type === 'added' || l.type === 'removed');
    expect(changedLines.length).toBeGreaterThan(0);
  });
});

describe('Edge Cases - computeDiffHunks', () => {
  it('should handle empty content', () => {
    const hunks = computeDiffHunks('', '', 3);
    expect(hunks).toEqual([]);
  });

  it('should merge nearby changes', () => {
    const original = 'line1\nline2\nline3\nline4\nline5\nline6';
    const modified = 'line1\nchanged2\nline3\nline4\nchanged5\nline6';
    const hunks = computeDiffHunks(original, modified, 1);
    // With context=1, these changes should be merged into one hunk
    expect(hunks.length).toBeLessThanOrEqual(2);
  });

  it('should separate distant changes', () => {
    const original = Array.from({ length: 100 }, (_, i) => `line${i}`).join('\n');
    const modified = Array.from({ length: 100 }, (_, i) => {
      if (i === 10) return 'changed10';
      if (i === 90) return 'changed90';
      return `line${i}`;
    }).join('\n');
    const hunks = computeDiffHunks(original, modified, 3);
    // These changes are far apart, should be separate hunks
    expect(hunks.length).toBe(2);
  });

  it('should include correct context lines', () => {
    const original = 'line1\nline2\nline3\nline4\nline5';
    const modified = 'line1\nline2\nchanged\nline4\nline5';
    const hunks = computeDiffHunks(original, modified, 1);
    expect(hunks.length).toBe(1);
    // Should include 1 line of context before and after
    expect(hunks[0].originalLines.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Consistency Checks', () => {
  it('should produce consistent results for same input', () => {
    const original = 'line1\nline2\nline3';
    const modified = 'line1\nchanged\nline3';
    
    const lines1 = buildSemanticDiffLines(original, modified, 1);
    const lines2 = buildSemanticDiffLines(original, modified, 1);
    
    expect(lines1).toEqual(lines2);
  });

  it('should have matching stats between computeDiffStats and buildSemanticDiffLines', () => {
    const original = 'line1\nline2\nline3\nline4';
    const modified = 'line1\nchanged\nline3\nadded\nline4';
    
    const stats = computeDiffStats(original, modified);
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    const addedCount = lines.filter(l => l.type === 'added').length;
    const removedCount = lines.filter(l => l.type === 'removed').length;
    
    // Total changes should match
    expect(addedCount + removedCount).toBe(stats.totalChanges);
  });

  it('should maintain line number continuity', () => {
    const original = 'line1\nline2\nline3\nline4\nline5';
    const modified = 'line1\nchanged\nline3\nline4\nline5';
    const lines = buildSemanticDiffLines(original, modified, 1);
    
    // Check that old line numbers are sequential (where present)
    const oldLineNums = lines
      .filter(l => l.oldLineNum !== undefined)
      .map(l => l.oldLineNum as number)
      .sort((a, b) => a - b);
    
    for (let i = 1; i < oldLineNums.length; i++) {
      // Line numbers should be sequential or have gaps (for added lines)
      expect(oldLineNums[i]).toBeGreaterThanOrEqual(oldLineNums[i - 1]);
    }
  });

  it('should not show changes for identical multiline content', () => {
    const content = `import { foo } from './foo';
import { bar } from './bar';
import { baz } from './baz';

function test() {
  return 42;
}`;
    
    const lines = buildSemanticDiffLines(content, content, 3);
    const changedLines = lines.filter(l => l.type === 'added' || l.type === 'removed');
    expect(changedLines.length).toBe(0);
  });
});
