/**
 * Tool Icons
 * 
 * Comprehensive icon mapping for all agent tools.
 * Uses Lucide icons with consistent styling for the terminal aesthetic.
 * 
 * Icons are organized by tool category for easy maintenance and extension.
 */
import React, { memo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  // File operations
  FileText,
  FilePlus,
  FileEdit,
  FileSearch,
  FileX,
  FolderOpen,
  FolderTree,
  
  // Terminal operations
  Terminal,
  SquareTerminal,
  
  // Search operations
  Search,
  Code2,
  TextSearch,
  
  // Web/Network operations
  Globe,
  Link,
  ExternalLink,
  Download,
  
  // Edit operations
  PenLine,
  Replace,
  Trash2,
  
  // Analysis/Research
  Microscope,
  Brain,
  Lightbulb,
  
  // Git operations
  GitBranch,
  GitCommit,
  GitPullRequest,
  
  // Notebook/Code
  NotebookPen,
  Braces,
  
  // System/Misc
  Settings,
  Cog,
  ListTodo,
  MessageSquare,
  Image,
  
  // Default fallback
  Circle,
} from 'lucide-react';

import { cn } from '../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export interface ToolIconProps {
  /** Size in pixels */
  size?: number;
  /** Additional className */
  className?: string;
  /** Whether the tool is currently running */
  isActive?: boolean;
  /** Whether the tool has an error */
  hasError?: boolean;
  /** Whether the tool completed successfully */
  isSuccess?: boolean;
}

export type ToolIconConfig = {
  icon: LucideIcon;
  /** Color class when active (running) */
  activeColor: string;
  /** Color class when error */
  errorColor: string;
  /** Color class when success/completed */
  successColor: string;
  /** Category label for grouping */
  category: 'file' | 'terminal' | 'search' | 'web' | 'edit' | 'git' | 'analysis' | 'system';
};

// =============================================================================
// Tool Icon Configuration Map
// =============================================================================

/**
 * Comprehensive mapping of tool names to their icon configurations.
 * Supports exact matches and pattern matching for flexible tool naming.
 */
const TOOL_ICON_MAP: Record<string, ToolIconConfig> = {
  // === File Read Operations ===
  read: {
    icon: FileText,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  read_file: {
    icon: FileText,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  cat: {
    icon: FileText,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  
  // === File Write/Create Operations ===
  write: {
    icon: FilePlus,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-success)]',
    category: 'file',
  },
  write_file: {
    icon: FilePlus,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-success)]',
    category: 'file',
  },
  create_file: {
    icon: FilePlus,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-success)]',
    category: 'file',
  },
  
  // === File Edit Operations ===
  edit: {
    icon: FileEdit,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-warning)]',
    category: 'edit',
  },
  edit_file: {
    icon: FileEdit,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-warning)]',
    category: 'edit',
  },
  replace: {
    icon: Replace,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-warning)]',
    category: 'edit',
  },
  patch: {
    icon: PenLine,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-warning)]',
    category: 'edit',
  },
  
  // === File Delete Operations ===
  delete: {
    icon: FileX,
    activeColor: 'text-[var(--color-error)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-error)]/70',
    category: 'file',
  },
  delete_file: {
    icon: FileX,
    activeColor: 'text-[var(--color-error)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-error)]/70',
    category: 'file',
  },
  remove: {
    icon: Trash2,
    activeColor: 'text-[var(--color-error)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-error)]/70',
    category: 'file',
  },
  rm: {
    icon: Trash2,
    activeColor: 'text-[var(--color-error)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-error)]/70',
    category: 'file',
  },
  
  // === Directory Operations ===
  ls: {
    icon: FolderOpen,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  list_directory: {
    icon: FolderOpen,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  list_dir: {
    icon: FolderOpen,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  tree: {
    icon: FolderTree,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  
  // === Terminal/Shell Operations ===
  run: {
    icon: Terminal,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'terminal',
  },
  run_terminal: {
    icon: Terminal,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'terminal',
  },
  exec: {
    icon: SquareTerminal,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'terminal',
  },
  shell: {
    icon: Terminal,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'terminal',
  },
  bash: {
    icon: Terminal,
    activeColor: 'text-[var(--color-warning)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'terminal',
  },
  
  // === Search Operations ===
  grep: {
    icon: TextSearch,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'search',
  },
  search: {
    icon: Search,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'search',
  },
  find: {
    icon: FileSearch,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'search',
  },
  code_search: {
    icon: Code2,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'search',
  },
  
  // === Web/Network Operations ===
  fetch: {
    icon: Globe,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'web',
  },
  web_fetch: {
    icon: Globe,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'web',
  },
  browse: {
    icon: ExternalLink,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'web',
  },
  download: {
    icon: Download,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'web',
  },
  url: {
    icon: Link,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'web',
  },
  
  // === Research/Analysis Operations ===
  research: {
    icon: Microscope,
    activeColor: 'text-[var(--color-accent-primary)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'analysis',
  },
  analyze: {
    icon: Brain,
    activeColor: 'text-[var(--color-accent-primary)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'analysis',
  },
  think: {
    icon: Lightbulb,
    activeColor: 'text-[var(--color-accent-primary)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'analysis',
  },
  
  // === Git Operations ===
  git: {
    icon: GitBranch,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'git',
  },
  commit: {
    icon: GitCommit,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-success)]',
    category: 'git',
  },
  pr: {
    icon: GitPullRequest,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-success)]',
    category: 'git',
  },
  
  // === Notebook Operations ===
  notebook: {
    icon: NotebookPen,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  
  // === Code Operations ===
  code: {
    icon: Braces,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'file',
  },
  
  // === System Operations ===
  config: {
    icon: Settings,
    activeColor: 'text-[var(--color-text-secondary)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'system',
  },
  settings: {
    icon: Cog,
    activeColor: 'text-[var(--color-text-secondary)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'system',
  },
  todo: {
    icon: ListTodo,
    activeColor: 'text-[var(--color-accent-primary)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-success)]',
    category: 'system',
  },
  message: {
    icon: MessageSquare,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'system',
  },
  image: {
    icon: Image,
    activeColor: 'text-[var(--color-info)]',
    errorColor: 'text-[var(--color-error)]',
    successColor: 'text-[var(--color-text-muted)]',
    category: 'system',
  },
};

// Default configuration for unknown tools
const DEFAULT_TOOL_CONFIG: ToolIconConfig = {
  icon: Circle,
  activeColor: 'text-[var(--color-warning)]',
  errorColor: 'text-[var(--color-error)]',
  successColor: 'text-[var(--color-text-muted)]',
  category: 'system',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get tool configuration by tool name.
 * Supports exact matches and pattern-based fallbacks.
 */
export function getToolConfig(toolName: string): ToolIconConfig {
  const name = toolName.toLowerCase();
  
  // Exact match first
  if (TOOL_ICON_MAP[name]) {
    return TOOL_ICON_MAP[name];
  }
  
  // Pattern-based matching for compound tool names
  // e.g., "read_file_async" should match "read"
  for (const [key, config] of Object.entries(TOOL_ICON_MAP)) {
    if (name.includes(key) || name.startsWith(key)) {
      return config;
    }
  }
  
  // Fallback heuristics for unknown tools
  if (name.includes('read') || name.includes('cat') || name.includes('view')) {
    return TOOL_ICON_MAP.read;
  }
  if (name.includes('write') || name.includes('create') || name.includes('new')) {
    return TOOL_ICON_MAP.write;
  }
  if (name.includes('edit') || name.includes('modify') || name.includes('update')) {
    return TOOL_ICON_MAP.edit;
  }
  if (name.includes('delete') || name.includes('remove') || name.includes('rm')) {
    return TOOL_ICON_MAP.delete;
  }
  if (name.includes('terminal') || name.includes('exec') || name.includes('run') || name.includes('shell')) {
    return TOOL_ICON_MAP.run;
  }
  if (name.includes('search') || name.includes('find') || name.includes('grep')) {
    return TOOL_ICON_MAP.search;
  }
  if (name.includes('fetch') || name.includes('web') || name.includes('http') || name.includes('url')) {
    return TOOL_ICON_MAP.fetch;
  }
  if (name.includes('git') || name.includes('branch') || name.includes('commit')) {
    return TOOL_ICON_MAP.git;
  }
  if (name.includes('list') || name.includes('ls') || name.includes('dir')) {
    return TOOL_ICON_MAP.ls;
  }
  
  return DEFAULT_TOOL_CONFIG;
}

/**
 * Get the icon component for a tool name.
 * Returns the LucideIcon component for custom rendering.
 */
export function getToolIcon(toolName: string): LucideIcon {
  return getToolConfig(toolName).icon;
}

/**
 * Get the color class for a tool based on its current state.
 */
export function getToolColorClass(
  toolName: string,
  status: 'running' | 'error' | 'completed' | 'pending'
): string {
  const config = getToolConfig(toolName);
  
  switch (status) {
    case 'running':
      return config.activeColor;
    case 'error':
      return config.errorColor;
    case 'completed':
      return config.successColor;
    case 'pending':
    default:
      return 'text-[var(--color-text-dim)]';
  }
}

// =============================================================================
// Tool Icon Component
// =============================================================================

interface ToolIconDisplayProps extends ToolIconProps {
  /** Tool name to get icon for */
  toolName: string;
  /** Tool status for color */
  status?: 'running' | 'error' | 'completed' | 'pending';
  /** Show tooltip with tool name on hover */
  showTooltip?: boolean;
}

/**
 * Renders an icon for a tool with proper styling based on status.
 * Use this component for consistent tool icon display across the app.
 */
export const ToolIconDisplay: React.FC<ToolIconDisplayProps> = memo(({
  toolName,
  size = 12,
  className,
  status = 'completed',
  showTooltip = false,
}) => {
  const config = getToolConfig(toolName);
  const Icon = config.icon;
  const colorClass = getToolColorClass(toolName, status);
  
  const iconElement = (
    <Icon
      size={size}
      className={cn(
        'flex-shrink-0 transition-colors duration-150',
        colorClass,
        className
      )}
      aria-hidden="true"
    />
  );
  
  if (showTooltip) {
    return (
      <span title={toolName} className="inline-flex">
        {iconElement}
      </span>
    );
  }
  
  return iconElement;
});

ToolIconDisplay.displayName = 'ToolIconDisplay';

// =============================================================================
// Exports
// =============================================================================

export { TOOL_ICON_MAP };
