/**
 * LSP Diagnostics Tool
 * 
 * Get diagnostics (errors, warnings) for files using language servers.
 */

import { relative } from 'node:path';
import { resolvePath } from '../../../utils/fileSystem';
import { getLSPManager } from '../../../lsp';
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';

interface DiagnosticsArgs extends Record<string, unknown> {
  /** File path(s) to check (relative to workspace) */
  files?: string[];
  /** Get all cached diagnostics from workspace */
  all?: boolean;
  /** Filter by severity: 'error', 'warning', 'info', 'hint' */
  severity?: 'error' | 'warning' | 'info' | 'hint';
}

export const lspDiagnosticsTool: ToolDefinition<DiagnosticsArgs> = {
  name: 'lsp_diagnostics',
  description: `Get diagnostics (errors, warnings) for files using language servers.

Use this to:
- Check for errors in specific files
- Get all workspace diagnostics
- Filter diagnostics by severity

Parameters:
- files (optional): Array of file paths to check
- all (optional): Get all cached diagnostics from workspace
- severity (optional): Filter by 'error', 'warning', 'info', or 'hint'

Returns formatted list of diagnostics with file, line, severity, and message.`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['diagnostics', 'errors', 'warnings', 'problems', 'issues', 'lint', 'lsp'],
  ui: {
    icon: 'alert-circle',
    label: 'Diagnostics',
    color: 'red',
    runningLabel: 'Getting diagnostics...',
    completedLabel: 'Diagnostics retrieved',
  },

  inputExamples: [
    { files: ['src/main.ts'] },
    { all: true, severity: 'error' },
  ],

  schema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'File paths to check (relative to workspace)',
        items: { type: 'string' },
      },
      all: {
        type: 'boolean',
        description: 'Get all cached diagnostics from workspace',
      },
      severity: {
        type: 'string',
        description: "Filter by severity: 'error', 'warning', 'info', 'hint'",
        enum: ['error', 'warning', 'info', 'hint'],
      },
    },
    required: [],
  },

  async execute(args: DiagnosticsArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'lsp_diagnostics',
        success: false,
        output: 'Error: No workspace selected.',
      };
    }

    const lspManager = getLSPManager();
    if (!lspManager) {
      return {
        toolName: 'lsp_diagnostics',
        success: false,
        output: 'Error: LSP manager not initialized.',
      };
    }

    try {
      let diagnostics;

      if (args.all) {
        // Get all cached diagnostics
        diagnostics = lspManager.getAllDiagnostics();
      } else if (args.files && args.files.length > 0) {
        // Get diagnostics for specific files
        diagnostics = [];
        for (const file of args.files) {
          const filePath = resolvePath(context.workspacePath, file, {
            allowOutsideWorkspace: context.allowOutsideWorkspace,
          });
          await lspManager.openDocument(filePath);
          const fileDiags = await lspManager.getDiagnostics(filePath);
          diagnostics.push(...fileDiags);
        }
      } else {
        return {
          toolName: 'lsp_diagnostics',
          success: false,
          output: "Error: Provide 'files' array or set 'all: true'.",
        };
      }

      // Filter by severity if specified
      if (args.severity) {
        diagnostics = diagnostics.filter(d => d.severity === args.severity);
      }

      if (diagnostics.length === 0) {
        const filterNote = args.severity ? ` (filtered by ${args.severity})` : '';
        return {
          toolName: 'lsp_diagnostics',
          success: true,
          output: `✓ No diagnostics found${filterNote}.`,
          metadata: { errorCount: 0, warningCount: 0 },
        };
      }

      // Group by file
      const byFile = new Map<string, typeof diagnostics>();
      for (const diag of diagnostics) {
        const relPath = relative(context.workspacePath, diag.filePath);
        if (!byFile.has(relPath)) {
          byFile.set(relPath, []);
        }
        byFile.get(relPath)!.push(diag);
      }

      // Count by severity
      const errorCount = diagnostics.filter(d => d.severity === 'error').length;
      const warningCount = diagnostics.filter(d => d.severity === 'warning').length;
      const infoCount = diagnostics.filter(d => d.severity === 'info').length;
      const hintCount = diagnostics.filter(d => d.severity === 'hint').length;

      const lines: string[] = [];

      for (const [file, fileDiags] of byFile) {
        lines.push(`\n${file}:`);
        for (const diag of fileDiags) {
          const icon = diag.severity === 'error' ? '✗' : 
                       diag.severity === 'warning' ? '⚠' : 
                       diag.severity === 'info' ? 'ℹ' : '💡';
          const code = diag.code ? ` [${diag.code}]` : '';
          lines.push(`  ${diag.line}:${diag.column}  ${icon} ${diag.message}${code}`);
        }
      }

      const summary = [];
      if (errorCount > 0) summary.push(`${errorCount} error(s)`);
      if (warningCount > 0) summary.push(`${warningCount} warning(s)`);
      if (infoCount > 0) summary.push(`${infoCount} info`);
      if (hintCount > 0) summary.push(`${hintCount} hint(s)`);

      lines.push(`\n${summary.join(', ')} in ${byFile.size} file(s)`);

      return {
        toolName: 'lsp_diagnostics',
        success: true,
        output: lines.join('\n'),
        metadata: {
          errorCount,
          warningCount,
          infoCount,
          hintCount,
          fileCount: byFile.size,
          diagnostics,
        },
      };
    } catch (error) {
      return {
        toolName: 'lsp_diagnostics',
        success: false,
        output: `Error getting diagnostics: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
