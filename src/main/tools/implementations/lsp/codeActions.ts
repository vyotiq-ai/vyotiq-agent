/**
 * LSP Code Actions Tool
 * 
 * Get available code actions (quick fixes, refactorings) for a range.
 */

import { resolvePath } from '../../../utils/fileSystem';
import { getLSPManager } from '../../../lsp';
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface CodeActionsArgs extends Record<string, unknown> {
  /** File path (relative to workspace) */
  file: string;
  /** Start line number (1-indexed) */
  start_line: number;
  /** Start column number (1-indexed) */
  start_column: number;
  /** End line number (1-indexed, defaults to start_line) */
  end_line?: number;
  /** End column number (1-indexed, defaults to start_column) */
  end_column?: number;
}

export const lspCodeActionsTool: ToolDefinition<CodeActionsArgs> = {
  name: 'lsp_code_actions',
  description: `Get available code actions (quick fixes, refactorings) for a code range.

Use this to:
- Find quick fixes for errors or warnings
- Get refactoring suggestions
- See available source actions (organize imports, etc.)

Parameters:
- file (required): File path relative to workspace
- start_line (required): Start line number (1-indexed)
- start_column (required): Start column number (1-indexed)
- end_line (optional): End line number (defaults to start_line)
- end_column (optional): End column number (defaults to start_column)

Returns a list of available code actions with their edits.`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['code actions', 'quick fix', 'refactor', 'fix', 'actions', 'lsp'],
  ui: {
    icon: 'wand-2',
    label: 'Code Actions',
    color: 'orange',
    runningLabel: 'Getting code actions...',
    completedLabel: 'Code actions retrieved',
  },

  inputExamples: [
    { file: 'src/main.ts', start_line: 10, start_column: 1 },
    { file: 'src/utils/helpers.ts', start_line: 25, start_column: 1, end_line: 30, end_column: 50 },
  ],

  schema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'File path relative to workspace',
      },
      start_line: {
        type: 'number',
        description: 'Start line number (1-indexed)',
      },
      start_column: {
        type: 'number',
        description: 'Start column number (1-indexed)',
      },
      end_line: {
        type: 'number',
        description: 'End line number (defaults to start_line)',
      },
      end_column: {
        type: 'number',
        description: 'End column number (defaults to start_column)',
      },
    },
    required: ['file', 'start_line', 'start_column'],
  },

  async execute(args: CodeActionsArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'lsp_code_actions',
        success: false,
        output: 'Error: No workspace selected.',
      };
    }

    const lspManager = getLSPManager();
    if (!lspManager) {
      return {
        toolName: 'lsp_code_actions',
        success: false,
        output: 'Error: LSP manager not initialized.',
      };
    }

    const filePath = resolvePath(context.workspacePath, args.file, {
      allowOutsideWorkspace: context.allowOutsideWorkspace,
    });

    const endLine = args.end_line || args.start_line;
    const endColumn = args.end_column || args.start_column;

    try {
      // Ensure document is open
      await lspManager.openDocument(filePath);

      const actions = await lspManager.getCodeActions(
        filePath,
        args.start_line,
        args.start_column,
        endLine,
        endColumn
      );

      if (!actions || actions.length === 0) {
        return {
          toolName: 'lsp_code_actions',
          success: true,
          output: `No code actions available at ${args.file}:${args.start_line}:${args.start_column}`,
        };
      }

      const lines: string[] = [`${actions.length} code action(s) available:\n`];

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const preferred = action.isPreferred ? ' ⭐' : '';
        const kind = action.kind ? ` [${action.kind}]` : '';
        lines.push(`${i + 1}. ${action.title}${kind}${preferred}`);
        
        if (action.edits && action.edits.length > 0) {
          lines.push(`   Edits: ${action.edits.length} change(s)`);
        }
      }

      return {
        toolName: 'lsp_code_actions',
        success: true,
        output: lines.join('\n'),
        metadata: { actions },
      };
    } catch (error) {
      return {
        toolName: 'lsp_code_actions',
        success: false,
        output: `Error getting code actions: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
