/**
 * LSP Definition Tool
 * 
 * Find the definition of a symbol at a position.
 */

import { relative } from 'node:path';
import { resolvePath } from '../../../utils/fileSystem';
import { getLSPManager } from '../../../lsp';
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface DefinitionArgs extends Record<string, unknown> {
  /** File path (relative to workspace) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** Type of definition to find: 'definition', 'type', or 'implementation' */
  type?: 'definition' | 'type' | 'implementation';
}

export const lspDefinitionTool: ToolDefinition<DefinitionArgs> = {
  name: 'lsp_definition',
  description: `Find the definition location of a symbol at a specific position.

Use this to:
- Jump to where a function, class, or variable is defined
- Find the type definition of a variable
- Find implementations of an interface or abstract method

Parameters:
- file (required): File path relative to workspace
- line (required): Line number (1-indexed)
- column (required): Column number (1-indexed)
- type (optional): 'definition' (default), 'type', or 'implementation'

Returns the file path and position of the definition.`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['definition', 'goto', 'jump', 'find', 'declaration', 'type', 'implementation', 'lsp'],
  ui: {
    icon: 'navigation',
    label: 'Go to Definition',
    color: 'purple',
    runningLabel: 'Finding definition...',
    completedLabel: 'Definition found',
  },

  inputExamples: [
    { file: 'src/main.ts', line: 10, column: 15 },
    { file: 'src/utils/helpers.ts', line: 25, column: 8, type: 'type' },
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
      type: {
        type: 'string',
        description: "Type of definition: 'definition', 'type', or 'implementation'",
        enum: ['definition', 'type', 'implementation'],
      },
    },
    required: ['file', 'line', 'column'],
  },

  async execute(args: DefinitionArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'lsp_definition',
        success: false,
        output: 'Error: No workspace selected.',
      };
    }

    const lspManager = getLSPManager();
    if (!lspManager) {
      return {
        toolName: 'lsp_definition',
        success: false,
        output: 'Error: LSP manager not initialized.',
      };
    }

    const filePath = resolvePath(context.workspacePath, args.file, {
      allowOutsideWorkspace: context.allowOutsideWorkspace,
    });

    const defType = args.type || 'definition';

    try {
      // Ensure document is open
      await lspManager.openDocument(filePath);

      let locations;
      switch (defType) {
        case 'type':
          locations = await lspManager.getTypeDefinition(filePath, args.line, args.column);
          break;
        case 'implementation':
          locations = await lspManager.getImplementation(filePath, args.line, args.column);
          break;
        default:
          locations = await lspManager.getDefinition(filePath, args.line, args.column);
      }

      if (!locations || locations.length === 0) {
        return {
          toolName: 'lsp_definition',
          success: true,
          output: `No ${defType} found at ${args.file}:${args.line}:${args.column}`,
        };
      }

      const lines: string[] = [`Found ${locations.length} ${defType}(s):\n`];

      for (const loc of locations) {
        const relPath = relative(context.workspacePath, loc.filePath);
        lines.push(`  ${relPath}:${loc.line}:${loc.column}`);
      }

      return {
        toolName: 'lsp_definition',
        success: true,
        output: lines.join('\n'),
        metadata: { locations, type: defType },
      };
    } catch (error) {
      return {
        toolName: 'lsp_definition',
        success: false,
        output: `Error finding ${defType}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
