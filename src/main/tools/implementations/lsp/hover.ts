/**
 * LSP Hover Tool
 * 
 * Get type information and documentation for a symbol at a position.
 */

import { resolvePath } from '../../../utils/fileSystem';
import { getLSPManager } from '../../../lsp';
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface HoverArgs extends Record<string, unknown> {
  /** File path (relative to workspace) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
}

export const lspHoverTool: ToolDefinition<HoverArgs> = {
  name: 'lsp_hover',
  description: `Get type information and documentation for a symbol at a specific position.

## When to Use
- **Understand types**: See what type a variable or expression has
- **Read docs**: Get documentation for functions, classes, or methods
- **API exploration**: Understand function signatures and parameters
- **Quick info**: Get information without navigating away

## Workflow Integration
Use for understanding before editing:
\`\`\`
read(file) → see the code
lsp_hover(file, line, col) → understand types/docs
[make informed changes]
edit(file, old, new) → apply changes
read_lints() → verify
\`\`\`

## When to Use vs Other LSP Tools
- **lsp_hover**: Quick type info and docs (no navigation)
- **lsp_definition**: Navigate to where symbol is defined
- **lsp_references**: Find all usages of a symbol
- **lsp_symbols**: Get file outline or search workspace

## Parameters
- **file** (required): File path relative to workspace
- **line** (required): Line number (1-indexed)
- **column** (required): Column number (1-indexed)

## Returns
- Type information for the symbol
- Documentation/JSDoc if available
- Function signatures
- Range of the symbol`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['hover', 'type', 'info', 'documentation', 'signature', 'lsp'],
  ui: {
    icon: 'info',
    label: 'Hover Info',
    color: 'blue',
    runningLabel: 'Getting hover info...',
    completedLabel: 'Hover info retrieved',
  },

  inputExamples: [
    { file: 'src/main.ts', line: 10, column: 15 },
    { file: 'src/utils/helpers.ts', line: 25, column: 8 },
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
    },
    required: ['file', 'line', 'column'],
  },

  async execute(args: HoverArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'lsp_hover',
        success: false,
        output: 'Error: No workspace selected.',
      };
    }

    const lspManager = getLSPManager();
    if (!lspManager) {
      return {
        toolName: 'lsp_hover',
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

      const hover = await lspManager.getHover(filePath, args.line, args.column);

      if (!hover || !hover.contents) {
        return {
          toolName: 'lsp_hover',
          success: true,
          output: `No hover information available at ${args.file}:${args.line}:${args.column}`,
        };
      }

      let output = `Hover info at ${args.file}:${args.line}:${args.column}\n\n`;
      output += hover.contents;

      if (hover.range) {
        output += `\n\nRange: ${hover.range.startLine}:${hover.range.startColumn} - ${hover.range.endLine}:${hover.range.endColumn}`;
      }

      return {
        toolName: 'lsp_hover',
        success: true,
        output,
        metadata: { hover },
      };
    } catch (error) {
      return {
        toolName: 'lsp_hover',
        success: false,
        output: `Error getting hover info: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
