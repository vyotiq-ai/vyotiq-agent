/**
 * Theme Mode System
 * 
 * Provides light/dark mode support with system preference detection,
 * smooth transitions, and persistent preference storage.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createLogger } from './logger';

const logger = createLogger('themeMode');

// =============================================================================
// Types
// =============================================================================

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeColors {
  // Backgrounds
  bg: {
    base: string;
    surface: string;
    elevated: string;
    header: string;
    input: string;
    hover: string;
    active: string;
  };
  
  // Borders
  border: {
    subtle: string;
    default: string;
    strong: string;
    focus: string;
  };
  
  // Text
  text: {
    primary: string;
    secondary: string;
    muted: string;
    dim: string;
    placeholder: string;
    inverse: string;
  };
  
  // Terminal-specific
  terminal: {
    prompt: string;
    command: string;
    flag: string;
    value: string;
    path: string;
    string: string;
    comment: string;
    error: string;
    warning: string;
    success: string;
    info: string;
  };
  
  // Semantic
  status: {
    ready: string;
    busy: string;
    error: string;
    idle: string;
  };
  
  // Shadows
  shadow: {
    sm: string;
    md: string;
    lg: string;
    glow: string;
  };
}

// =============================================================================
// Color Definitions
// =============================================================================

export const darkTheme: ThemeColors = {
  bg: {
    base: '#050506',
    surface: '#0a0a0c',
    elevated: '#0f0f11',
    header: '#0b0b0d',
    input: '#0a0a0c',
    hover: 'rgba(255, 255, 255, 0.03)',
    active: 'rgba(255, 255, 255, 0.05)',
  },
  border: {
    subtle: '#1a1a1d',
    default: '#1f1f24',
    strong: '#27272a',
    focus: 'rgba(52, 211, 153, 0.3)',
  },
  text: {
    primary: '#e4e4e7',
    secondary: '#a1a1aa',
    muted: '#71717a',
    dim: '#52525b',
    placeholder: '#3f3f46',
    inverse: '#18181b',
  },
  terminal: {
    prompt: '#34d399',
    command: '#e4e4e7',
    flag: '#34d399',
    value: '#a1a1aa',
    path: '#60a5fa',
    string: '#fbbf24',
    comment: '#52525b',
    error: '#f87171',
    warning: '#fbbf24',
    success: '#34d399',
    info: '#60a5fa',
  },
  status: {
    ready: '#34d399',
    busy: '#fbbf24',
    error: '#f87171',
    idle: '#52525b',
  },
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
    glow: '0 0 20px rgba(52, 211, 153, 0.15)',
  },
};

export const lightTheme: ThemeColors = {
  bg: {
    base: '#ffffff',
    surface: '#fafafa',
    elevated: '#f5f5f5',
    header: '#f8f8f8',
    input: '#ffffff',
    hover: 'rgba(0, 0, 0, 0.03)',
    active: 'rgba(0, 0, 0, 0.05)',
  },
  border: {
    subtle: '#e5e5e5',
    default: '#d4d4d4',
    strong: '#a3a3a3',
    focus: 'rgba(16, 185, 129, 0.4)',
  },
  text: {
    primary: '#18181b',
    secondary: '#3f3f46',
    muted: '#52525b',
    dim: '#71717a',
    placeholder: '#a1a1aa',
    inverse: '#fafafa',
  },
  terminal: {
    prompt: '#059669',
    command: '#18181b',
    flag: '#059669',
    value: '#3f3f46',
    path: '#2563eb',
    string: '#d97706',
    comment: '#71717a',
    error: '#dc2626',
    warning: '#d97706',
    success: '#059669',
    info: '#2563eb',
  },
  status: {
    ready: '#059669',
    busy: '#d97706',
    error: '#dc2626',
    idle: '#71717a',
  },
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.07)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    glow: '0 0 20px rgba(16, 185, 129, 0.1)',
  },
};

// =============================================================================
// CSS Variable Mapping
// =============================================================================

const CSS_VAR_PREFIX = '--theme';

type NestedObject = { [key: string]: string | NestedObject };

function flattenTheme(theme: ThemeColors | NestedObject, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(theme)) {
    const varName = prefix ? `${prefix}-${key}` : key;
    
    if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenTheme(value as NestedObject, varName));
    } else {
      result[`${CSS_VAR_PREFIX}-${varName}`] = value as string;
    }
  }
  
  return result;
}

/**
 * Apply theme colors as CSS variables to document root
 */
export function applyThemeToDocument(theme: ThemeColors): void {
  const vars = flattenTheme(theme);
  const root = document.documentElement;
  
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

/**
 * Get CSS variable reference for theme color
 */
export function themeVar(path: string): string {
  const varName = `${CSS_VAR_PREFIX}-${path.replace(/\./g, '-')}`;
  return `var(${varName})`;
}

// =============================================================================
// Theme Storage
// =============================================================================

const STORAGE_KEY = 'vyotiq-theme-mode';

function getStoredTheme(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch (error) {
    logger.debug('Failed to read theme mode from storage', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

function storeTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (error) {
    logger.debug('Failed to persist theme mode to storage', {
      mode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// =============================================================================
// System Preference Detection
// =============================================================================

function getSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return getSystemPreference();
  }
  return mode;
}

// =============================================================================
// Theme Context
// =============================================================================

import { createContext, useContext, type ReactNode } from 'react';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Theme Provider component
 */
export function ThemeProvider({ 
  children,
  defaultMode = 'system',
}: { 
  children: ReactNode;
  defaultMode?: ThemeMode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return getStoredTheme() ?? defaultMode;
  });
  
  const resolved = useMemo(() => resolveTheme(mode), [mode]);
  const colors = useMemo(() => resolved === 'dark' ? darkTheme : lightTheme, [resolved]);
  
  // Apply theme to document via CSS class toggle
  // The html.dark / html.light classes in index.css handle all --color-* variables
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolved);
  }, [resolved]);
  
  // Listen for system preference changes
  useEffect(() => {
    if (mode !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handler = () => {
      const newResolved = getSystemPreference();
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add(newResolved);
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [mode]);
  
  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    storeTheme(newMode);
  }, []);
  
  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);
  
  const value = useMemo((): ThemeContextValue => ({
    mode,
    resolved,
    colors,
    setMode,
    toggle,
  }), [mode, resolved, colors, setMode, toggle]);
  
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Hook for theme-aware colors
 */
export function useThemeColors(): ThemeColors {
  const { colors } = useTheme();
  return colors;
}

/**
 * Hook for resolved theme mode
 */
export function useResolvedTheme(): ResolvedTheme {
  const { resolved } = useTheme();
  return resolved;
}

// =============================================================================
// Theme-aware Style Utilities
// =============================================================================

// =============================================================================
// Transition Utilities
// =============================================================================

/**
 * CSS classes for smooth theme transitions
 */
export const themeTransition = 'transition-colors duration-200 ease-out';

/**
 * Apply theme transition to all elements
 */
export function enableThemeTransition(): void {
  document.documentElement.style.setProperty(
    'transition',
    'background-color 0.2s ease-out, color 0.2s ease-out, border-color 0.2s ease-out'
  );
}

/**
 * Disable theme transition (for initial load)
 */
export function disableThemeTransition(): void {
  document.documentElement.style.removeProperty('transition');
}

export default {
  darkTheme,
  lightTheme,
  ThemeProvider,
  useTheme,
  useThemeColors,
  useResolvedTheme,
  themeVar,
  themeTransition,
};
