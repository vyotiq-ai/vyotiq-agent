/**
 * Responsive Utilities
 * 
 * Centralized utilities for responsive design, touch interactions,
 * and mobile-specific behaviors.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { MOBILE_BREAKPOINT, TABLET_BREAKPOINT, DESKTOP_BREAKPOINT, WIDE_BREAKPOINT } from './constants';

// =============================================================================
// Breakpoint Types
// =============================================================================

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: MOBILE_BREAKPOINT,      // 640
  md: TABLET_BREAKPOINT,      // 768
  lg: DESKTOP_BREAKPOINT,     // 1024
  xl: WIDE_BREAKPOINT,        // 1280
  '2xl': 1536,
};

// =============================================================================
// Responsive Hooks
// =============================================================================

/**
 * Get current breakpoint name
 * Returns the active breakpoint string based on window width
 * 
 * Note: For checking if viewport is at/above a specific breakpoint,
 * use useBreakpoint from hooks/useMediaQuery.ts instead
 */
export function useCurrentBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('lg');
  
  useEffect(() => {
    const getBreakpoint = (): Breakpoint => {
      const width = window.innerWidth;
      if (width >= BREAKPOINTS['2xl']) return '2xl';
      if (width >= BREAKPOINTS.xl) return 'xl';
      if (width >= BREAKPOINTS.lg) return 'lg';
      if (width >= BREAKPOINTS.md) return 'md';
      if (width >= BREAKPOINTS.sm) return 'sm';
      return 'xs';
    };
    
    setBreakpoint(getBreakpoint());
    
    const handleResize = () => {
      setBreakpoint(getBreakpoint());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return breakpoint;
}

// Alias for backwards compatibility
export const useBreakpoint = useCurrentBreakpoint;

/**
 * Check if viewport is at or above a breakpoint
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);
  
  return matches;
}

/**
 * Common responsive checks
 */
export function useResponsive() {
  const breakpoint = useCurrentBreakpoint();
  
  return {
    breakpoint,
    isMobile: breakpoint === 'xs' || breakpoint === 'sm',
    isTablet: breakpoint === 'md',
    isDesktop: breakpoint === 'lg' || breakpoint === 'xl' || breakpoint === '2xl',
    isSmall: breakpoint === 'xs' || breakpoint === 'sm' || breakpoint === 'md',
    isLarge: breakpoint === 'lg' || breakpoint === 'xl' || breakpoint === '2xl',
    isExtraLarge: breakpoint === 'xl' || breakpoint === '2xl',
  };
}

// =============================================================================
// Touch Detection
// =============================================================================

/**
 * Detect if device supports touch
 */
export function useTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  
  useEffect(() => {
    const checkTouch = () => {
      return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    };
    setIsTouch(checkTouch());
  }, []);
  
  return isTouch;
}

/**
 * Handle touch interactions with haptic feedback option
 */
export function useTouchHandler(
  onTap?: () => void,
  options?: {
    haptic?: boolean;
    longPressDelay?: number;
    onLongPress?: () => void;
  }
) {
  const touchStartRef = useRef<number>(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  
  const handleTouchStart = useCallback(() => {
    touchStartRef.current = Date.now();
    
    if (options?.onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        if (options.haptic && 'vibrate' in navigator) {
          navigator.vibrate(50);
        }
        options.onLongPress?.();
      }, options.longPressDelay ?? 500);
    }
  }, [options]);
  
  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    
    const touchDuration = Date.now() - touchStartRef.current;
    
    // If it was a quick tap (not a long press)
    if (touchDuration < (options?.longPressDelay ?? 500)) {
      if (options?.haptic && 'vibrate' in navigator) {
        navigator.vibrate(10);
      }
      onTap?.();
    }
  }, [onTap, options]);
  
  const handleTouchCancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  }, []);
  
  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  };
}

// =============================================================================
// Swipe Gestures
// =============================================================================

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export function useSwipeGesture(handlers: SwipeHandlers, threshold = 50) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    // Determine primary direction
    if (absX > absY && absX > threshold) {
      if (deltaX > 0) {
        handlers.onSwipeRight?.();
      } else {
        handlers.onSwipeLeft?.();
      }
    } else if (absY > absX && absY > threshold) {
      if (deltaY > 0) {
        handlers.onSwipeDown?.();
      } else {
        handlers.onSwipeUp?.();
      }
    }
    
    touchStartRef.current = null;
  }, [handlers, threshold]);
  
  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}

// =============================================================================
// Safe Area Utilities (for notched devices)
// =============================================================================

/**
 * Get safe area insets for notched devices
 */
export function useSafeArea() {
  const [safeArea, setSafeArea] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
  
  useEffect(() => {
    const computedStyle = getComputedStyle(document.documentElement);
    
    const getSafeArea = () => ({
      top: parseInt(computedStyle.getPropertyValue('--sat') || '0', 10) || 
           parseInt(computedStyle.getPropertyValue('env(safe-area-inset-top)') || '0', 10),
      right: parseInt(computedStyle.getPropertyValue('--sar') || '0', 10) ||
             parseInt(computedStyle.getPropertyValue('env(safe-area-inset-right)') || '0', 10),
      bottom: parseInt(computedStyle.getPropertyValue('--sab') || '0', 10) ||
              parseInt(computedStyle.getPropertyValue('env(safe-area-inset-bottom)') || '0', 10),
      left: parseInt(computedStyle.getPropertyValue('--sal') || '0', 10) ||
            parseInt(computedStyle.getPropertyValue('env(safe-area-inset-left)') || '0', 10),
    });
    
    setSafeArea(getSafeArea());
  }, []);
  
  return safeArea;
}

// =============================================================================
// Orientation
// =============================================================================

export type Orientation = 'portrait' | 'landscape';

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  
  useEffect(() => {
    const getOrientation = (): Orientation => {
      if (window.matchMedia('(orientation: landscape)').matches) {
        return 'landscape';
      }
      return 'portrait';
    };
    
    setOrientation(getOrientation());
    
    const handleChange = () => {
      setOrientation(getOrientation());
    };
    
    window.addEventListener('orientationchange', handleChange);
    window.addEventListener('resize', handleChange);
    
    return () => {
      window.removeEventListener('orientationchange', handleChange);
      window.removeEventListener('resize', handleChange);
    };
  }, []);
  
  return orientation;
}

// =============================================================================
// Viewport Height (for mobile browsers with dynamic toolbars)
// =============================================================================

/**
 * Get actual viewport height (accounting for mobile browser chrome)
 */
export function useViewportHeight() {
  const [height, setHeight] = useState(0);
  
  useEffect(() => {
    const updateHeight = () => {
      // Use visualViewport if available (more accurate on mobile)
      const vh = window.visualViewport?.height ?? window.innerHeight;
      setHeight(vh);
      // Set CSS variable for use in styles
      document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
    };
    
    updateHeight();
    
    window.addEventListener('resize', updateHeight);
    window.visualViewport?.addEventListener('resize', updateHeight);
    
    return () => {
      window.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('resize', updateHeight);
    };
  }, []);
  
  return height;
}

// =============================================================================
// Responsive Container Size
// =============================================================================

/**
 * Get container dimensions (for responsive layouts)
 */
export function useContainerSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  
  return { ref, ...size };
}

// =============================================================================
// Responsive Classes Helper
// =============================================================================

/**
 * Generate responsive class strings
 */
export function responsive<T extends string>(
  classes: Partial<Record<Breakpoint, T>>
): string {
  const result: string[] = [];
  
  // Add base class (xs)
  if (classes.xs) {
    result.push(classes.xs);
  }
  
  // Add responsive prefixes
  const prefixes: Record<Exclude<Breakpoint, 'xs'>, string> = {
    sm: 'sm:',
    md: 'md:',
    lg: 'lg:',
    xl: 'xl:',
    '2xl': '2xl:',
  };
  
  for (const [breakpoint, prefix] of Object.entries(prefixes)) {
    const classValue = classes[breakpoint as Breakpoint];
    if (classValue) {
      result.push(`${prefix}${classValue}`);
    }
  }
  
  return result.join(' ');
}

// =============================================================================
// Mobile-specific Behaviors
// =============================================================================

/**
 * Prevent body scroll when modal is open (mobile-aware)
 */
export function usePreventBodyScroll(prevent: boolean) {
  useEffect(() => {
    if (!prevent) return;
    
    const scrollY = window.scrollY;
    const body = document.body;
    
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    
    return () => {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [prevent]);
}

/**
 * Detect if keyboard is open on mobile
 */
export function useKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    const initialHeight = window.innerHeight;
    
    const handleResize = () => {
      // On mobile, keyboard opening reduces viewport height significantly
      const heightDiff = initialHeight - window.innerHeight;
      setIsOpen(heightDiff > 150);
    };
    
    window.visualViewport?.addEventListener('resize', handleResize);
    
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);
  
  return isOpen;
}

export default {
  BREAKPOINTS,
  useCurrentBreakpoint,
  useBreakpoint,  // Alias for useCurrentBreakpoint
  useMediaQuery,
  useResponsive,
  useTouchDevice,
  useTouchHandler,
  useSwipeGesture,
  useSafeArea,
  useOrientation,
  useViewportHeight,
  useContainerSize,
  usePreventBodyScroll,
  useKeyboardOpen,
  responsive,
};
