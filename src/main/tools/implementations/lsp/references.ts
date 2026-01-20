/**
 * LSP References Tool
 * 
 * Find all references to a symbol at a position.
 */

import { relative } from 'node:path';
import { resolvePath } from '../../../utils/fileSystem';
import { getLSPManager } from '../../../lsp';
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface ReferencesArgs extends Record<string, unknown> {
  /** File path (relative to workspace) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** Include the declaration in results (default: true) */
  include_declaration?: boolean;
}

export const lspReferencesTool: ToolDefinition<ReferencesArgs> = {
  name: 'lsp_references',
  description: `Find all references to a symbol at a specific position. Critical for safe refactoring.

## When to Use
- **Before renaming**: Find all usages to understand impact
- **Refactoring**: Identify all places that need changes
- **Understanding code**: See how a symbol is used throughout the codebase
- **Impact analysis**: Assess the scope of a change

## Workflow Integration
Use for safe refactoring:
\`\`\`
lsp_references(file, line, col) → find ALL usages
read(files_with_references) → understand each usage
[plan changes based on usage patterns]
edit(each_file) → make consistent changes
read_lints() → verify no errors
\`\`\`

## Refactoring Pattern
\`\`\`
lsp_definition → find where symbol is defined
lsp_references → find all usages
[for each reference]
  read(file) → understand context
  edit(file, old, new) → update usage
read_lints() → verify all changes
\`\`\`

## Parameters
- **file** (required): File path relative to workspace
- **line** (required): Line number (1-indexed)
- **column** (required): Column number (1-indexed)
- **include_declaration** (optional): Include the declaration itself (default: true)

## Output
- Total reference count
- References grouped by file
- Line and column for each reference

## Best Practices
- Always check references before renaming or removing symbols
- Use with lsp_definition to understand the full picture
- Consider all usages when changing function signatures`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['references', 'usages', 'find', 'all', 'occurrences', 'lsp'],
  ui: {
    icon: 'link',
    label: 'Find References',
    color: 'cyan',
    runningLabel: 'Finding references...',
    completedLabel: 'References found',
  },

  inputExamples: [
    { file: 'src/main.ts', line: 10, column: 15 },
    { file: 'src/utils/helpers.ts', line: 25, column: 8, include_declaration: false },
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
      include_declaration: {
        type: 'boolean',
        description: 'Include the declaration in results (default: true)',
      },
    },
    required: ['file', 'line', 'column'],
  },

  async execute(args: ReferencesArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'lsp_references',
        success: false,
        output: 'Error: No workspace selected.',
      };
    }

    const lspManager = getLSPManager();
    if (!lspManager) {
      return {
        toolName: 'lsp_references',
        success: false,
        output: 'Error: LSP manager not initialized.',
      };
    }

    const filePath = resolvePath(context.workspacePath, args.file, {
      allowOutsideWorkspace: context.allowOutsideWorkspace,
    });

    const includeDeclaration = args.include_declaration !== false;

    try {
      // Ensure document is open
      await lspManager.openDocument(filePath);

      const locations = await lspManager.getReferences(
        filePath,
        args.line,
        args.column,
        includeDeclaration
      );

      if (!locations || locations.length === 0) {
        return {
          toolName: 'lsp_references',
          success: true,
          output: `No references found at ${args.file}:${args.line}:${args.column}`,
        };
      }

      // Group by file
      const byFile = new Map<string, Array<{ line: number; column: number }>>();
      for (const loc of locations) {
        const relPath = relative(context.workspacePath, loc.filePath);
        if (!byFile.has(relPath)) {
          byFile.set(relPath, []);
        }
        byFile.get(relPath)!.push({ line: loc.line, column: loc.column });
      }

      const lines: string[] = [`Found ${locations.length} reference(s) in ${byFile.size} file(s):\n`];

      for (const [file, refs] of byFile) {
        lines.push(`\n${file}:`);
        for (const ref of refs) {
          lines.push(`  Line ${ref.line}, Column ${ref.column}`);
        }
      }

      return {
        toolName: 'lsp_references',
        success: true,
        output: lines.join('\n'),
        metadata: { 
          totalReferences: locations.length,
          fileCount: byFile.size,
          locations,
        },
      };
    } catch (error) {
      return {
        toolName: 'lsp_references',
        success: false,
        output: `Error finding references: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
