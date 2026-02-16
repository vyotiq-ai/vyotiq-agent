/**
 * Diff Utilities
 *
 * Semantic diff algorithms for computing line-by-line and word-level diffs.
 * Supports LCS-based alignment, inline (word) diff highlighting,
 * context-aware hunk grouping, and streaming incremental updates.
 */

// =============================================================================
// Types
// =============================================================================

export interface InlineDiffPart {
  text: string;
  type: 'unchanged' | 'added' | 'removed';
}

export interface InlineDiffResult {
  oldParts: InlineDiffPart[];
  newParts: InlineDiffPart[];
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'expand';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
  inlineDiff?: InlineDiffResult;
  /** Number of hidden lines for expand markers */
  hiddenLines?: number;
  /** Unique index for expand markers (used by DiffViewer to track expanded state) */
  expandIndex?: number;
  /** Hidden context lines that this expand marker represents (populated for expansion) */
  hiddenLineData?: DiffLine[];
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: number;
  totalChanges: number;
}

export interface Hunk {
  /** 1-based start line in original file */
  oldStart: number;
  /** Number of lines from the original */
  oldCount: number;
  /** 1-based start line in modified file */
  newStart: number;
  /** Number of lines from the modified */
  newCount: number;
  /** Lines in this hunk */
  lines: DiffLine[];
  /** Original lines (for header rendering) */
  originalLines: DiffLine[];
}

// =============================================================================
// Longest Common Subsequence (LCS)
// =============================================================================

/**
 * Compute the Longest Common Subsequence of two string arrays.
 * Uses Hunt-Szymanski optimization for large inputs with few matches,
 * falling back to standard DP for small inputs.
 */
export function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  if (m === 0 || n === 0) return [];

  // For large inputs, use optimized path
  if (m > 500 && n > 500) {
    return computeLCSOptimized(a, b);
  }

  // Standard DP approach for smaller inputs
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the actual subsequence
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Optimized LCS for large inputs. Uses a hash-map approach
 * to reduce memory and time on sequences with many unique elements.
 */
function computeLCSOptimized(a: string[], b: string[]): string[] {
  // Build index of b values → positions
  const bIndex = new Map<string, number[]>();
  for (let j = b.length - 1; j >= 0; j--) {
    const existing = bIndex.get(b[j]);
    if (existing) {
      existing.push(j);
    } else {
      bIndex.set(b[j], [j]);
    }
  }

  // Patience-style merge with binary search
  const stacks: number[] = [];
  const backPointers: Array<{ bIdx: number; prev: number }> = [];

  for (let i = 0; i < a.length; i++) {
    const positions = bIndex.get(a[i]);
    if (!positions) continue;

    for (const bIdx of positions) {
      // Binary search for insertion point in stacks
      let lo = 0;
      let hi = stacks.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (stacks[mid] < bIdx) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }

      const prevStackIdx = lo > 0 ? findLastBackPointer(backPointers, stacks[lo - 1]) : -1;
      const entry = { bIdx, prev: prevStackIdx };
      backPointers.push(entry);

      stacks[lo] = bIdx;
    }
  }

  // Reconstruct LCS from backPointers
  if (stacks.length === 0) return [];

  const result: string[] = [];
  let idx = findLastBackPointer(backPointers, stacks[stacks.length - 1]);
  while (idx >= 0) {
    result.unshift(b[backPointers[idx].bIdx]);
    idx = backPointers[idx].prev;
  }

  return result;
}

function findLastBackPointer(backPointers: Array<{ bIdx: number; prev: number }>, targetBIdx: number): number {
  for (let i = backPointers.length - 1; i >= 0; i--) {
    if (backPointers[i].bIdx === targetBIdx) return i;
  }
  return -1;
}

// =============================================================================
// String Similarity
// =============================================================================

/**
 * Compute similarity ratio between two strings (0-1).
 * Uses a character-level LCS ratio, optimized for short strings.
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const maxLen = Math.max(a.length, b.length);

  // For very long strings, use a sampling approach
  if (maxLen > 500) {
    return stringSimilaritySampled(a, b);
  }

  // Character-level LCS length using optimized space DP
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  const lcsLen = prev[n];
  return (2 * lcsLen) / (a.length + b.length);
}

/**
 * Sampled similarity for long strings — checks prefix, middle, and suffix.
 */
function stringSimilaritySampled(a: string, b: string): number {
  const sampleSize = 100;
  const aChunks = [
    a.slice(0, sampleSize),
    a.slice(Math.max(0, Math.floor(a.length / 2) - sampleSize / 2), Math.floor(a.length / 2) + sampleSize / 2),
    a.slice(-sampleSize),
  ];
  const bChunks = [
    b.slice(0, sampleSize),
    b.slice(Math.max(0, Math.floor(b.length / 2) - sampleSize / 2), Math.floor(b.length / 2) + sampleSize / 2),
    b.slice(-sampleSize),
  ];

  let totalSim = 0;
  for (let i = 0; i < 3; i++) {
    totalSim += stringSimilarity(aChunks[i], bChunks[i]);
  }
  return totalSim / 3;
}

// =============================================================================
// Inline (word-level) Diff
// =============================================================================

/**
 * Tokenize a line into words, whitespace, and punctuation for fine-grained diff.
 */
function tokenize(line: string): string[] {
  if (!line) return [];
  // Split into words, whitespace runs, and individual punctuation
  const tokens: string[] = [];
  const regex = /(\s+|[^\s\w]|[\w]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/**
 * Compute word-level inline diff between two lines.
 * Returns separated old/new parts with change type annotations.
 */
export function computeInlineDiff(oldLine: string, newLine: string): InlineDiffResult {
  if (!oldLine && !newLine) {
    return { oldParts: [], newParts: [] };
  }
  if (oldLine === newLine) {
    const parts: InlineDiffPart[] = oldLine ? [{ text: oldLine, type: 'unchanged' }] : [];
    return { oldParts: parts, newParts: [...parts] };
  }
  if (!oldLine) {
    return { oldParts: [], newParts: [{ text: newLine, type: 'added' }] };
  }
  if (!newLine) {
    return { oldParts: [{ text: oldLine, type: 'removed' }], newParts: [] };
  }

  const oldTokens = tokenize(oldLine);
  const newTokens = tokenize(newLine);

  // Compute LCS of tokens
  const lcs = computeTokenLCS(oldTokens, newTokens);

  // Build old parts
  const oldParts: InlineDiffPart[] = [];
  let lcsIdx = 0;
  for (const token of oldTokens) {
    if (lcsIdx < lcs.length && token === lcs[lcsIdx]) {
      oldParts.push({ text: token, type: 'unchanged' });
      lcsIdx++;
    } else {
      oldParts.push({ text: token, type: 'removed' });
    }
  }

  // Build new parts
  const newParts: InlineDiffPart[] = [];
  lcsIdx = 0;
  for (const token of newTokens) {
    if (lcsIdx < lcs.length && token === lcs[lcsIdx]) {
      newParts.push({ text: token, type: 'unchanged' });
      lcsIdx++;
    } else {
      newParts.push({ text: token, type: 'added' });
    }
  }

  // Merge adjacent same-type parts for cleaner output
  return {
    oldParts: mergeAdjacentParts(oldParts),
    newParts: mergeAdjacentParts(newParts),
  };
}

/**
 * Token-level LCS using DP with backtracking.
 */
function computeTokenLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  if (m === 0 || n === 0) return [];

  // Full DP for backtracking
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Merge adjacent InlineDiffParts of the same type.
 */
function mergeAdjacentParts(parts: InlineDiffPart[]): InlineDiffPart[] {
  if (parts.length === 0) return parts;
  const result: InlineDiffPart[] = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const last = result[result.length - 1];
    if (last.type === parts[i].type) {
      last.text += parts[i].text;
    } else {
      result.push({ ...parts[i] });
    }
  }
  return result;
}

// =============================================================================
// Semantic Diff Lines
// =============================================================================

/**
 * Build a semantic line-by-line diff with context lines and expand markers.
 *
 * Uses LCS to align original and modified lines, then:
 * - Pairs removed/added lines with high similarity for inline diffs
 * - Wraps changes in context windows
 * - Collapses distant unchanged regions into expand markers
 *
 * @param original - Original file content
 * @param modified - Modified file content
 * @param contextLines - Number of context lines around each change (0 = changes only)
 */
export function buildSemanticDiffLines(
  original: string,
  modified: string,
  contextLines: number,
): DiffLine[] {
  if (original === modified) {
    // Identical content — return context lines only (if requested)
    if (contextLines > 0) {
      const lines = original.split('\n');
      return lines.map((line, i) => ({
        type: 'context' as const,
        content: line,
        oldLineNum: i + 1,
        newLineNum: i + 1,
      }));
    }
    return [];
  }

  const origLines = original ? original.split('\n') : [];
  const modLines = modified ? modified.split('\n') : [];

  // Handle empty originals/modifications
  if (origLines.length === 0 && modLines.length === 0) return [];

  // Compute LCS alignment
  const lcs = computeLCS(origLines, modLines);

  // Build raw diff entries with LCS alignment
  const rawDiff = buildRawDiff(origLines, modLines, lcs);

  // Pair similar removed/added lines for inline diff
  const paired = pairSimilarLines(rawDiff);

  // Apply context windowing
  if (contextLines === 0) {
    // No context — return only changed lines
    return paired.filter(l => l.type !== 'context');
  }

  return applyContextWindow(paired, contextLines);
}

/**
 * Raw diff entry before pairing.
 */
interface RawDiffEntry {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

/**
 * Build raw diff from LCS alignment.
 */
function buildRawDiff(origLines: string[], modLines: string[], lcs: string[]): RawDiffEntry[] {
  const entries: RawDiffEntry[] = [];
  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;

  while (origIdx < origLines.length || modIdx < modLines.length) {
    if (lcsIdx < lcs.length) {
      // Emit all removed lines before the next LCS match
      while (origIdx < origLines.length && origLines[origIdx] !== lcs[lcsIdx]) {
        entries.push({ type: 'removed', content: origLines[origIdx], oldLineNum: origIdx + 1 });
        origIdx++;
      }
      // Emit all added lines before the next LCS match
      while (modIdx < modLines.length && modLines[modIdx] !== lcs[lcsIdx]) {
        entries.push({ type: 'added', content: modLines[modIdx], newLineNum: modIdx + 1 });
        modIdx++;
      }
      // Emit the LCS match as context
      if (origIdx < origLines.length && modIdx < modLines.length) {
        entries.push({
          type: 'context',
          content: origLines[origIdx],
          oldLineNum: origIdx + 1,
          newLineNum: modIdx + 1,
        });
        origIdx++;
        modIdx++;
        lcsIdx++;
      }
    } else {
      // No more LCS — remaining lines are changes
      while (origIdx < origLines.length) {
        entries.push({ type: 'removed', content: origLines[origIdx], oldLineNum: origIdx + 1 });
        origIdx++;
      }
      while (modIdx < modLines.length) {
        entries.push({ type: 'added', content: modLines[modIdx], newLineNum: modIdx + 1 });
        modIdx++;
      }
    }
  }

  return entries;
}

/**
 * Pair adjacent removed + added lines that are similar enough for inline diff.
 * Similarity threshold: 0.4 (40%).
 */
function pairSimilarLines(entries: RawDiffEntry[]): DiffLine[] {
  const result: DiffLine[] = [];
  const SIMILARITY_THRESHOLD = 0.4;

  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];

    // Look for adjacent removed → added blocks to pair
    if (entry.type === 'removed') {
      // Collect consecutive removed lines
      const removedBlock: RawDiffEntry[] = [];
      while (i < entries.length && entries[i].type === 'removed') {
        removedBlock.push(entries[i]);
        i++;
      }

      // Collect consecutive added lines
      const addedBlock: RawDiffEntry[] = [];
      while (i < entries.length && entries[i].type === 'added') {
        addedBlock.push(entries[i]);
        i++;
      }

      // Try to pair removed with added by similarity
      const pairedRemoved = new Set<number>();
      const pairedAdded = new Set<number>();
      const pairs: Array<[number, number]> = [];

      // For each removed line, find best matching added line
      for (let r = 0; r < removedBlock.length; r++) {
        let bestMatch = -1;
        let bestSim = SIMILARITY_THRESHOLD;
        for (let a = 0; a < addedBlock.length; a++) {
          if (pairedAdded.has(a)) continue;
          const sim = stringSimilarity(removedBlock[r].content, addedBlock[a].content);
          if (sim > bestSim) {
            bestSim = sim;
            bestMatch = a;
          }
        }
        if (bestMatch >= 0) {
          pairs.push([r, bestMatch]);
          pairedRemoved.add(r);
          pairedAdded.add(bestMatch);
        }
      }

      // Emit unpaired removed, paired removed+added, and unpaired added
      // Maintain the original order: removed first, then added
      for (let r = 0; r < removedBlock.length; r++) {
        const pair = pairs.find(p => p[0] === r);
        if (pair) {
          const inlineDiff = computeInlineDiff(removedBlock[r].content, addedBlock[pair[1]].content);
          result.push({
            type: 'removed',
            content: removedBlock[r].content,
            oldLineNum: removedBlock[r].oldLineNum,
            inlineDiff,
          });
          result.push({
            type: 'added',
            content: addedBlock[pair[1]].content,
            newLineNum: addedBlock[pair[1]].newLineNum,
            inlineDiff,
          });
        } else {
          result.push({
            type: 'removed',
            content: removedBlock[r].content,
            oldLineNum: removedBlock[r].oldLineNum,
          });
        }
      }

      // Emit unpaired added lines
      for (let a = 0; a < addedBlock.length; a++) {
        if (!pairedAdded.has(a)) {
          result.push({
            type: 'added',
            content: addedBlock[a].content,
            newLineNum: addedBlock[a].newLineNum,
          });
        }
      }

      continue;
    }

    // Context or added lines pass through
    result.push({
      type: entry.type,
      content: entry.content,
      oldLineNum: entry.oldLineNum,
      newLineNum: entry.newLineNum,
    });
    i++;
  }

  return result;
}

/**
 * Apply context windowing — keep N lines around changes, collapse the rest.
 */
function applyContextWindow(lines: DiffLine[], contextLines: number): DiffLine[] {
  // Mark which indices are within context range of a change
  const isChange = lines.map(l => l.type === 'added' || l.type === 'removed');
  const inContext = new Array(lines.length).fill(false);

  for (let i = 0; i < lines.length; i++) {
    if (isChange[i]) {
      // Mark context around this change
      for (let j = Math.max(0, i - contextLines); j <= Math.min(lines.length - 1, i + contextLines); j++) {
        inContext[j] = true;
      }
    }
  }

  const result: DiffLine[] = [];
  let lastIncluded = -1;
  let expandIdx = 0;

  // Leading expand marker: check if the first context-visible line is not at index 0
  const firstContextIdx = lines.findIndex((_, idx) => inContext[idx]);
  if (firstContextIdx > 0) {
    const hiddenLines = lines.slice(0, firstContextIdx);
    result.push({
      type: 'expand',
      content: `@@ ${firstContextIdx} lines hidden @@`,
      hiddenLines: firstContextIdx,
      expandIndex: expandIdx++,
      hiddenLineData: hiddenLines,
    });
    lastIncluded = firstContextIdx - 1;
  }

  for (let i = 0; i < lines.length; i++) {
    if (inContext[i]) {
      // If there's a gap since last included, insert expand marker
      if (lastIncluded >= 0 && i - lastIncluded > 1) {
        const hiddenCount = i - lastIncluded - 1;
        if (hiddenCount > 0) {
          const hiddenLines = lines.slice(lastIncluded + 1, i);
          result.push({
            type: 'expand',
            content: `@@ ${hiddenCount} lines hidden @@`,
            hiddenLines: hiddenCount,
            expandIndex: expandIdx++,
            hiddenLineData: hiddenLines,
          });
        }
      }
      result.push(lines[i]);
      lastIncluded = i;
    }
  }

  // Trailing expand marker
  if (lastIncluded >= 0 && lastIncluded < lines.length - 1) {
    const hidden = lines.length - lastIncluded - 1;
    if (hidden > 0) {
      const hiddenLines = lines.slice(lastIncluded + 1);
      result.push({
        type: 'expand',
        content: `@@ ${hidden} lines hidden @@`,
        hiddenLines: hidden,
        expandIndex: expandIdx++,
        hiddenLineData: hiddenLines,
      });
    }
  }

  return result;
}

// =============================================================================
// Diff Statistics
// =============================================================================

/**
 * Compute diff statistics between original and modified content.
 */
export function computeDiffStats(original: string, modified: string): DiffStats {
  if (original === modified) {
    return { added: 0, removed: 0, changed: 0, totalChanges: 0 };
  }

  const origLines = original ? original.split('\n') : [];
  const modLines = modified ? modified.split('\n') : [];

  if (origLines.length === 0 && modLines.length === 0) {
    return { added: 0, removed: 0, changed: 0, totalChanges: 0 };
  }

  const lcs = computeLCS(origLines, modLines);

  // Build raw diff to count
  const rawDiff = buildRawDiff(origLines, modLines, lcs);
  const paired = pairSimilarLines(rawDiff);

  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const line of paired) {
    if (line.type === 'added') {
      added++;
    } else if (line.type === 'removed') {
      removed++;
    }
  }

  // Paired lines (those with inlineDiff) count as "changed"
  const pairedRemovedCount = paired.filter(l => l.type === 'removed' && l.inlineDiff).length;
  changed = pairedRemovedCount;

  return {
    added,
    removed,
    changed,
    totalChanges: added + removed,
  };
}

// =============================================================================
// Diff Hunks
// =============================================================================

/**
 * Compute diff hunks — grouped changes with surrounding context.
 * Each hunk is a self-contained unit showing one cluster of changes.
 *
 * @param original - Original file content
 * @param modified - Modified file content
 * @param context - Number of context lines around each change
 */
export function computeDiffHunks(
  original: string,
  modified: string,
  context: number,
): Hunk[] {
  if (original === modified || (!original && !modified)) {
    return [];
  }

  const origLines = original ? original.split('\n') : [];
  const modLines = modified ? modified.split('\n') : [];

  const lcs = computeLCS(origLines, modLines);
  const rawDiff = buildRawDiff(origLines, modLines, lcs);
  const paired = pairSimilarLines(rawDiff);

  // Re-insert all context lines for hunk extraction
  const fullLines: DiffLine[] = paired;

  // Find change indices
  const changeIndices: number[] = [];
  for (let i = 0; i < fullLines.length; i++) {
    if (fullLines[i].type === 'added' || fullLines[i].type === 'removed') {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) return [];

  // Group nearby changes into hunks
  const hunkGroups: Array<{ start: number; end: number }> = [];
  let currentGroup = {
    start: Math.max(0, changeIndices[0] - context),
    end: Math.min(fullLines.length - 1, changeIndices[0] + context),
  };

  for (let k = 1; k < changeIndices.length; k++) {
    const expandedStart = Math.max(0, changeIndices[k] - context);
    const expandedEnd = Math.min(fullLines.length - 1, changeIndices[k] + context);

    if (expandedStart <= currentGroup.end + 1) {
      // Merge into current group
      currentGroup.end = expandedEnd;
    } else {
      hunkGroups.push({ ...currentGroup });
      currentGroup = { start: expandedStart, end: expandedEnd };
    }
  }
  hunkGroups.push(currentGroup);

  // Build hunk objects
  return hunkGroups.map(group => {
    const hunkLines = fullLines.slice(group.start, group.end + 1);
    const firstOldLine = hunkLines.find(l => l.oldLineNum !== undefined)?.oldLineNum ?? 1;
    const firstNewLine = hunkLines.find(l => l.newLineNum !== undefined)?.newLineNum ?? 1;
    const oldCount = hunkLines.filter(l => l.type === 'removed' || l.type === 'context').length;
    const newCount = hunkLines.filter(l => l.type === 'added' || l.type === 'context').length;

    return {
      oldStart: firstOldLine,
      oldCount,
      newStart: firstNewLine,
      newCount,
      lines: hunkLines,
      originalLines: [...hunkLines],
    };
  });
}

// =============================================================================
// Streaming Diff Support
// =============================================================================

export interface StreamingDiffState {
  /** Currently known original content */
  originalContent: string;
  /** Accumulated modified content so far */
  partialContent: string;
  /** Lines already diffed and emitted */
  emittedLines: DiffLine[];
  /** Index of last processed modified line */
  lastProcessedLine: number;
  /** Whether the stream is complete */
  isComplete: boolean;
}

/**
 * Create a new streaming diff state.
 */
export function createStreamingDiffState(originalContent: string): StreamingDiffState {
  return {
    originalContent,
    partialContent: '',
    emittedLines: [],
    lastProcessedLine: 0,
    isComplete: false,
  };
}

/**
 * Update streaming diff state with new partial content.
 * Returns newly computed diff lines since last update.
 */
export function updateStreamingDiff(
  state: StreamingDiffState,
  newContent: string,
  isComplete: boolean,
): { newLines: DiffLine[]; state: StreamingDiffState } {
  const updatedState: StreamingDiffState = {
    ...state,
    partialContent: newContent,
    isComplete,
  };

  const modLines = newContent.split('\n');
  const origLines = state.originalContent.split('\n');

  // Only process lines that are newly complete (not the last partial line unless complete)
  const processUpTo = isComplete ? modLines.length : Math.max(0, modLines.length - 1);

  if (processUpTo <= state.lastProcessedLine) {
    return { newLines: [], state: updatedState };
  }

  // Compute diff for the new lines range
  const origSlice = origLines.slice(0, processUpTo);
  const modSlice = modLines.slice(0, processUpTo);

  const fullDiff = buildSemanticDiffLines(
    origSlice.join('\n'),
    modSlice.join('\n'),
    0,
  );

  // Extract only new lines we haven't emitted yet
  const newLines = fullDiff.slice(state.emittedLines.length);

  updatedState.emittedLines = fullDiff;
  updatedState.lastProcessedLine = processUpTo;

  return { newLines, state: updatedState };
}
