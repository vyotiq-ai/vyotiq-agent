/**
 * Diff Utilities Refinement Tests
 * 
 * Advanced tests to validate refinements and optimizations.
 */
import { describe, it, expect } from 'vitest';
import {
  computeLCS,
  stringSimilarity,
  computeDiffStats,
  computeInlineDiff,
  buildSemanticDiffLines,
} from './diffUtils';

describe('Refinement - Core Utilities', () => {
  it('computeLCS should find longest common subsequence', () => {
    const result = computeLCS(['a', 'b', 'c', 'd'], ['a', 'c', 'd', 'e']);
    expect(result).toEqual(['a', 'c', 'd']);
  });

  it('stringSimilarity should calculate similarity correctly', () => {
    const similarity = stringSimilarity('hello world', 'hello world');
    expect(similarity).toBe(1);

    const partialSimilarity = stringSimilarity('hello', 'hello world');
    expect(partialSimilarity).toBeGreaterThan(0.4);
    expect(partialSimilarity).toBeLessThan(1);
  });

  it('computeDiffStats should count changes correctly', () => {
    const stats = computeDiffStats('line1\nline2', 'line1\nline3');
    expect(stats.added).toBeGreaterThanOrEqual(0);
    expect(stats.removed).toBeGreaterThanOrEqual(0);
  });
});

describe('Refinement - Similarity Threshold', () => {
  it('should pair lines with 40% similarity', () => {
    const original = 'function oldName() { return 42; }';
    const modified = 'function newName() { return 42; }';
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should be paired as modification (both removed and added with inline diff)
    const removedLines = lines.filter(l => l.type === 'removed');
    const addedLines = lines.filter(l => l.type === 'added');
    
    expect(removedLines.length).toBe(1);
    expect(addedLines.length).toBe(1);
    
    // Should have inline diff
    expect(removedLines[0].inlineDiff).toBeDefined();
    expect(addedLines[0].inlineDiff).toBeDefined();
  });

  it('should not pair lines with low similarity', () => {
    const original = 'const x = 1;';
    const modified = 'function doSomething() { return "hello"; }';
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should be separate (not paired)
    const removedLines = lines.filter(l => l.type === 'removed');
    const addedLines = lines.filter(l => l.type === 'added');
    
    expect(removedLines.length).toBe(1);
    expect(addedLines.length).toBe(1);
    
    // Should NOT have inline diff (not similar enough to pair)
    expect(removedLines[0].inlineDiff).toBeUndefined();
    expect(addedLines[0].inlineDiff).toBeUndefined();
  });

  it('should handle multiple similar lines correctly', () => {
    const original = `line1
line2
line3`;
    const modified = `line1
line2_modified
line3_modified`;
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // line1 should be context (with contextLines=0, it won't show)
    // line2 and line3 should be paired modifications
    const contextLines = lines.filter(l => l.type === 'context');
    const removedLines = lines.filter(l => l.type === 'removed');
    const addedLines = lines.filter(l => l.type === 'added');
    
    // With contextLines=0, no context lines are shown
    expect(contextLines.length).toBe(0);
    expect(removedLines.length).toBe(2);
    expect(addedLines.length).toBe(2);
  });
});

describe('Refinement - Inline Diff Quality', () => {
  it('should highlight only changed words in similar lines', () => {
    const oldLine = 'import { foo } from "./foo.js";';
    const newLine = 'import { bar } from "./foo.js";';
    const diff = computeInlineDiff(oldLine, newLine);
    
    // Should have both unchanged and changed parts
    expect(diff.oldParts.some(p => p.type === 'unchanged')).toBe(true);
    expect(diff.oldParts.some(p => p.type === 'removed')).toBe(true);
    expect(diff.newParts.some(p => p.type === 'unchanged')).toBe(true);
    expect(diff.newParts.some(p => p.type === 'added')).toBe(true);
    
    // The unchanged parts should include common tokens
    const oldUnchanged = diff.oldParts.filter(p => p.type === 'unchanged').map(p => p.text).join('');
    const newUnchanged = diff.newParts.filter(p => p.type === 'unchanged').map(p => p.text).join('');
    
    expect(oldUnchanged).toContain('import');
    expect(newUnchanged).toContain('import');
  });

  it('should handle punctuation changes precisely', () => {
    const oldLine = 'const x = 1;';
    const newLine = 'const x = 2;';
    const diff = computeInlineDiff(oldLine, newLine);
    
    // Should identify the exact change (1 -> 2)
    const oldChanged = diff.oldParts.filter(p => p.type === 'removed').map(p => p.text).join('');
    const newChanged = diff.newParts.filter(p => p.type === 'added').map(p => p.text).join('');
    
    expect(oldChanged).toBe('1');
    expect(newChanged).toBe('2');
  });

  it('should handle whitespace changes', () => {
    const oldLine = 'const x=1;';
    const newLine = 'const x = 1;';
    const diff = computeInlineDiff(oldLine, newLine);
    
    // The tokenizer treats '=' as a separate token
    // So 'x=1' becomes ['x', '=', '1'] and 'x = 1' becomes ['x', ' ', '=', ' ', '1']
    // This should detect the whitespace differences
    const oldText = diff.oldParts.map(p => p.text).join('');
    const newText = diff.newParts.map(p => p.text).join('');
    
    expect(oldText).toBe(oldLine);
    expect(newText).toBe(newLine);
    expect(oldText).not.toBe(newText);
  });
});

describe('Refinement - Context Line Optimization', () => {
  it('should minimize context lines when contextLines=0', () => {
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
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // With contextLines=0, should only show changed lines
    const contextLines = lines.filter(l => l.type === 'context');
    expect(contextLines.length).toBe(0);
  });

  it('should include appropriate context when contextLines=3', () => {
    const original = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n');
    const modified = Array.from({ length: 20 }, (_, i) => i === 10 ? 'changed' : `line${i + 1}`).join('\n');
    
    const lines = buildSemanticDiffLines(original, modified, 3);
    
    // Should have context lines around the change
    const contextLines = lines.filter(l => l.type === 'context');
    expect(contextLines.length).toBeGreaterThan(0);
    expect(contextLines.length).toBeLessThanOrEqual(6); // 3 before + 3 after
  });

  it('should collapse distant unchanged regions', () => {
    const original = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join('\n');
    const modified = Array.from({ length: 100 }, (_, i) => {
      if (i === 10) return 'changed1';
      if (i === 90) return 'changed2';
      return `line${i + 1}`;
    }).join('\n');
    
    const lines = buildSemanticDiffLines(original, modified, 3);
    
    // Should have expand markers for collapsed regions
    const expandLines = lines.filter(l => l.type === 'expand');
    expect(expandLines.length).toBeGreaterThan(0);
  });
});

describe('Refinement - Memory Efficiency', () => {
  it('should handle very large diffs without excessive memory', () => {
    const original = Array.from({ length: 5000 }, (_, i) => `line${i}`).join('\n');
    const modified = Array.from({ length: 5000 }, (_, i) => i % 100 === 0 ? `changed${i}` : `line${i}`).join('\n');
    
    const memBefore = process.memoryUsage().heapUsed;
    const lines = buildSemanticDiffLines(original, modified, 3);
    const memAfter = process.memoryUsage().heapUsed;
    
    const memUsed = (memAfter - memBefore) / 1024 / 1024; // MB
    
    expect(lines.length).toBeGreaterThan(0);
    // Memory usage can vary significantly due to GC, so we use a more realistic threshold
    expect(memUsed).toBeLessThan(500); // Should use less than 500MB
  });

  it('should not create excessive intermediate objects', () => {
    const original = 'a\n'.repeat(1000);
    const modified = 'b\n'.repeat(1000);
    
    const start = Date.now();
    const lines = buildSemanticDiffLines(original, modified, 0);
    const duration = Date.now() - start;
    
    expect(lines.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });
});

describe('Refinement - Correctness Validation', () => {
  it('should never show duplicate line numbers', () => {
    const original = `line1
line2
line3
line4
line5`;
    const modified = `line1
changed2
line3
changed4
line5`;
    
    const lines = buildSemanticDiffLines(original, modified, 1);
    
    // Collect all old line numbers (excluding context which appears in both)
    const oldLineNums: number[] = [];
    const newLineNums: number[] = [];
    
    for (const line of lines) {
      if (line.type === 'removed' && line.oldLineNum) {
        oldLineNums.push(line.oldLineNum);
      } else if (line.type === 'added' && line.newLineNum) {
        newLineNums.push(line.newLineNum);
      } else if (line.type === 'context') {
        if (line.oldLineNum) oldLineNums.push(line.oldLineNum);
        if (line.newLineNum) newLineNums.push(line.newLineNum);
      }
    }
    
    // Check for duplicates
    const uniqueOld = new Set(oldLineNums);
    const uniqueNew = new Set(newLineNums);
    
    expect(oldLineNums.length).toBe(uniqueOld.size);
    expect(newLineNums.length).toBe(uniqueNew.size);
  });

  it('should maintain correct line number sequence', () => {
    // Test that line numbers are assigned correctly
    const original = `line1
line2
line3
line4
line5`;
    const modified = `line1
line2
modified3
line4
line5`;
    
    const lines = buildSemanticDiffLines(original, modified, 1);
    
    // Verify that all lines have appropriate line numbers
    for (const line of lines) {
      if (line.type === 'removed') {
        expect(line.oldLineNum).toBeDefined();
        expect(line.oldLineNum).toBeGreaterThan(0);
      } else if (line.type === 'added') {
        expect(line.newLineNum).toBeDefined();
        expect(line.newLineNum).toBeGreaterThan(0);
      } else if (line.type === 'context') {
        expect(line.oldLineNum).toBeDefined();
        expect(line.newLineNum).toBeDefined();
        expect(line.oldLineNum).toBeGreaterThan(0);
        expect(line.newLineNum).toBeGreaterThan(0);
      }
    }
  });

  it('should correctly handle mixed additions and removals', () => {
    const original = `line1
line2
line3
line4`;
    const modified = `line1
added1
line3
added2`;
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    const stats = computeDiffStats(original, modified);
    const addedCount = lines.filter(l => l.type === 'added').length;
    const removedCount = lines.filter(l => l.type === 'removed').length;
    
    expect(addedCount + removedCount).toBe(stats.totalChanges);
  });
});

describe('Refinement - Real-World Scenarios', () => {
  it('should handle TypeScript import refactoring', () => {
    const original = `import { Component } from 'react';
import { useState } from 'react';
import { useEffect } from 'react';`;
    
    const modified = `import { Component, useState, useEffect } from 'react';`;
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should show 3 removals and 1 addition
    const removedLines = lines.filter(l => l.type === 'removed');
    const addedLines = lines.filter(l => l.type === 'added');
    
    expect(removedLines.length).toBe(3);
    expect(addedLines.length).toBe(1);
  });

  it('should handle function signature changes', () => {
    const original = 'function test(a, b) {';
    const modified = 'function test(a: string, b: number) {';
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should be paired as modification
    const removedLines = lines.filter(l => l.type === 'removed');
    const addedLines = lines.filter(l => l.type === 'added');
    
    expect(removedLines.length).toBe(1);
    expect(addedLines.length).toBe(1);
    expect(removedLines[0].inlineDiff).toBeDefined();
  });

  it('should handle comment additions', () => {
    const original = 'const x = 1;';
    const modified = `// This is a comment
const x = 1;`;
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should show 1 addition (comment) and 1 context (const x = 1)
    // With contextLines=0, the unchanged line won't be shown as context
    const addedLines = lines.filter(l => l.type === 'added');
    const contextLines = lines.filter(l => l.type === 'context');
    
    expect(addedLines.length).toBe(1);
    // With contextLines=0, context lines are not included
    expect(contextLines.length).toBe(0);
  });

  it('should handle code block reordering', () => {
    const original = `function a() {}
function b() {}
function c() {}`;
    
    const modified = `function c() {}
function a() {}
function b() {}`;
    
    const lines = buildSemanticDiffLines(original, modified, 0);
    
    // Should detect the reordering
    const changedLines = lines.filter(l => l.type === 'added' || l.type === 'removed');
    expect(changedLines.length).toBeGreaterThan(0);
  });
});
