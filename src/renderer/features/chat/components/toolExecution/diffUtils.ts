/**
 * Diff Utilities
 * 
 * Pure functions for computing diffs, hunks, and inline word-level changes.
 * Used by DiffViewer for unified view rendering.
 */

// Diff hunk for unified view
export interface DiffHunk {
  type: 'context' | 'added' | 'removed' | 'changed';
  originalStart: number;
  originalEnd: number;
  modifiedStart: number;
  modifiedEnd: number;
  originalLines: string[];
  modifiedLines: string[];
}

export interface InlineDiffPart {
  text: string;
  changed: boolean;
}

export interface InlineDiff {
  oldParts: InlineDiffPart[];
  newParts: InlineDiffPart[];
}

/**
 * Compute diff statistics (added, removed, changed lines)
 */
export function computeDiffStats(original: string, modified: string): { added: number; removed: number; changed: number } {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  
  let added = 0;
  let removed = 0;
  
  const originalSet = new Map<string, number>();
  for (const line of originalLines) {
    originalSet.set(line, (originalSet.get(line) || 0) + 1);
  }
  
  for (const line of modifiedLines) {
    const count = originalSet.get(line) || 0;
    if (count > 0) {
      originalSet.set(line, count - 1);
    } else {
      added++;
    }
  }
  
  for (const [, count] of originalSet) {
    removed += count;
  }
  
  const changed = Math.min(added, removed);
  return { 
    added: Math.max(0, added - changed), 
    removed: Math.max(0, removed - changed), 
    changed 
  };
}

/**
 * Compute Longest Common Subsequence
 */
export function computeLCS<T>(a: T[], b: T[]): T[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find LCS
  const lcs: T[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

/**
 * Compute diff hunks for unified view display
 */
export function computeDiffHunks(original: string, modified: string, contextLines = 3): DiffHunk[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const hunks: DiffHunk[] = [];
  
  const lcs = computeLCS(originalLines, modifiedLines);
  const changes: Array<{ type: 'equal' | 'delete' | 'insert'; origIdx: number; modIdx: number; line: string }> = [];
  
  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;
  
  while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
    if (lcsIdx < lcs.length && origIdx < originalLines.length && originalLines[origIdx] === lcs[lcsIdx]) {
      if (modIdx < modifiedLines.length && modifiedLines[modIdx] === lcs[lcsIdx]) {
        changes.push({ type: 'equal', origIdx, modIdx, line: originalLines[origIdx] });
        origIdx++;
        modIdx++;
        lcsIdx++;
      } else {
        changes.push({ type: 'insert', origIdx: -1, modIdx, line: modifiedLines[modIdx] });
        modIdx++;
      }
    } else if (origIdx < originalLines.length) {
      changes.push({ type: 'delete', origIdx, modIdx: -1, line: originalLines[origIdx] });
      origIdx++;
    } else if (modIdx < modifiedLines.length) {
      changes.push({ type: 'insert', origIdx: -1, modIdx, line: modifiedLines[modIdx] });
      modIdx++;
    }
  }
  
  // Group changes into hunks with context
  let currentHunk: DiffHunk | null = null;
  let contextBuffer: Array<{ origIdx: number; modIdx: number; line: string }> = [];
  
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    
    if (change.type === 'equal') {
      if (currentHunk) {
        if (contextBuffer.length < contextLines) {
          currentHunk.originalLines.push(change.line);
          currentHunk.modifiedLines.push(change.line);
          currentHunk.originalEnd = change.origIdx + 1;
          currentHunk.modifiedEnd = change.modIdx + 1;
        }
        contextBuffer.push({ origIdx: change.origIdx, modIdx: change.modIdx, line: change.line });
        
        if (contextBuffer.length >= contextLines * 2) {
          hunks.push(currentHunk);
          currentHunk = null;
          contextBuffer = contextBuffer.slice(-contextLines);
        }
      } else {
        contextBuffer.push({ origIdx: change.origIdx, modIdx: change.modIdx, line: change.line });
        if (contextBuffer.length > contextLines) {
          contextBuffer.shift();
        }
      }
    } else {
      if (!currentHunk) {
        const leadingContext = contextBuffer.slice(-contextLines);
        currentHunk = {
          type: 'changed',
          originalStart: leadingContext.length > 0 ? leadingContext[0].origIdx : (change.origIdx >= 0 ? change.origIdx : 0),
          originalEnd: change.origIdx >= 0 ? change.origIdx + 1 : (leadingContext.length > 0 ? leadingContext[leadingContext.length - 1].origIdx + 1 : 0),
          modifiedStart: leadingContext.length > 0 ? leadingContext[0].modIdx : (change.modIdx >= 0 ? change.modIdx : 0),
          modifiedEnd: change.modIdx >= 0 ? change.modIdx + 1 : (leadingContext.length > 0 ? leadingContext[leadingContext.length - 1].modIdx + 1 : 0),
          originalLines: leadingContext.map(c => c.line),
          modifiedLines: leadingContext.map(c => c.line),
        };
        contextBuffer = [];
      }
      
      if (change.type === 'delete') {
        currentHunk.originalLines.push(change.line);
        currentHunk.originalEnd = change.origIdx + 1;
      } else {
        currentHunk.modifiedLines.push(change.line);
        currentHunk.modifiedEnd = change.modIdx + 1;
      }
    }
  }
  
  if (currentHunk) {
    hunks.push(currentHunk);
  }
  
  return hunks;
}

/**
 * Compute inline word-level diff for a line pair
 */
export function computeInlineDiff(oldLine: string, newLine: string): InlineDiff {
  const oldWords = oldLine.split(/(\s+)/);
  const newWords = newLine.split(/(\s+)/);
  const lcs = computeLCS(oldWords, newWords);
  
  const oldParts: InlineDiffPart[] = [];
  const newParts: InlineDiffPart[] = [];
  
  let oldIdx = 0, newIdx = 0, lcsIdx = 0;
  
  while (oldIdx < oldWords.length || newIdx < newWords.length) {
    if (lcsIdx < lcs.length && oldIdx < oldWords.length && oldWords[oldIdx] === lcs[lcsIdx]) {
      if (newIdx < newWords.length && newWords[newIdx] === lcs[lcsIdx]) {
        oldParts.push({ text: oldWords[oldIdx], changed: false });
        newParts.push({ text: newWords[newIdx], changed: false });
        oldIdx++;
        newIdx++;
        lcsIdx++;
      } else if (newIdx < newWords.length) {
        newParts.push({ text: newWords[newIdx], changed: true });
        newIdx++;
      }
    } else if (oldIdx < oldWords.length) {
      oldParts.push({ text: oldWords[oldIdx], changed: true });
      oldIdx++;
    } else if (newIdx < newWords.length) {
      newParts.push({ text: newWords[newIdx], changed: true });
      newIdx++;
    }
  }
  
  return { oldParts, newParts };
}
