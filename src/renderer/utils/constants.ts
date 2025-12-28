// App-wide constants

// Streaming update intervals
export const STREAMING_FLUSH_INTERVAL = 50; // 20 updates per second
export const STREAMING_MAX_BUFFER_SIZE = 100;

// UI constants
export const SIDEBAR_WIDTH = 280;
export const SIDEBAR_COLLAPSED_WIDTH = 0;
export const HEADER_HEIGHT = 40;

// UI Timing constants (in milliseconds)
export const UI_TIMING = {
  /** Duration to show "Copied!" feedback after copying to clipboard */
  COPY_FEEDBACK_DURATION: 2000,
  /** Duration to show success state before returning to idle */
  SUCCESS_FEEDBACK_DURATION: 3500,
  /** Duration to show error messages */
  ERROR_DISPLAY_DURATION: 5000,
  /** Delay before auto-dismissing notifications */
  NOTIFICATION_DURATION: 3000,
  /** Debounce delay for typing in inputs */
  INPUT_DEBOUNCE: 300,
  /** Delay for tooltip appearance */
  TOOLTIP_DELAY: 500,
} as const;

// Responsive breakpoints
export const MOBILE_BREAKPOINT = 640;   // sm
export const TABLET_BREAKPOINT = 768;   // md
export const DESKTOP_BREAKPOINT = 1024; // lg
export const WIDE_BREAKPOINT = 1280;    // xl

// Split pane
export const SPLIT_PANE_MIN_SIZE = 300;

// Chat scroll
export const CHAT_SCROLL_THRESHOLD = 150;
export const CHAT_SCROLL_DEBOUNCE = 100;

// Message limits
export const MAX_MESSAGE_CHARS = 200000;
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  newSession: { key: 'n', modifier: 'ctrl', description: 'Create new session' },
  settings: { key: ',', modifier: 'ctrl', description: 'Open settings' },
  stopGeneration: { key: 'Escape', modifier: '', description: 'Stop generation' },
  sendMessage: { key: 'Enter', modifier: '', description: 'Send message' },
  newLine: { key: 'Enter', modifier: 'shift', description: 'Insert new line' },
  toggleSidebar: { key: 'b', modifier: 'ctrl', description: 'Toggle sidebar' },
  toggleTerminal: { key: '`', modifier: 'ctrl', description: 'Toggle terminal panel' },
  toggleBrowser: { key: 'b', modifier: 'ctrl+shift', description: 'Toggle browser panel' },
  toggleUndoHistory: { key: 'h', modifier: 'ctrl+shift', description: 'Toggle undo history' },
  toggleMetrics: { key: 'm', modifier: 'ctrl+shift', description: 'Toggle metrics dashboard' },
  showShortcuts: { key: '?', modifier: '', description: 'Show keyboard shortcuts' },
  profileMetrics: { key: 'p', modifier: 'ctrl+shift', description: 'Show performance metrics (dev)' },
  quickOpen: { key: 'p', modifier: 'ctrl', description: 'Quick open file' },
  commandPalette: { key: 'k', modifier: 'ctrl', description: 'Command palette' },
  findInFiles: { key: 'f', modifier: 'ctrl+shift', description: 'Search in files' },
} as const;
