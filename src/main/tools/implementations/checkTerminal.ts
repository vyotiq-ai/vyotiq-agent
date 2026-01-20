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
  description: `Check the output and status of a terminal process.

## When to Use
- **Monitor background processes**: Check on servers, watchers, builds
- **Get command output**: See what a background command produced
- **Verify process status**: Check if still running or completed
- **Debug issues**: See error output from failed commands

## Workflow Integration
Use with run's background mode:
\`\`\`
run("npm run dev", run_in_background: true) → get PID
[do other work]
check_terminal(pid) → see server output
[when done]
kill_terminal(pid) → stop server
\`\`\`

## Parameters
- **pid** (required): Process ID returned from run command
- **incremental**: Only return new output since last check (default: false)
- **filter**: Regex pattern to filter output lines

## Output
- Process status (RUNNING or COMPLETED)
- Exit code (if completed)
- stdout and stderr output
- Command that was run

## Tips
- Use incremental: true for long-running processes to avoid repeated output
- Use filter to find specific patterns (e.g., "error|warning")
- Check periodically for servers to ensure they started correctly`,
  requiresApproval: false,
  category: 'terminal',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],
  searchKeywords: ['check', 'status', 'output', 'terminal', 'process', 'background', 'monitor', 'server', 'watch'],
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
