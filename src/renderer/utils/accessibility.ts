/**
 * Accessibility Utilities
 * 
 * Centralized accessibility utilities for ARIA labels, focus management,
 * keyboard navigation, and screen reader support.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';

// Import reduced motion hook from hooks module to avoid duplication
// import { usePrefersReducedMotion as useMediaQueryReducedMotion } from '../hooks/useMediaQuery';

// =============================================================================
// ARIA Labels and Roles
// =============================================================================

/**
 * Common ARIA attributes for interactive elements
 */
export const ariaButton = (label: string, options?: {
  pressed?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  controls?: string;
  describedBy?: string;
}) => ({
  'aria-label': label,
  role: 'button',
  tabIndex: options?.disabled ? -1 : 0,
  ...(options?.pressed !== undefined && { 'aria-pressed': options.pressed }),
  ...(options?.expanded !== undefined && { 'aria-expanded': options.expanded }),
  ...(options?.disabled && { 'aria-disabled': true }),
  ...(options?.controls && { 'aria-controls': options.controls }),
  ...(options?.describedBy && { 'aria-describedby': options.describedBy }),
});

/**
 * ARIA attributes for navigation regions
 */
export const ariaNavigation = (label: string) => ({
  role: 'navigation',
  'aria-label': label,
});

/**
 * ARIA attributes for main content region
 */
export const ariaMain = (label = 'Main content') => ({
  role: 'main',
  'aria-label': label,
});

/**
 * ARIA attributes for complementary regions (sidebar)
 */
export const ariaAside = (label: string) => ({
  role: 'complementary',
  'aria-label': label,
});

/**
 * ARIA attributes for dialogs/modals
 */
export const ariaDialog = (label: string, description?: string) => ({
  role: 'dialog',
  'aria-modal': true,
  'aria-label': label,
  ...(description && { 'aria-describedby': description }),
});

/**
 * ARIA attributes for alert messages
 */
export const ariaAlert = (type: 'assertive' | 'polite' = 'polite') => ({
  role: type === 'assertive' ? 'alert' : 'status',
  'aria-live': type,
  'aria-atomic': true,
});

/**
 * ARIA attributes for lists
 */
export const ariaList = (label?: string) => ({
  role: 'list',
  ...(label && { 'aria-label': label }),
});

export const ariaListItem = () => ({
  role: 'listitem',
});

/**
 * ARIA attributes for menus
 */
export const ariaMenu = (label: string) => ({
  role: 'menu',
  'aria-label': label,
});

export const ariaMenuItem = (selected = false) => ({
  role: 'menuitem',
  'aria-selected': selected,
  tabIndex: selected ? 0 : -1,
});

/**
 * ARIA attributes for tabs
 */
export const ariaTabList = (label: string, orientation: 'horizontal' | 'vertical' = 'horizontal') => ({
  role: 'tablist',
  'aria-label': label,
  'aria-orientation': orientation,
});

export const ariaTab = (id: string, panelId: string, selected = false) => ({
  role: 'tab',
  id,
  'aria-selected': selected,
  'aria-controls': panelId,
  tabIndex: selected ? 0 : -1,
});

export const ariaTabPanel = (id: string, tabId: string) => ({
  role: 'tabpanel',
  id,
  'aria-labelledby': tabId,
  tabIndex: 0,
});

/**
 * ARIA attributes for tree views (removed - explorer functionality removed)
 */
// ariaTree and ariaTreeItem removed - explorer functionality removed


/**
 * ARIA attributes for loading states
 */
export const ariaLoading = (label = 'Loading') => ({
  role: 'progressbar',
  'aria-label': label,
  'aria-busy': true,
});

/**
 * ARIA attributes for search
 */
export const ariaSearch = (label = 'Search') => ({
  role: 'search',
  'aria-label': label,
});

// =============================================================================
// Focus Management Hooks
// =============================================================================

/**
 * Trap focus within an element (for modals/dialogs)
 * Supports two usage patterns:
 * 1. useFocusTrap(active) - returns a ref to attach to container
 * 2. useFocusTrap(externalRef, active) - uses provided ref
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  refOrActive: React.RefObject<T> | boolean = true,
  activeParam?: boolean
) {
  // Determine if first arg is a ref or boolean
  const isRefProvided = typeof refOrActive === 'object' && refOrActive !== null;
  const externalRef = isRefProvided ? refOrActive : null;
  const active = isRefProvided ? (activeParam ?? true) : (refOrActive as boolean);
  
  const internalRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  
  // Store containerRef in a stable ref to avoid dependency issues
  const containerRefStable = useRef<React.RefObject<T>>(externalRef || internalRef);
  containerRefStable.current = externalRef || internalRef;
  
  useEffect(() => {
    if (!active) return;
    
    // Store the previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;
    
    const container = containerRefStable.current.current;
    if (!container) return;
    
    // Get all focusable elements
    const getFocusableElements = () => {
      const selectors = [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');
      
      return Array.from(container.querySelectorAll<HTMLElement>(selectors));
    };
    
    // Focus the first focusable element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
    
    // Handle Tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      const elements = getFocusableElements();
      if (elements.length === 0) return;
      
      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];
      
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };
    
    container.addEventListener('keydown', handleKeyDown);
    
    // Restore focus on cleanup
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current && document.body.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus();
      }
    };
  }, [active]);
  
  // Return internal ref only if no external ref was provided
  return isRefProvided ? undefined : internalRef;
}

/**
 * Manage focus when opening/closing a component
 */
export function useFocusOnMount<T extends HTMLElement = HTMLElement>(shouldFocus = true) {
  const ref = useRef<T>(null);
  
  useEffect(() => {
    if (shouldFocus && ref.current) {
      // Small delay to ensure element is mounted
      const timer = setTimeout(() => {
        ref.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [shouldFocus]);
  
  return ref;
}

/**
 * Return focus to a specific element after an action
 */
export function useReturnFocus() {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  
  const saveFocus = useCallback(() => {
    returnFocusRef.current = document.activeElement as HTMLElement;
  }, []);
  
  const restoreFocus = useCallback(() => {
    if (returnFocusRef.current && document.body.contains(returnFocusRef.current)) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, []);
  
  return { saveFocus, restoreFocus };
}

// =============================================================================
// Keyboard Navigation Hooks
// =============================================================================

/**
 * Arrow key navigation for lists
 */
export function useArrowNavigation<T extends HTMLElement = HTMLDivElement>(
  itemCount: number,
  options?: {
    orientation?: 'horizontal' | 'vertical' | 'both';
    loop?: boolean;
    onSelect?: (index: number) => void;
    initialIndex?: number;
  }
) {
  const containerRef = useRef<T>(null);
  const [activeIndex, setActiveIndex] = useState(options?.initialIndex ?? 0);
  
  const orientation = options?.orientation ?? 'vertical';
  const loop = options?.loop ?? true;
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      let newIndex = activeIndex;
      
      const isNext = (
        (orientation !== 'horizontal' && e.key === 'ArrowDown') ||
        (orientation !== 'vertical' && e.key === 'ArrowRight')
      );
      
      const isPrev = (
        (orientation !== 'horizontal' && e.key === 'ArrowUp') ||
        (orientation !== 'vertical' && e.key === 'ArrowLeft')
      );
      
      if (isNext) {
        e.preventDefault();
        newIndex = loop
          ? (activeIndex + 1) % itemCount
          : Math.min(activeIndex + 1, itemCount - 1);
      } else if (isPrev) {
        e.preventDefault();
        newIndex = loop
          ? (activeIndex - 1 + itemCount) % itemCount
          : Math.max(activeIndex - 1, 0);
      } else if (e.key === 'Home') {
        e.preventDefault();
        newIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        newIndex = itemCount - 1;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        options?.onSelect?.(activeIndex);
        return;
      }
      
      if (newIndex !== activeIndex) {
        setActiveIndex(newIndex);
      }
    };
    
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, itemCount, loop, orientation, options]);
  
  return { containerRef, activeIndex, setActiveIndex };
}

/**
 * Type-ahead search for lists
 */
export function useTypeahead(
  items: string[],
  onMatch: (index: number) => void,
  options?: {
    timeout?: number;
    caseSensitive?: boolean;
  }
) {
  const searchBufferRef = useRef('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  const timeout = options?.timeout ?? 500;
  const caseSensitive = options?.caseSensitive ?? false;
  
  const handleKeyPress = useCallback((char: string) => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Append character to search buffer
    searchBufferRef.current += char;
    
    // Search for matching item
    const search = caseSensitive
      ? searchBufferRef.current
      : searchBufferRef.current.toLowerCase();
    
    const matchIndex = items.findIndex(item => {
      const itemText = caseSensitive ? item : item.toLowerCase();
      return itemText.startsWith(search);
    });
    
    if (matchIndex >= 0) {
      onMatch(matchIndex);
    }
    
    // Clear buffer after timeout
    timeoutRef.current = setTimeout(() => {
      searchBufferRef.current = '';
    }, timeout);
  }, [items, onMatch, timeout, caseSensitive]);
  
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return handleKeyPress;
}

// =============================================================================
// Screen Reader Utilities
// =============================================================================

/**
 * Announce message to screen readers
 */
export function useScreenReaderAnnounce() {
  const announceRef = useRef<HTMLDivElement | null>(null);
  
  useEffect(() => {
    // Create live region if it doesn't exist
    if (!announceRef.current) {
      const div = document.createElement('div');
      div.setAttribute('aria-live', 'polite');
      div.setAttribute('aria-atomic', 'true');
      div.className = 'sr-only';
      div.style.cssText = 'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0);';
      document.body.appendChild(div);
      announceRef.current = div;
    }
    
    return () => {
      if (announceRef.current && document.body.contains(announceRef.current)) {
        document.body.removeChild(announceRef.current);
        announceRef.current = null;
      }
    };
  }, []);
  
  const announce = useCallback((message: string, politeness: 'polite' | 'assertive' = 'polite') => {
    if (!announceRef.current) return;
    
    announceRef.current.setAttribute('aria-live', politeness);
    announceRef.current.textContent = '';
    
    // Small delay to ensure the change is detected
    requestAnimationFrame(() => {
      if (announceRef.current) {
        announceRef.current.textContent = message;
      }
    });
  }, []);
  
  return announce;
}

/**
 * Create visually hidden but accessible text
 */
export const srOnly = {
  className: 'sr-only absolute w-px h-px overflow-hidden whitespace-nowrap',
  style: {
    position: 'absolute' as const,
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap' as const,
    borderWidth: 0,
  },
};

// =============================================================================
// Skip Link Component Helper
// =============================================================================

/**
 * Props for skip link functionality
 */
export const getSkipLinkProps = (targetId: string) => ({
  href: `#${targetId}`,
  className: 'sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:p-4 focus:bg-[var(--color-surface-2)] focus:text-[var(--color-accent-primary)] focus:rounded-lg',
  children: 'Skip to main content',
});

// =============================================================================
// Reduced Motion Utilities
// =============================================================================

/**
 * Check if user prefers reduced motion
 */
export const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return prefersReducedMotion;
};

/**
 * Get animation class based on reduced motion preference
 */
export function useAnimationClass(animationClass: string, fallbackClass = '') {
  const prefersReducedMotion = usePrefersReducedMotion();
  return prefersReducedMotion ? fallbackClass : animationClass;
}

// =============================================================================
// Alias Exports for API Compatibility
// =============================================================================

/**
 * Alias for useScreenReaderAnnounce - provides announce function for screen readers
 */
export function useAnnouncer() {
  const announce = useScreenReaderAnnounce();
  return { announce };
}

/**
 * Alias for usePrefersReducedMotion
 */
export const useReducedMotion = usePrefersReducedMotion;

/**
 * Check if user prefers high contrast
 */
export function useHighContrast() {
  const [prefersHighContrast, setPrefersHighContrast] = useState(false);
  
  useEffect(() => {
    const query = window.matchMedia('(prefers-contrast: more)');
    setPrefersHighContrast(query.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersHighContrast(e.matches);
    };
    
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);
  
  return prefersHighContrast;
}

// =============================================================================
// Focus Trap Utility (non-hook version)
// =============================================================================

export interface FocusTrapOptions {
  onEscape?: () => void;
  returnFocus?: boolean;
  initialFocus?: HTMLElement | null;
}

/**
 * Non-hook focus trap utility - creates a focus trap manager
 */
export function focusTrap(container: HTMLElement, options: FocusTrapOptions = {}) {
  const previousFocus = document.activeElement as HTMLElement;
  
  const getFocusableElements = () => {
    const selectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return Array.from(container.querySelectorAll<HTMLElement>(selectors));
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && options.onEscape) {
      options.onEscape();
      return;
    }
    
    if (e.key !== 'Tab') return;
    
    const elements = getFocusableElements();
    if (elements.length === 0) return;
    
    const firstElement = elements[0];
    const lastElement = elements[elements.length - 1];
    
    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  };
  
  // Activate trap
  container.addEventListener('keydown', handleKeyDown);
  
  // Focus initial element
  if (options.initialFocus) {
    options.initialFocus.focus();
  } else {
    const elements = getFocusableElements();
    if (elements.length > 0) {
      elements[0].focus();
    }
  }
  
  // Return deactivate function
  return {
    deactivate: () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (options.returnFocus !== false && previousFocus && document.body.contains(previousFocus)) {
        previousFocus.focus();
      }
    },
  };
}

// =============================================================================
// Keyboard Navigation
// =============================================================================

export interface KeyboardNavigationOptions {
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
  onSelect?: (index: number) => void;
}

/**
 * Keyboard navigation utility class
 */
export class KeyboardNavigation {
  private container: HTMLElement;
  private itemCount: number;
  private activeIndex: number;
  private options: KeyboardNavigationOptions;
  private handleKeyDown: (e: KeyboardEvent) => void;
  
  constructor(container: HTMLElement, itemCount: number, options: KeyboardNavigationOptions = {}) {
    this.container = container;
    this.itemCount = itemCount;
    this.activeIndex = 0;
    this.options = {
      orientation: 'vertical',
      loop: true,
      ...options,
    };
    
    this.handleKeyDown = (e: KeyboardEvent) => {
      let newIndex = this.activeIndex;
      const { orientation, loop } = this.options;
      
      const isNext = (
        (orientation !== 'horizontal' && e.key === 'ArrowDown') ||
        (orientation !== 'vertical' && e.key === 'ArrowRight')
      );
      
      const isPrev = (
        (orientation !== 'horizontal' && e.key === 'ArrowUp') ||
        (orientation !== 'vertical' && e.key === 'ArrowLeft')
      );
      
      if (isNext) {
        e.preventDefault();
        newIndex = loop
          ? (this.activeIndex + 1) % this.itemCount
          : Math.min(this.activeIndex + 1, this.itemCount - 1);
      } else if (isPrev) {
        e.preventDefault();
        newIndex = loop
          ? (this.activeIndex - 1 + this.itemCount) % this.itemCount
          : Math.max(this.activeIndex - 1, 0);
      } else if (e.key === 'Home') {
        e.preventDefault();
        newIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        newIndex = this.itemCount - 1;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.options.onSelect?.(this.activeIndex);
        return;
      }
      
      if (newIndex !== this.activeIndex) {
        this.activeIndex = newIndex;
      }
    };
    
    this.container.addEventListener('keydown', this.handleKeyDown);
  }
  
  getActiveIndex() {
    return this.activeIndex;
  }
  
  setActiveIndex(index: number) {
    this.activeIndex = Math.max(0, Math.min(index, this.itemCount - 1));
  }
  
  destroy() {
    this.container.removeEventListener('keydown', this.handleKeyDown);
  }
}

/**
 * Hook wrapper for KeyboardNavigation
 */
export function useKeyboardNavigation(
  itemCount: number,
  options?: KeyboardNavigationOptions
) {
  return useArrowNavigation(itemCount, options);
}

// =============================================================================
// Announcer Class
// =============================================================================

/**
 * Screen reader announcer class for imperative usage
 */
export class Announcer {
  private liveRegion: HTMLDivElement;
  
  constructor() {
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = 'sr-only';
    this.liveRegion.style.cssText = 'position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0);';
    document.body.appendChild(this.liveRegion);
  }
  
  announce(message: string, politeness: 'polite' | 'assertive' = 'polite') {
    this.liveRegion.setAttribute('aria-live', politeness);
    this.liveRegion.textContent = '';
    
    requestAnimationFrame(() => {
      this.liveRegion.textContent = message;
    });
  }
  
  destroy() {
    if (document.body.contains(this.liveRegion)) {
      document.body.removeChild(this.liveRegion);
    }
  }
}

// =============================================================================
// ARIA Helpers
// =============================================================================

/**
 * Get ARIA label based on element type and state
 */
export function getAriaLabel(
  label: string,
  state?: { disabled?: boolean; expanded?: boolean; selected?: boolean }
): string {
  let result = label;
  
  if (state?.disabled) {
    result += ', disabled';
  }
  if (state?.expanded !== undefined) {
    result += state.expanded ? ', expanded' : ', collapsed';
  }
  if (state?.selected) {
    result += ', selected';
  }
  
  return result;
}

export interface LiveRegionProps {
  'aria-live': 'polite' | 'assertive' | 'off';
  'aria-atomic'?: boolean;
  'aria-relevant'?: 'additions' | 'removals' | 'text' | 'all';
}

/**
 * Get live region props for dynamic content
 */
export function getLiveRegionProps(
  politeness: 'polite' | 'assertive' = 'polite',
  options?: { atomic?: boolean; relevant?: 'additions' | 'removals' | 'text' | 'all' }
): LiveRegionProps {
  return {
    'aria-live': politeness,
    'aria-atomic': options?.atomic ?? true,
    ...(options?.relevant && { 'aria-relevant': options.relevant }),
  };
}

export interface A11yOptions {
  role?: string;
  label?: string;
  describedBy?: string;
  controls?: string;
  expanded?: boolean;
  selected?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

/**
 * Get comprehensive accessibility props
 */
export function getA11yProps(options: A11yOptions): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  
  if (options.role) props.role = options.role;
  if (options.label) props['aria-label'] = options.label;
  if (options.describedBy) props['aria-describedby'] = options.describedBy;
  if (options.controls) props['aria-controls'] = options.controls;
  if (options.expanded !== undefined) props['aria-expanded'] = options.expanded;
  if (options.selected !== undefined) props['aria-selected'] = options.selected;
  if (options.disabled) props['aria-disabled'] = true;
  if (options.hidden) props['aria-hidden'] = true;
  
  return props;
}

// =============================================================================
// Skip Link Hook
// =============================================================================

/**
 * Hook for skip link functionality
 */
export function useSkipLink(targetId: string) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }, [targetId]);
  
  return {
    href: `#${targetId}`,
    onClick: handleClick,
    className: 'sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:p-4 focus:bg-[var(--color-surface-2)] focus:text-[var(--color-accent-primary)] focus:rounded-lg',
  };
}

export default {
  ariaButton,
  ariaNavigation,
  ariaMain,
  ariaAside,
  ariaDialog,
  ariaAlert,
  ariaList,
  ariaListItem,
  ariaMenu,
  ariaMenuItem,
  ariaTabList,
  ariaTab,
  ariaTabPanel,

  ariaLoading,
  ariaSearch,
  useFocusTrap,
  useFocusOnMount,
  useReturnFocus,
  useArrowNavigation,
  useTypeahead,
  useScreenReaderAnnounce,
  useAnnouncer,
  usePrefersReducedMotion,
  useReducedMotion,
  useHighContrast,
  useAnimationClass,
  useKeyboardNavigation,
  useSkipLink,
  focusTrap,
  KeyboardNavigation,
  Announcer,
  getAriaLabel,
  getLiveRegionProps,
  getA11yProps,
  srOnly,
  getSkipLinkProps,
};
