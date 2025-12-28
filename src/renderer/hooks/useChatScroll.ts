import { useEffect, useRef, useCallback } from 'react';

interface UseChatScrollOptions {
  /** Enable auto-scroll behavior */
  enabled?: boolean;
  /** Threshold from bottom to trigger auto-scroll (default: 150px) */
  threshold?: number;
  /** Debounce delay for scroll events (default: 100ms) */
  debounceMs?: number;
}

/**
 * Optimized chat scroll hook that:
 * 1. Only auto-scrolls if user is near the bottom
 * 2. Uses RAF for smooth scrolling without layout thrashing
 * 3. Debounces scroll detection to reduce event overhead
 */
export const useChatScroll = <T,>(dep: T, options: UseChatScrollOptions = {}) => {
  const { enabled = true, threshold = 150, debounceMs = 100 } = options;
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef(0);
  const prevDepRef = useRef<T>(dep);

  // Check if user is near bottom (debounced)
  const handleScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollTimeRef.current < debounceMs) return;
    lastScrollTimeRef.current = now;

    const element = scrollRef.current;
    if (!element) return;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = distanceFromBottom <= threshold;
  }, [threshold, debounceMs]);

  // Scroll to bottom using RAF for smooth animation
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (!element) return;

      // Use scrollTo with smooth behavior for better UX
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });
    });
  }, []);

  // Set up scroll listener
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    // Passive listener for better scroll performance
    element.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [handleScroll]);

  // Auto-scroll when dependency changes (only if near bottom)
  useEffect(() => {
    if (!enabled) return;
    
    // Check if dep actually changed (shallow comparison for objects won't work, so compare references)
    if (prevDepRef.current === dep) return;
    prevDepRef.current = dep;

    // Only auto-scroll if user is near bottom
    if (isNearBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [dep, enabled, scrollToBottom]);

  // Force scroll to bottom (for new messages from user)
  const forceScrollToBottom = useCallback(() => {
    isNearBottomRef.current = true;
    scrollToBottom('instant');
  }, [scrollToBottom]);

  return { scrollRef, forceScrollToBottom, scrollToBottom };
};
