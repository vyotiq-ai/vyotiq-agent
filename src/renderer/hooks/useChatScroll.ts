import { useEffect, useRef, useCallback } from 'react';

interface UseChatScrollOptions {
  /** Enable auto-scroll behavior */
  enabled?: boolean;
  /** Threshold from bottom to trigger auto-scroll (default: 150px) */
  threshold?: number;
  /** Enable streaming mode for continuous content updates */
  streamingMode?: boolean;
}

/**
 * Chat scroll hook with automatic smooth scrolling during streaming
 * 
 * Automatically keeps the view focused on the latest content as it streams in.
 * Uses RAF for smooth 60fps scrolling performance.
 */
export const useChatScroll = <T,>(dep: T, options: UseChatScrollOptions = {}) => {
  const { 
    enabled = true, 
    threshold = 150, 
    streamingMode = false,
  } = options;
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollHeightRef = useRef(0);
  const prevDepRef = useRef<T>(dep);
  
  // Track if user manually scrolled away from bottom
  const userScrolledAwayRef = useRef(false);
  const lastUserScrollTimeRef = useRef(0);

  // Check if near bottom
  const isNearBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return true;
    const { scrollTop, scrollHeight, clientHeight } = element;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  }, [threshold]);

  // Scroll to bottom instantly
  const scrollToBottomInstant = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    lastScrollHeightRef.current = element.scrollHeight;
  }, []);

  // Scroll to bottom smoothly
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    if (!element) return;

    if (behavior === 'instant') {
      scrollToBottomInstant();
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior: 'smooth',
    });
    lastScrollHeightRef.current = element.scrollHeight;
  }, [scrollToBottomInstant]);

  // Track user scroll events to detect manual scrolling
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    
    let scrollTimeout: number | null = null;
    
    const handleScroll = () => {
      const now = Date.now();
      const { scrollHeight, scrollTop, clientHeight } = element;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // If user scrolled more than threshold away from bottom, they want to read
      if (distanceFromBottom > threshold) {
        userScrolledAwayRef.current = true;
        lastUserScrollTimeRef.current = now;
      } else {
        // User is back near bottom
        userScrolledAwayRef.current = false;
      }
      
      // Reset user scroll flag after 2 seconds of no scrolling when near bottom
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        if (!userScrolledAwayRef.current) {
          lastUserScrollTimeRef.current = 0;
        }
      }, 2000);
    };
    
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [threshold]);

  // Streaming scroll - only scroll if user hasn't scrolled away
  useEffect(() => {
    if (!streamingMode || !enabled) {
      return;
    }

    let animationId: number;
    let lastFrameTime = 0;
    const MIN_FRAME_INTERVAL = 50; // ~20fps is enough for scroll following
    
    const tick = (currentTime: number) => {
      const element = scrollRef.current;
      if (!element) {
        animationId = requestAnimationFrame(tick);
        return;
      }

      // Throttle frames
      if (currentTime - lastFrameTime < MIN_FRAME_INTERVAL) {
        animationId = requestAnimationFrame(tick);
        return;
      }
      lastFrameTime = currentTime;

      // CRITICAL: Don't auto-scroll if user manually scrolled away
      if (userScrolledAwayRef.current) {
        lastScrollHeightRef.current = element.scrollHeight;
        animationId = requestAnimationFrame(tick);
        return;
      }

      const { scrollHeight, scrollTop, clientHeight } = element;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // Only auto-scroll if very close to bottom (within threshold)
      if (distanceFromBottom <= threshold) {
        const diff = scrollHeight - clientHeight - scrollTop;
        if (diff > 2) {
          // Gentle scroll: 30% of remaining distance
          element.scrollTop = scrollTop + Math.max(2, diff * 0.3);
        }
      }
      
      lastScrollHeightRef.current = scrollHeight;
      animationId = requestAnimationFrame(tick);
    };

    // Initialize
    if (scrollRef.current) {
      lastScrollHeightRef.current = scrollRef.current.scrollHeight;
      // Only scroll to bottom if user hasn't scrolled away
      if (!userScrolledAwayRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }

    animationId = requestAnimationFrame(tick);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [streamingMode, enabled, threshold]);

  // Initialize scroll height tracking
  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      lastScrollHeightRef.current = element.scrollHeight;
    }
  }, []);

  // Auto-scroll when dependency changes (new messages)
  useEffect(() => {
    if (!enabled) return;
    if (prevDepRef.current === dep) return;
    prevDepRef.current = dep;

    // Only scroll if near bottom
    if (isNearBottom()) {
      scrollToBottom('smooth');
    }
  }, [dep, enabled, scrollToBottom, isNearBottom]);

  // Force scroll to bottom (for new user messages)
  const forceScrollToBottom = useCallback(() => {
    userScrolledAwayRef.current = false; // Reset user scroll intent
    scrollToBottomInstant();
  }, [scrollToBottomInstant]);

  // Reset user scroll flag (call when user sends a message)
  const resetUserScroll = useCallback(() => {
    userScrolledAwayRef.current = false;
  }, []);

  return { 
    scrollRef, 
    forceScrollToBottom, 
    scrollToBottom,
    isNearBottom,
    resetUserScroll,
  };
};
