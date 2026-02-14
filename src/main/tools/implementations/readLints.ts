/**
 * Read Lints Tool
 * 
 * Runs ESLint on specified files and returns linting errors/warnings.
 * This tool helps the agent verify code quality after making changes.
 */
import { relative, isAbsolute } from 'node:path';
import { promises as fs } from 'node:fs';
import { resolvePath } from '../../utils/fileSystem';
import { createLogger } from '../../logger';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

const logger = createLogger('read_lints');

interface ReadLintsArgs extends Record<string, unknown> {
  /** File paths to check for linting errors (relative to workspace) */
  files: string[];
  /** Whether to include warnings (default: true) */
  include_warnings?: boolean;
  /** Whether to attempt auto-fix (default: false) */
  fix?: boolean;
}

interface LintMessage {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  ruleId: string | null;
}

interface LintResult {
  filePath: string;
  messages: LintMessage[];
  errorCount: number;
  warningCount: number;
}

export const readLintsTool: ToolDefinition<ReadLintsArgs> = {
  name: 'read_lints',
  description: `Read linting errors and warnings from specified files using ESLint/TypeScript.

## CRITICAL: Use After Every Edit
This is an essential verification step. Run read_lints() after EVERY file edit to catch issues immediately.

## When to Use
- **After editing files**: Verify no syntax/type errors introduced
- **Before completing tasks**: Ensure code quality
- **Debugging issues**: Find and understand errors
- **Pre-commit check**: Validate all changed files

## Workflow Integration
This is the VERIFY step in the core loop:
\`\`\`
read(file) → understand code
edit(file, old, new) → make change
read_lints([file]) → VERIFY no errors
[if errors] → fix immediately
[if clean] → continue to next task
\`\`\`

## Parameters
- **files** (required): Array of file paths to check (relative to workspace)
- **include_warnings**: Include warnings in output (default: true)
- **fix**: Attempt to auto-fix issues (default: false)

## Output
- File path with line:column for each issue
- Severity indicator ([ERR] error, [WARN] warning)
- Message and rule ID
- Summary of total errors/warnings

## Best Practices
- Check files immediately after editing
- Fix errors before moving to next task
- Don't accumulate technical debt
- Use fix: true for auto-fixable issues`,
  requiresApproval: false,
  category: 'code-intelligence',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['lint', 'eslint', 'error', 'warning', 'check', 'validate', 'code quality', 'diagnostics', 'verify', 'typescript'],
  ui: {
    icon: 'alert-triangle',
    label: 'Lint',
    color: 'amber',
    runningLabel: 'Checking lint...',
    completedLabel: 'Lint complete',
  },
  
  inputExamples: [
    { files: ['src/main/agent/systemPrompt.ts'] },
    { files: ['src/renderer/App.tsx', 'src/renderer/main.tsx'], include_warnings: false },
    { files: ['src/utils/helpers.ts'], fix: true },
  ],
  
  schema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'File paths to check for linting errors (relative to workspace)',
        items: { type: 'string' },
      },
      include_warnings: {
        type: 'boolean',
        description: 'Whether to include warnings in output (default: true)',
      },
      fix: {
        type: 'boolean',
        description: 'Whether to attempt auto-fix (default: false)',
      },
    },
    required: ['files'],
  },

  async execute(args: ReadLintsArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (!context.workspacePath) {
      return {
        toolName: 'read_lints',
        success: false,
        output: 'Error: No workspace selected. Linting requires an active workspace.',
      };
    }

    if (!args.files || !Array.isArray(args.files) || args.files.length === 0) {
      return {
        toolName: 'read_lints',
        success: false,
        output: 'Error: No files specified. Provide an array of file paths to check.',
      };
    }

    const includeWarnings = args.include_warnings !== false;
    const fix = args.fix === true;

    // Resolve file paths
    const resolvedFiles: string[] = [];
    for (const file of args.files) {
      const resolved = resolvePath(context.workspacePath, file, {
        allowOutsideWorkspace: context.allowOutsideWorkspace,
      });
      try {
        await fs.access(resolved);
        resolvedFiles.push(resolved);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
          context.logger.warn(`File not found: ${file}`);
        } else {
          logger.debug('Failed to access file for linting', {
            file,
            resolved,
            code: err.code,
            error: err.message,
          });
          context.logger.warn(`File not accessible: ${file}`);
        }
      }
    }

    if (resolvedFiles.length === 0) {
      return {
        toolName: 'read_lints',
        success: false,
        output: 'Error: None of the specified files exist.',
      };
    }

    try {
      // Run ESLint via terminal command for reliability
      // Quote each file path to prevent shell injection
      const quotedFiles = resolvedFiles.map(f => `"${f.replace(/"/g, '\\"')}"`);
      const eslintArgs = [
        'npx', 'eslint',
        '--format', 'json',
        ...quotedFiles,
      ];
      
      if (fix) {
        eslintArgs.push('--fix');
      }

      const result = await context.terminalManager.run(
        eslintArgs.join(' '),
        {
          cwd: context.workspacePath,
          waitForExit: true,
          timeout: 60000,
        }
      );

      // Parse ESLint JSON output
      let lintResults: LintResult[] = [];
      
      // ESLint outputs JSON to stdout
      const output = result.stdout || result.stderr;
      
      // Try to find JSON in the output
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          lintResults = JSON.parse(jsonMatch[0]);
        } catch (error) {
          // If JSON parsing fails, try running with simpler format
          logger.debug('Failed to parse ESLint JSON output; falling back to simple lint', {
            error: error instanceof Error ? error.message : String(error),
          });
          return await runSimpleLint(args.files, context, includeWarnings);
        }
      } else if (result.exitCode === 0) {
        // No issues found
        return {
          toolName: 'read_lints',
          success: true,
          output: `[OK] No linting issues found in ${resolvedFiles.length} file(s).`,
          metadata: {
            filesChecked: resolvedFiles.length,
            errorCount: 0,
            warningCount: 0,
          },
        };
      } else {
        // Fallback to simple lint
        return await runSimpleLint(resolvedFiles, context, includeWarnings);
      }

      // Format results
      return formatLintResults(lintResults, context.workspacePath, includeWarnings, fix);
      
    } catch (error) {
      const err = error as Error;
      const isTimeout = err.message.includes('timed out') || err.message.includes('timeout');
      context.logger.error('ESLint execution failed', { error: err.message, isTimeout });
      
      // If the first attempt timed out, don't try more slow operations
      if (isTimeout) {
        return {
          toolName: 'read_lints',
          success: false,
          output: `Error: Lint check timed out. This may happen if ESLint needs to be installed or configured. Consider running 'npm install' first, or try again with a shorter file list.`,
          metadata: {
            error: 'timeout',
            filesAttempted: resolvedFiles.length,
          },
        };
      }
      
      // Only try fallback for non-timeout errors
      return await runTypeCheck(args.files, context);
    }
  },
};

/**
 * Run a simpler lint check using ESLint stylish format
 */
async function runSimpleLint(
  files: string[],
  context: ToolExecutionContext,
  includeWarnings: boolean
): Promise<ToolExecutionResult> {
  const quotedFiles = files.map(f => `"${f.replace(/"/g, '\\"')}"`);
  const result = await context.terminalManager.run(
    `npx eslint ${quotedFiles.join(' ')}`,
    {
      cwd: context.workspacePath,
      waitForExit: true,
      timeout: 30000, // Reduced timeout since this is a fallback
    }
  );

  const output = result.stdout + result.stderr;
  
  // Check for timeout indication
  if (output.includes('timed out') || result.exitCode === -1) {
    return {
      toolName: 'read_lints',
      success: false,
      output: `Error: Lint check timed out. ESLint may need installation or configuration.`,
      metadata: {
        error: 'timeout',
        filesAttempted: files.length,
      },
    };
  }
  
  if (result.exitCode === 0 || !output.trim()) {
    return {
      toolName: 'read_lints',
      success: true,
      output: `[OK] No linting issues found in ${files.length} file(s).`,
      metadata: {
        filesChecked: files.length,
        errorCount: 0,
        warningCount: 0,
      },
    };
  }

  // Filter warnings if needed
  let filteredOutput = output;
  if (!includeWarnings) {
    filteredOutput = output
      .split('\n')
      .filter(line => !line.includes('warning'))
      .join('\n');
  }

  return {
    toolName: 'read_lints',
    success: true,
    output: filteredOutput || '[OK] No errors found (warnings filtered).',
    metadata: {
      filesChecked: files.length,
      rawOutput: true,
    },
  };
}

/**
 * Run TypeScript type checking as fallback
 */
async function runTypeCheck(
  files: string[],
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const result = await context.terminalManager.run(
      `npx tsc --noEmit ${files.join(' ')}`,
      {
        cwd: context.workspacePath,
        waitForExit: true,
        timeout: 30000, // Reduced timeout since this is a fallback
      }
    );

    const output = result.stdout + result.stderr;
    
    // Check for timeout indication
    if (output.includes('timed out') || result.exitCode === -1) {
      return {
        toolName: 'read_lints',
        success: false,
        output: `Error: TypeScript check timed out. TypeScript may need installation.`,
        metadata: {
          error: 'timeout',
          filesAttempted: files.length,
          checkType: 'typescript',
        },
      };
    }
    
    if (result.exitCode === 0 || !output.trim()) {
      return {
        toolName: 'read_lints',
        success: true,
        output: `[OK] No TypeScript errors found in ${files.length} file(s).`,
        metadata: {
          filesChecked: files.length,
          errorCount: 0,
          checkType: 'typescript',
        },
      };
    }

    return {
      toolName: 'read_lints',
      success: true,
      output: `TypeScript errors:\n${output}`,
      metadata: {
        filesChecked: files.length,
        checkType: 'typescript',
      },
    };
  } catch (error) {
    const err = error as Error;
    const isTimeout = err.message.includes('timed out') || err.message.includes('timeout');
    
    if (isTimeout) {
      return {
        toolName: 'read_lints',
        success: false,
        output: `Error: TypeScript check timed out. TypeScript may need installation.`,
        metadata: {
          error: 'timeout',
          filesAttempted: files.length,
          checkType: 'typescript',
        },
      };
    }
    
    return {
      toolName: 'read_lints',
      success: false,
      output: 'Error: Could not run linting. Make sure ESLint or TypeScript is installed.',
    };
  }
}

/**
 * Format ESLint JSON results into readable output
 */
function formatLintResults(
  results: LintResult[],
  workspacePath: string,
  includeWarnings: boolean,
  wasFixed: boolean
): ToolExecutionResult {
  let totalErrors = 0;
  let totalWarnings = 0;
  const outputLines: string[] = [];

  for (const result of results) {
    const relativePath = isAbsolute(result.filePath)
      ? relative(workspacePath, result.filePath)
      : result.filePath;
    
    const messages = includeWarnings
      ? result.messages
      : result.messages.filter(m => m.severity === 'error');
    
    if (messages.length === 0) continue;

    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;

    outputLines.push(`\n${relativePath}:`);
    
    for (const msg of messages) {
      const severity = msg.severity === 'error' ? '[ERR]' : '[WARN]';
      const rule = msg.ruleId ? ` (${msg.ruleId})` : '';
      outputLines.push(`  ${msg.line}:${msg.column}  ${severity} ${msg.message}${rule}`);
    }
  }

  if (outputLines.length === 0) {
    const fixNote = wasFixed ? ' (some issues were auto-fixed)' : '';
    return {
      toolName: 'read_lints',
      success: true,
      output: `[OK] No linting issues found${fixNote}.`,
      metadata: {
        errorCount: 0,
        warningCount: 0,
        wasFixed,
      },
    };
  }

  const summary = `\n\n${totalErrors} error(s), ${totalWarnings} warning(s)`;
  const fixNote = wasFixed ? '\n(Some issues were auto-fixed)' : '';

  return {
    toolName: 'read_lints',
    success: true,
    output: outputLines.join('\n') + summary + fixNote,
    metadata: {
      errorCount: totalErrors,
      warningCount: totalWarnings,
      filesWithIssues: results.filter(r => r.messages.length > 0).length,
      wasFixed,
    },
  };
}
