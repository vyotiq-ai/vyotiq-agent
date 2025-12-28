/**
 * Write File Tool
 * 
 * Writes a file to the local filesystem.
 * Supports creating new files and overwriting existing files.
 * Will create parent directories if they don't exist.
 */
import { promises as fs } from 'node:fs';
import { resolvePath, ensureDirectory } from '../../utils/fileSystem';
import { wasFileRead, getReadFilesCache } from '../fileTracker';
import { undoHistory } from '../../agent/undoHistory';
import { createLogger } from '../../logger';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

const logger = createLogger('write');

interface WriteFileArgs extends Record<string, unknown> {
  /** The absolute path to the file to write (must be absolute, not relative) */
  file_path: string;
  /** The content to write to the file */
  content: string;
  /** @deprecated Use file_path instead */
  path?: string;
  /** Create parent directories if they don't exist (default: true) */
  createDirectories?: boolean;
}

export const writeFileTool: ToolDefinition<WriteFileArgs> = {
  name: 'write',
  description: `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase using the Edit tool. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.
- Parent directories will be created automatically if they don't exist.

Parameters:
- file_path (required): The absolute path to the file to write (must be absolute, not relative)
- content (required): The content to write to the file

This tool requires user approval before execution.`,
  requiresApproval: true,
  category: 'file-write',
  riskLevel: 'moderate',
  allowedCallers: ['direct'], // Not safe for programmatic calling
  searchKeywords: [
    'write', 'create', 'file', 'new', 'save', 'output', 'overwrite',
  ],
  ui: {
    icon: 'file-plus',
    label: 'Write',
    color: 'orange',
    runningLabel: 'Writing file...',
    completedLabel: 'File written',
  },
  mustReadBeforeWrite: true,
  trackedReadsInSession: getReadFilesCache(),
  
  // Input examples for improved accuracy
  inputExamples: [
    // Example 1: Create simple TypeScript file
    {
      file_path: '/project/src/utils/constants.ts',
      content: 'export const API_URL = "https://api.example.com";\nexport const MAX_RETRIES = 3;',
    },
    // Example 2: Create configuration file
    {
      file_path: '/project/config/settings.json',
      content: '{\n  "debug": false,\n  "logLevel": "info"\n}',
    },
    // Example 3: Create React component
    {
      file_path: '/project/src/components/Button.tsx',
      content: `import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
}

export const Button: React.FC<ButtonProps> = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};`,
    },
  ],
  
  schema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to write (must be absolute, not relative)',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['file_path', 'content'],
  },

  async execute(args: WriteFileArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      context.logger.error('Write tool: No workspace path in context', {
        hasWorkspacePath: !!context.workspacePath,
      });
      return {
        toolName: 'write',
        success: false,
        output: `Error: No workspace selected for this session.\n\nThis file operation requires an active workspace context.\n\nPossible causes:\n1. The session's workspace was deleted or removed\n2. The session was created without a workspace binding\n\nSolution: Create a new session after selecting a workspace.`,
      };
    }

    // Support both file_path and legacy path parameter
    const pathArg = args.file_path || args.path;
    
    if (!pathArg || typeof pathArg !== 'string') {
      context.logger.error('Write tool: Invalid file_path argument', {
        pathArg,
        typeofPathArg: typeof pathArg,
      });
      return {
        toolName: 'write',
        success: false,
        output: 'Error: Invalid file_path argument. Path must be a non-empty string.',
      };
    }

    if (typeof args.content !== 'string') {
      context.logger.error('Write tool: Invalid content argument', {
        typeofContent: typeof args.content,
      });
      return {
        toolName: 'write',
        success: false,
        output: 'Error: Invalid content argument. Content must be a string.',
      };
    }

    let filePath: string;
    try {
      filePath = resolvePath(context.workspacePath, pathArg.trim(), {
        allowOutsideWorkspace: context.allowOutsideWorkspace,
      });
    } catch (pathError) {
      const err = pathError as Error;
      context.logger.error('Write tool: Path resolution failed', {
        path: pathArg,
        workspacePath: context.workspacePath,
        error: err.message,
      });
      return {
        toolName: 'write',
        success: false,
        output: `Error: Failed to resolve path: ${err.message}`,
      };
    }
    
    // Log the write operation with resolved path
    context.logger.info('Writing file', {
      inputPath: pathArg,
      resolvedPath: filePath,
      workspacePath: context.workspacePath,
      contentLength: args.content.length,
    });

    try {
      // Safety validation before write
      if (context.safetyManager && context.runId) {
        const safetyCheck = await context.safetyManager.validateFileOperation(
          'write',
          filePath,
          context.runId,
          args.content
        );
        
        if (!safetyCheck.allowed) {
          const reasons = safetyCheck.issues
            .filter(i => i.severity === 'block')
            .map(i => `• ${i.reason}`)
            .join('\n');
          context.logger.error('Write blocked by safety manager', {
            path: filePath,
            issues: safetyCheck.issues,
          });
          return {
            toolName: 'write',
            success: false,
            output: `Error: Write operation blocked by safety guardrails:\n${reasons}\n\nResolved path: ${filePath}`,
          };
        }
        
        // Log backup if created
        if (safetyCheck.backupPath) {
          context.logger.info('Auto-backup created before write', {
            originalPath: filePath,
            backupPath: safetyCheck.backupPath,
          });
        }
        
        // Log warnings (but don't block)
        const warnings = safetyCheck.issues.filter(i => i.severity === 'warn');
        if (warnings.length > 0) {
          context.logger.info('Write operation has safety warnings', {
            path: filePath,
            warnings: warnings.map(w => w.reason),
          });
        }
      }

      // Check if file exists - if so, verify it was read first
      let fileExists = false;
      let originalContent: string | undefined;
      try {
        await fs.access(filePath);
        fileExists = true;
        // Read original content for diff generation
        originalContent = await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        // File doesn't exist (ENOENT) - that's fine for new files.
        // Other failures (permissions, transient IO) should be observable.
        const err = error as NodeJS.ErrnoException;
        if (err.code && err.code !== 'ENOENT') {
          logger.debug('Failed to read existing file before write', {
            filePath,
            code: err.code,
            error: err.message,
          });
        }
      }
      
      // For existing files, warn if not read first (but don't block)
      if (fileExists && !wasFileRead(filePath)) {
        context.logger.info('Writing to existing file that was not read first', {
          path: pathArg,
          resolvedPath: filePath,
        });
        // Note: We log info but don't block - the approval flow handles safety
      }

      // Ensure directory exists (default behavior)
      if (args.createDirectories !== false) {
        context.logger.info('Ensuring directory exists', { filePath });
        await ensureDirectory(filePath);
      }

      // Write the file
      context.logger.info('Calling fs.writeFile', { filePath });
      await fs.writeFile(filePath, args.content, 'utf-8');
      context.logger.info('fs.writeFile completed successfully', { filePath });

      // Record change in undo history
      if (context.sessionId && context.runId) {
        try {
          await undoHistory.recordChange(
            context.sessionId,
            context.runId,
            filePath,
            fileExists ? 'modify' : 'create',
            originalContent ?? null,
            args.content,
            'write',
            `${fileExists ? 'Overwrote' : 'Created'} ${pathArg.split(/[/\\]/).pop() || pathArg}`
          );
        } catch (undoError) {
          context.logger.warn('Failed to record undo history', { error: (undoError as Error).message });
        }
      }

      // Verify the file was written
      try {
        const writtenStats = await fs.stat(filePath);
        context.logger.info('File write verified', {
          filePath,
          size: writtenStats.size,
          mtime: writtenStats.mtime,
        });
      } catch (verifyError) {
        context.logger.error('File write verification failed', {
          filePath,
          error: (verifyError as Error).message,
        });
      }

      const lineCount = args.content.split('\n').length;
      const byteCount = Buffer.byteLength(args.content, 'utf-8');
      const action = fileExists ? 'overwritten' : 'created';

      return {
        toolName: 'write',
        success: true,
        output: `Successfully ${action} ${pathArg} (${lineCount} lines, ${byteCount} bytes)\nResolved path: ${filePath}`,
        metadata: {
          path: pathArg,
          filePath: filePath,
          content: args.content,
          newContent: args.content,
          originalContent: originalContent, // Include original content for diff generation
          lineCount,
          byteCount,
          action: fileExists ? 'modified' : 'created',
        },
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      context.logger.error('Write tool: fs operation failed', {
        filePath,
        errorCode: err.code,
        errorMessage: err.message,
        stack: err.stack,
      });
      
      if (err.code === 'EACCES') {
        return {
          toolName: 'write',
          success: false,
          output: `═══ PERMISSION DENIED ═══\n\nFile: ${pathArg}\nResolved: ${filePath}\n\nCannot write to this location due to permission restrictions.\n\n═══ SUGGESTIONS ═══\n• Check file/folder permissions\n• The file may be read-only or locked by another process\n• Try a different location within the workspace`,
        };
      }
      if (err.code === 'ENOENT') {
        return {
          toolName: 'write',
          success: false,
          output: `═══ DIRECTORY NOT FOUND ═══\n\nFile: ${pathArg}\nResolved: ${filePath}\n\nThe parent directory does not exist.\n\n═══ SUGGESTIONS ═══\n• Ensure createDirectories is not set to false\n• Check the path is correct\n• Use 'ls' to verify the directory structure`,
        };
      }
      if (err.code === 'EISDIR') {
        return {
          toolName: 'write',
          success: false,
          output: `═══ PATH IS A DIRECTORY ═══\n\nFile: ${pathArg}\nResolved: ${filePath}\n\nThe path points to a directory, not a file.\n\n═══ SUGGESTIONS ═══\n• Add a filename to the end of the path\n• Example: ${pathArg}/filename.ext`,
        };
      }
      if (err.code === 'ENOSPC') {
        return {
          toolName: 'write',
          success: false,
          output: `═══ DISK FULL ═══\n\nFile: ${pathArg}\n\nNo space left on device. Cannot write file.\n\n═══ SUGGESTIONS ═══\n• Free up disk space\n• Check disk quota limits`,
        };
      }
      if (err.code === 'EROFS') {
        return {
          toolName: 'write',
          success: false,
          output: `═══ READ-ONLY FILESYSTEM ═══\n\nFile: ${pathArg}\n\nThe filesystem is mounted as read-only.\n\n═══ SUGGESTIONS ═══\n• Remount the filesystem with write permissions\n• Choose a different location`,
        };
      }
      if (err.code === 'ENAMETOOLONG') {
        return {
          toolName: 'write',
          success: false,
          output: `═══ PATH TOO LONG ═══\n\nThe file path exceeds system limits.\n\n═══ SUGGESTIONS ═══\n• Use a shorter filename\n• Reduce directory nesting`,
        };
      }
      return {
        toolName: 'write',
        success: false,
        output: `═══ WRITE ERROR ═══\n\nFile: ${pathArg}\nResolved: ${filePath}\nError: ${err.message}\nCode: ${err.code || 'unknown'}`,
      };
    }
  },
};
