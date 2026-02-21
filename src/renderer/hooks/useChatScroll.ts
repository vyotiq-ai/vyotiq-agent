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
 * Smart chat scroll hook with intelligent auto-scrolling
 * 
 * Keeps the view pinned to the latest content during streaming while
 * respecting user intent when they scroll away to read history.
 * 
 * Intelligence:
 * - Adaptive threshold: scales with viewport height for consistent UX
 * - Direction-aware intent: scrolling down near bottom re-engages instantly
 * - No arbitrary timeouts: re-engagement is purely position + direction based
 * - Generous catch-up zone prevents falling behind during fast content growth
 * - Programmatic scroll isolation prevents false intent detection
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
  
  // Smart user intent tracking
  const userScrolledAwayRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const lastScrollTopRef = useRef(0);

  // Adaptive threshold — scales with viewport height so the "near bottom"
  // zone feels proportional on any screen size
  const getAdaptiveThreshold = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return threshold;
    return Math.max(threshold, el.clientHeight * 0.2);
  }, [threshold]);

  // Check if scroll position is near the bottom
  const isNearBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return true;
    const { scrollTop, scrollHeight, clientHeight } = element;
    return scrollHeight - scrollTop - clientHeight <= getAdaptiveThreshold();
  }, [getAdaptiveThreshold]);

  // Instant snap to bottom with programmatic scroll isolation
  const scrollToBottomInstant = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    isProgrammaticScrollRef.current = true;
    element.scrollTop = element.scrollHeight;
    lastScrollHeightRef.current = element.scrollHeight;
    queueMicrotask(() => {
      isProgrammaticScrollRef.current = false;
    });
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

  // Direction-aware scroll intent detection
  //
  // Tracks scroll direction to make smart re-engagement decisions:
  //  - Entering near-bottom zone → immediately re-engage auto-scroll
  //  - Scrolling UP beyond threshold → disengage (user wants to read)
  //  - Scrolling DOWN above threshold → preserve current state
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    
    lastScrollTopRef.current = element.scrollTop;
    
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      
      const { scrollHeight, scrollTop, clientHeight } = element;
      const prevScrollTop = lastScrollTopRef.current;
      lastScrollTopRef.current = scrollTop;
      
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const adaptiveThreshold = getAdaptiveThreshold();
      const isScrollingDown = scrollTop > prevScrollTop;
      
      if (distanceFromBottom <= adaptiveThreshold) {
        // Near bottom — always re-engage regardless of direction
        userScrolledAwayRef.current = false;
      } else if (!isScrollingDown) {
        // Scrolling up past threshold — user wants to read history
        userScrolledAwayRef.current = true;
      }
      // Scrolling down above threshold → keep current state (don't
      // interfere while user is actively returning to bottom)
    };
    
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, [getAdaptiveThreshold]);

  // Streaming auto-scroll RAF loop — pins scroll to bottom at ~30fps
  // with a generous 3x adaptive threshold catch-up zone that prevents
  // falling behind even during rapid content growth
  useEffect(() => {
    if (!streamingMode || !enabled) return;

    let animationId: number;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 32; // ~30fps — smooth following without excessive CPU
    
    const tick = (currentTime: number) => {
      const element = scrollRef.current;
      if (!element) {
        animationId = requestAnimationFrame(tick);
        return;
      }

      if (currentTime - lastFrameTime < FRAME_INTERVAL) {
        animationId = requestAnimationFrame(tick);
        return;
      }
      lastFrameTime = currentTime;

      // Respect user intent — never auto-scroll when user has scrolled away
      if (userScrolledAwayRef.current) {
        lastScrollHeightRef.current = element.scrollHeight;
        animationId = requestAnimationFrame(tick);
        return;
      }

      const { scrollHeight, scrollTop, clientHeight } = element;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // Generous catch-up zone: 3x adaptive threshold ensures fast content
      // growth (code blocks, tool output) can never outrun the scroller
      const catchUpZone = getAdaptiveThreshold() * 3;
      if (distanceFromBottom > 2 && distanceFromBottom <= catchUpZone) {
        isProgrammaticScrollRef.current = true;
        element.scrollTop = scrollHeight - clientHeight;
        queueMicrotask(() => {
          isProgrammaticScrollRef.current = false;
        });
      }

      lastScrollHeightRef.current = scrollHeight;
      animationId = requestAnimationFrame(tick);
    };

    // Initialize — snap to bottom if auto-scroll is engaged
    if (scrollRef.current) {
      lastScrollHeightRef.current = scrollRef.current.scrollHeight;
      if (!userScrolledAwayRef.current) {
        isProgrammaticScrollRef.current = true;
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        queueMicrotask(() => {
          isProgrammaticScrollRef.current = false;
        });
      }
    }

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [streamingMode, enabled, getAdaptiveThreshold]);

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
