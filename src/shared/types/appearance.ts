/**
 * Appearance & UI Customization Types
 * 
 * Contains types for theming, font settings, animations, and UI preferences.
 * Extracted from shared/types.ts for modular organization.
 */

// =============================================================================
// Accent Colors
// =============================================================================

export type AccentColorPreset = 
  | 'emerald'   // Default green
  | 'violet'    // Purple
  | 'blue'      // Blue
  | 'amber'     // Orange/yellow
  | 'rose'      // Pink/red
  | 'cyan'      // Teal/cyan
  | 'custom';   // Custom hex color

// =============================================================================
// Font & Display
// =============================================================================

/**
 * Font size scale options
 */
export type FontSizeScale = 'compact' | 'default' | 'comfortable' | 'large';

/**
 * Available terminal font families
 */
export type TerminalFont = 
  | 'JetBrains Mono'
  | 'Fira Code'
  | 'Source Code Pro'
  | 'Cascadia Code'
  | 'Consolas'
  | 'Monaco'
  | 'Menlo'
  | 'system';

/**
 * Loading indicator visual style
 */
export type LoadingIndicatorStyle = 'spinner' | 'dots' | 'pulse' | 'minimal';

/**
 * Animation speed preference
 */
export type AnimationSpeed = 'slow' | 'normal' | 'fast';

/**
 * Reduce motion behavior preference
 */
export type ReduceMotionPreference = 'system' | 'always' | 'never';

// =============================================================================
// Constants
// =============================================================================

/**
 * Animation speed multipliers
 */
export const ANIMATION_SPEED_MULTIPLIERS: Record<AnimationSpeed, number> = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.5,
};

// =============================================================================
// Appearance Settings Interface
// =============================================================================

/**
 * Appearance and UI customization settings
 */
export interface AppearanceSettings {
  /** Font size scale for the entire UI */
  fontSizeScale: FontSizeScale;
  /** Accent color preset */
  accentColor: AccentColorPreset;
  /** Custom accent color (hex) when accentColor is 'custom' */
  customAccentColor?: string;
  /** Enable compact mode (reduced padding/margins) */
  compactMode: boolean;
  /** Terminal font family */
  terminalFont: TerminalFont;
  /** Terminal font size in pixels */
  terminalFontSize: number;
  /** Enable smooth animations */
  enableAnimations: boolean;
  /** Loading indicator visual style */
  loadingIndicatorStyle: LoadingIndicatorStyle;
  /** Animation speed preference */
  animationSpeed: AnimationSpeed;
  /** Reduce motion behavior preference */
  reduceMotion: ReduceMotionPreference;
  /** Show line numbers in code blocks */
  showLineNumbers: boolean;
  /** Enable syntax highlighting in code blocks */
  enableSyntaxHighlighting: boolean;
}

// =============================================================================
// Defaults & Presets
// =============================================================================

/**
 * Default appearance settings
 */
export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  fontSizeScale: 'default',
  accentColor: 'emerald',
  compactMode: false,
  terminalFont: 'JetBrains Mono',
  terminalFontSize: 12,
  enableAnimations: true,
  loadingIndicatorStyle: 'spinner',
  animationSpeed: 'normal',
  reduceMotion: 'system',
  showLineNumbers: true,
  enableSyntaxHighlighting: true,
};

/**
 * Font size scale CSS variables mapping
 */
export const FONT_SIZE_SCALES: Record<FontSizeScale, {
  base: number;
  sm: number;
  xs: number;
  lg: number;
}> = {
  compact: { base: 11, sm: 10, xs: 9, lg: 12 },
  default: { base: 12, sm: 11, xs: 10, lg: 14 },
  comfortable: { base: 14, sm: 12, xs: 11, lg: 16 },
  large: { base: 16, sm: 14, xs: 12, lg: 18 },
};

/**
 * Accent color CSS variable mappings
 */
export const ACCENT_COLOR_PRESETS: Record<Exclude<AccentColorPreset, 'custom'>, {
  primary: string;
  hover: string;
  active: string;
  muted: string;
}> = {
  emerald: { primary: '#34d399', hover: '#6ee7b7', active: '#a7f3d0', muted: '#047857' },
  violet: { primary: '#a78bfa', hover: '#c4b5fd', active: '#ddd6fe', muted: '#6d28d9' },
  blue: { primary: '#60a5fa', hover: '#93c5fd', active: '#bfdbfe', muted: '#1d4ed8' },
  amber: { primary: '#fbbf24', hover: '#fcd34d', active: '#fde68a', muted: '#b45309' },
  rose: { primary: '#fb7185', hover: '#fda4af', active: '#fecdd3', muted: '#be123c' },
  cyan: { primary: '#22d3ee', hover: '#67e8f9', active: '#a5f3fc', muted: '#0e7490' },
};
