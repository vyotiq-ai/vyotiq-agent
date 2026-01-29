/**
 * LSP Completions Tool
 * 
 * Get code completions at a position.
 */

import { resolvePath } from '../../../utils/fileSystem';
import { getLSPManager } from '../../../lsp';
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface CompletionsArgs extends Record<string, unknown> {
  /** File path (relative to workspace) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** Maximum number of completions to return (default: 20) */
  limit?: number;
}

export const lspCompletionsTool: ToolDefinition<CompletionsArgs> = {
  name: 'lsp_completions',
  description: `Get code completions at a specific position.

Use this to:
- See what methods/properties are available on an object
- Get suggestions for function arguments
- Complete import statements

Parameters:
- file (required): File path relative to workspace
- line (required): Line number (1-indexed)
- column (required): Column number (1-indexed)
- limit (optional): Maximum completions to return (default: 20)

Returns a list of completion suggestions with kind and documentation.`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['completions', 'autocomplete', 'suggestions', 'intellisense', 'lsp'],
  ui: {
    icon: 'sparkles',
    label: 'Completions',
    color: 'yellow',
    runningLabel: 'Getting completions...',
    completedLabel: 'Completions retrieved',
  },

  inputExamples: [
    { file: 'src/main.ts', line: 10, column: 15 },
    { file: 'src/utils/helpers.ts', line: 25, column: 8, limit: 10 },
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
      limit: {
        type: 'number',
        description: 'Maximum completions to return (default: 20)',
      },
    },
    required: ['file', 'line', 'column'],
  },

  async execute(args: CompletionsArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'lsp_completions',
        success: false,
        output: 'Error: No workspace selected.',
      };
    }

    const lspManager = getLSPManager();
    if (!lspManager) {
      return {
        toolName: 'lsp_completions',
        success: false,
        output: 'Error: LSP manager not initialized.',
      };
    }

    const filePath = resolvePath(context.workspacePath, args.file, {
      allowOutsideWorkspace: context.allowOutsideWorkspace,
    });

    const limit = args.limit || 20;

    try {
      // Ensure document is open
      await lspManager.openDocument(filePath);

      const completions = await lspManager.getCompletions(filePath, args.line, args.column);

      if (!completions || completions.length === 0) {
        return {
          toolName: 'lsp_completions',
          success: true,
          output: `No completions available at ${args.file}:${args.line}:${args.column}`,
        };
      }

      const limited = completions.slice(0, limit);
      const lines: string[] = [`${completions.length} completion(s) at ${args.file}:${args.line}:${args.column}:\n`];

      for (const item of limited) {
        const detail = item.detail ? ` - ${item.detail}` : '';
        lines.push(`  ${item.kind} ${item.label}${detail}`);
        
        if (item.documentation) {
          // Truncate long documentation
          const doc = item.documentation.length > 100 
            ? item.documentation.slice(0, 100) + '...'
            : item.documentation;
          lines.push(`    ${doc}`);
        }
      }

      if (completions.length > limit) {
        lines.push(`\n  ... and ${completions.length - limit} more`);
      }

      return {
        toolName: 'lsp_completions',
        success: true,
        output: lines.join('\n'),
        metadata: { 
          totalCompletions: completions.length,
          completions: limited,
        },
      };
    } catch (error) {
      return {
        toolName: 'lsp_completions',
        success: false,
        output: `Error getting completions: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
