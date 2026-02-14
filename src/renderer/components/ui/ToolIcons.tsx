/**
 * Tool Descriptions
 * 
 * Minimal module providing human-readable descriptions for tools.
 * Icons have been removed for a cleaner, minimalist interface.
 */

// =============================================================================
// Types (minimal, for backwards compatibility)
// =============================================================================

export interface ToolIconProps {
  /** Tool name */
  toolName?: string;
  /** Size in pixels */
  size?: number;
  /** Additional className */
  className?: string;
}

export type ToolIconConfig = {
  /** Category label for grouping */
  category: 'file' | 'terminal' | 'search' | 'web' | 'edit' | 'git' | 'analysis' | 'system';
};

// =============================================================================
// Tool Categories (minimal map for type checking)
// =============================================================================

const TOOL_CATEGORIES: Record<string, ToolIconConfig['category']> = {
  // File operations
  read: 'file',
  read_file: 'file',
  cat: 'file',
  write: 'file',
  write_file: 'file',
  create_file: 'file',
  edit: 'edit',
  edit_file: 'edit',
  replace: 'edit',
  patch: 'edit',
  delete: 'file',
  delete_file: 'file',
  remove: 'file',
  rm: 'file',
  ls: 'file',
  list_directory: 'file',
  list_dir: 'file',
  tree: 'file',
  bulk_operations: 'file',
  
  // Terminal operations
  run: 'terminal',
  run_terminal: 'terminal',
  exec: 'terminal',
  shell: 'terminal',
  bash: 'terminal',
  check_terminal: 'terminal',
  kill_terminal: 'terminal',
  
  // Search operations
  grep: 'search',
  search: 'search',
  find: 'search',
  code_search: 'search',
  
  // Web operations
  fetch: 'web',
  web_fetch: 'web',
  browse: 'web',
  download: 'web',
  url: 'web',
  browser_fetch: 'web',
  browser_navigate: 'web',
  browser_extract: 'web',
  browser_snapshot: 'web',
  browser_screenshot: 'web',
  browser_click: 'web',
  browser_type: 'web',
  browser_scroll: 'web',
  browser_wait: 'web',
  browser_console: 'web',
  browser_check_url: 'web',
  browser_fill_form: 'web',
  browser_hover: 'web',
  browser_evaluate: 'web',
  browser_state: 'web',
  browser_back: 'web',
  browser_forward: 'web',
  browser_reload: 'web',
  browser_network: 'web',
  browser_tabs: 'web',
  browser_security_status: 'web',
  
  // Research/Analysis
  research: 'analysis',
  analyze: 'analysis',
  think: 'analysis',
  lsp_hover: 'analysis',
  lsp_definition: 'analysis',
  lsp_references: 'analysis',
  lsp_symbols: 'analysis',
  lsp_diagnostics: 'analysis',
  lsp_completions: 'analysis',
  lsp_code_actions: 'analysis',
  lsp_rename: 'edit',
  read_lints: 'analysis',
  
  // Git operations
  git: 'git',
  commit: 'git',
  pr: 'git',
  
  // System operations
  todo_write: 'system',
  create_plan: 'system',
  verify_tasks: 'system',
  get_active_plan: 'system',
  list_plans: 'system',
  delete_plan: 'system',
  create_tool: 'system',
  request_tools: 'system',
  config: 'system',
  settings: 'system',
  todo: 'system',
  message: 'system',
  image: 'system',
  notebook: 'file',
  code: 'file',
};

// =============================================================================
// Tool Descriptions
// =============================================================================

const TOOL_DESCRIPTIONS: Record<string, string> = {
  read: 'Read file contents',
  read_file: 'Read file contents',
  cat: 'Display file contents',
  write: 'Create new file',
  write_file: 'Create new file',
  create_file: 'Create new file',
  edit: 'Edit existing file',
  edit_file: 'Edit existing file',
  replace: 'Replace text in file',
  patch: 'Apply patch to file',
  delete: 'Delete file',
  delete_file: 'Delete file',
  remove: 'Remove file',
  rm: 'Remove file',
  ls: 'List directory contents',
  list_directory: 'List directory contents',
  list_dir: 'List directory contents',
  tree: 'Show directory tree',
  bulk_operations: 'Bulk file operations',
  run: 'Execute shell command',
  run_terminal: 'Execute in terminal',
  exec: 'Execute command',
  shell: 'Run shell command',
  bash: 'Run bash command',
  check_terminal: 'Check terminal status',
  kill_terminal: 'Kill terminal process',
  grep: 'Search text in files',
  search: 'Search files',
  find: 'Find files',
  code_search: 'Search code',
  fetch: 'Fetch web content',
  web_fetch: 'Fetch from web',
  browse: 'Open URL',
  download: 'Download file',
  url: 'Access URL',
  browser_fetch: 'Fetch page content',
  browser_navigate: 'Navigate to URL',
  browser_extract: 'Extract page data',
  browser_snapshot: 'Get page HTML',
  browser_screenshot: 'Take screenshot',
  browser_click: 'Click element',
  browser_type: 'Type text',
  browser_scroll: 'Scroll page',
  browser_wait: 'Wait for element',
  browser_console: 'Get console logs',
  browser_check_url: 'Verify URL',
  browser_fill_form: 'Fill form fields',
  browser_hover: 'Hover over element',
  browser_evaluate: 'Run JavaScript',
  browser_state: 'Get browser state',
  browser_back: 'Navigate back',
  browser_forward: 'Navigate forward',
  browser_reload: 'Reload page',
  browser_network: 'Monitor network',
  browser_tabs: 'Manage tabs',
  browser_security_status: 'Check security',
  research: 'Research topic',
  analyze: 'Analyze content',
  think: 'Think step by step',
  git: 'Git operation',
  commit: 'Create commit',
  pr: 'Pull request action',
  lsp_hover: 'Get hover info',
  lsp_definition: 'Go to definition',
  lsp_references: 'Find references',
  lsp_symbols: 'List symbols',
  lsp_diagnostics: 'Get diagnostics',
  lsp_completions: 'Get completions',
  lsp_code_actions: 'Get code actions',
  lsp_rename: 'Rename symbol',
  read_lints: 'Check lint errors',
  todo_write: 'Update todo list',
  create_plan: 'Create task plan',
  verify_tasks: 'Verify tasks',
  get_active_plan: 'Get active plan',
  list_plans: 'List all plans',
  delete_plan: 'Delete plan',
  create_tool: 'Create dynamic tool',
  request_tools: 'Request tools',
  config: 'Update config',
  settings: 'Modify settings',
  todo: 'Manage todos',
  message: 'Send message',
  image: 'Process image',
  notebook: 'Notebook operation',
  code: 'Code operation',
};

// =============================================================================
// Helper Functions
// =============================================================================

export function getToolCategory(toolName: string): ToolIconConfig['category'] {
  const name = toolName.toLowerCase();
  
  if (TOOL_CATEGORIES[name]) {
    return TOOL_CATEGORIES[name];
  }
  
  if (name.startsWith('browser_') || name.startsWith('browser-')) return 'web';
  if (name.startsWith('lsp_') || name.startsWith('lsp-')) return 'analysis';
  if (name.includes('terminal') || name.includes('exec') || name.includes('run') || name.includes('shell')) return 'terminal';
  if (name.includes('search') || name.includes('find') || name.includes('grep')) return 'search';
  if (name.includes('git') || name.includes('branch') || name.includes('commit')) return 'git';
  if (name.includes('read') || name.includes('write') || name.includes('file') || name.includes('dir')) return 'file';
  if (name.includes('edit') || name.includes('modify') || name.includes('update')) return 'edit';
  if (name.includes('fetch') || name.includes('web') || name.includes('http') || name.includes('url')) return 'web';
  
  return 'system';
}

export function getToolDescription(toolName: string): string {
  const name = toolName.toLowerCase();
  
  if (TOOL_DESCRIPTIONS[name]) {
    return TOOL_DESCRIPTIONS[name];
  }
  
  if (name.startsWith('browser_')) {
    return `Browser: ${name.replace('browser_', '').replace(/_/g, ' ')}`;
  }
  if (name.startsWith('lsp_')) {
    return `LSP: ${name.replace('lsp_', '').replace(/_/g, ' ')}`;
  }
  if (name.startsWith('mcp_')) {
    return `MCP: ${name.replace('mcp_', '').replace(/_/g, ' ')}`;
  }
  
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getToolColorClass(
  _toolName: string,
  status: 'running' | 'error' | 'completed' | 'pending' | 'queued'
): string {
  switch (status) {
    case 'running':
      return 'text-[var(--color-warning)]';
    case 'error':
      return 'text-[var(--color-error)]';
    case 'completed':
      return 'text-[var(--color-text-muted)]';
    case 'queued':
      return 'text-[var(--color-info)]';
    case 'pending':
    default:
      return 'text-[var(--color-text-dim)]';
  }
}


