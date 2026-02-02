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
  autoScrollToBottom = true,
  autoScrollThreshold = 150,
  getItemKey = (_, index) => index,
  streamingMode = false,
  streamingDep,
}: VirtualizedListOptions<T>): VirtualizedListResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Track measured heights for each item
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  
  // Previous item count for auto-scroll detection
  const prevItemCountRef = useRef(items.length);
  
  // Track last scroll height for streaming scroll
  const lastScrollHeightRef = useRef(0);

  // Calculate item offsets and total height
  const { itemOffsets, totalHeight } = useMemo(() => {
    const offsets: number[] = [];
    let currentOffset = 0;

    for (let i = 0; i < items.length; i++) {
      offsets.push(currentOffset);
      const height = measuredHeights.get(i) ?? estimatedItemHeight;
      currentOffset += height;
    }

    return { itemOffsets: offsets, totalHeight: currentOffset };
  }, [items.length, measuredHeights, estimatedItemHeight]);

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

    // Debug logging
    if (items.length > 0) {
      console.log('[VirtualizedList] Calculating items:', {
        itemsLength: items.length,
        containerHeight,
        effectiveHeight,
        scrollTop,
        startIndex,
        endIndex,
        visibleEnd,
        firstOffset: itemOffsets[0],
        totalHeight
      });
    }

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

    return result;
  }, [items, containerHeight, scrollTop, findStartIndex, overscan, itemOffsets, measuredHeights, estimatedItemHeight, getItemKey, totalHeight]);

  // Handle scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const newScrollTop = container.scrollTop;
      setScrollTop(newScrollTop);
      
      // Check if near bottom
      const distanceFromBottom = totalHeight - (newScrollTop + containerHeight);
      setIsNearBottom(distanceFromBottom < autoScrollThreshold);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
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

  // Streaming scroll - continuously scroll as content grows (RAF-based for 60fps)
  useEffect(() => {
    if (!streamingMode || !autoScrollToBottom) {
      return;
    }

    let animationId: number;
    let frameCount = 0;
    
    const tick = () => {
      const container = containerRef.current;
      if (!container) {
        // Container not mounted yet, continue waiting
        animationId = requestAnimationFrame(tick);
        return;
      }

      const { scrollHeight, scrollTop: currentScrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;
      
      // First few frames: always scroll to bottom to ensure initial position
      // This handles the case where streaming just started
      if (frameCount < 10) {
        frameCount++;
        if (scrollHeight > clientHeight) {
          container.scrollTop = scrollHeight - clientHeight;
        }
        lastScrollHeightRef.current = scrollHeight;
        animationId = requestAnimationFrame(tick);
        return;
      }
      
      // Only auto-scroll if user is near bottom (within threshold + buffer)
      // This respects user intent if they scroll up to read
      if (distanceFromBottom <= autoScrollThreshold + 100) {
        // Content grew - scroll to follow
        if (scrollHeight > lastScrollHeightRef.current || distanceFromBottom > 5) {
          const targetScroll = scrollHeight - clientHeight;
          const diff = targetScroll - currentScrollTop;
          
          if (diff > 2) {
            // Smooth catch-up: scroll 35% of remaining distance per frame
            // This creates a natural easing effect
            const scrollAmount = Math.max(3, diff * 0.35);
            container.scrollTop = currentScrollTop + scrollAmount;
          }
        }
      }
      
      // Always track current height to detect growth
      lastScrollHeightRef.current = scrollHeight;
      animationId = requestAnimationFrame(tick);
    };

    // Initialize height tracking before starting loop
    if (containerRef.current) {
      lastScrollHeightRef.current = containerRef.current.scrollHeight;
      // Immediately scroll to bottom when streaming starts
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }

    // Start the scroll loop
    animationId = requestAnimationFrame(tick);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [streamingMode, autoScrollToBottom, autoScrollThreshold]);

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
  useEffect(() => {
    if (!streamingMode || !autoScrollToBottom) return;
    
    // Scroll to bottom when streaming content updates
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      
      const { scrollHeight, scrollTop: currentScrollTop, clientHeight } = container;
      const distanceFromBottom = scrollHeight - currentScrollTop - clientHeight;
      
      // Only scroll if near bottom
      if (distanceFromBottom <= autoScrollThreshold + 100) {
        container.scrollTop = scrollHeight - clientHeight;
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

  // Update measured height for an item
  const measureItem = useCallback((index: number, height: number) => {
    setMeasuredHeights((prev) => {
      if (prev.get(index) === height) return prev;
      const next = new Map(prev);
      next.set(index, height);
      return next;
    });
  }, []);

  return {
    virtualItems,
    totalHeight,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    contentRef: contentRef as React.RefObject<HTMLDivElement>,
    scrollToIndex,
    scrollToBottom,
    measureItem,
    isNearBottom,
    scrollTop,
  };
}

/**
 * Hook to measure an element's height and report it to the virtualizer
 */
export function useVirtualItemMeasure(
  measureItem: (index: number, height: number) => void,
  index: number
): React.RefCallback<HTMLElement> {
  const measureRef = useCallback((node: HTMLElement | null) => {
    if (node) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          measureItem(index, entry.contentRect.height);
        }
      });
      observer.observe(node);
      // Initial measurement
      measureItem(index, node.getBoundingClientRect().height);
      
      // Store cleanup function
      (node as HTMLElement & { _resizeObserver?: ResizeObserver })._resizeObserver = observer;
    }
  }, [measureItem, index]);

  return measureRef;
}
