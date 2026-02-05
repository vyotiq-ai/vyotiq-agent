/**
 * Tool Utilities
 * 
 * Utility functions for tool operations.
 * Icons have been removed for a cleaner, minimalist interface.
 */

// Re-export shared utilities
export {
  formatToolDuration,
  formatDuration,
  formatRelativeTime,
  formatElapsedTime,
  isDestructiveTool,
  categorizeToolName,
  isFileOperation,
  isTerminalOperation,
  isDangerousTool,
  getToolTarget,
  extractToolTarget,
  extractToolDetail,
  extractFilePath,
  extractContent,
  getToolExecutionResult,
  formatToolName,
  getFileName,
  formatPath,
  isToolError,
  groupToolMessages as groupToolMessagesShared,
  ToolUtils,
} from '../../shared/utils/toolUtils';

// Re-export from ToolIcons for backwards compatibility
export { getToolDescription, getToolCategory } from '../components/ui/ToolIcons';

// =============================================================================
// Tool Labels
// =============================================================================

const TOOL_LABELS: Record<string, string> = {
  read: 'Read',
  read_file: 'Read',
  cat: 'Display',
  write: 'Create',
  write_file: 'Create',
  create_file: 'Create',
  edit: 'Edit',
  edit_file: 'Edit',
  replace: 'Replace',
  replace_string_in_file: 'Edit',
  patch: 'Patch',
  delete: 'Delete',
  delete_file: 'Delete',
  remove: 'Remove',
  rm: 'Remove',
  ls: 'List',
  list_dir: 'List',
  list_directory: 'List',
  tree: 'Tree',
  run: 'Run',
  run_terminal: 'Run',
  run_terminal_command: 'Run',
  exec: 'Execute',
  shell: 'Shell',
  bash: 'Bash',
  check_terminal: 'Check',
  check_terminal_output: 'Check',
  kill: 'Kill',
  kill_terminal: 'Kill',
  kill_terminal_process: 'Kill',
  grep: 'Search',
  search: 'Search',
  find: 'Find',
  glob: 'Find files',
  code_search: 'Search code',
  fetch: 'Fetch',
  web_fetch: 'Fetch',
  browse: 'Browse',
  download: 'Download',
  research: 'Research',
  analyze: 'Analyze',
  think: 'Think',
  git: 'Git',
  commit: 'Commit',
  pr: 'PR',
  todo_write: 'Tasks',
  TodoWrite: 'Tasks',
  todo: 'Todo',
  create_plan: 'Plan',
  create_tool: 'Create tool',
  message: 'Message',
  image: 'Image',
  error: 'Error',
  fatal: 'Fatal',
  warning: 'Warning',
};

/**
 * @deprecated Use getToolDescription from ToolIcons instead
 */
export interface ToolUIConfig {
  label: string;
  color?: string;
  category?: string;
}

const defaultConfig: ToolUIConfig = {
  label: 'Tool',
  color: 'text-[var(--color-text-secondary)]',
  category: 'other',
};

/**
 * Get UI configuration for a tool by name
 * @deprecated Use getToolDescription and getToolCategory from ToolIcons instead
 */
export function getToolUIConfig(toolName?: string): ToolUIConfig {
  if (!toolName) return defaultConfig;

  const normalized = toolName.toLowerCase().trim();
  const label = TOOL_LABELS[normalized] || TOOL_LABELS[toolName] || 
    toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  return {
    label,
    color: 'text-[var(--color-text-secondary)]',
    category: 'other',
  };
}

/**
 * Get the color for a tool
 * @deprecated Status colors are now handled in individual components
 */
export function getToolColor(_toolName?: string): string {
  return 'text-[var(--color-text-secondary)]';
}
