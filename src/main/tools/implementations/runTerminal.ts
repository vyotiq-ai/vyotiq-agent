/**
 * Run Terminal Tool
 * 
 * Executes shell commands in the user's terminal.
 * Supports both foreground (wait for completion) and background execution.
 */
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type { ToolExecutionResult } from '../../../shared/types';

interface RunTerminalArgs extends Record<string, unknown> {
  /** The shell command to execute */
  command: string;
  /** Working directory for the command (defaults to workspace root) */
  cwd?: string;
  /** Run the command in the background without waiting for completion */
  run_in_background?: boolean;
  /** Timeout in milliseconds (default: 120000, max: 600000) */
  timeout?: number;
  /** Human-readable description of what the command does */
  description?: string;
}

export const runTerminalTool: ToolDefinition<RunTerminalArgs> = {
  name: 'run',
  description: `Execute a shell command in the terminal. Use this for running scripts, installing packages, building projects, or any command-line operation.

Guidelines:
- Prefer non-interactive commands; avoid editors like vim/nano
- Use appropriate flags for non-interactive mode (e.g., -y for apt, --yes for npm)
- For long-running processes (servers, watch mode), use run_in_background: true
- For long-running processes (servers, watch mode), use run_in_background: true
  - If run_in_background is omitted, the tool may auto-enable it for common dev/server/watch commands (override by explicitly setting it)
- Always provide a description explaining what the command does
- Commands run in the workspace root by default; use cwd to change directory

Platform Notes:
- On Windows, commands run in PowerShell
- On macOS/Linux, commands run in the default shell (usually bash/zsh)`,
  requiresApproval: true,
  category: 'terminal',
  riskLevel: 'moderate',
  allowedCallers: ['direct'],
  searchKeywords: ['run', 'execute', 'command', 'terminal', 'shell', 'bash', 'npm', 'script', 'build', 'install'],
  schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command (defaults to workspace root)',
      },
      run_in_background: {
        type: 'boolean',
        description: 'Run the command in the background without waiting for completion',
        default: false,
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000, max: 600000)',
      },
      description: {
        type: 'string',
        description: 'Human-readable description of what the command does',
      },
    },
    required: ['command'],
  },
  inputExamples: [
    { command: 'npm install', description: 'Install project dependencies' },
    { command: 'npm run build', description: 'Build the project' },
    { command: 'npm run dev', run_in_background: true, description: 'Start development server' },
    { command: 'git status', description: 'Check git status' },
  ],
  ui: {
    icon: 'terminal',
    label: 'Run',
    color: 'blue',
    runningLabel: 'Running command...',
    completedLabel: 'Command completed',
  },

  async execute(args: RunTerminalArgs, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const { command, cwd, run_in_background, timeout, description } = args;

    if (!command || command.trim() === '') {
      return {
        success: false,
        output: `═══ MISSING COMMAND ═══\n\nThe command parameter is required.\n\n═══ EXAMPLES ═══\n• { command: "npm install", description: "Install dependencies" }\n• { command: "npm run dev", run_in_background: true }`,
        toolName: 'run',
      };
    }

    // Warn about potentially dangerous commands
    const dangerousPatterns = [
      /\brm\s+(-rf?|--recursive)\s+[/\\]/i,  // rm -rf /
      /\bformat\s+[a-z]:/i,                   // format C:
      /\bdel\s+\/[sq]/i,                      // del /s /q
      /\b(shutdown|reboot)\b/i,              // shutdown/reboot
    ];
    
    const isDangerous = dangerousPatterns.some(p => p.test(command));
    if (isDangerous) {
      context.logger.warn('Potentially dangerous command detected', { command: command.slice(0, 100) });
    }

    const workingDir = cwd || context.workspacePath || context.cwd || process.cwd();

    const shouldAutoBackground = (cmd: string) => {
      const normalized = cmd.trim().replace(/\s+/g, ' ').toLowerCase();
      // Common long-running commands
      if (/(^|\s)(--watch|--serve|serve\b|watch\b)/.test(normalized)) return true;
      if (/^(npm|pnpm|yarn) (run )?(dev|start|serve|watch)(\s|$)/.test(normalized)) return true;
      if (/^(vite|next) (dev|start)(\s|$)/.test(normalized)) return true;
      if (/^electron-forge start(\s|$)/.test(normalized)) return true;
      return false;
    };

    const resolvedBackground = run_in_background ?? shouldAutoBackground(command);

    try {
      context.logger.info('Running terminal command', {
        command: command.slice(0, 100),
        cwd: workingDir,
        background: resolvedBackground,
      });

      const result = await context.terminalManager.run(command, {
        cwd: workingDir,
        waitForExit: !resolvedBackground,
        timeout,
        description,
      });

      // Format output for display
      const output = formatOutput(result, resolvedBackground, command);

      return {
        success: result.exitCode === 0 || resolvedBackground,
        output,
        toolName: 'run',
        metadata: {
          pid: result.pid,
          exitCode: result.exitCode,
          isBackground: resolvedBackground,
          command,
          cwd: workingDir,
          duration: result.finishedAt ? result.finishedAt - result.startedAt : undefined,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error('Terminal command failed', { error: errorMessage });

      // Provide more helpful error messages
      let output = `═══ COMMAND FAILED ═══\n\n`;
      output += `Command: ${command.length > 100 ? command.slice(0, 100) + '...' : command}\n`;
      output += `Working directory: ${workingDir}\n`;
      output += `Error: ${errorMessage}\n\n`;
      
      if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
        output += `═══ SUGGESTIONS ═══\n`;
        output += `• The command or program may not be installed\n`;
        output += `• Check if the command is in your PATH\n`;
        output += `• Try using the full path to the executable\n`;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        output += `═══ SUGGESTIONS ═══\n`;
        output += `• The command took too long to complete\n`;
        output += `• Try increasing the timeout parameter\n`;
        output += `• Use run_in_background: true for long-running commands\n`;
      } else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
        output += `═══ SUGGESTIONS ═══\n`;
        output += `• Permission denied - try running with elevated privileges\n`;
        output += `• Check file/directory permissions\n`;
      }

      return {
        success: false,
        output,
        toolName: 'run',
        metadata: { command, cwd: workingDir },
      };
    }
  },
};

function formatOutput(result: { 
  pid: number; 
  stdout: string; 
  stderr: string; 
  exitCode: number | null;
  startedAt: number;
  finishedAt?: number;
}, isBackground: boolean, command?: string): string {
  const parts: string[] = [];

  if (isBackground) {
    parts.push(`═══ BACKGROUND PROCESS STARTED ═══`);
    parts.push(`PID: ${result.pid}`);
    if (command) {
      parts.push(`Command: ${command.length > 80 ? command.slice(0, 80) + '...' : command}`);
    }
    parts.push('');
    parts.push('Use check_terminal { pid: ' + result.pid + ' } to get output');
    parts.push('Use kill_terminal { pid: ' + result.pid + ' } to stop');
    if (result.stdout) {
      parts.push('\n═══ INITIAL OUTPUT ═══');
      parts.push(result.stdout.slice(0, 500));
      if (result.stdout.length > 500) {
        parts.push('... (truncated, use check_terminal for full output)');
      }
    }
  } else {
    // Completed process
    if (result.stdout) {
      parts.push(result.stdout);
    }
    if (result.stderr) {
      parts.push(`\n═══ STDERR ═══\n${result.stderr}`);
    }
    
    const duration = result.finishedAt 
      ? `${((result.finishedAt - result.startedAt) / 1000).toFixed(2)}s`
      : 'unknown';
    
    const exitStatus = result.exitCode === 0 ? '✓' : '✗';
    parts.push(`\n[${exitStatus} Exit: ${result.exitCode ?? 'unknown'} | Duration: ${duration}]`);
  }

  return parts.join('\n').trim() || '(no output)';
}
