/**
 * Terminal/CLI Theme System
 * 
 * Centralized theme configuration for consistent Terminal/CLI styling
 * across the entire application.
 * 
 * Color values are sourced from the dynamic theme system (themeMode.tsx)
 * to ensure consistency between the terminal theme and the app's light/dark modes.
 * The darkTheme is used as the canonical color source.
 */

import { darkTheme } from './themeMode';

// ============================================================================
// Terminal Color Palette (sourced from dynamic theme)
// ============================================================================

export const terminalColors = {
  // Backgrounds
  bg: {
    base: darkTheme.bg.base,
    surface: darkTheme.bg.surface,
    elevated: darkTheme.bg.elevated,
    header: darkTheme.bg.header,
    input: darkTheme.bg.input,
  },
  
  // Borders
  border: {
    subtle: darkTheme.border.subtle,
    default: darkTheme.border.default,
    strong: darkTheme.border.strong,
    focus: darkTheme.border.focus,
  },
  
  // Text colors
  text: {
    primary: darkTheme.text.primary,
    secondary: darkTheme.text.secondary,
    muted: darkTheme.text.muted,
    dim: darkTheme.text.dim,
    placeholder: darkTheme.text.placeholder,
  },
  
  // Terminal-specific colors
  terminal: {
    prompt: darkTheme.terminal.prompt,
    command: darkTheme.terminal.command,
    flag: darkTheme.terminal.flag,
    value: darkTheme.terminal.value,
    path: darkTheme.terminal.path,
    string: darkTheme.terminal.string,
    comment: darkTheme.terminal.comment,
    error: darkTheme.terminal.error,
    warning: darkTheme.terminal.warning,
    success: darkTheme.terminal.success,
    info: darkTheme.terminal.info,
  },
  
  // Provider colors
  providers: {
    anthropic: '#fb923c',   // Orange-400
    openai: darkTheme.terminal.success,
    deepseek: darkTheme.terminal.info,
    gemini: '#a78bfa',      // Violet-400
  },
  
  // Status colors
  status: {
    ready: darkTheme.status.ready,
    busy: darkTheme.status.busy,
    error: darkTheme.status.error,
    idle: darkTheme.status.idle,
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
  cursor: 'inline-block w-2 h-4 bg-[var(--color-accent-primary)] animate-[blink_1s_steps(2)_infinite]',
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
