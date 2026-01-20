import { 
  TerminalSquare, 
  Search, 
  FolderOpen, 
  FileEdit, 
  FilePlus, 
  Eye, 
  Skull, 
  Clock,
  FileSearch,
  Folder,
  CircleX,
  Wrench,
  TriangleAlert,
  ListTodo,
  type LucideIcon 
} from 'lucide-react';

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

export interface ToolUIConfig {
  Icon: LucideIcon;
  label: string;
  color?: string;
  category?: string;
}

const toolConfigs: Record<string, ToolUIConfig> = {
  // File Reading
  read: { Icon: Eye, label: 'Read', color: 'text-[var(--color-info)]', category: 'file' },
  read_file: { Icon: Eye, label: 'Read', color: 'text-[var(--color-info)]', category: 'file' },
  
  // Directory Listing
  ls: { Icon: FolderOpen, label: 'List', color: 'text-[var(--color-info)]', category: 'file' },
  list_dir: { Icon: Folder, label: 'List', color: 'text-[var(--color-info)]', category: 'file' },
  list_directory: { Icon: Folder, label: 'List', color: 'text-[var(--color-info)]', category: 'file' },
  
  // File Writing
  write: { Icon: FilePlus, label: 'Create', color: 'text-[var(--color-success)]', category: 'file' },
  create_file: { Icon: FilePlus, label: 'Create', color: 'text-[var(--color-success)]', category: 'file' },
  
  // File Editing
  edit: { Icon: FileEdit, label: 'Edit', color: 'text-[var(--color-warning)]', category: 'file' },
  replace_string_in_file: { Icon: FileEdit, label: 'Edit', color: 'text-[var(--color-warning)]', category: 'file' },
  
  // Search
  grep: { Icon: Search, label: 'Search', color: 'text-[var(--color-accent-secondary)]', category: 'search' },
  search: { Icon: Search, label: 'Search', color: 'text-[var(--color-accent-secondary)]', category: 'search' },
  glob: { Icon: FileSearch, label: 'Find files', color: 'text-[var(--color-accent-secondary)]', category: 'search' },
  
  // Terminal
  run: { Icon: TerminalSquare, label: 'Run command', color: 'text-[var(--color-success)]', category: 'terminal' },
  run_terminal_command: { Icon: TerminalSquare, label: 'Run command', color: 'text-[var(--color-success)]', category: 'terminal' },
  check_terminal_output: { Icon: Clock, label: 'Check output', color: 'text-[var(--color-info)]', category: 'terminal' },
  kill: { Icon: CircleX, label: 'Kill process', color: 'text-[var(--color-error)]', category: 'terminal' },
  kill_terminal: { Icon: CircleX, label: 'Kill process', color: 'text-[var(--color-error)]', category: 'terminal' },
  kill_terminal_process: { Icon: CircleX, label: 'Kill process', color: 'text-[var(--color-error)]', category: 'terminal' },

  // Agent Internal
  TodoWrite: { Icon: ListTodo, label: 'Tasks', color: 'text-[var(--color-accent-primary)]', category: 'agent' },

  // Other
  'file-read': { Icon: Eye, label: 'Reading', color: 'text-[var(--color-info)]', category: 'file' },
  'file-write': { Icon: FilePlus, label: 'Writing', color: 'text-[var(--color-success)]', category: 'file' },
  'tool-call': { Icon: TerminalSquare, label: 'Executing', color: 'text-[var(--color-success)]', category: 'tool' },
  command: { Icon: TerminalSquare, label: 'Running', color: 'text-[var(--color-success)]', category: 'terminal' },
  
  // Error/fatal states
  error: { Icon: Skull, label: 'Error', color: 'text-[var(--color-error)]', category: 'error' },
  fatal: { Icon: Skull, label: 'Fatal', color: 'text-[var(--color-error)]', category: 'error' },
  warning: { Icon: TriangleAlert, label: 'Warning', color: 'text-[var(--color-warning)]', category: 'warning' },
};

// Icon mapping for dynamic icon loading (e.g., from saved configs)
const iconMap: Record<string, LucideIcon> = {
  TerminalSquare,
  Search,
  FolderOpen,
  FileEdit,
  FilePlus,
  Eye,
  Clock,
  FileSearch,
  Folder,
  CircleX,
  Wrench,
  Skull,
  TriangleAlert,
  ListTodo,
};

/**
 * Get icon component by name string - useful for dynamic icon resolution
 * where the icon name comes from configuration or user-defined skills.
 */
export function getIconByName(iconName: string): LucideIcon {
  return iconMap[iconName] || Wrench;
}

/**
 * Get all available icon names for UI selectors
 */
export function getAvailableIconNames(): string[] {
  return Object.keys(iconMap);
}

// Default configuration
const defaultConfig: ToolUIConfig = {
  Icon: Wrench,
  label: 'Tool',
  color: 'text-[var(--color-text-secondary)]',
  category: 'other',
};

/**
 * Get UI configuration for a tool by name
 */
export function getToolUIConfig(toolName?: string): ToolUIConfig {
  if (!toolName) return defaultConfig;

  const normalized = toolName.toLowerCase().trim();
  
  // Exact match first
  if (toolConfigs[normalized]) {
    return toolConfigs[normalized];
  }
  
  // Partial matches
  for (const [key, config] of Object.entries(toolConfigs)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return config;
    }
  }

  return defaultConfig;
}

/**
 * Get the color for a tool
 */
export function getToolColor(toolName?: string): string {
  const config = getToolUIConfig(toolName);
  return config.color ?? 'text-[var(--color-text-secondary)]';
}

/**
 * Get the category for a tool
 */
export function getToolCategory(toolName?: string): string | undefined {
  const config = getToolUIConfig(toolName);
  return config.category;
}

