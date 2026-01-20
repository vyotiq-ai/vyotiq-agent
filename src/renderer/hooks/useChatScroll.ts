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

  // Streaming scroll - continuously scroll as content grows
  useEffect(() => {
    if (!streamingMode || !enabled) {
      return;
    }

    let animationId: number;
    
    const tick = () => {
      const element = scrollRef.current;
      if (!element) {
        // Element not mounted yet, continue waiting
        animationId = requestAnimationFrame(tick);
        return;
      }

      const { scrollHeight, scrollTop, clientHeight } = element;
      const currentHeight = scrollHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // Only auto-scroll if user is near bottom (within threshold + buffer)
      // This respects user intent if they scroll up to read
      if (distanceFromBottom <= threshold + 50) {
        // Content grew - scroll to follow
        if (currentHeight > lastScrollHeightRef.current) {
          const targetScroll = scrollHeight - clientHeight;
          const currentScroll = scrollTop;
          const diff = targetScroll - currentScroll;
          
          if (diff > 3) {
            // Smooth catch-up: scroll 25% of remaining distance per frame
            // This creates a natural easing effect
            const scrollAmount = Math.max(2, diff * 0.25);
            element.scrollTop = currentScroll + scrollAmount;
          }
        }
      }
      
      // Always track current height to detect growth
      lastScrollHeightRef.current = currentHeight;
      animationId = requestAnimationFrame(tick);
    };

    // Initialize height tracking before starting loop
    if (scrollRef.current) {
      lastScrollHeightRef.current = scrollRef.current.scrollHeight;
    }

    // Start the scroll loop
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
    scrollToBottomInstant();
  }, [scrollToBottomInstant]);

  return { 
    scrollRef, 
    forceScrollToBottom, 
    scrollToBottom,
    isNearBottom,
  };
};
