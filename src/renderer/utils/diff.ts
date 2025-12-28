/**
 * Diff Utilities
 * 
 * Shared utilities for computing and displaying file diffs.
 * Used by both the undo history and inline tool result previews.
 */

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  lineNumber?: { old?: number; new?: number };
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

interface LCSMatch {
  oldIndex: number;
  newIndex: number;
}

/**
 * Compute Longest Common Subsequence matches between two arrays of lines
 */
function computeLCS(oldLines: string[], newLines: string[]): LCSMatch[] {
  const m = oldLines.length;
  const n = newLines.length;
  
  // Build LCS table
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matches
  const matches: LCSMatch[] = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matches.unshift({ oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

/**
 * Compute line-by-line differences between two strings
 */
export function computeDiff(oldContent: string | null | undefined, newContent: string | null | undefined): DiffLine[] {
  const oldLines = oldContent?.split('\n') || [];
  const newLines = newContent?.split('\n') || [];
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const lcs = computeLCS(oldLines, newLines);
  
  let oldIdx = 0;
  let newIdx = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const match of lcs) {
    // Add removed lines
    while (oldIdx < match.oldIndex) {
      result.push({
        type: 'removed',
        content: oldLines[oldIdx],
        lineNumber: { old: oldLineNum++ },
      });
      oldIdx++;
    }
    
    // Add added lines
    while (newIdx < match.newIndex) {
      result.push({
        type: 'added',
        content: newLines[newIdx],
        lineNumber: { new: newLineNum++ },
      });
      newIdx++;
    }
    
    // Add unchanged line
    result.push({
      type: 'unchanged',
      content: oldLines[oldIdx],
      lineNumber: { old: oldLineNum++, new: newLineNum++ },
    });
    oldIdx++;
    newIdx++;
  }

  // Add remaining removed lines
  while (oldIdx < oldLines.length) {
    result.push({
      type: 'removed',
      content: oldLines[oldIdx],
      lineNumber: { old: oldLineNum++ },
    });
    oldIdx++;
  }

  // Add remaining added lines
  while (newIdx < newLines.length) {
    result.push({
      type: 'added',
      content: newLines[newIdx],
      lineNumber: { new: newLineNum++ },
    });
    newIdx++;
  }

  return result;
}

/**
 * Compute diff statistics from diff lines
 */
export function computeDiffStats(diffLines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  
  for (const line of diffLines) {
    if (line.type === 'added') added++;
    else if (line.type === 'removed') removed++;
    else if (line.type === 'unchanged') unchanged++;
  }
  
  return { added, removed, unchanged };
}

/**
 * Create a compact diff summary suitable for display
 */
export function formatDiffSummary(stats: DiffStats): string {
  const parts: string[] = [];
  if (stats.added > 0) parts.push(`+${stats.added}`);
  if (stats.removed > 0) parts.push(`-${stats.removed}`);
  return parts.join(' ');
}

/**
 * Filter diff lines to show only context around changes
 * @param lines All diff lines
 * @param contextLines Number of unchanged lines to show around changes
 */
export function filterDiffWithContext(lines: DiffLine[], contextLines = 3): DiffLine[] {
  if (lines.length === 0) return [];
  
  const result: DiffLine[] = [];
  const changedIndices = new Set<number>();
  
  // Mark indices that need to be shown (changed lines + context)
  lines.forEach((line, idx) => {
    if (line.type === 'added' || line.type === 'removed') {
      for (let i = Math.max(0, idx - contextLines); i <= Math.min(lines.length - 1, idx + contextLines); i++) {
        changedIndices.add(i);
      }
    }
  });
  
  // Build result with ellipsis markers for gaps
  let lastShownIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (changedIndices.has(i)) {
      // Add ellipsis if there's a gap
      if (lastShownIndex >= 0 && i - lastShownIndex > 1) {
        result.push({ type: 'header', content: `... ${i - lastShownIndex - 1} unchanged lines ...` });
      }
      result.push(lines[i]);
      lastShownIndex = i;
    }
  }
  
  return result;
}

/**
 * Get file extension from path
 */
export function getFileExtension(filePath: string): string {
  const parts = filePath.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Get file name from path
 */
export function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}
