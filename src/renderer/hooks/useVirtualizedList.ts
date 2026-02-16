/**
 * useVirtualizedList Hook
 * 
 * Custom implementation of virtualized list rendering for performance optimization.
 * Renders only visible items plus a buffer, significantly improving performance
 * for large chat histories (100+ messages).
 * 
 * Features:
 * - Dynamic item height support
 * - Smooth scrolling
 * - Auto-scroll to bottom for new messages
 * - Configurable overscan (buffer items)
 * - Memory-efficient: only renders visible items
 * 
 * @example
 * ```tsx
 * const { virtualItems, totalHeight, containerRef } = useVirtualizedList({
 *   items: messages,
 *   estimatedItemHeight: 100,
 *   overscan: 3,
 * });
 * ```
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VirtualizedListOptions<T> {
  /** Array of items to render */
  items: T[];
  /** Estimated height of each item in pixels */
  estimatedItemHeight: number;
  /** Number of items to render outside visible area (default: 3) */
  overscan?: number;
  /** Gap between items in pixels (default: 0) */
  gap?: number;
  /** Whether to auto-scroll to bottom when new items are added */
  autoScrollToBottom?: boolean;
  /** Threshold from bottom to trigger auto-scroll (default: 150px) */
  autoScrollThreshold?: number;
  /** Get a unique key for each item */
  getItemKey?: (item: T, index: number) => string | number;
  /** Enable streaming mode for continuous content updates (uses RAF loop) */
  streamingMode?: boolean;
  /** Dependency that triggers scroll updates during streaming */
  streamingDep?: unknown;
}

export interface VirtualItem<T> {
  /** The item data */
  item: T;
  /** Index in the original array */
  index: number;
  /** Calculated top offset in pixels */
  offsetTop: number;
  /** Measured or estimated height */
  height: number;
  /** Unique key for React rendering */
  key: string | number;
}

export interface VirtualizedListResult<T> {
  /** Items to render in the visible area + overscan */
  virtualItems: VirtualItem<T>[];
  /** Total height of all items (for scroll container) */
  totalHeight: number;
  /** Ref to attach to the scroll container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Ref to attach to the content wrapper */
  contentRef: React.RefObject<HTMLDivElement>;
  /** Scroll to a specific item index */
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  /** Scroll to bottom */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Reset user scroll intent — call when streaming starts to re-engage auto-scroll */
  resetUserScroll: () => void;
  /** Update the measured height for an item */
  measureItem: (index: number, height: number) => void;
  /** Whether user is near bottom (for auto-scroll decision) */
  isNearBottom: boolean;
  /** Current scroll position */
  scrollTop: number;
}

export function useVirtualizedList<T>({
  items,
  estimatedItemHeight,
  overscan = 3,
  gap = 0,
  autoScrollToBottom = true,
  autoScrollThreshold = 150,
  getItemKey = (_, index) => index,
  streamingMode = false,
  streamingDep,
}: VirtualizedListOptions<T>): VirtualizedListResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Track measured heights using ref + version counter to batch measurement updates.
  // Using a Map in state directly causes cascading re-renders on every item measurement.
  // Instead, we store measurements in a ref and trigger a single re-render via version counter
  // after batching all measurements within a requestAnimationFrame cycle.
  const measuredHeightsRef = useRef<Map<number, number>>(new Map());
  const [measureVersion, setMeasureVersion] = useState(0);
  const pendingMeasureRef = useRef(false);
  
  // Expose a stable getter for the measured heights (used in memos)
  const measuredHeights = measuredHeightsRef.current;
  
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  
  // Previous item count for auto-scroll detection
  const prevItemCountRef = useRef(items.length);
  
  // Track last scroll height for streaming scroll
  const lastScrollHeightRef = useRef(0);
  
  // Track if user manually scrolled away from bottom
  const userScrolledAwayRef = useRef(false);
  const lastUserScrollTimeRef = useRef(0);
  
  // Flag to distinguish programmatic scroll from user scroll
  const isProgrammaticScrollRef = useRef(false);

  // Calculate item offsets and total height (including gaps between items)
  const { itemOffsets, totalHeight } = useMemo(() => {
    const offsets: number[] = [];
    let currentOffset = 0;

    for (let i = 0; i < items.length; i++) {
      offsets.push(currentOffset);
      const height = measuredHeights.get(i) ?? estimatedItemHeight;
      currentOffset += height;
      // Add gap after each item except the last
      if (i < items.length - 1) {
        currentOffset += gap;
      }
    }

    return { itemOffsets: offsets, totalHeight: currentOffset };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measuredHeights is a ref that doesn't trigger re-renders; measureVersion tracks ref changes instead
  }, [items.length, measureVersion, estimatedItemHeight, gap]);

  // Find visible range with binary search
  const findStartIndex = useCallback((scrollTop: number): number => {
    let low = 0;
    let high = itemOffsets.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (itemOffsets[mid] < scrollTop) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return Math.max(0, low - 1);
  }, [itemOffsets]);

  // Track previous calculation range to avoid unnecessary recalculations
  const prevRangeRef = useRef<{ startIndex: number; endIndex: number; itemsLength: number }>({
    startIndex: 0,
    endIndex: 0,
    itemsLength: 0,
  });

  // Calculate visible items
  const virtualItems = useMemo((): VirtualItem<T>[] => {
    if (items.length === 0) return [];
    
    // If container height is 0, render first few items as fallback
    // This handles the case where the container hasn't been measured yet
    const effectiveHeight = containerHeight > 0 ? containerHeight : 800;

    const startIndex = Math.max(0, findStartIndex(scrollTop) - overscan);
    const visibleEnd = scrollTop + effectiveHeight;
    
    let endIndex = startIndex;
    while (endIndex < items.length && itemOffsets[endIndex] < visibleEnd) {
      endIndex++;
    }
    endIndex = Math.min(items.length - 1, endIndex + overscan);

    const result: VirtualItem<T>[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      result.push({
        item: items[i],
        index: i,
        offsetTop: itemOffsets[i],
        height: measuredHeights.get(i) ?? estimatedItemHeight,
        key: getItemKey(items[i], i),
      });
    }

    // Update previous range tracking (for debugging if needed)
    prevRangeRef.current = { startIndex, endIndex, itemsLength: items.length };

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measuredHeights ref is tracked via measureVersion to batch measurement updates
  }, [items, containerHeight, scrollTop, findStartIndex, overscan, itemOffsets, measureVersion, estimatedItemHeight, getItemKey]);

  // Handle scroll events with user intent tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scrollTimeout: number | null = null;
    let rafId: number | null = null;

    const handleScroll = () => {
      // PERF: Batch scroll-derived state updates into a single RAF frame.
      // Previously, every scroll event (including those triggered by the
      // streaming RAF auto-scroller) caused two setState calls, each
      // triggering full virtualItems recalculation.  Now we coalesce them
      // into one update per frame.
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const newScrollTop = container.scrollTop;
        setScrollTop(newScrollTop);
        
        // Check if near bottom
        const distanceFromBottom = totalHeight - (newScrollTop + containerHeight);
        const nearBottom = distanceFromBottom < autoScrollThreshold;
        setIsNearBottom(nearBottom);
        
        // CRITICAL: Skip user-intent detection during programmatic scroll
        // The RAF auto-scroll loop sets this flag before adjusting scrollTop
        if (isProgrammaticScrollRef.current) {
          return;
        }
        
        // Track user scroll intent
        const now = Date.now();
        if (distanceFromBottom > autoScrollThreshold) {
          userScrolledAwayRef.current = true;
          lastUserScrollTimeRef.current = now;
        } else {
          userScrolledAwayRef.current = false;
        }
        
        // Reset flag after 2 seconds of being near bottom
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => {
          if (!userScrolledAwayRef.current) {
            lastUserScrollTimeRef.current = 0;
          }
        }, 2000);
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [totalHeight, containerHeight, autoScrollThreshold]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    observer.observe(container);
    setContainerHeight(container.clientHeight);

    return () => observer.disconnect();
  }, []);

  // Scroll to bottom on initial mount when items exist
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    if (items.length === 0) return;
    if (!containerHeight) return;
    
    hasInitializedRef.current = true;
    
    // Scroll to bottom on initial load
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (container && autoScrollToBottom) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [items.length, containerHeight, autoScrollToBottom]);

  // Streaming scroll - only follow content if user hasn't scrolled away
  useEffect(() => {
    if (!streamingMode || !autoScrollToBottom) {
      return;
    }

    let animationId: number;
    let lastFrameTime = 0;
    const MIN_FRAME_INTERVAL = 50; // ~20fps is enough for scroll following
    
    const tick = (currentTime: number) => {
      const container = containerRef.current;
      if (!container) {
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
        lastScrollHeightRef.current = container.scrollHeight;
        animationId = requestAnimationFrame(tick);
        return;
      }

      const { scrollHeight, scrollTop: currentScrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;
      
      // Use 2x threshold to prevent falling behind during fast streaming
      const scrollThreshold = autoScrollThreshold * 2;
      if (distanceFromBottom <= scrollThreshold) {
        const diff = scrollHeight - clientHeight - currentScrollTop;
        if (diff > 2) {
          // Set flag to prevent false user-intent detection
          isProgrammaticScrollRef.current = true;
          // SNAP to bottom — asymptotic catch-up (50%, 30%) can never keep
          // pace with fast content growth; the scroll falls behind, exceeds
          // the threshold, and auto-scroll permanently disengages.  Snapping
          // to scrollHeight guarantees the latest content stays in view.
          container.scrollTop = scrollHeight - clientHeight;
          queueMicrotask(() => {
            isProgrammaticScrollRef.current = false;
          });
        }
      }
      
      lastScrollHeightRef.current = scrollHeight;
      animationId = requestAnimationFrame(tick);
    };

    // Initialize
    if (containerRef.current) {
      lastScrollHeightRef.current = containerRef.current.scrollHeight;
      // Only scroll to bottom if user hasn't scrolled away
      if (!userScrolledAwayRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }
    animationId = requestAnimationFrame(tick);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [streamingMode, autoScrollToBottom, autoScrollThreshold]);

  // Re-anchor to bottom when totalHeight changes due to item measurement.
  // When items are measured as shorter than estimated, totalHeight shrinks,
  // the inner div height decreases, and the browser clamps scrollTop — which
  // manifests as an upward scroll jump.  Compensate by snapping to the new
  // bottom whenever we were already near-bottom.
  const prevTotalHeightRef = useRef(totalHeight);
  useEffect(() => {
    const container = containerRef.current;
    const prevHeight = prevTotalHeightRef.current;
    prevTotalHeightRef.current = totalHeight;

    if (!container || prevHeight === 0) return;
    if (totalHeight === prevHeight) return;
    if (userScrolledAwayRef.current) return;

    // If near bottom OR streaming, snap to the new bottom
    const { scrollTop: st, clientHeight: ch } = container;
    const distFromOldBottom = prevHeight - st - ch;
    if (distFromOldBottom < autoScrollThreshold * 2 || streamingMode) {
      isProgrammaticScrollRef.current = true;
      container.scrollTop = container.scrollHeight;
      queueMicrotask(() => {
        isProgrammaticScrollRef.current = false;
      });
    }
  }, [totalHeight, autoScrollThreshold, streamingMode]);

  // Auto-scroll to bottom when new items are added (non-streaming mode)
  useEffect(() => {
    if (!autoScrollToBottom || streamingMode) return;
    
    const newItemCount = items.length;
    const hadNewItems = newItemCount > prevItemCountRef.current;
    prevItemCountRef.current = newItemCount;

    if (hadNewItems && isNearBottom) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [items.length, autoScrollToBottom, isNearBottom, streamingMode]);

  // Auto-scroll when streaming dependency changes (content updates)
  // This is a backup for when RAF loop misses an update
  useEffect(() => {
    if (!streamingMode || !autoScrollToBottom) return;
    // Don't scroll if user has scrolled away
    if (userScrolledAwayRef.current) return;
    
    // Scroll to bottom when streaming content updates and near bottom
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      
      const { scrollHeight, scrollTop: currentScrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;
      
      // Use 2x threshold for the backup — more generous to prevent falling behind
      if (distanceFromBottom <= autoScrollThreshold * 2) {
        isProgrammaticScrollRef.current = true;
        container.scrollTop = scrollHeight - clientHeight;
        queueMicrotask(() => {
          isProgrammaticScrollRef.current = false;
        });
      }
    });
  }, [streamingDep, streamingMode, autoScrollToBottom, autoScrollThreshold]);

  // Scroll to specific index
  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container || index < 0 || index >= items.length) return;

    const offset = itemOffsets[index];
    container.scrollTo({ top: offset, behavior });
  }, [itemOffsets, items.length]);

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({ top: totalHeight, behavior });
  }, [totalHeight]);

  // Reset user scroll intent — call when new iteration/streaming starts
  // so auto-scroll re-engages even if user scrolled away previously
  const resetUserScroll = useCallback(() => {
    userScrolledAwayRef.current = false;
    lastUserScrollTimeRef.current = 0;
  }, []);

  // Update measured height for an item — batched via requestAnimationFrame
  // to avoid cascading state updates during rapid measurement callbacks
  const measureItem = useCallback((index: number, height: number) => {
    if (measuredHeightsRef.current.get(index) === height) return;
    measuredHeightsRef.current.set(index, height);
    
    if (!pendingMeasureRef.current) {
      pendingMeasureRef.current = true;
      requestAnimationFrame(() => {
        pendingMeasureRef.current = false;
        setMeasureVersion(v => v + 1);
      });
    }
  }, []);

  return {
    virtualItems,
    totalHeight,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    contentRef: contentRef as React.RefObject<HTMLDivElement>,
    scrollToIndex,
    scrollToBottom,
    resetUserScroll,
    measureItem,
    isNearBottom,
    scrollTop,
  };
}

/**
 * Hook to measure an element's height and report it to the virtualizer.
 * Uses ResizeObserver to track dynamic size changes (e.g. collapse/expand).
 */
export function useVirtualItemMeasure(
  measureItem: (index: number, height: number) => void,
  index: number
): React.RefCallback<HTMLElement> {
  // Keep the observer in a ref so we can disconnect it when the node
  // changes or unmounts — the previous implementation stored it on the
  // DOM node which was never cleaned up.
  const observerRef = useRef<ResizeObserver | null>(null);

  const measureRef = useCallback((node: HTMLElement | null) => {
    // Disconnect previous observer (handles ref changes & unmount)
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (node) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          measureItem(index, entry.contentRect.height);
        }
      });
      observer.observe(node);
      // Initial measurement
      measureItem(index, node.getBoundingClientRect().height);
      observerRef.current = observer;
    }
  }, [measureItem, index]);

  return measureRef;
}
