/**
 * Tool Action Descriptions
 * 
 * Generates human-readable, descriptive text explaining what each tool
 * is doing, working on, processing, or executing.
 * 
 * Replaces tool icons and names with clear action descriptions.
 */

/**
 * Status-based verb forms for different tool operations
 */
type StatusVerbs = {
  queued: string;
  running: string;
  completed: string;
  error: string;
  pending: string;
};

/**
 * Tool action configuration with status-specific descriptions
 */
interface ToolActionConfig {
  /** Verb forms for different statuses */
  verbs: StatusVerbs;
  /** Category for grouping */
  category: 'file' | 'terminal' | 'search' | 'web' | 'edit' | 'git' | 'analysis' | 'system' | 'browser' | 'lsp';
  /** Function to generate context-specific description */
  getContext?: (args: Record<string, unknown>, partialJson?: string) => string | undefined;
}

/**
 * Extract file path from arguments or partial JSON
 */
function extractFilePath(args: Record<string, unknown>, partialJson?: string): string | undefined {
  let filePath = (args.path || args.file_path || args.filePath || args.file) as string | undefined;
  
  if (!filePath && partialJson) {
    const pathMatch = partialJson.match(/"(?:path|file_path|file|filePath)"\s*:\s*"([^"]*)"/);
    if (pathMatch) {
      filePath = pathMatch[1];
    }
  }
  
  if (filePath) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }
  
  return undefined;
}

/**
 * Extract command from arguments or partial JSON
 */
function extractCommand(args: Record<string, unknown>, partialJson?: string): string | undefined {
  let command = args.command as string | undefined;
  
  if (!command && partialJson) {
    const cmdMatch = partialJson.match(/"command"\s*:\s*"([^"]*)"/);
    if (cmdMatch) command = cmdMatch[1];
  }
  
  if (command) {
    // Get the main command without long arguments
    const firstWord = command.split(/\s+/)[0];
    if (command.length > 40) {
      return firstWord;
    }
    return command.length > 25 ? `${command.slice(0, 25)}...` : command;
  }
  
  return undefined;
}

/**
 * Extract search pattern/query from arguments or partial JSON
 */
function extractPattern(args: Record<string, unknown>, partialJson?: string): string | undefined {
  let pattern = (args.pattern || args.query || args.search) as string | undefined;
  
  if (!pattern && partialJson) {
    const patternMatch = partialJson.match(/"(?:pattern|query|search)"\s*:\s*"([^"]*)"/);
    if (patternMatch) pattern = patternMatch[1];
  }
  
  if (pattern) {
    return pattern.length > 25 ? `"${pattern.slice(0, 22)}..."` : `"${pattern}"`;
  }
  
  return undefined;
}

/**
 * Extract URL from arguments or partial JSON
 */
function extractUrl(args: Record<string, unknown>, partialJson?: string): string | undefined {
  let url = args.url as string | undefined;
  
  if (!url && partialJson) {
    const urlMatch = partialJson.match(/"url"\s*:\s*"([^"]*)"/);
    if (urlMatch) url = urlMatch[1];
  }
  
  if (url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url.length > 30 ? `${url.slice(0, 27)}...` : url;
    }
  }
  
  return undefined;
}

/**
 * Extract directory from arguments or partial JSON
 */
function extractDirectory(args: Record<string, unknown>, partialJson?: string): string | undefined {
  let dir = (args.dir || args.directory || args.path) as string | undefined;
  
  if (!dir && partialJson) {
    const dirMatch = partialJson.match(/"(?:dir|directory|path)"\s*:\s*"([^"]*)"/);
    if (dirMatch) dir = dirMatch[1];
  }
  
  if (dir) {
    const parts = dir.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || dir || '.';
  }
  
  return '.';
}

/**
 * Tool action configurations map
 */
const TOOL_ACTIONS: Record<string, ToolActionConfig> = {
  // === File Read Operations ===
  read: {
    verbs: {
      queued: 'Waiting to read',
      running: 'Reading',
      completed: 'Read',
      error: 'Failed to read',
      pending: 'Will read',
    },
    category: 'file',
    getContext: extractFilePath,
  },
  read_file: {
    verbs: {
      queued: 'Waiting to read',
      running: 'Reading',
      completed: 'Read',
      error: 'Failed to read',
      pending: 'Will read',
    },
    category: 'file',
    getContext: extractFilePath,
  },
  cat: {
    verbs: {
      queued: 'Waiting to display',
      running: 'Displaying',
      completed: 'Displayed',
      error: 'Failed to display',
      pending: 'Will display',
    },
    category: 'file',
    getContext: extractFilePath,
  },

  // === File Write/Create Operations ===
  write: {
    verbs: {
      queued: 'Waiting to write',
      running: 'Writing',
      completed: 'Wrote',
      error: 'Failed to write',
      pending: 'Will write',
    },
    category: 'file',
    getContext: extractFilePath,
  },
  write_file: {
    verbs: {
      queued: 'Waiting to create',
      running: 'Creating',
      completed: 'Created',
      error: 'Failed to create',
      pending: 'Will create',
    },
    category: 'file',
    getContext: extractFilePath,
  },
  create_file: {
    verbs: {
      queued: 'Waiting to create',
      running: 'Creating',
      completed: 'Created',
      error: 'Failed to create',
      pending: 'Will create',
    },
    category: 'file',
    getContext: extractFilePath,
  },

  // === File Edit Operations ===
  edit: {
    verbs: {
      queued: 'Waiting to edit',
      running: 'Editing',
      completed: 'Edited',
      error: 'Failed to edit',
      pending: 'Will edit',
    },
    category: 'edit',
    getContext: extractFilePath,
  },
  edit_file: {
    verbs: {
      queued: 'Waiting to edit',
      running: 'Editing',
      completed: 'Edited',
      error: 'Failed to edit',
      pending: 'Will edit',
    },
    category: 'edit',
    getContext: extractFilePath,
  },
  replace: {
    verbs: {
      queued: 'Waiting to replace',
      running: 'Replacing content in',
      completed: 'Replaced content in',
      error: 'Failed to replace content in',
      pending: 'Will replace content in',
    },
    category: 'edit',
    getContext: extractFilePath,
  },
  patch: {
    verbs: {
      queued: 'Waiting to patch',
      running: 'Patching',
      completed: 'Patched',
      error: 'Failed to patch',
      pending: 'Will patch',
    },
    category: 'edit',
    getContext: extractFilePath,
  },

  // === File Delete Operations ===
  delete: {
    verbs: {
      queued: 'Waiting to delete',
      running: 'Deleting',
      completed: 'Deleted',
      error: 'Failed to delete',
      pending: 'Will delete',
    },
    category: 'file',
    getContext: extractFilePath,
  },
  delete_file: {
    verbs: {
      queued: 'Waiting to delete',
      running: 'Deleting',
      completed: 'Deleted',
      error: 'Failed to delete',
      pending: 'Will delete',
    },
    category: 'file',
    getContext: extractFilePath,
  },
  remove: {
    verbs: {
      queued: 'Waiting to remove',
      running: 'Removing',
      completed: 'Removed',
      error: 'Failed to remove',
      pending: 'Will remove',
    },
    category: 'file',
    getContext: extractFilePath,
  },
  rm: {
    verbs: {
      queued: 'Waiting to remove',
      running: 'Removing',
      completed: 'Removed',
      error: 'Failed to remove',
      pending: 'Will remove',
    },
    category: 'file',
    getContext: extractFilePath,
  },

  // === Directory Operations ===
  ls: {
    verbs: {
      queued: 'Waiting to list',
      running: 'Listing contents of',
      completed: 'Listed',
      error: 'Failed to list',
      pending: 'Will list',
    },
    category: 'file',
    getContext: extractDirectory,
  },
  list_directory: {
    verbs: {
      queued: 'Waiting to list',
      running: 'Listing contents of',
      completed: 'Listed',
      error: 'Failed to list',
      pending: 'Will list',
    },
    category: 'file',
    getContext: extractDirectory,
  },
  list_dir: {
    verbs: {
      queued: 'Waiting to list',
      running: 'Listing contents of',
      completed: 'Listed',
      error: 'Failed to list',
      pending: 'Will list',
    },
    category: 'file',
    getContext: extractDirectory,
  },
  tree: {
    verbs: {
      queued: 'Waiting to map',
      running: 'Mapping directory tree',
      completed: 'Mapped directory tree',
      error: 'Failed to map directory',
      pending: 'Will map directory tree',
    },
    category: 'file',
    getContext: extractDirectory,
  },

  // === Terminal/Shell Operations ===
  run: {
    verbs: {
      queued: 'Waiting to execute',
      running: 'Executing',
      completed: 'Executed',
      error: 'Command failed',
      pending: 'Will execute',
    },
    category: 'terminal',
    getContext: extractCommand,
  },
  run_terminal: {
    verbs: {
      queued: 'Waiting to run',
      running: 'Running in terminal',
      completed: 'Ran',
      error: 'Terminal command failed',
      pending: 'Will run in terminal',
    },
    category: 'terminal',
    getContext: extractCommand,
  },
  exec: {
    verbs: {
      queued: 'Waiting to execute',
      running: 'Executing',
      completed: 'Executed',
      error: 'Execution failed',
      pending: 'Will execute',
    },
    category: 'terminal',
    getContext: extractCommand,
  },
  shell: {
    verbs: {
      queued: 'Waiting to run shell',
      running: 'Running shell command',
      completed: 'Ran shell command',
      error: 'Shell command failed',
      pending: 'Will run shell',
    },
    category: 'terminal',
    getContext: extractCommand,
  },
  bash: {
    verbs: {
      queued: 'Waiting to run',
      running: 'Running bash command',
      completed: 'Ran bash',
      error: 'Bash command failed',
      pending: 'Will run bash',
    },
    category: 'terminal',
    getContext: extractCommand,
  },

  // === Search Operations ===
  grep: {
    verbs: {
      queued: 'Waiting to search for',
      running: 'Searching for',
      completed: 'Searched for',
      error: 'Search failed for',
      pending: 'Will search for',
    },
    category: 'search',
    getContext: extractPattern,
  },
  search: {
    verbs: {
      queued: 'Waiting to search',
      running: 'Searching',
      completed: 'Searched',
      error: 'Search failed',
      pending: 'Will search',
    },
    category: 'search',
    getContext: extractPattern,
  },
  find: {
    verbs: {
      queued: 'Waiting to find',
      running: 'Finding',
      completed: 'Found',
      error: 'Failed to find',
      pending: 'Will find',
    },
    category: 'search',
    getContext: extractPattern,
  },
  code_search: {
    verbs: {
      queued: 'Waiting to search code for',
      running: 'Searching code for',
      completed: 'Searched code for',
      error: 'Code search failed for',
      pending: 'Will search code for',
    },
    category: 'search',
    getContext: extractPattern,
  },

  // === Web/Network Operations ===
  fetch: {
    verbs: {
      queued: 'Waiting to fetch',
      running: 'Fetching',
      completed: 'Fetched',
      error: 'Failed to fetch',
      pending: 'Will fetch',
    },
    category: 'web',
    getContext: extractUrl,
  },
  web_fetch: {
    verbs: {
      queued: 'Waiting to fetch from',
      running: 'Fetching from',
      completed: 'Fetched from',
      error: 'Failed to fetch from',
      pending: 'Will fetch from',
    },
    category: 'web',
    getContext: extractUrl,
  },
  browse: {
    verbs: {
      queued: 'Waiting to browse',
      running: 'Browsing',
      completed: 'Browsed',
      error: 'Failed to browse',
      pending: 'Will browse',
    },
    category: 'web',
    getContext: extractUrl,
  },
  download: {
    verbs: {
      queued: 'Waiting to download',
      running: 'Downloading',
      completed: 'Downloaded',
      error: 'Failed to download',
      pending: 'Will download',
    },
    category: 'web',
    getContext: extractUrl,
  },
  url: {
    verbs: {
      queued: 'Waiting to fetch',
      running: 'Fetching',
      completed: 'Fetched',
      error: 'Failed to fetch',
      pending: 'Will fetch',
    },
    category: 'web',
    getContext: extractUrl,
  },

  // === Browser Operations ===
  browser_navigate: {
    verbs: {
      queued: 'Waiting to navigate to',
      running: 'Navigating to',
      completed: 'Navigated to',
      error: 'Failed to navigate to',
      pending: 'Will navigate to',
    },
    category: 'browser',
    getContext: extractUrl,
  },
  browser_click: {
    verbs: {
      queued: 'Waiting to click',
      running: 'Clicking element',
      completed: 'Clicked',
      error: 'Failed to click',
      pending: 'Will click',
    },
    category: 'browser',
  },
  browser_type: {
    verbs: {
      queued: 'Waiting to type',
      running: 'Typing text',
      completed: 'Typed',
      error: 'Failed to type',
      pending: 'Will type',
    },
    category: 'browser',
  },
  browser_screenshot: {
    verbs: {
      queued: 'Waiting to capture',
      running: 'Capturing screenshot',
      completed: 'Captured screenshot',
      error: 'Failed to capture',
      pending: 'Will capture screenshot',
    },
    category: 'browser',
  },
  browser_scroll: {
    verbs: {
      queued: 'Waiting to scroll',
      running: 'Scrolling page',
      completed: 'Scrolled',
      error: 'Failed to scroll',
      pending: 'Will scroll',
    },
    category: 'browser',
  },
  browser_wait: {
    verbs: {
      queued: 'Waiting to wait for',
      running: 'Waiting for element',
      completed: 'Wait completed',
      error: 'Wait timeout',
      pending: 'Will wait for',
    },
    category: 'browser',
  },
  browser_get: {
    verbs: {
      queued: 'Waiting to get page',
      running: 'Getting page content',
      completed: 'Got page content',
      error: 'Failed to get content',
      pending: 'Will get page',
    },
    category: 'browser',
  },
  browser_evaluate: {
    verbs: {
      queued: 'Waiting to evaluate',
      running: 'Evaluating JavaScript',
      completed: 'Evaluated script',
      error: 'Evaluation failed',
      pending: 'Will evaluate',
    },
    category: 'browser',
  },
  browser_network: {
    verbs: {
      queued: 'Waiting to monitor',
      running: 'Monitoring network',
      completed: 'Monitored network',
      error: 'Monitoring failed',
      pending: 'Will monitor network',
    },
    category: 'browser',
  },
  browser_tabs: {
    verbs: {
      queued: 'Waiting to manage tabs',
      running: 'Managing browser tabs',
      completed: 'Managed tabs',
      error: 'Tab management failed',
      pending: 'Will manage tabs',
    },
    category: 'browser',
  },
  browser_security_status: {
    verbs: {
      queued: 'Waiting to check',
      running: 'Checking security status',
      completed: 'Checked security',
      error: 'Security check failed',
      pending: 'Will check security',
    },
    category: 'browser',
  },

  // === Research/Analysis Operations ===
  research: {
    verbs: {
      queued: 'Waiting to research',
      running: 'Researching',
      completed: 'Researched',
      error: 'Research failed',
      pending: 'Will research',
    },
    category: 'analysis',
    getContext: (args, partialJson) => extractPattern(args, partialJson) || (args.topic as string),
  },
  analyze: {
    verbs: {
      queued: 'Waiting to analyze',
      running: 'Analyzing',
      completed: 'Analyzed',
      error: 'Analysis failed',
      pending: 'Will analyze',
    },
    category: 'analysis',
  },
  think: {
    verbs: {
      queued: 'Preparing to think',
      running: 'Thinking through',
      completed: 'Thought through',
      error: 'Thinking interrupted',
      pending: 'Will think through',
    },
    category: 'analysis',
  },

  // === Git Operations ===
  git: {
    verbs: {
      queued: 'Waiting to run git',
      running: 'Running git operation',
      completed: 'Ran git',
      error: 'Git operation failed',
      pending: 'Will run git',
    },
    category: 'git',
    getContext: (args) => args.subcommand as string,
  },
  commit: {
    verbs: {
      queued: 'Waiting to commit',
      running: 'Committing changes',
      completed: 'Committed',
      error: 'Commit failed',
      pending: 'Will commit',
    },
    category: 'git',
  },
  pr: {
    verbs: {
      queued: 'Waiting to process PR',
      running: 'Processing pull request',
      completed: 'Processed PR',
      error: 'PR action failed',
      pending: 'Will process PR',
    },
    category: 'git',
  },

  // === LSP Operations ===
  lsp_hover: {
    verbs: {
      queued: 'Waiting to get hover info',
      running: 'Getting hover information',
      completed: 'Got hover info',
      error: 'Failed to get hover info',
      pending: 'Will get hover info',
    },
    category: 'lsp',
  },
  lsp_definition: {
    verbs: {
      queued: 'Waiting to find definition',
      running: 'Finding definition',
      completed: 'Found definition',
      error: 'Failed to find definition',
      pending: 'Will find definition',
    },
    category: 'lsp',
  },
  lsp_references: {
    verbs: {
      queued: 'Waiting to find references',
      running: 'Finding all references',
      completed: 'Found references',
      error: 'Failed to find references',
      pending: 'Will find references',
    },
    category: 'lsp',
  },
  lsp_symbols: {
    verbs: {
      queued: 'Waiting to list symbols',
      running: 'Listing symbols',
      completed: 'Listed symbols',
      error: 'Failed to list symbols',
      pending: 'Will list symbols',
    },
    category: 'lsp',
  },
  lsp_diagnostics: {
    verbs: {
      queued: 'Waiting to check diagnostics',
      running: 'Checking diagnostics',
      completed: 'Checked diagnostics',
      error: 'Failed to check diagnostics',
      pending: 'Will check diagnostics',
    },
    category: 'lsp',
  },
  lsp_completions: {
    verbs: {
      queued: 'Waiting to get completions',
      running: 'Getting completions',
      completed: 'Got completions',
      error: 'Failed to get completions',
      pending: 'Will get completions',
    },
    category: 'lsp',
  },
  lsp_code_actions: {
    verbs: {
      queued: 'Waiting to get code actions',
      running: 'Getting code actions',
      completed: 'Got code actions',
      error: 'Failed to get code actions',
      pending: 'Will get code actions',
    },
    category: 'lsp',
  },
  lsp_rename: {
    verbs: {
      queued: 'Waiting to rename',
      running: 'Renaming symbol',
      completed: 'Renamed symbol',
      error: 'Rename failed',
      pending: 'Will rename',
    },
    category: 'lsp',
  },

  // === Task/Planning Operations ===
  todo_write: {
    verbs: {
      queued: 'Waiting to update todos',
      running: 'Updating todo list',
      completed: 'Updated todos',
      error: 'Failed to update todos',
      pending: 'Will update todos',
    },
    category: 'system',
  },
  create_plan: {
    verbs: {
      queued: 'Waiting to create plan',
      running: 'Creating task plan',
      completed: 'Created plan',
      error: 'Failed to create plan',
      pending: 'Will create plan',
    },
    category: 'system',
  },
  verify_tasks: {
    verbs: {
      queued: 'Waiting to verify',
      running: 'Verifying tasks',
      completed: 'Verified tasks',
      error: 'Verification failed',
      pending: 'Will verify tasks',
    },
    category: 'system',
  },
  get_active_plan: {
    verbs: {
      queued: 'Waiting to get plan',
      running: 'Getting active plan',
      completed: 'Got active plan',
      error: 'Failed to get plan',
      pending: 'Will get plan',
    },
    category: 'system',
  },
  list_plans: {
    verbs: {
      queued: 'Waiting to list plans',
      running: 'Listing plans',
      completed: 'Listed plans',
      error: 'Failed to list plans',
      pending: 'Will list plans',
    },
    category: 'system',
  },
  delete_plan: {
    verbs: {
      queued: 'Waiting to delete plan',
      running: 'Deleting plan',
      completed: 'Deleted plan',
      error: 'Failed to delete plan',
      pending: 'Will delete plan',
    },
    category: 'system',
  },

  // === System Operations ===
  create_tool: {
    verbs: {
      queued: 'Waiting to create tool',
      running: 'Creating dynamic tool',
      completed: 'Created tool',
      error: 'Failed to create tool',
      pending: 'Will create tool',
    },
    category: 'system',
  },
  request_tools: {
    verbs: {
      queued: 'Waiting to request tools',
      running: 'Requesting tools',
      completed: 'Requested tools',
      error: 'Failed to request tools',
      pending: 'Will request tools',
    },
    category: 'system',
  },
  config: {
    verbs: {
      queued: 'Waiting to update config',
      running: 'Updating configuration',
      completed: 'Updated config',
      error: 'Failed to update config',
      pending: 'Will update config',
    },
    category: 'system',
  },
  settings: {
    verbs: {
      queued: 'Waiting to modify settings',
      running: 'Modifying settings',
      completed: 'Modified settings',
      error: 'Failed to modify settings',
      pending: 'Will modify settings',
    },
    category: 'system',
  },
  todo: {
    verbs: {
      queued: 'Waiting to manage todos',
      running: 'Managing todos',
      completed: 'Managed todos',
      error: 'Failed to manage todos',
      pending: 'Will manage todos',
    },
    category: 'system',
  },
  message: {
    verbs: {
      queued: 'Waiting to send message',
      running: 'Sending message',
      completed: 'Sent message',
      error: 'Failed to send message',
      pending: 'Will send message',
    },
    category: 'system',
  },
  image: {
    verbs: {
      queued: 'Waiting to process image',
      running: 'Processing image',
      completed: 'Processed image',
      error: 'Image processing failed',
      pending: 'Will process image',
    },
    category: 'system',
  },
  bulk_operations: {
    verbs: {
      queued: 'Waiting to perform bulk ops',
      running: 'Performing bulk file operations',
      completed: 'Completed bulk ops',
      error: 'Bulk operations failed',
      pending: 'Will perform bulk ops',
    },
    category: 'system',
  },
  read_lints: {
    verbs: {
      queued: 'Waiting to check lints',
      running: 'Checking lint errors',
      completed: 'Checked lints',
      error: 'Failed to check lints',
      pending: 'Will check lints',
    },
    category: 'system',
  },
};

/**
 * Get the action configuration for a tool, with fallback for unknown tools
 */
function getToolActionConfig(toolName: string): ToolActionConfig {
  const name = toolName.toLowerCase();
  
  // Exact match
  if (TOOL_ACTIONS[name]) {
    return TOOL_ACTIONS[name];
  }
  
  // Pattern matching for prefixes
  if (name.startsWith('browser_')) {
    return {
      verbs: {
        queued: 'Waiting to perform browser action',
        running: `Performing ${name.replace('browser_', '').replace(/_/g, ' ')}`,
        completed: `Completed ${name.replace('browser_', '').replace(/_/g, ' ')}`,
        error: `Browser action failed`,
        pending: 'Will perform browser action',
      },
      category: 'browser',
    };
  }
  
  if (name.startsWith('lsp_')) {
    return {
      verbs: {
        queued: 'Waiting for LSP',
        running: `Running ${name.replace('lsp_', '').replace(/_/g, ' ')}`,
        completed: `Completed ${name.replace('lsp_', '').replace(/_/g, ' ')}`,
        error: `LSP operation failed`,
        pending: 'Will run LSP operation',
      },
      category: 'lsp',
    };
  }
  
  if (name.startsWith('mcp_')) {
    return {
      verbs: {
        queued: 'Waiting for MCP tool',
        running: `Running ${name.replace('mcp_', '').replace(/_/g, ' ')}`,
        completed: `Completed ${name.replace('mcp_', '').replace(/_/g, ' ')}`,
        error: `MCP tool failed`,
        pending: 'Will run MCP tool',
      },
      category: 'system',
    };
  }
  
  // Default fallback
  const formattedName = name.replace(/_/g, ' ');
  return {
    verbs: {
      queued: `Waiting to run ${formattedName}`,
      running: `Running ${formattedName}`,
      completed: `Completed ${formattedName}`,
      error: `Failed ${formattedName}`,
      pending: `Will run ${formattedName}`,
    },
    category: 'system',
  };
}

export type ToolStatus = 'queued' | 'running' | 'completed' | 'error' | 'pending';

/**
 * Generate a descriptive action text for a tool based on its name, status, and arguments.
 * 
 * @param toolName - The name of the tool being executed
 * @param status - Current execution status of the tool
 * @param args - Tool arguments (parsed or empty)
 * @param partialJson - Partial JSON string for extracting context during streaming
 * @returns Descriptive action text like "Reading config.ts" or "Searching for 'pattern'"
 */
export function getToolActionDescription(
  toolName: string,
  status: ToolStatus = 'running',
  args: Record<string, unknown> = {},
  partialJson?: string,
): string {
  const config = getToolActionConfig(toolName);
  const verb = config.verbs[status];
  
  // Get context if available
  const context = config.getContext?.(args, partialJson);
  
  if (context) {
    return `${verb} ${context}`;
  }
  
  return verb;
}

/**
 * Get just the action verb without context (for compact displays)
 */
export function getToolActionVerb(toolName: string, status: ToolStatus = 'running'): string {
  const config = getToolActionConfig(toolName);
  return config.verbs[status];
}

/**
 * Get the category of a tool for styling purposes
 */
export function getToolActionCategory(toolName: string): ToolActionConfig['category'] {
  const config = getToolActionConfig(toolName);
  return config.category;
}

/**
 * Check if the tool is a file-related operation
 */
export function isFileRelatedTool(toolName: string): boolean {
  const category = getToolActionCategory(toolName);
  return category === 'file' || category === 'edit';
}

/**
 * Check if the tool is a terminal/command operation
 */
export function isTerminalRelatedTool(toolName: string): boolean {
  const category = getToolActionCategory(toolName);
  return category === 'terminal';
}

/**
 * Check if the tool is a search operation
 */
export function isSearchRelatedTool(toolName: string): boolean {
  const category = getToolActionCategory(toolName);
  return category === 'search';
}

/**
 * Check if the tool is a web/browser operation
 */
export function isWebRelatedTool(toolName: string): boolean {
  const category = getToolActionCategory(toolName);
  return category === 'web' || category === 'browser';
}
