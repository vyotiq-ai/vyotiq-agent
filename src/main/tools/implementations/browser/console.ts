/**
 * Browser Console Tool
 * 
 * Capture and retrieve browser console logs for debugging web applications.
 * Essential for understanding JavaScript errors and warnings in tested apps.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';
import { createLogger } from '../../../logger';

const logger = createLogger('BrowserConsoleTool');

interface ConsoleArgs extends Record<string, unknown> {
  /** Filter by log level */
  level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
  /** Maximum number of logs to return */
  limit?: number;
  /** Clear logs after retrieving */
  clear?: boolean;
  /** Filter logs by text pattern */
  filter?: string;
}

// Store console logs in memory
const consoleLogs: Array<{
  level: 'error' | 'warning' | 'info' | 'debug' | 'log';
  message: string;
  timestamp: number;
  source?: string;
  line?: number;
}> = [];

// Maximum logs to keep
const MAX_LOGS = 500;

// Track if we've set up the listener
let listenerSetup = false;
let listenerSetupDeferredLogged = false;

/**
 * Setup listener for browser console messages
 * This should be called when the browser manager is initialized
 */
export function setupConsoleListener(): void {
  if (listenerSetup) return;
  
  try {
    const browser = getBrowserManager();
    
    // Remove any existing listener to prevent duplicates
    browser.removeAllListeners('console-message');
    
    browser.on('console-message', (data: { 
      level: 'error' | 'warning' | 'info' | 'debug' | 'log';
      message: string;
      source?: string;
      line?: number;
      timestamp: number;
    }) => {
      addConsoleLog(data.level, data.message, data.source, data.line);
    });
    
    listenerSetup = true;
  } catch (error) {
    // Browser manager may not be initialized yet - this is fine
    // The listener will be set up when the tool is first executed
    if (!listenerSetupDeferredLogged) {
      listenerSetupDeferredLogged = true;
      logger.debug('Browser manager not initialized; deferring console listener setup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Add a console log entry
 */
export function addConsoleLog(
  level: 'error' | 'warning' | 'info' | 'debug' | 'log',
  message: string,
  source?: string,
  line?: number
): void {
  consoleLogs.push({
    level,
    message,
    timestamp: Date.now(),
    source,
    line,
  });
  
  // Keep only recent logs
  if (consoleLogs.length > MAX_LOGS) {
    consoleLogs.splice(0, consoleLogs.length - MAX_LOGS);
  }
}

/**
 * Clear all console logs
 */
export function clearConsoleLogs(): void {
  consoleLogs.length = 0;
}

/**
 * Get console logs with filtering
 */
export function getConsoleLogs(options?: {
  level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
  limit?: number;
  filter?: string;
}): typeof consoleLogs {
  let logs = [...consoleLogs];
  
  // Filter by level
  if (options?.level && options.level !== 'all') {
    const levelMap: Record<string, string[]> = {
      errors: ['error'],
      warnings: ['warning'],
      info: ['info', 'log'],
      debug: ['debug'],
    };
    const allowedLevels = levelMap[options.level] || [];
    logs = logs.filter(log => allowedLevels.includes(log.level));
  }
  
  // Filter by text pattern
  if (options?.filter) {
    const pattern = options.filter.toLowerCase();
    logs = logs.filter(log => log.message.toLowerCase().includes(pattern));
  }
  
  // Apply limit
  if (options?.limit) {
    logs = logs.slice(-options.limit);
  }
  
  return logs;
}

async function executeConsole(
  args: ConsoleArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { level = 'all', limit = 50, clear = false, filter } = args;
  
  // Ensure listener is set up
  setupConsoleListener();
  
  context.logger.info('Getting browser console logs', { level, limit, filter });

  try {
    const logs = getConsoleLogs({ level, limit, filter });
    
    if (clear) {
      clearConsoleLogs();
    }

    if (logs.length === 0) {
      return {
        toolName: 'browser_console',
        success: true,
        output: 'No console logs captured. Navigate to a page and interact with it to capture logs.',
        metadata: { logCount: 0 },
      };
    }

    // Format logs for output
    let output = `## Browser Console Logs (${logs.length})\n\n`;
    
    const levelIcons: Record<string, string> = {
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
      debug: '🔍',
      log: '📝',
    };
    
    for (const log of logs) {
      const icon = levelIcons[log.level] || '•';
      const time = new Date(log.timestamp).toISOString().split('T')[1].slice(0, 12);
      const source = log.source ? ` (${log.source}${log.line ? `:${log.line}` : ''})` : '';
      
      output += `${icon} **[${time}]** ${log.level.toUpperCase()}${source}\n`;
      output += `   ${log.message.slice(0, 500)}${log.message.length > 500 ? '...' : ''}\n\n`;
    }
    
    // Summary by level
    const errorCount = logs.filter(l => l.level === 'error').length;
    const warnCount = logs.filter(l => l.level === 'warning').length;
    
    if (errorCount > 0 || warnCount > 0) {
      output += `---\n**Summary:** ${errorCount} errors, ${warnCount} warnings\n`;
    }

    return {
      toolName: 'browser_console',
      success: true,
      output,
      metadata: {
        logCount: logs.length,
        errorCount,
        warningCount: warnCount,
        cleared: clear,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Console log error', { error: errorMessage });
    
    return {
      toolName: 'browser_console',
      success: false,
      output: `Failed to get console logs: ${errorMessage}`,
    };
  }
}

export const browserConsoleTool: ToolDefinition<ConsoleArgs> = {
  name: 'browser_console',
  description: `Get browser console logs for debugging web applications.

**Captures:**
- JavaScript errors and exceptions
- Console.log/warn/error output
- Network errors
- Uncaught promise rejections

**Use cases:**
- Debug why a web app isn't working
- Check for JavaScript errors after interactions
- Monitor console output during testing

**Best Practice:** Call this after browser_navigate or interactions to check for errors.`,

  requiresApproval: false,
  category: 'browser-read',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      level: {
        type: 'string',
        enum: ['all', 'errors', 'warnings', 'info', 'debug'],
        description: 'Filter by log level (default: all)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of logs to return (default: 50)',
      },
      clear: {
        type: 'boolean',
        description: 'Clear logs after retrieving (default: false)',
      },
      filter: {
        type: 'string',
        description: 'Filter logs by text pattern',
      },
    },
    required: [],
  },

  ui: {
    icon: 'Terminal',
    label: 'Console Logs',
    color: 'text-yellow-400',
    runningLabel: 'Getting logs...',
    completedLabel: 'Logs retrieved',
  },

  inputExamples: [
    {},
    { level: 'errors' },
    { level: 'all', limit: 100 },
    { filter: 'TypeError' },
  ],

  execute: executeConsole,
};
