/**
 * Kill Terminal Tool
 * 
 * Terminates a running terminal process.
 * Use this to stop background processes or hung commands.
 */
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

interface KillTerminalArgs extends Record<string, unknown> {
  /** Process ID to kill */
  pid: number;
}

export const killTerminalTool: ToolDefinition<KillTerminalArgs> = {
  name: 'kill_terminal',
  description: `Terminate a running terminal process.

## When to Use
- **Stop servers**: Kill dev servers when done testing
- **Stop watchers**: End file watchers or build watchers
- **Kill hung processes**: Terminate unresponsive commands
- **Clean up**: Stop processes before ending session

## Workflow Integration
Complete the terminal lifecycle:
\`\`\`
run("npm run dev", run_in_background: true) → start server, get PID
[do testing/development work]
check_terminal(pid) → verify server is running
[when done]
kill_terminal(pid) → stop server
\`\`\`

## Parameters
- **pid** (required): Process ID to kill (from run command output)

## Safety
- Requires user approval before execution
- Only kills processes started in current session
- Cannot kill system processes

## Common Use Cases
- Stop development servers (npm run dev, yarn start)
- End file watchers (webpack --watch, tsc --watch)
- Terminate test runners in watch mode
- Clean up after testing`,
  requiresApproval: true,
  category: 'terminal',
  riskLevel: 'moderate',
  allowedCallers: ['direct'],
  searchKeywords: ['kill', 'stop', 'terminate', 'end', 'process', 'cancel', 'server', 'watch'],
  schema: {
    type: 'object',
    properties: {
      pid: {
        type: 'number',
        description: 'Process ID to kill',
      },
    },
    required: ['pid'],
  },
  inputExamples: [
    { pid: 12345 },
  ],
  ui: {
    icon: 'square',
    label: 'Kill',
    color: 'red',
    runningLabel: 'Killing...',
    completedLabel: 'Process killed',
  },

  async execute(args: KillTerminalArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { pid } = args;

    if (typeof pid !== 'number' || pid <= 0) {
      return {
        success: false,
        output: `═══ INVALID PID ═══\n\nA valid process ID (positive number) is required.\n\n═══ USAGE ═══\n{ pid: 12345 }`,
        toolName: 'kill_terminal',
      };
    }

    try {
      // Check if process exists first
      const isRunning = context.terminalManager.isRunning?.(pid);
      
      if (isRunning === false) {
        return {
          success: false,
          output: `═══ PROCESS NOT RUNNING ═══\n\nPID: ${pid}\n\nThe process is not running or does not exist.\n\nPossible reasons:\n• The process already completed\n• The process was already killed\n• The PID is from a different session`,
          toolName: 'kill_terminal',
          metadata: { pid },
        };
      }

      const killed = await context.terminalManager.kill(pid);

      if (killed) {
        context.logger.info('Process killed', { pid });
        return {
          success: true,
          output: `═══ PROCESS TERMINATED ═══\n\nPID: ${pid}\nStatus: Successfully killed`,
          toolName: 'kill_terminal',
          metadata: { pid, killed: true },
        };
      } else {
        return {
          success: false,
          output: `═══ KILL FAILED ═══\n\nPID: ${pid}\n\nFailed to terminate the process. It may have already exited.`,
          toolName: 'kill_terminal',
          metadata: { pid, killed: false },
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('Failed to kill process', { error: errorMessage, pid });

      let output = `═══ KILL ERROR ═══\n\nPID: ${pid}\nError: ${errorMessage}`;
      
      if (errorMessage.includes('EPERM') || errorMessage.includes('permission')) {
        output += `\n\n═══ SUGGESTION ═══\nPermission denied. The process may require elevated privileges to kill.`;
      }

      return {
        success: false,
        output,
        toolName: 'kill_terminal',
        metadata: { pid },
      };
    }
  },
};
