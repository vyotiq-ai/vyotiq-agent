/**
 * LSP Rename Tool
 * 
 * Rename a symbol across the workspace.
 */

import { relative } from 'node:path';
import { resolvePath } from '../../../utils/fileSystem';
import { getLSPManager } from '../../../lsp';
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface RenameArgs extends Record<string, unknown> {
  /** File path (relative to workspace) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** New name for the symbol */
  new_name: string;
}

export const lspRenameTool: ToolDefinition<RenameArgs> = {
  name: 'lsp_rename',
  description: `Rename a symbol across the workspace.

Use this to:
- Safely rename variables, functions, classes, etc.
- Get all the edits needed to rename a symbol
- Preview changes before applying them

Parameters:
- file (required): File path relative to workspace
- line (required): Line number (1-indexed)
- column (required): Column number (1-indexed)
- new_name (required): New name for the symbol

Returns the list of edits needed to perform the rename.
Note: This tool returns the edits but does NOT apply them. Use the edit tool to apply.`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['rename', 'refactor', 'symbol', 'name', 'lsp'],
  ui: {
    icon: 'pencil',
    label: 'Rename Symbol',
    color: 'violet',
    runningLabel: 'Computing rename...',
    completedLabel: 'Rename computed',
  },

  inputExamples: [
    { file: 'src/main.ts', line: 10, column: 15, new_name: 'newFunctionName' },
  ],

  schema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'File path relative to workspace',
      },
      line: {
        type: 'number',
        description: 'Line number (1-indexed)',
      },
      column: {
        type: 'number',
        description: 'Column number (1-indexed)',
      },
      new_name: {
        type: 'string',
        description: 'New name for the symbol',
      },
    },
    required: ['file', 'line', 'column', 'new_name'],
  },

  async execute(args: RenameArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'lsp_rename',
        success: false,
        output: 'Error: No workspace selected.',
      };
    }

    const lspManager = getLSPManager();
    if (!lspManager) {
      return {
        toolName: 'lsp_rename',
        success: false,
        output: 'Error: LSP manager not initialized.',
      };
    }

    const filePath = resolvePath(context.workspacePath, args.file, {
      allowOutsideWorkspace: context.allowOutsideWorkspace,
    });

    try {
      // Ensure document is open
      await lspManager.openDocument(filePath);

      const result = await lspManager.renameSymbol(
        filePath,
        args.line,
        args.column,
        args.new_name
      );

      if (!result || result.length === 0) {
        return {
          toolName: 'lsp_rename',
          success: true,
          output: `Cannot rename symbol at ${args.file}:${args.line}:${args.column}`,
        };
      }

      // Count total edits
      let totalEdits = 0;
      for (const fileEdits of result) {
        totalEdits += fileEdits.edits.length;
      }

      const lines: string[] = [`Rename to "${args.new_name}" requires ${totalEdits} edit(s) in ${result.length} file(s):\n`];

      for (const fileEdits of result) {
        const relPath = relative(context.workspacePath, fileEdits.filePath);
        lines.push(`\n${relPath}: ${fileEdits.edits.length} edit(s)`);
        
        for (const edit of fileEdits.edits.slice(0, 5)) {
          lines.push(`  Line ${edit.range.startLine}: "${edit.newText}"`);
        }
        
        if (fileEdits.edits.length > 5) {
          lines.push(`  ... and ${fileEdits.edits.length - 5} more`);
        }
      }

      lines.push('\nNote: Use the edit tool to apply these changes.');

      return {
        toolName: 'lsp_rename',
        success: true,
        output: lines.join('\n'),
        metadata: { 
          totalEdits,
          fileCount: result.length,
          edits: result,
        },
      };
    } catch (error) {
      return {
        toolName: 'lsp_rename',
        success: false,
        output: `Error computing rename: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
