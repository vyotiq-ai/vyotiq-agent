/**
 * LSP Symbols Tool
 * 
 * Get document symbols (outline) or search workspace symbols.
 */

import { relative } from 'node:path';
import { resolvePath } from '../../../utils/fileSystem';
import { getLSPManager } from '../../../lsp';
import type { NormalizedSymbol } from '../../../lsp/types';
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface SymbolsArgs extends Record<string, unknown> {
  /** File path for document symbols, or omit for workspace search */
  file?: string;
  /** Query string for workspace symbol search */
  query?: string;
}

export const lspSymbolsTool: ToolDefinition<SymbolsArgs> = {
  name: 'lsp_symbols',
  description: `Get symbols from a document or search workspace symbols.

Use this to:
- Get an outline of a file (classes, functions, variables)
- Search for symbols across the entire workspace
- Navigate to specific code elements

Parameters:
- file (optional): File path for document symbols
- query (optional): Search query for workspace symbols

Provide 'file' for document outline, or 'query' for workspace search.`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['symbols', 'outline', 'structure', 'classes', 'functions', 'search', 'lsp'],
  ui: {
    icon: 'list-tree',
    label: 'Symbols',
    color: 'green',
    runningLabel: 'Getting symbols...',
    completedLabel: 'Symbols retrieved',
  },

  inputExamples: [
    { file: 'src/main.ts' },
    { query: 'handleClick' },
  ],

  schema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'File path for document symbols',
      },
      query: {
        type: 'string',
        description: 'Search query for workspace symbols',
      },
    },
    required: [],
  },

  async execute(args: SymbolsArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'lsp_symbols',
        success: false,
        output: 'Error: No workspace selected.',
      };
    }

    const lspManager = getLSPManager();
    if (!lspManager) {
      return {
        toolName: 'lsp_symbols',
        success: false,
        output: 'Error: LSP manager not initialized.',
      };
    }

    if (!args.file && !args.query) {
      return {
        toolName: 'lsp_symbols',
        success: false,
        output: "Error: Provide either 'file' for document symbols or 'query' for workspace search.",
      };
    }

    try {
      if (args.file) {
        // Document symbols
        const filePath = resolvePath(context.workspacePath, args.file, {
          allowOutsideWorkspace: context.allowOutsideWorkspace,
        });

        await lspManager.openDocument(filePath);
        const symbols = await lspManager.getDocumentSymbols(filePath);

        if (!symbols || symbols.length === 0) {
          return {
            toolName: 'lsp_symbols',
            success: true,
            output: `No symbols found in ${args.file}`,
          };
        }

        const lines: string[] = [`Symbols in ${args.file}:\n`];
        formatSymbols(symbols, lines, 0);

        return {
          toolName: 'lsp_symbols',
          success: true,
          output: lines.join('\n'),
          metadata: { symbols, file: args.file },
        };
      } else {
        // Workspace symbol search
        const symbols = await lspManager.searchWorkspaceSymbols(args.query!);

        if (!symbols || symbols.length === 0) {
          return {
            toolName: 'lsp_symbols',
            success: true,
            output: `No symbols found matching "${args.query}"`,
          };
        }

        const lines: string[] = [`Found ${symbols.length} symbol(s) matching "${args.query}":\n`];

        for (const sym of symbols.slice(0, 50)) {
          const relPath = relative(context.workspacePath, sym.filePath);
          const container = sym.containerName ? ` (in ${sym.containerName})` : '';
          lines.push(`  ${sym.kind} ${sym.name}${container}`);
          lines.push(`    ${relPath}:${sym.line}:${sym.column}`);
        }

        if (symbols.length > 50) {
          lines.push(`\n  ... and ${symbols.length - 50} more`);
        }

        return {
          toolName: 'lsp_symbols',
          success: true,
          output: lines.join('\n'),
          metadata: { symbols, query: args.query },
        };
      }
    } catch (error) {
      return {
        toolName: 'lsp_symbols',
        success: false,
        output: `Error getting symbols: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

function formatSymbols(symbols: NormalizedSymbol[], lines: string[], indent: number): void {
  const prefix = '  '.repeat(indent);
  
  for (const sym of symbols) {
    lines.push(`${prefix}${sym.kind} ${sym.name} (line ${sym.line})`);
    
    if (sym.children && sym.children.length > 0) {
      formatSymbols(sym.children, lines, indent + 1);
    }
  }
}
