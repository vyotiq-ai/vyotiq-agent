/**
 * Grep Tool
 * 
 * A powerful search tool built on ripgrep-style pattern matching.
 * Searches file contents using regular expressions with advanced options.
 */
import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';
import { resolvePath } from '../../utils/fileSystem';
import { createLogger } from '../../logger';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

const logger = createLogger('grep');

// Limits to prevent context overflow
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max file size
const MAX_FILES_TO_SEARCH = 1000;

// Common file type extensions mapping (like ripgrep --type)
const FILE_TYPE_MAP: Record<string, string[]> = {
  js: ['.js', '.mjs', '.cjs'],
  ts: ['.ts', '.tsx', '.mts', '.cts'],
  jsx: ['.jsx'],
  tsx: ['.tsx'],
  py: ['.py', '.pyi'],
  rust: ['.rs'],
  go: ['.go'],
  java: ['.java'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.h'],
  css: ['.css', '.scss', '.sass', '.less'],
  html: ['.html', '.htm'],
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  md: ['.md', '.markdown'],
  xml: ['.xml'],
  sql: ['.sql'],
  sh: ['.sh', '.bash', '.zsh'],
  rb: ['.rb'],
  php: ['.php'],
};

interface GrepArgs extends Record<string, unknown> {
  /** The regular expression pattern to search for in file contents */
  pattern: string;
  /** File or directory to search in (defaults to workspace root) */
  path?: string;
  /** Glob pattern to filter files (e.g., \"*.js\", \"*.{ts,tsx}\") */
  glob?: string;
  /** Output mode: \"content\", \"files_with_matches\", or \"count\" */
  output_mode?: 'content' | 'files_with_matches' | 'count';
  /** Number of lines to show before each match (requires output_mode: \"content\") */
  '-B'?: number;
  /** Number of lines to show after each match (requires output_mode: \"content\") */
  '-A'?: number;
  /** Number of lines to show before and after each match (requires output_mode: \"content\") */
  '-C'?: number;
  /** Show line numbers in output (requires output_mode: \"content\") */
  '-n'?: boolean;
  /** Case insensitive search */
  '-i'?: boolean;
  /** File type to search (e.g., \"js\", \"py\", \"rust\") */
  type?: string;
  /** Limit output to first N lines/entries */
  head_limit?: number;
  /** Enable multiline mode where . matches newlines */
  multiline?: boolean;
}

export const grepTool: ToolDefinition<GrepArgs> = {
  name: 'grep',
  description: `A powerful search tool built on ripgrep-style pattern matching. Use this to search file contents.

## IMPORTANT
ALWAYS use this Grep tool for search tasks. NEVER invoke \`grep\` or \`rg\` as a terminal command. The Grep tool has been optimized for correct permissions and access.

## When to Use
- **Find code patterns**: function declarations, imports, class definitions
- **Search for text**: error messages, comments, strings
- **Locate usages**: find where a function/variable is used
- **Code review**: find TODOs, FIXMEs, console.logs

## Output Modes
- **files_with_matches** (default): Just file paths - fastest, use when you only need to know which files
- **content**: Shows matching lines with context - use when you need to see the matches
- **count**: Shows match counts per file - use for statistics

## Key Parameters
- **pattern** (required): Regex pattern to search for
- **path**: Directory or file to search (defaults to workspace root)
- **glob**: Filter files by pattern (e.g., "*.ts", "**/*.tsx")
- **type**: Filter by file type (js, ts, py, rust, go, etc.)
- **-i**: Case insensitive search
- **-C/-B/-A**: Context lines (before/after/both)
- **-n**: Show line numbers (default: true)
- **multiline**: Enable patterns that span multiple lines

## Pattern Examples
- \`function\\s+\\w+\` - Find function declarations
- \`import.*react\` - Find React imports
- \`console\\.log\` - Find console.log calls (escape the dot!)
- \`FIXME|TODO\` - Find todos and fixmes
- \`class\\s+\\w+\\s+extends\` - Find class inheritance

## Workflow Integration
Use grep as the first step to discover files, then read them:
\`\`\`
grep("pattern") → get file list
read(files) → understand context
edit(file, old, new) → make changes
\`\`\``,
  requiresApproval: false,
  category: 'file-search',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  deferLoading: true,
  searchKeywords: ['search', 'find', 'pattern', 'regex', 'grep', 'match', 'content', 'text search', 'ripgrep', 'rg', 'locate', 'discover'],
  ui: {
    icon: 'search',
    label: 'Grep',
    color: 'purple',
    runningLabel: 'Searching...',
    completedLabel: 'Search complete',
  },

  // Input examples for improved accuracy
  inputExamples: [
    // Example 1: Search directory for pattern, list files
    {
      pattern: 'export\\s+function',
      path: '/home/user/project/src',
      output_mode: 'files_with_matches',
    },
    // Example 2: Search with content and context
    {
      pattern: 'FIXME',
      path: '/home/user/project',
      output_mode: 'content',
      '-B': 2,
      '-A': 2,
      '-n': true,
      '-i': true,
    },
    // Example 3: Search specific file type
    {
      pattern: 'import.*react',
      type: 'tsx',
      '-i': true,
    },
    // Example 4: Search with glob filter
    {
      pattern: 'class\\s+\\w+',
      glob: '**/*.ts',
      output_mode: 'content',
      '-C': 3,
    },
    // Example 5: Count matches
    {
      pattern: 'console\\.log',
      type: 'js',
      output_mode: 'count',
    },
    // Example 6: Multiline search
    {
      pattern: 'interface\\s+\\w+\\s*\\{[\\s\\S]*?\\}',
      type: 'ts',
      multiline: true,
      output_mode: 'content',
    },
  ],

  schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regular expression pattern to search for in file contents',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in. Defaults to workspace root',
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")',
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output mode: "content", "files_with_matches" (default), or "count"',
      },
      '-B': {
        type: 'number',
        description: 'Number of lines to show before each match (requires output_mode: "content")',
      },
      '-A': {
        type: 'number',
        description: 'Number of lines to show after each match (requires output_mode: "content")',
      },
      '-C': {
        type: 'number',
        description: 'Number of lines to show before and after each match (requires output_mode: "content")',
      },
      '-n': {
        type: 'boolean',
        description: 'Show line numbers in output (requires output_mode: "content")',
      },
      '-i': {
        type: 'boolean',
        description: 'Case insensitive search',
      },
      type: {
        type: 'string',
        description: 'File type to search (js, py, rust, go, java, etc.)',
      },
      head_limit: {
        type: 'number',
        description: 'Limit output to first N lines/entries',
      },
      multiline: {
        type: 'boolean',
        description: 'Enable multiline mode where . matches newlines',
      },
    },
    required: ['pattern'],
  },

  async execute(args: GrepArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'grep',
        success: false,
        output: `═══ NO WORKSPACE ═══\n\nThis search operation requires an active workspace context.\n\n═══ POSSIBLE CAUSES ═══\n• The session's workspace was deleted or removed\n• The session was created without a workspace binding\n\n═══ SOLUTION ═══\nCreate a new session after selecting a workspace.`,
      };
    }

    if (!args.pattern || typeof args.pattern !== 'string') {
      return {
        toolName: 'grep',
        success: false,
        output: `═══ INVALID PATTERN ═══\n\nPattern must be a non-empty string.\n\n═══ EXAMPLES ═══\n• "FIXME" - Find fixmes\n• "function\\s+\\w+" - Find function declarations\n• "import.*react" - Find React imports\n• "console\\.log" - Find console.log calls (escape the dot)`,
      };
    }

    // Use new parameter names
    const searchPath = args.path?.trim() || '.';
    const outputMode = args.output_mode || 'files_with_matches';
    const caseInsensitive = args['-i'] || false;
    const beforeContext = args['-C'] ?? args['-B'] ?? 0;
    const afterContext = args['-C'] ?? args['-A'] ?? 0;
    const showLineNumbers = args['-n'] !== false; // Default to showing line numbers
    const headLimit = args.head_limit;
    const multiline = args.multiline === true;

    const resolvedPath = resolvePath(context.workspacePath, searchPath, {
      allowOutsideWorkspace: context.allowOutsideWorkspace,
    });

    try {
      let unreadableFilesLogged = 0;
      const MAX_UNREADABLE_FILE_LOGS = 5;

      // Create regex with appropriate flags
      let regexFlags = 'g';
      if (caseInsensitive) regexFlags += 'i';
      if (multiline) regexFlags += 'ms'; // multiline + dotall

      let regex: RegExp;
      try {
        regex = new RegExp(args.pattern, regexFlags);
      } catch (regexError) {
        const err = regexError as Error;
        let output = `═══ INVALID REGEX PATTERN ═══\n\n`;
        output += `Pattern: ${args.pattern}\n`;
        output += `Error: ${err.message}\n\n`;
        output += `═══ COMMON FIXES ═══\n`;
        output += `• Escape special characters: . * + ? ^ $ { } [ ] ( ) | \\\n`;
        output += `• Use \\.  to match a literal dot\n`;
        output += `• Use \\( \\) to match literal parentheses\n`;
        output += `• Use \\{ \\} to match literal braces\n\n`;
        output += `═══ EXAMPLES ═══\n`;
        output += `• "console\\.log" - Match console.log\n`;
        output += `• "function\\s+\\w+" - Match function declarations\n`;
        output += `• "\\[.*\\]" - Match array brackets`;
        return {
          toolName: 'grep',
          success: false,
          output,
        };
      }

      // Check if path is a file or directory
      const stats = await fs.stat(resolvedPath);

      if (stats.isFile()) {
        // Single file search
        return await searchSingleFile(resolvedPath, searchPath, regex, {
          outputMode,
          beforeContext: Math.min(beforeContext, 10),
          afterContext: Math.min(afterContext, 10),
          showLineNumbers,
          headLimit,
          multiline,
        });
      }

      // Directory search - collect all files
      const filesToSearch = await collectFiles(resolvedPath, context.workspacePath, {
        glob: args.glob,
        fileType: args.type,
        maxFiles: MAX_FILES_TO_SEARCH,
      });

      if (filesToSearch.length === 0) {
        return {
          toolName: 'grep',
          success: true,
          output: 'No files found matching the specified criteria.',
          metadata: {
            pattern: args.pattern,
            path: searchPath,
            matchCount: 0,
          },
        };
      }

      // Search all files
      const results: SearchResult[] = [];
      let filesSearched = 0;
      let totalMatches = 0;

      for (const file of filesToSearch) {
        if (headLimit && results.length >= headLimit) break;

        const fileStats = await fs.stat(file.absolute).catch((): null => null);
        if (!fileStats || fileStats.size > MAX_FILE_SIZE) continue;

        try {
          const content = await fs.readFile(file.absolute, 'utf-8');
          const lines = content.split(/\r?\n/);

          // Find matches
          const matches: MatchResult[] = [];
          for (let i = 0; i < lines.length; i++) {
            regex.lastIndex = 0;
            if (regex.test(lines[i])) {
              matches.push({ lineNum: i + 1, line: lines[i] });
            }
          }

          // Also handle multiline matches
          if (multiline && matches.length === 0) {
            regex.lastIndex = 0;
            if (regex.test(content)) {
              // Found a multiline match - mark first line
              matches.push({ lineNum: 1, line: lines[0] });
            }
          }

          if (matches.length > 0) {
            filesSearched++;
            totalMatches += matches.length;
            results.push({
              file: file.relative,
              absolutePath: file.absolute,
              matches,
              lines,
            });
          }
        } catch (error) {
          // Skip files that can't be read, but log a small sample to aid debugging.
          if (unreadableFilesLogged < MAX_UNREADABLE_FILE_LOGS) {
            unreadableFilesLogged++;
            const err = error as NodeJS.ErrnoException;
            logger.debug('Skipping unreadable file during grep', {
              file: file.relative,
              code: err.code,
              message: err.message,
            });
          }
        }
      }

      // Format output based on mode
      return formatOutput(results, {
        pattern: args.pattern,
        searchPath,
        outputMode,
        beforeContext: Math.min(beforeContext, 10),
        afterContext: Math.min(afterContext, 10),
        showLineNumbers,
        headLimit,
        filesSearched,
        totalMatches,
        totalFiles: filesToSearch.length,
      });

    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return {
          toolName: 'grep',
          success: false,
          output: `Error: Path not found: ${searchPath}`,
        };
      }
      return {
        toolName: 'grep',
        success: false,
        output: `Error: Failed to search: ${err.message}`,
      };
    }
  },
};

// =============================================================================
// Helper Types and Functions
// =============================================================================

interface MatchResult {
  lineNum: number;
  line: string;
}

interface SearchResult {
  file: string;
  absolutePath: string;
  matches: MatchResult[];
  lines: string[];
}

interface SearchOptions {
  outputMode: 'content' | 'files_with_matches' | 'count';
  beforeContext: number;
  afterContext: number;
  showLineNumbers: boolean;
  headLimit?: number;
  multiline: boolean;
}

interface CollectOptions {
  glob?: string;
  fileType?: string;
  maxFiles: number;
}

interface FormatOptions {
  pattern: string;
  searchPath: string;
  outputMode: 'content' | 'files_with_matches' | 'count';
  beforeContext: number;
  afterContext: number;
  showLineNumbers: boolean;
  headLimit?: number;
  filesSearched: number;
  totalMatches: number;
  totalFiles: number;
}

/**
 * Search a single file
 */
async function searchSingleFile(
  absolutePath: string,
  relativePath: string,
  regex: RegExp,
  options: SearchOptions
): Promise<ToolExecutionResult> {
  const stats = await fs.stat(absolutePath);

  if (stats.size > MAX_FILE_SIZE) {
    return {
      toolName: 'grep',
      success: false,
      output: `Error: File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
    };
  }

  const content = await fs.readFile(absolutePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const matches: MatchResult[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (options.headLimit && matches.length >= options.headLimit) break;
    regex.lastIndex = 0;
    if (regex.test(lines[i])) {
      matches.push({ lineNum: i + 1, line: lines[i] });
    }
  }

  if (matches.length === 0) {
    return {
      toolName: 'grep',
      success: true,
      output: `No matches found for pattern in ${relativePath}`,
      metadata: {
        file: relativePath,
        pattern: regex.source,
        matchCount: 0,
      },
    };
  }

  // Format based on output mode
  let output: string;

  switch (options.outputMode) {
    case 'count': {
      output = `${relativePath}: ${matches.length} match(es)`;
      break;
    }

    case 'files_with_matches': {
      output = relativePath;
      break;
    }

    case 'content':
    default:
      output = formatContentOutput(relativePath, matches, lines, options);
      break;
  }

  return {
    toolName: 'grep',
    success: true,
    output,
    metadata: {
      file: relativePath,
      pattern: regex.source,
      matchCount: matches.length,
      lineNumbers: matches.map(m => m.lineNum),
    },
  };
}

/**
 * Collect files to search based on filters
 */
async function collectFiles(
  dirPath: string,
  workspacePath: string,
  options: CollectOptions
): Promise<Array<{ absolute: string; relative: string }>> {
  const files: Array<{ absolute: string; relative: string }> = [];

  // Build extension filter from type
  let allowedExtensions: string[] | null = null;
  if (options.fileType && FILE_TYPE_MAP[options.fileType.toLowerCase()]) {
    allowedExtensions = FILE_TYPE_MAP[options.fileType.toLowerCase()];
  }

  // Build glob matcher
  const globMatcher = options.glob ? createGlobMatcher(options.glob) : null;

  async function walk(dir: string): Promise<void> {
    if (files.length >= options.maxFiles) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= options.maxFiles) break;

      // Skip hidden and common ignore directories
      if (entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'out' ||
        entry.name === '__pycache__') {
        continue;
      }

      const fullPath = join(dir, entry.name);
      const relativePath = relative(workspacePath, fullPath);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        // Check extension filter
        if (allowedExtensions) {
          const ext = '.' + entry.name.split('.').pop()?.toLowerCase();
          if (!allowedExtensions.includes(ext)) continue;
        }

        // Check glob filter
        if (globMatcher && !globMatcher(relativePath) && !globMatcher(entry.name)) {
          continue;
        }

        files.push({ absolute: fullPath, relative: relativePath });
      }
    }
  }

  await walk(dirPath);
  return files;
}

/**
 * Create a simple glob matcher function
 */
function createGlobMatcher(pattern: string): (path: string) => boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
    .replace(/\{([^}]+)\}/g, (_, group) => `(${group.split(',').join('|')})`);

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return (path: string) => regex.test(path);
}

/**
 * Format content output with context
 */
function formatContentOutput(
  file: string,
  matches: MatchResult[],
  lines: string[],
  options: SearchOptions
): string {
  const chunks: string[] = [];

  for (const match of matches) {
    const contextLines: string[] = [];
    const start = Math.max(0, match.lineNum - 1 - options.beforeContext);
    const end = Math.min(lines.length - 1, match.lineNum - 1 + options.afterContext);

    for (let i = start; i <= end; i++) {
      const isMatch = i === match.lineNum - 1;
      const prefix = isMatch ? '>' : ' ';
      const lineNumStr = options.showLineNumbers
        ? (i + 1).toString().padStart(4, ' ') + ' | '
        : '';
      contextLines.push(`${prefix}${lineNumStr}${lines[i]}`);
    }

    chunks.push(`${file}:\n${contextLines.join('\n')}`);
  }

  return chunks.join('\n---\n');
}

/**
 * Format the final output based on mode and options
 */
function formatOutput(
  results: SearchResult[],
  options: FormatOptions
): ToolExecutionResult {
  if (results.length === 0) {
    return {
      toolName: 'grep',
      success: true,
      output: `No matches found for pattern: ${options.pattern}`,
      metadata: {
        pattern: options.pattern,
        path: options.searchPath,
        matchCount: 0,
        filesSearched: options.totalFiles,
      },
    };
  }

  let output: string;
  let entries: string[] = [];

  switch (options.outputMode) {
    case 'count': {
      entries = results.map(r => `${r.file}: ${r.matches.length}`);
      if (options.headLimit) entries = entries.slice(0, options.headLimit);
      output = entries.join('\n');
      output += `\n\nTotal: ${options.totalMatches} match(es) in ${options.filesSearched} file(s)`;
      break;
    }

    case 'files_with_matches': {
      entries = results.map(r => r.file);
      if (options.headLimit) entries = entries.slice(0, options.headLimit);
      output = entries.join('\n');
      output += `\n\n${options.filesSearched} file(s) with matches`;
      break;
    }

    case 'content':
    default: {
      const chunks: string[] = [];
      let lineCount = 0;

      for (const result of results) {
        if (options.headLimit && lineCount >= options.headLimit) break;

        for (const match of result.matches) {
          if (options.headLimit && lineCount >= options.headLimit) break;

          const contextLines: string[] = [];
          const start = Math.max(0, match.lineNum - 1 - options.beforeContext);
          const end = Math.min(result.lines.length - 1, match.lineNum - 1 + options.afterContext);

          for (let i = start; i <= end; i++) {
            const isMatch = i === match.lineNum - 1;
            const prefix = isMatch ? '>' : ' ';
            const lineNumStr = options.showLineNumbers
              ? (i + 1).toString().padStart(4, ' ') + ' | '
              : '';
            contextLines.push(`${prefix}${lineNumStr}${result.lines[i]}`);
            lineCount++;
          }

          chunks.push(`${result.file}:\n${contextLines.join('\n')}`);
        }
      }

      output = chunks.join('\n---\n');
      output += `\n\n${options.totalMatches} match(es) in ${options.filesSearched} file(s)`;
      break;
    }
  }

  return {
    toolName: 'grep',
    success: true,
    output,
    metadata: {
      pattern: options.pattern,
      path: options.searchPath,
      matchCount: options.totalMatches,
      filesWithMatches: options.filesSearched,
      filesSearched: options.totalFiles,
    },
  };
}
