/**
 * Bulk File Operations Tool
 * 
 * Performs multiple file operations (rename, move, copy, delete) in a single call.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolvePath } from '../../utils/fileSystem';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';
import { createLogger } from '../../logger';

const logger = createLogger('bulkOperations');

export type BulkOperationType = 'rename' | 'move' | 'copy' | 'delete';

export interface BulkOperation {
  type: BulkOperationType;
  source: string;
  destination?: string; // Required for rename, move, copy
}

interface BulkOperationsArgs extends Record<string, unknown> {
  operations: BulkOperation[];
  continueOnError?: boolean;
}

interface OperationResult {
  operation: BulkOperation;
  success: boolean;
  error?: string;
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    // Keep behavior tolerant, but don't silently swallow unexpected failures.
    if (err.code === 'EEXIST') return;
    logger.warn('Failed to ensure directory', {
      dirPath,
      code: err.code,
      error: err.message ?? String(error),
    });
    throw error;
  }
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  const stats = await fs.stat(src);
  
  if (stats.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      await copyRecursive(srcPath, destPath);
    }
  } else {
    await ensureDir(path.dirname(dest));
    await fs.copyFile(src, dest);
  }
}

async function deleteRecursive(targetPath: string): Promise<void> {
  const stats = await fs.stat(targetPath);
  
  if (stats.isDirectory()) {
    await fs.rm(targetPath, { recursive: true, force: true });
  } else {
    await fs.unlink(targetPath);
  }
}

export const bulkOperationsTool: ToolDefinition<BulkOperationsArgs> = {
  name: 'bulk',
  description: `Perform multiple file operations (rename, move, copy, delete) in a single call.

## When to Use
- **Refactoring**: Rename/move multiple files at once
- **Reorganizing**: Move files to new directory structure
- **Cleanup**: Delete multiple temporary files
- **Copying templates**: Copy multiple template files

## Operation Types
- **rename**: Rename a file or directory in place
- **move**: Move a file or directory to a new location
- **copy**: Copy a file or directory (recursive for directories)
- **delete**: Remove a file or directory (use with caution!)

## Parameters
- **operations** (required): Array of operations to perform
  - type: 'rename' | 'move' | 'copy' | 'delete'
  - source: Source file/directory path (relative to workspace)
  - destination: Target path (required for rename, move, copy)
- **continueOnError**: Continue with remaining operations if one fails (default: false)

## Workflow Integration
Use for batch refactoring:
\`\`\`
grep("OldName") → find files to rename
bulk([
  { type: "rename", source: "OldName.ts", destination: "NewName.ts" },
  { type: "move", source: "src/old/", destination: "src/new/" }
])
grep("OldName") → verify no remaining references
\`\`\`

## Safety
- Requires user approval
- Operations execute sequentially (not parallel)
- Use continueOnError: true for non-critical operations
- Maximum 50 operations per call

## Best Practices
- Verify source files exist before bulk operations
- Use continueOnError for cleanup operations
- Check results for partial failures`,
  requiresApproval: true,
  category: 'file-write',
  deferLoading: true,
  searchKeywords: ['bulk', 'batch', 'multiple files', 'rename', 'move', 'copy', 'delete', 'refactor', 'reorganize', 'cleanup'],
  ui: {
    icon: 'layers',
    label: 'Bulk',
    color: 'orange',
    runningLabel: 'Processing operations...',
    completedLabel: 'Operations complete',
  },
  riskLevel: 'dangerous',
  allowedCallers: ['direct'],
  schema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['rename', 'move', 'copy', 'delete'] },
            source: { type: 'string' },
            destination: { type: 'string' },
          },
          required: ['type', 'source'],
        },
        description: 'Array of operations with {type, source, destination?}',
      },
      continueOnError: {
        type: 'boolean',
        description: 'Continue with remaining operations if one fails',
      },
    },
    required: ['operations'],
  },

  inputExamples: [
    {
      // Rename a file
      operations: [
        { type: 'rename', source: 'old-name.ts', destination: 'new-name.ts' },
      ],
    },
    {
      // Move multiple files
      operations: [
        { type: 'move', source: 'src/utils.ts', destination: 'lib/utils.ts' },
        { type: 'move', source: 'src/helpers.ts', destination: 'lib/helpers.ts' },
      ],
      continueOnError: true,
    },
    {
      // Copy and delete
      operations: [
        { type: 'copy', source: 'templates/component.tsx', destination: 'src/components/NewComponent.tsx' },
        { type: 'delete', source: 'temp/scratch.ts' },
      ],
    },
  ],

  async execute(args: BulkOperationsArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'bulk',
        success: false,
        output: '═══ NO WORKSPACE ═══\n\nPlease select a workspace before performing bulk operations.',
      };
    }

    if (!Array.isArray(args.operations) || args.operations.length === 0) {
      return {
        toolName: 'bulk',
        success: false,
        output: `═══ INVALID OPERATIONS ═══\n\nMust provide a non-empty array of operations.\n\n═══ EXAMPLE ═══\n{\n  operations: [\n    { type: "rename", source: "old.ts", destination: "new.ts" },\n    { type: "move", source: "src/file.ts", destination: "lib/file.ts" }\n  ]\n}`,
      };
    }
    
    // Validate operation count isn't excessive
    const MAX_OPERATIONS = 50;
    if (args.operations.length > MAX_OPERATIONS) {
      return {
        toolName: 'bulk',
        success: false,
        output: `═══ TOO MANY OPERATIONS ═══\n\nMaximum ${MAX_OPERATIONS} operations per call. You provided ${args.operations.length}.\n\n═══ SUGGESTION ═══\nSplit into multiple bulk calls.`,
      };
    }

    const continueOnError = args.continueOnError ?? false;
    const results: OperationResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const op of args.operations) {
      // Validate operation
      if (!op.type || !op.source) {
        results.push({
          operation: op,
          success: false,
          error: 'Missing required fields: type and source',
        });
        failCount++;
        if (!continueOnError) break;
        continue;
      }

      if (!['rename', 'move', 'copy', 'delete'].includes(op.type)) {
        results.push({
          operation: op,
          success: false,
          error: `Unknown operation type: ${op.type}. Valid types: rename, move, copy, delete`,
        });
        failCount++;
        if (!continueOnError) break;
        continue;
      }

      if (['rename', 'move', 'copy'].includes(op.type) && !op.destination) {
        results.push({
          operation: op,
          success: false,
          error: `Operation '${op.type}' requires a destination`,
        });
        failCount++;
        if (!continueOnError) break;
        continue;
      }

      const sourcePath = resolvePath(context.workspacePath, op.source, {
        allowOutsideWorkspace: context.allowOutsideWorkspace,
      });
      const destPath = op.destination 
        ? resolvePath(context.workspacePath, op.destination, {
            allowOutsideWorkspace: context.allowOutsideWorkspace,
          })
        : '';

      try {
        switch (op.type) {
          case 'rename':
          case 'move':
            await ensureDir(path.dirname(destPath));
            await fs.rename(sourcePath, destPath);
            results.push({ operation: op, success: true });
            successCount++;
            break;

          case 'copy':
            await copyRecursive(sourcePath, destPath);
            results.push({ operation: op, success: true });
            successCount++;
            break;

          case 'delete':
            await deleteRecursive(sourcePath);
            results.push({ operation: op, success: true });
            successCount++;
            break;

          default:
            results.push({
              operation: op,
              success: false,
              error: `Unknown operation type: ${op.type}`,
            });
            failCount++;
        }
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        let errorMsg = err.message;
        
        if (err.code === 'ENOENT') {
          errorMsg = `Source not found: ${op.source}`;
        } else if (err.code === 'EACCES') {
          errorMsg = `Permission denied: ${op.source}`;
        } else if (err.code === 'EEXIST') {
          errorMsg = `Destination already exists: ${op.destination}`;
        } else if (err.code === 'ENOTEMPTY') {
          errorMsg = `Directory not empty: ${op.destination}`;
        } else if (err.code === 'EPERM') {
          errorMsg = `Operation not permitted: ${op.source}`;
        }

        results.push({ operation: op, success: false, error: errorMsg });
        failCount++;
        if (!continueOnError) break;
      }
    }

    // Build output with visual formatting
    const lines: string[] = [];
    const allSucceeded = failCount === 0;
    const statusIcon = allSucceeded ? '[OK]' : (successCount > 0 ? '[!]' : '[ERR]');
    
    lines.push(`═══ BULK OPERATIONS ${statusIcon} ═══`);
    lines.push(`Succeeded: ${successCount} | Failed: ${failCount} | Total: ${args.operations.length}`);
    lines.push('');

    for (const result of results) {
      const status = result.success ? '[OK]' : '[ERR]';
      const op = result.operation;
      let desc = `${op.type}: ${op.source}`;
      if (op.destination) {
        desc += ` → ${op.destination}`;
      }
      lines.push(`${status} ${desc}`);
      if (result.error) {
        lines.push(`  └─ Error: ${result.error}`);
      }
    }

    const partialSuccess = successCount > 0 && failCount > 0;

    return {
      toolName: 'bulk',
      success: allSucceeded || partialSuccess,
      output: lines.join('\n'),
      metadata: {
        totalOperations: args.operations.length,
        successCount,
        failCount,
        results: results.map(r => ({
          type: r.operation.type,
          source: r.operation.source,
          destination: r.operation.destination,
          success: r.success,
          error: r.error,
        })),
      },
    };
  },
};
