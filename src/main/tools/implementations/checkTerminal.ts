/**
 * Check Terminal Tool
 * 
 * Gets the output and status of a running or completed terminal process.
 * Use this to check on background processes started with run_in_background.
 */
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

interface CheckTerminalArgs extends Record<string, unknown> {
  /** Process ID returned from the run command */
  pid: number;
  /** Only return new output since last check */
  incremental?: boolean;
  /** Regex pattern to filter output lines */
  filter?: string;
}

export const checkTerminalTool: ToolDefinition<CheckTerminalArgs> = {
  name: 'check_terminal',
  description: `Check the output and status of a terminal process. Use this to:
- Get output from background processes
- Check if a process is still running
- Filter output with regex patterns
- Get incremental output since last check`,
  requiresApproval: false,
  category: 'terminal',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['check', 'status', 'output', 'terminal', 'process', 'background', 'monitor'],
  schema: {
    type: 'object',
    properties: {
      pid: {
        type: 'number',
        description: 'Process ID returned from the run command',
      },
      incremental: {
        type: 'boolean',
        description: 'Only return new output since last check',
        default: false,
      },
      filter: {
        type: 'string',
        description: 'Regex pattern to filter output lines',
      },
    },
    required: ['pid'],
  },
  inputExamples: [
    { pid: 12345 },
    { pid: 12345, incremental: true },
    { pid: 12345, filter: 'error|warning' },
  ],
  ui: {
    icon: 'terminal',
    label: 'Check',
    color: 'cyan',
    runningLabel: 'Checking...',
    completedLabel: 'Check complete',
  },

  async execute(args: CheckTerminalArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { pid, incremental = false, filter } = args;

    if (typeof pid !== 'number' || pid <= 0) {
      return {
        success: false,
        output: `═══ INVALID PID ═══\n\nA valid process ID (positive number) is required.\n\n═══ USAGE ═══\n{ pid: 12345 }\n{ pid: 12345, incremental: true }\n{ pid: 12345, filter: "error|warning" }`,
        toolName: 'check_terminal',
      };
    }

    try {
      const result = context.terminalManager.getOutput(pid, {
        incrementalOnly: incremental,
        filter,
      });

      if (!result) {
        return {
          success: false,
          output: `═══ PROCESS NOT FOUND ═══\n\nPID: ${pid}\n\nThe process may have:\n• Already completed and been cleaned up\n• Never existed with this PID\n• Been started in a different session`,
          toolName: 'check_terminal',
          metadata: { pid },
        };
      }

      const isRunning = context.terminalManager.isRunning?.(pid) ?? (result.exitCode === null);
      const status = isRunning ? '● RUNNING' : '○ COMPLETED';
      
      const parts: string[] = [];
      parts.push(`═══ PROCESS ${pid} ═══`);
      parts.push(`Status: ${status}`);
      
      if (!isRunning && result.exitCode !== null) {
        const exitIcon = result.exitCode === 0 ? '✓' : '✗';
        parts.push(`Exit code: ${exitIcon} ${result.exitCode}`);
      }
      
      if (result.stdout) {
        parts.push(`\n═══ OUTPUT ═══\n${result.stdout}`);
      } else if (incremental) {
        parts.push('\n(no new output since last check)');
      } else {
        parts.push('\n(no output)');
      }

      if (result.stderr) {
        parts.push(`\n═══ ERRORS ═══\n${result.stderr}`);
      }

      return {
        success: true,
        output: parts.join('\n'),
        toolName: 'check_terminal',
        metadata: {
          pid,
          isRunning,
          exitCode: result.exitCode,
          command: result.command,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('Failed to check terminal', { error: errorMessage, pid });

      return {
        success: false,
        output: `═══ CHECK FAILED ═══\n\nPID: ${pid}\nError: ${errorMessage}`,
        toolName: 'check_terminal',
        metadata: { pid },
      };
    }
  },
};
