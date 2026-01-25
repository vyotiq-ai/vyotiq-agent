/**
 * Tool UI Configuration
 * 
 * Defines the UI metadata for each tool including icons, colors, and labels.
 */
import type { ToolCategory, ToolUIMetadata } from './toolTypes';

// Default UI configurations for each tool
export const TOOL_UI_CONFIG: Record<string, ToolUIMetadata> = {
  // File Reading
  read: {
    icon: 'Eye',
    label: 'Read',
    color: 'text-blue-400',
    runningLabel: 'Reading',
    completedLabel: 'Read',
  },
  read_file: {
    icon: 'Eye',
    label: 'Read',
    color: 'text-blue-400',
    runningLabel: 'Reading',
    completedLabel: 'Read',
  },

  // Directory Listing
  ls: {
    icon: 'FolderOpen',
    label: 'List',
    color: 'text-cyan-400',
    runningLabel: 'Listing',
    completedLabel: 'Listed',
  },
  list_dir: {
    icon: 'FolderOpen',
    label: 'List',
    color: 'text-cyan-400',
    runningLabel: 'Listing',
    completedLabel: 'Listed',
  },
  list_directory: {
    icon: 'FolderOpen',
    label: 'List',
    color: 'text-cyan-400',
    runningLabel: 'Listing',
    completedLabel: 'Listed',
  },

  // File Creation
  write: {
    icon: 'FilePlus',
    label: 'Create',
    color: 'text-[var(--color-accent-primary)]',
    runningLabel: 'Creating',
    completedLabel: 'Created',
  },
  create_file: {
    icon: 'FilePlus',
    label: 'Create',
    color: 'text-[var(--color-accent-primary)]',
    runningLabel: 'Creating',
    completedLabel: 'Created',
  },

  // File Editing
  edit: {
    icon: 'FileEdit',
    label: 'Edit',
    color: 'text-amber-400',
    runningLabel: 'Editing',
    completedLabel: 'Edited',
  },
  replace_string_in_file: {
    icon: 'FileEdit',
    label: 'Edit',
    color: 'text-amber-400',
    runningLabel: 'Editing',
    completedLabel: 'Edited',
  },

  // Searching
  grep: {
    icon: 'Search',
    label: 'Search',
    color: 'text-purple-400',
    runningLabel: 'Searching',
    completedLabel: 'Found',
  },
  search: {
    icon: 'Search',
    label: 'Search',
    color: 'text-purple-400',
    runningLabel: 'Searching',
    completedLabel: 'Found',
  },
  glob: {
    icon: 'FileSearch',
    label: 'Find Files',
    color: 'text-purple-400',
    runningLabel: 'Finding',
    completedLabel: 'Found',
  },

  // Semantic Search
  codebase_search: {
    icon: 'Brain',
    label: 'Semantic Search',
    color: 'text-indigo-400',
    runningLabel: 'Searching',
    completedLabel: 'Found',
  },

  // Terminal
  run: {
    icon: 'Terminal',
    label: 'Run',
    color: 'text-green-400',
    runningLabel: 'Running',
    completedLabel: 'Ran',
  },
  run_terminal_command: {
    icon: 'Terminal',
    label: 'Run',
    color: 'text-green-400',
    runningLabel: 'Running',
    completedLabel: 'Ran',
  },
  check_terminal_output: {
    icon: 'Clock',
    label: 'Check',
    color: 'text-blue-400',
    runningLabel: 'Checking',
    completedLabel: 'Checked',
  },
  kill_terminal: {
    icon: 'XCircle',
    label: 'Kill',
    color: 'text-red-400',
    runningLabel: 'Killing',
    completedLabel: 'Killed',
  },

  // Code Intelligence
  symbols: {
    icon: 'Code',
    label: 'Symbols',
    color: 'text-indigo-400',
    runningLabel: 'Getting Symbols',
    completedLabel: 'Found Symbols',
  },
  definition: {
    icon: 'ArrowRight',
    label: 'Definition',
    color: 'text-indigo-400',
    runningLabel: 'Finding Definition',
    completedLabel: 'Found Definition',
  },
  references: {
    icon: 'GitBranch',
    label: 'References',
    color: 'text-indigo-400',
    runningLabel: 'Finding References',
    completedLabel: 'Found References',
  },
  diagnostics: {
    icon: 'TriangleAlert',
    label: 'Diagnostics',
    color: 'text-orange-400',
    runningLabel: 'Checking Diagnostics',
    completedLabel: 'Checked Diagnostics',
  },

  // Enhanced File Operations
  bulk: {
    icon: 'Files',
    label: 'Bulk',
    color: 'text-teal-400',
    runningLabel: 'Processing Files',
    completedLabel: 'Processed Files',
  },
  watch: {
    icon: 'Eye',
    label: 'Watch',
    color: 'text-sky-400',
    runningLabel: 'Watching',
    completedLabel: 'Watching',
  },

  // Agent Internal Tools
  TodoWrite: {
    icon: 'ListTodo',
    label: 'Tasks',
    color: 'text-[var(--color-accent-primary)]',
    runningLabel: 'Updating tasks',
    completedLabel: 'Tasks updated',
  },
};

// Category mappings
export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  read: 'file-read',
  read_file: 'file-read',
  ls: 'file-read',
  list_dir: 'file-read',
  list_directory: 'file-read',
  write: 'file-write',
  create_file: 'file-write',
  edit: 'file-write',
  replace_string_in_file: 'file-write',
  grep: 'file-search',
  search: 'file-search',
  glob: 'file-search',
  codebase_search: 'file-search',
  run: 'terminal',
  run_terminal_command: 'terminal',
  check_terminal_output: 'terminal',
  kill_terminal: 'terminal',
  symbols: 'code-intelligence',
  definition: 'code-intelligence',
  references: 'code-intelligence',
  diagnostics: 'code-intelligence',
  bulk: 'file-write',
  watch: 'file-read',
  // LSP tools
  lsp_hover: 'code-intelligence',
  lsp_definition: 'code-intelligence',
  lsp_references: 'code-intelligence',
  lsp_symbols: 'code-intelligence',
  lsp_diagnostics: 'code-intelligence',
  lsp_completions: 'code-intelligence',
  lsp_code_actions: 'code-intelligence',
  lsp_rename: 'code-intelligence',
  // Browser read-only tools
  browser_fetch: 'browser-read',
  browser_extract: 'browser-read',
  browser_console: 'browser-read',
  browser_network: 'browser-read',
  browser_snapshot: 'browser-read',
  browser_state: 'browser-read',
  browser_security_status: 'browser-read',
  browser_check_url: 'browser-read',
  browser_screenshot: 'browser-read',
  // Browser state-changing tools
  browser_click: 'browser-write',
  browser_type: 'browser-write',
  browser_navigate: 'browser-write',
  browser_scroll: 'browser-write',
  browser_fill_form: 'browser-write',
  browser_hover: 'browser-write',
  browser_evaluate: 'browser-write',
  browser_back: 'browser-write',
  browser_forward: 'browser-write',
  browser_reload: 'browser-write',
  browser_tabs: 'browser-write',
  browser_wait: 'browser-write',
  // Agent internal tools
  TodoWrite: 'agent-internal',
};

// Default fallback config
export const DEFAULT_TOOL_UI: ToolUIMetadata = {
  icon: 'Wrench',
  label: 'Tool',
  color: 'text-zinc-400',
  runningLabel: 'Running',
  completedLabel: 'Completed',
};

/**
 * Get UI configuration for a tool
 */
export function getToolUIConfig(toolName: string): ToolUIMetadata {
  return TOOL_UI_CONFIG[toolName] || DEFAULT_TOOL_UI;
}

/**
 * Get category for a tool
 */
export function getToolCategory(toolName: string): ToolCategory {
  return TOOL_CATEGORIES[toolName] || 'other';
}
