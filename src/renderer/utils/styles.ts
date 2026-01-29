/**
 * Shared style constants for consistent UI across the application.
 * Use these constants to ensure visual consistency.
 * 
 * CSS Variables are defined in src/index.css under @theme
 */

// =============================================================================
// SURFACE COLORS (Backgrounds)
// Aligned with index.css @theme variables for consistency
// =============================================================================

export const SURFACE = {
  /** Deepest background (page level) - matches --color-surface-base */
  base: 'bg-[var(--color-surface-base)]',
  /** Standard surface for cards, inputs, panels - matches --color-surface-1 */
  level1: 'bg-[var(--color-surface-1)]',
  /** Elevated surfaces - matches --color-surface-sidebar */
  level2: 'bg-[var(--color-surface-sidebar)]',
  /** Hover states, highlighted areas - matches --color-surface-header */
  level3: 'bg-[var(--color-surface-header)]',
  /** Header/navigation bars */
  header: 'bg-[var(--color-surface-header)]',
  /** Sidebar background */
  sidebar: 'bg-[var(--color-surface-sidebar)]',
  /** Input backgrounds */
  input: 'bg-[var(--color-surface-1)]',
} as const;

// =============================================================================
// BORDER COLORS
// Aligned with index.css @theme --color-border-* variables
// =============================================================================

export const BORDER = {
  /** Subtle borders (sidebar, header, dividers) - matches --color-border-subtle */
  subtle: 'border-[var(--color-border-subtle)]',
  /** Default borders (cards, inputs, panels) - matches --color-border-default */
  default: 'border-[var(--color-border-default)]',
  /** Emphasized borders - matches --color-border-strong */
  strong: 'border-[var(--color-border-strong)]',
  /** Focus state borders - matches --color-border-focus */
  focus: 'border-[var(--color-border-focus)]',
} as const;

// =============================================================================
// TEXT COLORS
// =============================================================================

export const TEXT = {
  /** Primary text - uses CSS variable */
  primary: 'text-[var(--color-text-primary)]',
  /** Secondary text - uses CSS variable */
  secondary: 'text-[var(--color-text-secondary)]',
  /** Muted text, labels - uses CSS variable */
  muted: 'text-[var(--color-text-muted)]',
  /** Placeholder text - uses CSS variable */
  placeholder: 'placeholder:text-[var(--color-text-placeholder)]',
} as const;

// =============================================================================
// ACCENT COLORS
// =============================================================================

export const ACCENT = {
  /** Primary accent - using CSS variable for light/dark mode compatibility */
  primary: 'text-[var(--color-accent-primary)]',
  primaryBg: 'bg-[var(--color-accent-primary)]',
  /** Secondary accent - for hover states */
  hover: 'hover:brightness-110',
  /** Active/pressed state */
  active: 'active:brightness-90',
} as const;

// =============================================================================
// COMPOSED STYLES (Common combinations)
// =============================================================================

/**
 * Input field styles - use for all text inputs, selects, textareas
 */
export const INPUT_STYLES = {
  base: `w-full ${SURFACE.level1} ${TEXT.primary} ${BORDER.default} px-3 py-2.5 text-sm outline-none transition-all duration-200 ${TEXT.placeholder}`,
  focus: `focus:${BORDER.focus} focus:${SURFACE.level2} focus:ring-1 focus:ring-[var(--color-accent-primary)]/20`,
  disabled: 'disabled:opacity-50 disabled:cursor-not-allowed',
} as const;

/**
 * Card styles
 */
export const CARD_STYLES = {
  base: `${SURFACE.level1} ${BORDER.default} overflow-hidden`,
  hoverable: `hover:border-[var(--color-border-default)]/60 hover:${SURFACE.level3} transition-all duration-200`,
  footer: `p-4 border-t ${BORDER.default} ${SURFACE.base}`,
} as const;

/**
 * Panel styles (floating panels, modals, popovers)
 */
export const PANEL_STYLES = {
  base: `${SURFACE.level1} ${BORDER.default} shadow-2xl`,
  modal: `${SURFACE.base} ${BORDER.default} shadow-2xl`,
} as const;

/**
 * Header/Navigation styles
 */
export const NAV_STYLES = {
  header: `${SURFACE.header} border-b ${BORDER.subtle}`,
  sidebar: `${SURFACE.sidebar} border-r ${BORDER.subtle}`,
} as const;

// =============================================================================
// HELPER FUNCTION
// =============================================================================

/**
 * Combines multiple style constants into a single string
 */
export function composeStyles(...styles: string[]): string {
  return styles.filter(Boolean).join(' ');
}
