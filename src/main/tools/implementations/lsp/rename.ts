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
  description: `Rename a symbol across the workspace. Computes all required edits for safe refactoring.

## When to Use
- **Safe renaming**: Rename variables, functions, classes across all files
- **Refactoring preview**: See all changes before applying
- **Consistent updates**: Ensure all references are updated together

## Workflow Integration
Use for safe symbol renaming:
\`\`\`
lsp_references(file, line, col) → preview all usages
lsp_rename(file, line, col, new_name) → compute edits
[review the computed edits]
[apply edits using edit tool]
read_lints() → verify no errors
\`\`\`

## Important Notes
- This tool COMPUTES edits but does NOT apply them
- Review the computed edits before applying
- Use the edit tool to apply each change
- For simple renames, consider using bulk tool instead

## Parameters
- **file** (required): File path relative to workspace
- **line** (required): Line number (1-indexed)
- **column** (required): Column number (1-indexed)
- **new_name** (required): New name for the symbol

## Output
- Total number of edits required
- Files that will be modified
- Preview of each edit (line and new text)

## Best Practices
- Check lsp_references first to understand scope
- Review all computed edits before applying
- Apply edits file by file using edit tool
- Run read_lints after all changes`,
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
