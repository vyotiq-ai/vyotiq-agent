/**
 * Glob Tool
 * 
 * Fast file-pattern matching using glob syntax.
 * Finds files matching specified patterns across the workspace.
 */
import { glob } from 'glob';
import { resolvePath } from '../../utils/fileSystem';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

// Limit results to prevent context overflow
const MAX_GLOB_RESULTS = 500;

interface GlobArgs extends Record<string, unknown> {
  /** The glob pattern to match files */
  pattern: string;
  /** Directory to search from (absolute path, defaults to workspace root) */
  path?: string;
  /** Return absolute paths instead of relative (default: false) */
  absolute?: boolean;
  /** Array of glob patterns to exclude */
  ignore?: string[];
  /** Include hidden files starting with dot (default: true) */
  dot?: boolean;
}

export const globTool: ToolDefinition<GlobArgs> = {
  name: 'glob',
  description: `Fast file-pattern matching using glob syntax. Use this tool to find files matching a pattern.

Usage:
- Returns relative paths by default (set absolute: true for full paths)
- Automatically ignores node_modules and .git directories unless specified
- Supports standard glob patterns: *, **, ?, [...], {...}
- Use Grep tool instead if you need to search file contents

Pattern Syntax:
- * matches any characters except /
- ** matches any characters including /
- ? matches single character
- [...] matches character class
- {...} matches alternatives (e.g., "*.{ts,tsx}")

Parameters:
- pattern (required): The glob pattern to match (e.g., "**/*.ts", "src/**/*.{js,tsx}")
- path (optional): Absolute path to search from. Defaults to workspace root
- absolute (optional): Return absolute paths instead of relative (default: false)
- ignore (optional): Array of glob patterns to exclude (e.g., ["node_modules/**", "dist/**"])
- dot (optional): Include hidden files starting with "." (default: true)`,
  requiresApproval: false,
  category: 'file-search',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['find', 'search', 'files', 'pattern', 'glob', 'match', 'list', 'locate'],
  ui: {
    icon: 'file-search',
    label: 'Glob',
    color: 'teal',
    runningLabel: 'Searching files...',
    completedLabel: 'Files found',
  },
  
  // Input examples for improved accuracy
  inputExamples: [
    // Example 1: Find all TypeScript files
    { pattern: '**/*.ts' },
    // Example 2: Find files in specific directory with exclusions
    { 
      pattern: '**/*.{ts,tsx}', 
      path: '/home/user/project/src',
      ignore: ['**/*.test.ts', '**/*.spec.ts'] 
    },
    // Example 3: Find config files at root
    { pattern: '*.{json,yaml,yml,toml}' },
    // Example 4: Get absolute paths
    { pattern: 'src/components/**/*.tsx', absolute: true },
    // Example 5: Find all JavaScript files including hidden
    { pattern: '**/*.js', dot: true },
  ],
  
  schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match files (e.g., "**/*.ts", "src/**/*.{js,tsx}")',
      },
      path: {
        type: 'string',
        description: 'Absolute path to search from (defaults to workspace root)',
      },
      absolute: {
        type: 'boolean',
        description: 'Return absolute paths (default: false)',
      },
      ignore: {
        type: 'array',
        items: { type: 'string' },
        description: 'Glob patterns to exclude (e.g., ["node_modules/**", "dist/**"])',
      },
      dot: {
        type: 'boolean',
        description: 'Include hidden files (default: true)',
      },
    },
    required: ['pattern'],
  },

  async execute(args: GlobArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'glob',
        success: false,
        output: `═══ NO WORKSPACE ═══\n\nThis file search operation requires an active workspace context.\n\n═══ POSSIBLE CAUSES ═══\n• The session's workspace was deleted or removed\n• The session was created without a workspace binding\n\n═══ SOLUTION ═══\nCreate a new session after selecting a workspace.`,
      };
    }

    if (!args.pattern || typeof args.pattern !== 'string') {
      return {
        toolName: 'glob',
        success: false,
        output: `═══ INVALID PATTERN ═══\n\nPattern must be a non-empty string.\n\n═══ EXAMPLES ═══\n• "**/*.ts" - All TypeScript files\n• "src/**/*.{js,jsx}" - JS/JSX in src/\n• "*.json" - JSON files in root\n• "**/test*" - Files starting with 'test'`,
      };
    }
    
    // Validate pattern doesn't have obvious issues
    const pattern = args.pattern.trim();
    if (pattern.startsWith('/') && process.platform === 'win32') {
      return {
        toolName: 'glob',
        success: false,
        output: `═══ INVALID PATTERN ═══\n\nPatterns should not start with '/' on Windows.\n\n═══ SUGGESTION ═══\nUse relative patterns like "**/*.ts" or specify path parameter separately.`,
      };
    }

    // Support both path and legacy cwd parameter
    const searchPath = args.path
      ? resolvePath(context.workspacePath, args.path.trim(), {
          allowOutsideWorkspace: context.allowOutsideWorkspace,
        })
      : context.workspacePath;

    try {
      const matches = await glob(pattern, {
        cwd: searchPath,
        absolute: Boolean(args.absolute),
        dot: args.dot !== false, // Default to true
        ignore: args.ignore || ['**/node_modules/**', '**/.git/**'],
      });

      if (matches.length === 0) {
        // Provide helpful suggestions when no matches found
        let output = `═══ NO MATCHES FOUND ═══\n\n`;
        output += `Pattern: ${pattern}\n`;
        output += `Search path: ${args.path || '(workspace root)'}\n\n`;
        output += `═══ SUGGESTIONS ═══\n`;
        output += `• Check the pattern syntax is correct\n`;
        output += `• Try a broader pattern (e.g., "**/*" to see all files)\n`;
        output += `• Use 'ls' to verify the directory structure\n`;
        
        if (!pattern.includes('**')) {
          output += `• Add "**/" prefix to search recursively\n`;
        }
        if (args.ignore && args.ignore.length > 0) {
          output += `• Check if ignore patterns are too broad: ${args.ignore.join(', ')}\n`;
        }
        
        return {
          toolName: 'glob',
          success: true,
          output,
          metadata: {
            pattern,
            count: 0,
          },
        };
      }

      // Sort matches for consistent output
      matches.sort();
      
      // Truncate if too many results
      const wasTruncated = matches.length > MAX_GLOB_RESULTS;
      const displayMatches = wasTruncated ? matches.slice(0, MAX_GLOB_RESULTS) : matches;
      
      let output = displayMatches.join('\n');
      if (wasTruncated) {
        output += `\n\n═══ TRUNCATED ═══\nFound ${matches.length} matches, showing first ${MAX_GLOB_RESULTS}.\n\n═══ SUGGESTION ═══\nUse a more specific pattern to narrow results.`;
      } else {
        output += `\n\n[${matches.length} file(s) found]`;
      }

      return {
        toolName: 'glob',
        success: true,
        output,
        metadata: {
          pattern,
          count: matches.length,
          searchPath: args.path || '.',
          wasTruncated,
        },
      };
    } catch (error) {
      const err = error as Error;
      let output = `═══ GLOB ERROR ═══\n\n`;
      output += `Pattern: ${pattern}\n`;
      output += `Error: ${err.message}\n\n`;
      
      if (err.message.includes('Invalid') || err.message.includes('pattern')) {
        output += `═══ PATTERN SYNTAX HELP ═══\n`;
        output += `• * matches any characters except /\n`;
        output += `• ** matches any characters including /\n`;
        output += `• ? matches single character\n`;
        output += `• [...] matches character class\n`;
        output += `• {...} matches alternatives\n`;
      }
      
      return {
        toolName: 'glob',
        success: false,
        output,
      };
    }
  },
};
