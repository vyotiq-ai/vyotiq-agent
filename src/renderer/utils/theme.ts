/**
 * Terminal/CLI Theme System
 * 
 * Centralized theme configuration for consistent Terminal/CLI styling
 * across the entire application.
 */

// ============================================================================
// Terminal Color Palette
// ============================================================================

export const terminalColors = {
  // Backgrounds
  bg: {
    base: '#050506',        // Deepest background
    surface: '#0a0a0c',     // Terminal surface
    elevated: '#0f0f11',    // Elevated panels
    header: '#0b0b0d',      // Header bar
    input: '#0a0a0c',       // Input backgrounds
  },
  
  // Borders
  border: {
    subtle: '#1a1a1d',      // Subtle borders
    default: '#1f1f24',     // Default borders
    strong: '#27272a',      // Strong borders
    focus: 'rgba(52, 211, 153, 0.3)', // Focus state
  },
  
  // Text colors
  text: {
    primary: '#e4e4e7',     // Primary text (zinc-200)
    secondary: '#a1a1aa',   // Secondary text (zinc-400)
    muted: '#71717a',       // Muted text (zinc-500)
    dim: '#52525b',         // Dim text (zinc-600)
    placeholder: '#3f3f46', // Placeholder text (zinc-700)
  },
  
  // Terminal-specific colors
  terminal: {
    prompt: '#34d399',      // Lambda/prompt color (emerald-400)
    command: '#e4e4e7',     // Command text
    flag: '#34d399',        // CLI flags (emerald)
    value: '#a1a1aa',       // Flag values (zinc-400)
    path: '#60a5fa',        // File paths (blue-400)
    string: '#fbbf24',      // Strings (amber-400)
    comment: '#52525b',     // Comments (zinc-600)
    error: '#f87171',       // Errors (red-400)
    warning: '#fbbf24',     // Warnings (amber-400)
    success: '#34d399',     // Success (emerald-400)
    info: '#60a5fa',        // Info (blue-400)
  },
  
  // Provider colors
  providers: {
    anthropic: '#fb923c',   // Orange-400
    openai: '#34d399',      // Emerald-400
    deepseek: '#60a5fa',    // Blue-400
    gemini: '#a78bfa',      // Violet-400
  },
  
  // Status colors
  status: {
    ready: '#34d399',       // Emerald
    busy: '#fbbf24',        // Amber
    error: '#f87171',       // Red
    idle: '#52525b',        // Zinc-600
  },
  
  // Traffic light dots (macOS style)
  dots: {
    red: '#ff5f57',
    yellow: '#febc2e',
    green: '#28c840',
  },
} as const;

// ============================================================================
// Terminal Typography
// ============================================================================

export const terminalTypography = {
  fontFamily: {
    mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  
  fontSize: {
    xs: '10px',
    sm: '11px',
    base: '12px',
    md: '13px',
    lg: '14px',
  },
  
  lineHeight: {
    tight: '1.2',
    normal: '1.5',
    relaxed: '1.7',
  },
} as const;

// ============================================================================
// Terminal Component Styles (Tailwind class strings)
// ============================================================================

export const terminalStyles = {
  // Terminal window container
  window: 'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] overflow-hidden',
  
  // Terminal header bar with traffic lights
  headerBar: 'flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-sidebar)] border-b border-[var(--color-border-subtle)]',
  
  // Traffic light dots
  trafficDots: 'flex items-center gap-1.5',
  dotRed: 'w-2.5 h-2.5 rounded-full bg-[#ff5f57]',
  dotYellow: 'w-2.5 h-2.5 rounded-full bg-[#febc2e]',
  dotGreen: 'w-2.5 h-2.5 rounded-full bg-[#28c840]',
  
  // Terminal prompt
  prompt: 'text-[var(--color-accent-primary)] font-mono',
  promptSymbol: 'text-[var(--color-accent-primary)]',
  
  // Terminal input
  input: 'bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)] font-mono outline-none',
  
  // Terminal output/text
  output: 'font-mono text-[var(--color-text-secondary)]',
  
  // CLI flags/options
  flag: 'text-[var(--color-accent-primary)]/70 font-mono text-[10px]',
  flagValue: 'text-[var(--color-text-secondary)] font-mono text-[10px]',
  
  // Status bar
  statusBar: 'flex items-center gap-3 px-3 py-1.5 bg-[var(--color-surface-sidebar)] border-t border-[var(--color-border-subtle)] font-mono text-[10px]',
  
  // Status indicator
  statusReady: 'flex items-center gap-1.5 text-[var(--color-accent-primary)]/70',
  statusBusy: 'flex items-center gap-1.5 text-[var(--color-warning)]/70',
  statusError: 'flex items-center gap-1.5 text-[var(--color-error)]/70',
  
  // Buttons
  buttonPrimary: 'px-2 py-1 bg-[var(--color-accent-primary)]/10 hover:bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] font-mono text-[10px] rounded transition-colors',
  buttonSecondary: 'px-2 py-1 bg-[var(--color-surface-2)]/50 hover:bg-[var(--color-surface-3)]/50 text-[var(--color-text-secondary)] font-mono text-[10px] rounded transition-colors',
  buttonDanger: 'px-2 py-1 bg-[var(--color-error)]/10 hover:bg-[var(--color-error)]/20 text-[var(--color-error)] font-mono text-[10px] rounded transition-colors',
  
  // Panels/Cards
  panel: 'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
  panelHeader: 'px-3 py-2 border-b border-[var(--color-border-subtle)] font-mono text-[11px] text-[var(--color-text-secondary)]',
  panelContent: 'p-3',
  
  // Section headers
  sectionHeader: 'text-[10px] text-[var(--color-text-placeholder)] font-mono uppercase tracking-wider',
  
  // List items
  listItem: 'px-2 py-1.5 rounded hover:bg-[var(--color-surface-2)]/30 transition-colors cursor-pointer font-mono text-[11px]',
  listItemActive: 'bg-[var(--color-surface-2)]/50 text-[var(--color-text-primary)]',
  
  // Blinking cursor
  cursor: 'inline-block w-2 h-4 bg-[var(--color-accent-primary)] animate-pulse',
  cursorBlink: 'animate-[blink_1s_steps(1)_infinite]',
} as const;

// ============================================================================
// Terminal Prompt Prefixes
// ============================================================================

export const terminalPrompts = {
  lambda: 'λ',
  arrow: '❯',
  chevron: '>',
  dollar: '$',
  hash: '#',
  tilde: '~',
} as const;

// ============================================================================
// CLI-style Labels
// ============================================================================

export const cliLabels = {
  // Actions
  run: 'run',
  kill: 'kill',
  stop: 'stop',
  exec: 'exec',
  clear: 'clear',
  
  // Status
  ready: 'ready',
  busy: 'busy',
  idle: 'idle',
  error: 'error',
  
  // Operations
  read: 'read',
  write: 'write',
  edit: 'edit',
  list: 'ls',
  search: 'grep',
  find: 'find',
  
  // Flags
  auto: '--auto',
  model: '--model',
  ctx: '--ctx',
  file: '--file',
  verbose: '--verbose',
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a CLI flag with value
 */
export const formatFlag = (flag: string, value: string | number | boolean): string => {
  if (typeof value === 'boolean') {
    return value ? flag : '';
  }
  return `${flag}=${value}`;
};

// Note: formatPath is available from shared/utils/toolUtils.ts via renderer/utils/tools.ts
// Import it from there: import { formatPath } from './tools';

/**
 * Format tokens for display
 */
export const formatTokens = (n: number): string => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

/**
 * Get provider color class
 */
export const getProviderColor = (provider: string): string => {
  const colors: Record<string, string> = {
    anthropic: 'text-[var(--color-warning)]',
    openai: 'text-[var(--color-accent-primary)]',
    deepseek: 'text-[var(--color-info)]',
    gemini: 'text-[var(--color-accent-secondary)]',
  };
  return colors[provider] || 'text-[var(--color-text-secondary)]';
};

/**
 * Get provider label
 */
export const getProviderLabel = (provider: string): string => {
  const labels: Record<string, string> = {
    anthropic: 'Claude',
    openai: 'GPT',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
  };
  return labels[provider] || 'AI';
};

export default {
  colors: terminalColors,
  typography: terminalTypography,
  styles: terminalStyles,
  prompts: terminalPrompts,
  labels: cliLabels,
  formatFlag,
  formatTokens,
  formatFileSize,
  getProviderColor,
  getProviderLabel,
};
