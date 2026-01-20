/**
 * Edit File Tool
 * 
 * Performs exact string replacements in files.
 * Uses a find-and-replace approach with unique string matching.
 */
import { promises as fs } from 'node:fs';
import { resolvePath } from '../../utils/fileSystem';
import { wasFileRead, getReadFilesCache } from '../fileTracker';
import { undoHistory } from '../../agent/undoHistory';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

interface EditFileArgs extends Record<string, unknown> {
  /** The absolute path to the file to modify */
  file_path: string;
  /** The text to replace (must be exact match) */
  old_string: string;
  /** The text to replace it with (must be different from old_string) */
  new_string: string;
  /** Replace all occurrences of old_string (default: false) */
  replace_all?: boolean;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate simple similarity score between two strings (0-1)
 * Uses character-level comparison for efficiency
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1.length || !str2.length) return 0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  // Count matching characters at same positions
  let matches = 0;
  const minLen = shorter.length;
  for (let i = 0; i < minLen; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  
  return matches / longer.length;
}

/**
 * Normalize line endings to LF
 */
function normalizeLineEndings(str: string): string {
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Try to find a match with normalized line endings
 * Returns the original content position if found
 */
function findWithNormalizedLineEndings(
  content: string,
  searchStr: string
): { found: boolean; normalizedContent: string; normalizedSearch: string } {
  const normalizedContent = normalizeLineEndings(content);
  const normalizedSearch = normalizeLineEndings(searchStr);
  
  return {
    found: normalizedContent.includes(normalizedSearch),
    normalizedContent,
    normalizedSearch,
  };
}

/**
 * Find the best matching substring in content for a given search string
 * Returns the match with highest similarity and its location
 */
function findBestMatch(
  content: string,
  searchStr: string,
  threshold = 0.7
): { match: string; index: number; similarity: number; lineNum: number } | null {
  const searchLines = searchStr.split('\n');
  const contentLines = content.split('\n');
  const searchLineCount = searchLines.length;
  
  let bestMatch: { match: string; index: number; similarity: number; lineNum: number } | null = null;
  
  // Slide through content looking for best match
  for (let i = 0; i <= contentLines.length - searchLineCount; i++) {
    const candidateLines = contentLines.slice(i, i + searchLineCount);
    const candidate = candidateLines.join('\n');
    const similarity = calculateSimilarity(searchStr, candidate);
    
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      // Calculate character index
      const index = contentLines.slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      bestMatch = { match: candidate, index, similarity, lineNum: i + 1 };
    }
  }
  
  return bestMatch;
}

/**
 * Identify specific differences between two strings
 * Returns a diagnostic message about what's different
 */
function identifyDifferences(expected: string, actual: string): string {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const diffs: string[] = [];
  
  // Check line count difference
  if (expectedLines.length !== actualLines.length) {
    diffs.push(`Line count: expected ${expectedLines.length}, found ${actualLines.length}`);
  }
  
  // Find first differing line
  const minLines = Math.min(expectedLines.length, actualLines.length);
  for (let i = 0; i < minLines; i++) {
    const exp = expectedLines[i];
    const act = actualLines[i];
    if (exp !== act) {
      // Check for whitespace differences
      if (exp.trim() === act.trim()) {
        const expIndent = exp.match(/^\s*/)?.[0] || '';
        const actIndent = act.match(/^\s*/)?.[0] || '';
        if (expIndent !== actIndent) {
          diffs.push(`Line ${i + 1}: indentation differs (expected ${expIndent.length} chars, found ${actIndent.length})`);
        }
        const expTrailing = exp.length - exp.trimEnd().length;
        const actTrailing = act.length - act.trimEnd().length;
        if (expTrailing !== actTrailing) {
          diffs.push(`Line ${i + 1}: trailing whitespace differs`);
        }
      } else {
        // Content differs
        const preview = act.length > 50 ? act.substring(0, 50) + '...' : act;
        diffs.push(`Line ${i + 1} differs: "${preview}"`);
      }
      break; // Report only first difference
    }
  }
  
  // Check for line ending issues
  if (expected.includes('\r\n') !== actual.includes('\r\n')) {
    diffs.push('Line endings differ (CRLF vs LF)');
  }
  
  return diffs.length > 0 ? diffs.join('\n') : 'Unknown difference';
}

/**
 * Normalize a string for comparison (collapse whitespace)
 */
function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Check if the string might have been modified by common transformations
 */
function detectCommonIssues(searchStr: string, content: string): string[] {
  const issues: string[] = [];
  
  // Check for CRLF/LF mismatch
  if (searchStr.includes('\r\n') && !content.includes('\r\n')) {
    issues.push('old_string uses Windows line endings (CRLF), but file uses Unix (LF)');
  } else if (!searchStr.includes('\r\n') && content.includes('\r\n')) {
    issues.push('old_string uses Unix line endings (LF), but file uses Windows (CRLF)');
  }
  
  // Check for tab/space mismatch
  const searchHasTabs = searchStr.includes('\t');
  const searchHasSpaces = /^  +/m.test(searchStr);
  const contentHasTabs = content.includes('\t');
  const contentHasSpaces = /^  +/m.test(content);
  
  if (searchHasTabs && !contentHasTabs && contentHasSpaces) {
    issues.push('old_string uses tabs, but file uses spaces for indentation');
  } else if (searchHasSpaces && !contentHasSpaces && contentHasTabs) {
    issues.push('old_string uses spaces, but file uses tabs for indentation');
  }
  
  // Check for trailing whitespace
  if (/[ \t]$/m.test(searchStr) && !/[ \t]$/m.test(content)) {
    issues.push('old_string has trailing whitespace that may not exist in file');
  }
  
  return issues;
}

export const editFileTool: ToolDefinition<EditFileArgs> = {
  name: 'edit',
  description: `Performs exact string replacement in files. The primary tool for making targeted code changes.

## When to Use
- **Targeted changes**: Modifying specific functions, lines, or blocks
- **Refactoring**: Renaming variables, updating signatures, fixing bugs
- **Small updates**: Adding imports, changing values, fixing typos
- **Preserving context**: When most of the file should remain unchanged

## When NOT to Use
- **New files**: Use write tool instead
- **Major rewrites**: If changing >50% of file, use write
- **Moving/renaming files**: Use terminal with 'mv' command
- **Repeated failures**: Switch to write tool after 2-3 failed attempts

## Workflow Integration
This is the core of the Read → Edit → Verify cycle:
\`\`\`
read(file) → Get EXACT file content
  │
  ├─ Copy the EXACT text you want to change
  │   (including whitespace, indentation)
  │
edit(file, old_string, new_string)
  │
  ├─ SUCCESS → read_lints() to verify
  │
  └─ FAILURE → Diagnose and retry OR use write tool
\`\`\`

## Critical Requirements

### old_string Rules
1. **EXACT MATCH**: Must match character-for-character, including:
   - All whitespace (spaces, tabs, newlines)
   - Indentation (copy exactly from read output)
   - Line endings
2. **UNIQUE MATCH**: Must match exactly ONE location in the file
3. **SUFFICIENT CONTEXT**: Include 3+ surrounding lines to ensure uniqueness
4. **COPY DIRECTLY**: Copy from read tool output, don't retype

### new_string Rules
1. **COMPLETE REPLACEMENT**: Provide the full replacement text
2. **PRESERVE INDENTATION**: Match the surrounding code style
3. **NO LINE NUMBERS**: Don't include line number prefixes from read output
4. **MUST BE DIFFERENT**: old_string and new_string cannot be identical

## Common Failures & Recovery

| Error | Cause | Fix |
|-------|-------|-----|
| "old_string not found" | Text doesn't match exactly | Re-read file, copy exactly |
| "matches multiple locations" | Not enough context | Add more surrounding lines |
| Whitespace mismatch | Tabs vs spaces, trailing spaces | Copy directly from read output |
| Keeps failing | Complex edit or file changed | Use write tool instead |

## Self-Correction Protocol
1. **First failure**: Re-read file, copy exact text, retry
2. **Second failure**: Add more context lines (function signature, unique comments)
3. **Third failure**: Use write tool to replace entire file

## Parameters
- **file_path** (required): Absolute path to the file to modify
- **old_string** (required): Exact text to find and replace (must be unique)
- **new_string** (required): Replacement text (must differ from old_string)
- **replace_all** (optional, default: false): Replace ALL occurrences

## Safety Features
- Requires user approval before execution
- File must be read in current session before editing
- Auto-backup created before modification
- Undo history recorded for all edits
- Detailed diagnostics on failure

## Best Practices
- **Always read first**: Get exact content before editing
- **Copy exactly**: Don't retype text, copy from read output
- **Include context**: 3+ lines before and after the change
- **Verify after**: Run read_lints() immediately after edit
- **One change at a time**: Make atomic, focused edits`,
  requiresApproval: true,
  category: 'file-write',
  riskLevel: 'moderate',
  allowedCallers: ['direct'], // Not safe for programmatic calling
  searchKeywords: ['edit', 'modify', 'change', 'update', 'replace', 'refactor', 'fix'],
  ui: {
    icon: 'pencil',
    label: 'Edit',
    color: 'yellow',
    runningLabel: 'Editing file...',
    completedLabel: 'File edited',
  },
  mustReadBeforeWrite: true,
  trackedReadsInSession: getReadFilesCache(),
  
  // Input examples for improved accuracy
  inputExamples: [
    // Example 1: Simple single replacement with context (Unix)
    {
      file_path: '/home/user/myproject/src/utils/helpers.ts',
      old_string: `export function calculateTotal(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price;
  }
  return total;
}`,
      new_string: `export function calculateTotal(items: Item[]): number {
  return items.reduce((total, item) => total + item.price, 0);
}`,
    },
    // Example 2: Windows path example
    {
      file_path: 'C:\\Users\\user\\projects\\myproject\\src\\api\\client.ts',
      old_string: `  async fetch(url: string): Promise<Response> {
    const response = await fetch(url);
    return response.json();
  }`,
      new_string: `  async fetch(url: string): Promise<Response> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(\`HTTP error: \${response.status}\`);
      }
      return response.json();
    } catch (error) {
      logger.error('Fetch failed', { url, error });
      throw error;
    }
  }`,
    },
    // Example 3: Replace all occurrences
    {
      file_path: '/home/user/myproject/src/components/Button.tsx',
      old_string: 'color="primary"',
      new_string: 'variant="primary"',
      replace_all: true,
    },
  ],
  
  schema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to modify',
      },
      old_string: {
        type: 'string',
        description: 'The exact text to search for and replace (must be unique in file)',
      },
      new_string: {
        type: 'string',
        description: 'The text to replace old_string with',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences instead of just the first (default: false)',
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },

  async execute(args: EditFileArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    // Log received arguments for debugging
    const argKeys = Object.keys(args);
    context.logger.info('Edit tool: Received arguments', {
      argKeys,
      hasFilePath: !!args.file_path,
      hasOldString: typeof args.old_string === 'string',
      hasNewString: typeof args.new_string === 'string',
      oldStringLength: typeof args.old_string === 'string' ? args.old_string.length : 0,
      newStringLength: typeof args.new_string === 'string' ? args.new_string.length : 0,
    });

    if (!context.workspacePath) {
      return {
        toolName: 'edit',
        success: false,
        output: `Error: No workspace selected for this session.\n\nThis file operation requires an active workspace context.\n\nPossible causes:\n1. The session's workspace was deleted or removed\n2. The session was created without a workspace binding\n\nSolution: Create a new session after selecting a workspace.`,
      };
    }

    // Extract parameters (support common LLM variations)
    const filePath = args.file_path || (args as Record<string, unknown>).filePath as string | undefined;
    const oldString = args.old_string || (args as Record<string, unknown>).oldString as string | undefined;
    const newString = args.new_string ?? (args as Record<string, unknown>).newString as string | undefined;
    const replaceAll = args.replace_all ?? (args as Record<string, unknown>).replaceAll as boolean | undefined ?? false;

    // Validate file_path - provide detailed diagnostics
    if (!filePath || typeof filePath !== 'string') {
      const receivedArgs = argKeys.length > 0 
        ? `Received keys: ${argKeys.join(', ')}` 
        : 'No arguments received (possible JSON parsing failure)';
      context.logger.error('Edit tool: Missing file_path', { 
        args: JSON.stringify(args).slice(0, 500),
        argKeys,
      });
      return {
        toolName: 'edit',
        success: false,
        output: `Invalid file_path argument. Must be an absolute path to the file.\n\n${receivedArgs}\n\nExpected: file_path (string), old_string (string), new_string (string)\n\nIf this error persists, the tool arguments may not have been properly parsed from the LLM response.`,
      };
    }

    // Validate old_string - provide detailed diagnostics
    if (typeof oldString !== 'string' || oldString.length === 0) {
      const receivedType = oldString === undefined ? 'undefined' : oldString === null ? 'null' : Array.isArray(oldString) ? 'array' : typeof oldString;
      context.logger.error('Edit tool: Invalid old_string', { 
        receivedType,
        filePath,
        argKeys,
      });
      return {
        toolName: 'edit',
        success: false,
        output: `Invalid old_string argument. Must be a non-empty STRING, not ${receivedType}.\n\nReceived argument keys: ${argKeys.join(', ')}\n\nIf you intended to make multiple replacements, call edit multiple times (one replacement per call) or set replace_all: true for identical strings.`,
      };
    }

    // Validate new_string - allow empty string (for deletion)
    if (typeof newString !== 'string') {
      const receivedType = newString === undefined ? 'undefined' : newString === null ? 'null' : Array.isArray(newString) ? 'array' : typeof newString;
      context.logger.error('Edit tool: Invalid new_string', { 
        receivedType,
        filePath,
        argKeys,
      });
      return {
        toolName: 'edit',
        success: false,
        output: `Invalid new_string argument. Must be a STRING (can be empty to delete text), not ${receivedType}.\n\nReceived argument keys: ${argKeys.join(', ')}`,
      };
    }

    // Check that old_string and new_string are different
    if (oldString === newString) {
      // Provide more diagnostic info to help the LLM understand the issue
      const preview = oldString.length > 100 ? oldString.substring(0, 100) + '...' : oldString;
      context.logger.warn('Edit tool: old_string and new_string are identical', {
        filePath,
        stringLength: oldString.length,
        preview: preview.substring(0, 50),
      });
      return {
        toolName: 'edit',
        success: false,
        output: `ERROR: old_string and new_string are IDENTICAL - no changes to make.

This means you're trying to replace text with the exact same text. This is a no-op.

WHAT TO DO:
1. old_string should contain the CURRENT/ORIGINAL text from the file
2. new_string should contain the MODIFIED/NEW text you want

COMMON CAUSES:
• You may have copied the same text to both fields
• You may have already made this change in a previous edit
• The file may already contain the desired content

SOLUTION:
• Re-read the file to see its current state
• If the change is already applied, move on to the next task
• If not, ensure old_string has the ORIGINAL text and new_string has your CHANGES

String preview (first 100 chars):
"${preview}"`,
      };
    }

    let resolvedPath: string;
    try {
      resolvedPath = resolvePath(context.workspacePath, filePath.trim(), {
        allowOutsideWorkspace: context.allowOutsideWorkspace,
      });
    } catch (pathError) {
      const err = pathError as Error;
      context.logger.error('Edit tool: Path resolution failed', {
        path: filePath,
        workspacePath: context.workspacePath,
        error: err.message,
      });
      return {
        toolName: 'edit',
        success: false,
        output: `Error: Failed to resolve path: ${err.message}`,
      };
    }
    
    // Log the edit operation with resolved path
    context.logger.info('Edit tool: Processing edit request', {
      inputPath: filePath,
      resolvedPath,
      workspacePath: context.workspacePath,
      oldStringLength: oldString.length,
      newStringLength: newString.length,
      replaceAll,
    });

    // Safety validation before edit
    if (context.safetyManager && context.runId) {
      const estimatedNewContent = newString; // Use newString as content estimate for size check
      const safetyCheck = await context.safetyManager.validateFileOperation(
        'write',
        resolvedPath,
        context.runId,
        estimatedNewContent
      );
      
      if (!safetyCheck.allowed) {
        const reasons = safetyCheck.issues
          .filter(i => i.severity === 'block')
          .map(i => `• ${i.reason}`)
          .join('\n');
        context.logger.error('Edit blocked by safety manager', {
          path: resolvedPath,
          issues: safetyCheck.issues,
        });
        return {
          toolName: 'edit',
          success: false,
          output: `Error: Edit operation blocked by safety guardrails:\n${reasons}\n\nResolved path: ${resolvedPath}`,
        };
      }
      
      // Log backup if created
      if (safetyCheck.backupPath) {
        context.logger.info('Auto-backup created before edit', {
          originalPath: resolvedPath,
          backupPath: safetyCheck.backupPath,
        });
      }
    }

    // Safety check: verify file was read before editing
    // This is a soft warning - we don't block the operation since the file content
    // may have been provided through other means (editor context, conversation, etc.)
    const fileWasRead = wasFileRead(resolvedPath);
    let safetyWarning = '';
    if (!fileWasRead) {
      safetyWarning = `Note: File was not read via the read tool in this session. Ensure old_string matches exactly.\n\n`;
      context.logger.info('Edit without prior read', { path: filePath, resolved: resolvedPath });
    }

    try {
      // Read original content
      const originalContent = await fs.readFile(resolvedPath, 'utf-8');
      const originalLines = originalContent.split('\n').length;

      // Check if old_string exists in file - try exact match first
      let effectiveOldString = oldString;
      let effectiveContent = originalContent;
      let lineEndingNormalized = false;
      
      if (!originalContent.includes(oldString)) {
        // Try with normalized line endings (CRLF -> LF)
        const normalized = findWithNormalizedLineEndings(originalContent, oldString);
        if (normalized.found) {
          effectiveOldString = normalized.normalizedSearch;
          effectiveContent = normalized.normalizedContent;
          lineEndingNormalized = true;
          context.logger.info('Edit tool: Using normalized line endings for match', {
            resolvedPath,
            originalHasCRLF: originalContent.includes('\r\n'),
            searchHasCRLF: oldString.includes('\r\n'),
          });
        }
      }
      
      if (!effectiveContent.includes(effectiveOldString)) {
        // Comprehensive diagnostics for matching failure
        const diagnostics: string[] = [];
        let suggestion = '';
        let bestMatchInfo = '';
        
        // 1. Check for common issues (line endings, tabs vs spaces)
        const commonIssues = detectCommonIssues(oldString, originalContent);
        if (commonIssues.length > 0) {
          diagnostics.push('Detected issues:\n' + commonIssues.map(i => `  • ${i}`).join('\n'));
        }
        
        // 2. Check for whitespace/indentation issues with normalized comparison
        const normalizedOld = normalizeWhitespace(oldString);
        const normalizedContent = normalizeWhitespace(originalContent);
        
        if (normalizedContent.includes(normalizedOld)) {
          suggestion = 'WHITESPACE MISMATCH: The text exists but with different whitespace/indentation.';
          
          // Try to find the actual location and show differences
          const bestMatch = findBestMatch(originalContent, oldString, 0.6);
          if (bestMatch) {
            const differences = identifyDifferences(oldString, bestMatch.match);
            bestMatchInfo = `\nBest match found at line ${bestMatch.lineNum} (${Math.round(bestMatch.similarity * 100)}% similar):\n${differences}`;
          }
        } else {
          // 3. Check if key lines exist individually
          const lines = oldString.split('\n').filter(l => l.trim().length > 0);
          const firstLine = lines[0]?.trim() || '';
          const lastLine = lines[lines.length - 1]?.trim() || '';
          const middleLine = lines.length > 2 ? lines[Math.floor(lines.length / 2)]?.trim() : '';
          
          const foundLines: string[] = [];
          const missingLines: string[] = [];
          
          if (firstLine.length > 10) {
            if (originalContent.includes(firstLine)) {
              foundLines.push(`First line: "${firstLine.substring(0, 40)}${firstLine.length > 40 ? '...' : ''}"`);
            } else {
              missingLines.push(`First line not found: "${firstLine.substring(0, 40)}${firstLine.length > 40 ? '...' : ''}"`);
            }
          }
          
          if (lastLine.length > 10 && lastLine !== firstLine) {
            if (originalContent.includes(lastLine)) {
              foundLines.push(`Last line: "${lastLine.substring(0, 40)}${lastLine.length > 40 ? '...' : ''}"`);
            } else {
              missingLines.push(`Last line not found: "${lastLine.substring(0, 40)}${lastLine.length > 40 ? '...' : ''}"`);
            }
          }
          
          if (middleLine && middleLine.length > 10 && middleLine !== firstLine && middleLine !== lastLine) {
            if (originalContent.includes(middleLine)) {
              foundLines.push(`Middle line: "${middleLine.substring(0, 40)}${middleLine.length > 40 ? '...' : ''}"`);
            }
          }
          
          if (foundLines.length > 0 && missingLines.length > 0) {
            suggestion = 'PARTIAL MATCH: Some lines found but context doesn\'t match.';
            diagnostics.push('Found in file:\n' + foundLines.map(l => `  ✓ ${l}`).join('\n'));
            diagnostics.push('Not found:\n' + missingLines.map(l => `  ✗ ${l}`).join('\n'));
          } else if (missingLines.length > 0 && foundLines.length === 0) {
            suggestion = 'NO MATCH: The specified text does not appear to exist in this file.';
            diagnostics.push('Neither first nor last line of old_string was found in the file.');
          }
          
          // 4. Try fuzzy matching to find similar content
          const bestMatch = findBestMatch(originalContent, oldString, 0.5);
          if (bestMatch && bestMatch.similarity >= 0.5) {
            bestMatchInfo = `\nClosest match found at line ${bestMatch.lineNum} (${Math.round(bestMatch.similarity * 100)}% similar).`;
            if (bestMatch.similarity >= 0.7) {
              const differences = identifyDifferences(oldString, bestMatch.match);
              bestMatchInfo += `\nDifferences:\n${differences}`;
            }
          }
        }

        const preview = oldString.length > 150 
          ? oldString.substring(0, 150) + `... (${oldString.length} chars total)` 
          : oldString;

        let output = `old_string not found in file.\n\n`;
        output += `═══ DIAGNOSIS ═══\n`;
        if (suggestion) {
          output += `${suggestion}\n`;
        }
        if (diagnostics.length > 0) {
          output += `\n${diagnostics.join('\n\n')}\n`;
        }
        if (bestMatchInfo) {
          output += `${bestMatchInfo}\n`;
        }
        output += `\n═══ SEARCHED FOR ═══\n${preview}\n`;
        output += `\n═══ FILE ═══\n${filePath}\n`;
        output += `\n═══ TIPS ═══\n`;
        output += `• Re-read the file using the read tool to get current content\n`;
        output += `• Copy old_string EXACTLY from read output (including whitespace)\n`;
        output += `• Include 3+ lines of context before and after the target change\n`;
        output += `• Check that the file hasn't been modified since you last read it`;

        return {
          toolName: 'edit',
          success: false,
          output,
        };
      }

      // Count occurrences - use effective strings if line endings were normalized
      const searchContent = lineEndingNormalized ? effectiveContent : originalContent;
      const searchString = lineEndingNormalized ? effectiveOldString : oldString;
      const occurrenceCount = (searchContent.match(new RegExp(escapeRegExp(searchString), 'g')) || []).length;

      // If multiple occurrences and not replace_all, fail
      if (occurrenceCount > 1 && !replaceAll) {
        return {
          toolName: 'edit',
          success: false,
          output: `old_string matches ${occurrenceCount} locations in the file.

To fix this, either:
1. Add more surrounding context to make the match unique
2. Set replace_all: true to replace ALL occurrences

File: ${filePath}`,
        };
      }

      // Perform replacement
      let content: string;
      let replacementCount: number;
      
      if (lineEndingNormalized) {
        // If we normalized line endings for matching, we need to:
        // 1. Normalize the new_string to match the file's line ending style
        // 2. Perform replacement on normalized content
        // 3. Convert back to original line ending style if file used CRLF
        const fileUsesCRLF = originalContent.includes('\r\n');
        const normalizedNewString = normalizeLineEndings(newString);
        
        if (replaceAll) {
          content = effectiveContent.split(effectiveOldString).join(normalizedNewString);
          replacementCount = occurrenceCount;
        } else {
          content = effectiveContent.replace(effectiveOldString, normalizedNewString);
          replacementCount = 1;
        }
        
        // Convert back to CRLF if original file used it
        if (fileUsesCRLF) {
          content = content.replace(/\n/g, '\r\n');
        }
        
        context.logger.info('Edit tool: Applied line-ending normalized replacement', {
          resolvedPath,
          fileUsesCRLF,
          replacementCount,
        });
      } else {
        // Standard replacement without normalization
        if (replaceAll) {
          content = originalContent.split(oldString).join(newString);
          replacementCount = occurrenceCount;
        } else {
          content = originalContent.replace(oldString, newString);
          replacementCount = 1;
        }
      }

      // Write modified content
      context.logger.info('Edit tool: Writing modified content', { 
        resolvedPath, 
        originalSize: originalContent.length,
        newSize: content.length,
      });
      await fs.writeFile(resolvedPath, content, 'utf-8');
      context.logger.info('Edit tool: fs.writeFile completed successfully', { resolvedPath });
      
      // Record change in undo history
      if (context.sessionId && context.runId) {
        try {
          await undoHistory.recordChange(
            context.sessionId,
            context.runId,
            resolvedPath,
            'modify',
            originalContent,
            content,
            'edit',
            `Edited ${filePath.split(/[/\\]/).pop() || filePath}`
          );
        } catch (undoError) {
          context.logger.warn('Failed to record undo history', { error: (undoError as Error).message });
        }
      }
      
      // Verify the file was written
      try {
        const writtenStats = await fs.stat(resolvedPath);
        context.logger.info('Edit tool: File write verified', {
          resolvedPath,
          size: writtenStats.size,
          mtime: writtenStats.mtime,
        });
      } catch (verifyError) {
        context.logger.error('Edit tool: File write verification failed', {
          resolvedPath,
          error: (verifyError as Error).message,
        });
      }

      // Calculate stats
      const newLines = content.split('\n').length;
      const linesChanged = newLines - originalLines;
      const charsChanged = content.length - originalContent.length;

      let output = safetyWarning;
      output += `Successfully edited ${filePath}\n`;
      output += `Replaced ${replacementCount} occurrence(s)\n`;
      output += `Lines: ${originalLines} → ${newLines} (${linesChanged >= 0 ? '+' : ''}${linesChanged})\n`;
      output += `Characters: ${charsChanged >= 0 ? '+' : ''}${charsChanged}\n`;
      output += `Resolved path: ${resolvedPath}`;

      return {
        toolName: 'edit',
        success: true,
        output,
        metadata: {
          path: filePath,
          filePath: resolvedPath,
          content: content,
          newContent: content,
          originalContent: originalContent,
          replacementCount,
          linesAdded: Math.max(0, linesChanged),
          linesRemoved: Math.max(0, -linesChanged),
          action: 'modified',
        },
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      context.logger.error('Edit tool: Operation failed', {
        resolvedPath,
        errorCode: err.code,
        errorMessage: err.message,
        stack: err.stack,
      });
      
      if (err.code === 'ENOENT') {
        return {
          toolName: 'edit',
          success: false,
          output: `File not found: ${filePath}\n\nUse the write tool to create new files.\nResolved path: ${resolvedPath}`,
        };
      }
      if (err.code === 'EACCES') {
        return {
          toolName: 'edit',
          success: false,
          output: `Permission denied: ${filePath}\nResolved path: ${resolvedPath}`,
        };
      }
      return {
        toolName: 'edit',
        success: false,
        output: `Failed to edit file: ${err.message}\nResolved path: ${resolvedPath}`,
      };
    }
  },
};
