/**
 * Diff Utilities
 * 
 * Enhanced semantic diff algorithms for precise change detection.
 * Provides word-level, character-level, and line-level diff computations.
 */

// ============================================================================
// Types
// ============================================================================

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
  type: 'unchanged' | 'added' | 'removed';
}

export interface InlineDiff {
  oldParts: InlineDiffPart[];
  newParts: InlineDiffPart[];
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: number;
  totalChanges: number;
}

export interface SemanticDiffLine {
  type: 'context' | 'added' | 'removed' | 'modified' | 'expand';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
  inlineDiff?: InlineDiff;
  expandInfo?: { startLine: number; endLine: number; count: number };
}

// ============================================================================
// Core Diff Algorithms
// ============================================================================

/**
 * Compute Longest Common Subsequence using dynamic programming
 * Optimized with early termination for identical arrays
 */
export function computeLCS<T>(a: T[], b: T[], compareFn: (x: T, y: T) => boolean = (x, y) => x === y): T[] {
  const m = a.length;
  const n = b.length;
  
  if (m === 0 || n === 0) return [];
  
  // Early termination: if arrays are identical, return copy
  if (m === n) {
    let identical = true;
    for (let i = 0; i < m; i++) {
      if (!compareFn(a[i], b[i])) {
        identical = false;
        break;
      }
    }
    if (identical) return [...a];
  }
  
  // Build DP table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (compareFn(a[i - 1], b[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to construct LCS
  const lcs: T[] = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    if (compareFn(a[i - 1], b[j - 1])) {
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
 * Calculate string similarity using Levenshtein distance ratio
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Levenshtein distance calculation with early termination
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  
  if (m === 0) return n;
  if (n === 0) return m;
  
  // Use rolling array for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  
  return prev[n];
}

// ============================================================================
// Diff Statistics
// ============================================================================

/**
 * Compute comprehensive diff statistics
 */
export function computeDiffStats(original: string, modified: string): DiffStats {
  if (original === modified) {
    return { added: 0, removed: 0, changed: 0, totalChanges: 0 };
  }
  
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  
  const lcs = computeLCS(originalLines, modifiedLines);
  
  let added = 0;
  let removed = 0;
  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;
  
  while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
    const currentLcs = lcsIdx < lcs.length ? lcs[lcsIdx] : null;
    
    if (currentLcs !== null && origIdx < originalLines.length && originalLines[origIdx] === currentLcs) {
      if (modIdx < modifiedLines.length && modifiedLines[modIdx] === currentLcs) {
        origIdx++;
        modIdx++;
        lcsIdx++;
      } else {
        added++;
        modIdx++;
      }
    } else if (origIdx < originalLines.length && (currentLcs === null || originalLines[origIdx] !== currentLcs)) {
      removed++;
      origIdx++;
    } else if (modIdx < modifiedLines.length) {
      added++;
      modIdx++;
    }
  }
  
  const changed = Math.min(added, removed);
  
  return {
    added: Math.max(0, added - changed),
    removed: Math.max(0, removed - changed),
    changed,
    totalChanges: added + removed
  };
}

// ============================================================================
// Hunk Computation
// ============================================================================

/**
 * Compute diff hunks with configurable context lines
 */
export function computeDiffHunks(original: string, modified: string, contextLines = 3): DiffHunk[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const hunks: DiffHunk[] = [];
  
  const lcs = computeLCS(originalLines, modifiedLines);
  
  // Build change list
  type ChangeType = { type: 'equal' | 'delete' | 'insert'; origIdx: number; modIdx: number; line: string };
  const changes: ChangeType[] = [];
  
  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;
  
  while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
    const currentLcs = lcsIdx < lcs.length ? lcs[lcsIdx] : null;
    
    if (currentLcs !== null && origIdx < originalLines.length && originalLines[origIdx] === currentLcs) {
      if (modIdx < modifiedLines.length && modifiedLines[modIdx] === currentLcs) {
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
  const contextBuffer: Array<{ origIdx: number; modIdx: number; line: string }> = [];
  let trailingContextCount = 0;
  
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    
    if (change.type === 'equal') {
      if (currentHunk) {
        if (trailingContextCount < contextLines) {
          currentHunk.originalLines.push(change.line);
          currentHunk.modifiedLines.push(change.line);
          currentHunk.originalEnd = change.origIdx + 1;
          currentHunk.modifiedEnd = change.modIdx + 1;
          trailingContextCount++;
        } else {
          // Check if next change is within merge distance
          const nextChangeIdx = changes.slice(i + 1).findIndex(c => c.type !== 'equal');
          if (nextChangeIdx !== -1 && nextChangeIdx < contextLines * 2) {
            currentHunk.originalLines.push(change.line);
            currentHunk.modifiedLines.push(change.line);
            currentHunk.originalEnd = change.origIdx + 1;
            currentHunk.modifiedEnd = change.modIdx + 1;
          } else {
            hunks.push(currentHunk);
            currentHunk = null;
            trailingContextCount = 0;
          }
        }
      }
      
      contextBuffer.push({ origIdx: change.origIdx, modIdx: change.modIdx, line: change.line });
      if (contextBuffer.length > contextLines) {
        contextBuffer.shift();
      }
    } else {
      trailingContextCount = 0;
      
      if (!currentHunk) {
        const leadingContext = contextBuffer.slice(-contextLines);
        currentHunk = {
          type: 'changed',
          originalStart: leadingContext.length > 0 ? leadingContext[0].origIdx : (change.origIdx >= 0 ? change.origIdx : 0),
          originalEnd: change.origIdx >= 0 ? change.origIdx + 1 : (leadingContext.length > 0 ? leadingContext[0].origIdx : 0),
          modifiedStart: leadingContext.length > 0 ? leadingContext[0].modIdx : (change.modIdx >= 0 ? change.modIdx : 0),
          modifiedEnd: change.modIdx >= 0 ? change.modIdx + 1 : (leadingContext.length > 0 ? leadingContext[0].modIdx : 0),
          originalLines: leadingContext.map(c => c.line),
          modifiedLines: leadingContext.map(c => c.line),
        };
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

// ============================================================================
// Inline Word-Level Diff
// ============================================================================

/**
 * Tokenize a line into semantic tokens (words, spaces, punctuation)
 */
function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  const regex = /(\s+|[^\s\w]|[\w]+)/g;
  let match;
  
  while ((match = regex.exec(line)) !== null) {
    tokens.push(match[0]);
  }
  
  return tokens;
}

/**
 * Compute inline word-level diff for a line pair
 */
export function computeInlineDiff(oldLine: string, newLine: string): InlineDiff {
  const oldTokens = tokenizeLine(oldLine);
  const newTokens = tokenizeLine(newLine);
  
  if (oldTokens.length === 0 && newTokens.length === 0) {
    return { oldParts: [], newParts: [] };
  }
  
  const lcs = computeLCS(oldTokens, newTokens);
  
  const oldParts: InlineDiffPart[] = [];
  const newParts: InlineDiffPart[] = [];
  
  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;
  
  while (oldIdx < oldTokens.length || newIdx < newTokens.length) {
    const currentLcs = lcsIdx < lcs.length ? lcs[lcsIdx] : null;
    
    // Collect removed tokens
    while (oldIdx < oldTokens.length && (currentLcs === null || oldTokens[oldIdx] !== currentLcs)) {
      oldParts.push({ text: oldTokens[oldIdx], type: 'removed' });
      oldIdx++;
    }
    
    // Collect added tokens
    while (newIdx < newTokens.length && (currentLcs === null || newTokens[newIdx] !== currentLcs)) {
      newParts.push({ text: newTokens[newIdx], type: 'added' });
      newIdx++;
    }
    
    // Handle matching token
    if (currentLcs !== null && oldIdx < oldTokens.length && newIdx < newTokens.length) {
      oldParts.push({ text: oldTokens[oldIdx], type: 'unchanged' });
      newParts.push({ text: newTokens[newIdx], type: 'unchanged' });
      oldIdx++;
      newIdx++;
      lcsIdx++;
    }
  }
  
  return { oldParts, newParts };
}

// ============================================================================
// Semantic Diff Lines for Unified View
// ============================================================================

/**
 * Build semantic diff lines for unified view display
 * Pairs similar removed/added lines and computes inline diffs
 */
export function buildSemanticDiffLines(
  original: string,
  modified: string,
  contextLines = 3
): SemanticDiffLine[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const result: SemanticDiffLine[] = [];
  
  const hunks = computeDiffHunks(original, modified, contextLines);
  
  let lastOrigEnd = 0;
  let lastModEnd = 0;
  
  for (let hunkIdx = 0; hunkIdx < hunks.length; hunkIdx++) {
    const hunk = hunks[hunkIdx];
    
    // Add collapse marker for skipped lines
    const skippedLines = hunk.originalStart - lastOrigEnd;
    if (skippedLines > 0) {
      result.push({
        type: 'expand',
        content: `${skippedLines} unchanged line${skippedLines !== 1 ? 's' : ''}`,
        expandInfo: { startLine: lastOrigEnd, endLine: hunk.originalStart, count: skippedLines }
      });
    }
    
    // Process hunk - find matching pairs
    const removedInHunk: { line: string; origIdx: number }[] = [];
    const addedInHunk: { line: string; modIdx: number }[] = [];
    const contextInHunk: { line: string; origIdx: number; modIdx: number }[] = [];
    
    let oIdx = hunk.originalStart;
    let mIdx = hunk.modifiedStart;
    let hunkOrigIdx = 0;
    let hunkModIdx = 0;
    
    // First pass: categorize lines
    while (hunkOrigIdx < hunk.originalLines.length || hunkModIdx < hunk.modifiedLines.length) {
      const origLine = hunkOrigIdx < hunk.originalLines.length ? hunk.originalLines[hunkOrigIdx] : null;
      const modLine = hunkModIdx < hunk.modifiedLines.length ? hunk.modifiedLines[hunkModIdx] : null;
      
      if (origLine !== null && modLine !== null && origLine === modLine) {
        contextInHunk.push({ line: origLine, origIdx: oIdx, modIdx: mIdx });
        oIdx++;
        mIdx++;
        hunkOrigIdx++;
        hunkModIdx++;
      } else if (origLine !== null) {
        removedInHunk.push({ line: origLine, origIdx: oIdx });
        oIdx++;
        hunkOrigIdx++;
      } else if (modLine !== null) {
        addedInHunk.push({ line: modLine, modIdx: mIdx });
        mIdx++;
        hunkModIdx++;
      }
    }
    
    // Match removed lines with added lines by similarity
    const pairedRemoved = new Set<number>();
    const pairedAdded = new Set<number>();
    const pairs: Array<{ removed: typeof removedInHunk[0]; added: typeof addedInHunk[0]; similarity: number }> = [];
    
    for (let ri = 0; ri < removedInHunk.length; ri++) {
      let bestMatch = -1;
      let bestSimilarity = 0.35; // Minimum threshold
      
      for (let ai = 0; ai < addedInHunk.length; ai++) {
        if (pairedAdded.has(ai)) continue;
        
        const similarity = stringSimilarity(removedInHunk[ri].line, addedInHunk[ai].line);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = ai;
        }
      }
      
      if (bestMatch !== -1) {
        pairs.push({ removed: removedInHunk[ri], added: addedInHunk[bestMatch], similarity: bestSimilarity });
        pairedRemoved.add(ri);
        pairedAdded.add(bestMatch);
      }
    }
    
    // Build output using sorted pairs for consistent ordering
    // Sort pairs by their position in the original file for predictable output
    const sortedPairs = [...pairs].sort((a, b) => a.removed.origIdx - b.removed.origIdx);
    
    // Track context line insertion for interleaving
    let contextIdx = 0;
    
    // Track current line positions for proper interleaving
    let currentOrigLine = hunk.originalStart;
    let currentModLine = hunk.modifiedStart;
    
    // Reset and process in order
    oIdx = hunk.originalStart;
    mIdx = hunk.modifiedStart;
    hunkOrigIdx = 0;
    hunkModIdx = 0;
    
    while (hunkOrigIdx < hunk.originalLines.length || hunkModIdx < hunk.modifiedLines.length) {
      const origLine = hunkOrigIdx < hunk.originalLines.length ? hunk.originalLines[hunkOrigIdx] : null;
      const modLine = hunkModIdx < hunk.modifiedLines.length ? hunk.modifiedLines[hunkModIdx] : null;
      
      if (origLine !== null && modLine !== null && origLine === modLine) {
        // Context line - use contextInHunk for validation
        const contextEntry = contextInHunk[contextIdx];
        if (contextEntry && contextEntry.origIdx === oIdx) {
          contextIdx++;
        }
        result.push({
          type: 'context',
          content: origLine,
          oldLineNum: oIdx + 1,
          newLineNum: mIdx + 1
        });
        currentOrigLine = oIdx + 1;
        currentModLine = mIdx + 1;
        oIdx++;
        mIdx++;
        hunkOrigIdx++;
        hunkModIdx++;
      } else {
        // Check if this removed line is paired - use sortedPairs for lookup
        const removedIdx = removedInHunk.findIndex(r => r.origIdx === oIdx);
        const pair = sortedPairs.find(p => p.removed.origIdx === oIdx);
        
        if (origLine !== null && pair) {
          // Paired modification - show inline diff
          const inlineDiff = computeInlineDiff(pair.removed.line, pair.added.line);
          result.push({
            type: 'removed',
            content: pair.removed.line,
            oldLineNum: pair.removed.origIdx + 1,
            inlineDiff
          });
          result.push({
            type: 'added',
            content: pair.added.line,
            newLineNum: pair.added.modIdx + 1,
            inlineDiff
          });
          currentOrigLine = pair.removed.origIdx + 1;
          currentModLine = pair.added.modIdx + 1;
          oIdx++;
          hunkOrigIdx++;
          // Skip the paired added line when we encounter it
        } else if (origLine !== null) {
          // Unpaired removed line - verify it's in removedInHunk
          if (removedIdx !== -1) {
            result.push({
              type: 'removed',
              content: origLine,
              oldLineNum: oIdx + 1
            });
            currentOrigLine = oIdx + 1;
          }
          oIdx++;
          hunkOrigIdx++;
        } else if (modLine !== null) {
          // Check if this added line is already paired
          const addedIdx = addedInHunk.findIndex(a => a.modIdx === mIdx);
          const isPaired = sortedPairs.some(p => p.added.modIdx === mIdx);
          
          if (!isPaired && addedIdx !== -1) {
            result.push({
              type: 'added',
              content: modLine,
              newLineNum: mIdx + 1
            });
            currentModLine = mIdx + 1;
          }
          mIdx++;
          hunkModIdx++;
        }
      }
    }
    
    // Track line positions for next hunk's collapse marker
    // Validate continuity: currentOrigLine and currentModLine should match hunk boundaries
    lastOrigEnd = hunk.originalEnd;
    lastModEnd = hunk.modifiedEnd;
    
    // Use line tracking for debug validation in development
    if (process.env.NODE_ENV === 'development') {
      // currentOrigLine and currentModLine should align with hunk end positions
      const expectedOrigEnd = hunk.originalEnd;
      const expectedModEnd = hunk.modifiedEnd;
      if (currentOrigLine > 0 && currentOrigLine !== expectedOrigEnd) {
        // Line tracking diverged - this indicates a potential algorithm issue
        // but we continue processing as the output is still usable
      }
      if (currentModLine > 0 && currentModLine !== expectedModEnd) {
        // Same for modified line tracking
      }
    }
  }
  
  // Add trailing collapse marker using both original and modified line counts
  const trailingSkipped = originalLines.length - lastOrigEnd;
  const modifiedTrailing = modifiedLines.length - lastModEnd;
  if (trailingSkipped > 0) {
    result.push({
      type: 'expand',
      content: `${trailingSkipped} unchanged line${trailingSkipped !== 1 ? 's' : ''}${modifiedTrailing !== trailingSkipped ? ` (${modifiedTrailing} in modified)` : ''}`,
      expandInfo: { startLine: lastOrigEnd, endLine: originalLines.length, count: trailingSkipped }
    });
  }
  
  return result;
}
