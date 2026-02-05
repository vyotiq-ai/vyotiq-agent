/**
 * List Directory Tool (LS)
 * 
 * Lists files and directories in a given path.
 * Supports ignore patterns via glob syntax.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { resolvePath } from '../../utils/fileSystem';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';
import { checkCancellation, formatCancelled } from '../types/formatUtils';

// Limits to prevent context overflow
const MAX_ENTRIES = 500;
const MAX_RECURSIVE_DEPTH = 4;

interface ListDirArgs extends Record<string, unknown> {
  /** The absolute path to the directory to list (must be absolute, not relative) */
  path: string;
  /** List of glob patterns to ignore */
  ignore?: string[];
  /** Show hidden files starting with "." (default: false) */
  showHidden?: boolean;
  /** List subdirectories recursively (default: false) */
  recursive?: boolean;
}

export const listDirTool: ToolDefinition<ListDirArgs> = {
  name: 'ls',
  description: `List files and directories in a given path.

## When to Use
- **Explore structure**: Understand directory layout before making changes
- **Find files**: When you know the directory but not exact filenames
- **Verify paths**: Confirm directories exist before operations

## Key Difference from Glob
- **ls**: Lists contents of a specific directory (with optional recursion)
- **glob**: Finds files matching a pattern across the entire workspace

Use ls when exploring a known directory. Use glob when searching by pattern.

## Parameters
- **path** (required): Absolute path to the directory to list
- **ignore**: Glob patterns to exclude (e.g., ["node_modules", "*.log"])
- **showHidden**: Include hidden files starting with "." (default: false)
- **recursive**: List subdirectories recursively up to ${MAX_RECURSIVE_DEPTH} levels (default: false)

## Output Format
- Directories end with "/" (e.g., "src/")
- Files listed without suffix
- Sorted: directories first, then files alphabetically

## Workflow Integration
Use ls as part of exploration:
\`\`\`
ls(workspace) → understand structure
ls(src/) → find relevant directories
glob("**/*.ts") → find specific files
read(files) → understand code
\`\`\`

## Platform Notes
- Windows: Use paths like "C:\\Users\\..." or workspace-relative
- Unix/Mac: Use paths like "/home/user/..." or workspace-relative
- Do NOT use "/" alone on Windows - use the full workspace path`,
  requiresApproval: false,
  category: 'file-read',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['list', 'directory', 'folder', 'files', 'contents', 'ls', 'tree', 'browse', 'explore', 'structure'],
  ui: {
    icon: 'folder-open',
    label: 'List',
    color: 'blue',
    runningLabel: 'Listing directory...',
    completedLabel: 'Listed directory',
  },
  schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The absolute path to the directory to list (must be absolute, not relative)',
      },
      ignore: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of glob patterns to ignore',
      },
      showHidden: {
        type: 'boolean',
        description: 'Show hidden files (default: false)',
      },
      recursive: {
        type: 'boolean',
        description: 'List recursively (default: false)',
      },
    },
    required: ['path'],
  },

  inputExamples: [
    // Example 1: List project root (Unix)
    {
      path: '/home/user/myproject',
    },
    // Example 2: List project root (Windows)
    {
      path: 'C:\\Users\\user\\projects\\myproject',
    },
    // Example 3: List specific directory (Unix)
    {
      path: '/home/user/myproject/src/components',
    },
    // Example 4: List specific directory (Windows)
    {
      path: 'C:\\Users\\user\\projects\\myproject\\src\\components',
    },
    // Example 5: List with ignore patterns
    {
      path: '/home/user/project',
      ignore: ['node_modules', '*.log', 'dist/**'],
    },
    // Example 6: List with hidden files
    {
      path: '/home/user/project',
      showHidden: true,
    },
    // Example 7: List recursively
    {
      path: '/home/user/project/src',
      recursive: true,
      ignore: ['__tests__', '*.test.ts'],
    },
  ],

  async execute(args: ListDirArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'ls',
        success: false,
        output: `Error: No workspace selected for this session.\n\nThis directory operation requires an active workspace context.\n\nPossible causes:\n1. The session's workspace was deleted or removed\n2. The session was created without a workspace binding\n\nSolution: Create a new session after selecting a workspace.`,
      };
    }

    // Support path parameter
    const targetPath = args.path?.trim();
    
    if (!targetPath) {
      return {
        toolName: 'ls',
        success: false,
        output: 'Error: Invalid path argument. Path must be an absolute path to the directory.',
      };
    }

    // Note: Unix-style root paths like "/" are now handled by resolvePath()
    // which converts them to workspace-relative paths on Windows

    const dirPath = resolvePath(context.workspacePath, targetPath, {
      allowOutsideWorkspace: context.allowOutsideWorkspace,
    });
    const showHidden = args.showHidden === true;
    const recursive = args.recursive === true;
    const ignorePatterns = args.ignore || [];
    
    // Build ignore pattern matchers
    const shouldIgnore = (name: string): boolean => {
      if (ignorePatterns.length === 0) return false;
      return ignorePatterns.some(pattern => {
        // Simple glob matching: * matches any characters, ** matches directories
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*');
        return new RegExp(`^${regexPattern}$`).test(name);
      });
    };

    try {
      const allEntries: string[] = [];
      let wasTruncated = false;
      
      // Helper to list directory (with recursion support)
      const listDir = async (dir: string, prefix: string, depth: number): Promise<void> => {
        // Check for cancellation
        if (checkCancellation(context.signal)) {
          return;
        }
        
        if (allEntries.length >= MAX_ENTRIES) {
          wasTruncated = true;
          return;
        }
        
        if (recursive && depth > MAX_RECURSIVE_DEPTH) {
          allEntries.push(`${prefix}... (max depth ${MAX_RECURSIVE_DEPTH} reached)`);
          return;
        }
        
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        // Filter and sort entries
        const filtered = entries
          .filter((entry) => {
            // Filter hidden files
            if (!showHidden && entry.name.startsWith('.')) return false;
            // Filter by ignore patterns
            if (shouldIgnore(entry.name)) return false;
            return true;
          })
          .sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          });
        
        for (const entry of filtered) {
          if (allEntries.length >= MAX_ENTRIES) {
            wasTruncated = true;
            break;
          }
          
          if (entry.isDirectory()) {
            allEntries.push(`${prefix}${entry.name}/`);
            if (recursive) {
              await listDir(join(dir, entry.name), `${prefix}${entry.name}/`, depth + 1);
            }
          } else {
            allEntries.push(`${prefix}${entry.name}`);
          }
        }
      };
      
      await listDir(dirPath, '', 0);

      // Check for cancellation after listing
      if (checkCancellation(context.signal)) {
        return formatCancelled('ls', `Listed ${allEntries.length} entries before cancellation`, { path: targetPath });
      }

      if (allEntries.length === 0) {
        return {
          toolName: 'ls',
          success: true,
          output: `Directory is empty: ${targetPath}`,
          metadata: {
            path: targetPath,
            count: 0,
          },
        };
      }

      // Separate into directories and files for summary
      const dirs = allEntries.filter((f) => f.endsWith('/'));
      const files = allEntries.filter((f) => !f.endsWith('/'));
      
      let output = allEntries.join('\n');
      if (wasTruncated) {
        output += `\n\n... [Truncated: showing first ${MAX_ENTRIES} entries. Use specific subdirectory paths to see more.]`;
      }

      return {
        toolName: 'ls',
        success: true,
        output,
        metadata: {
          path: targetPath,
          count: allEntries.length,
          directories: dirs.length,
          files: files.length,
          wasTruncated,
        },
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        // Provide helpful suggestions for directory not found
        const pathParts = targetPath.split(/[/\\]/);
        const dirName = pathParts.pop() ?? targetPath;
        const parentPath = pathParts.join('/') || '.';
        
        let output = `═══ DIRECTORY NOT FOUND ═══\n\n`;
        output += `Requested: ${targetPath}\n`;
        output += `Resolved: ${dirPath}\n\n`;
        output += `═══ SUGGESTIONS ═══\n`;
        output += `• Check the path is correct (paths are case-sensitive)\n`;
        output += `• Use 'ls' on '${parentPath}' to see available directories\n`;
        output += `• Use 'glob' to search for '**/${dirName}/' to find similar directories`;
        
        return {
          toolName: 'ls',
          success: false,
          output,
        };
      }
      if (err.code === 'ENOTDIR') {
        return {
          toolName: 'ls',
          success: false,
          output: `═══ NOT A DIRECTORY ═══\n\nPath: ${targetPath}\n\nThe specified path is a file, not a directory.\n\n═══ SUGGESTIONS ═══\n• Use 'read' tool to view file contents\n• Remove the filename to list its parent directory`,
        };
      }
      if (err.code === 'EACCES') {
        return {
          toolName: 'ls',
          success: false,
          output: `═══ PERMISSION DENIED ═══\n\nPath: ${targetPath}\n\nCannot list directory contents due to permission restrictions.\n\n═══ SUGGESTIONS ═══\n• Check directory permissions\n• Try listing a parent directory`,
        };
      }
      return {
        toolName: 'ls',
        success: false,
        output: `═══ LIST ERROR ═══\n\nPath: ${targetPath}\nError: ${err.message}\nCode: ${err.code || 'unknown'}`,
      };
    }
  },
};
