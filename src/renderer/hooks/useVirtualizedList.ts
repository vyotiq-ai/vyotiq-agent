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
  /** Threshold from bottom to trigger auto-scroll (default: 100px) */
  autoScrollThreshold?: number;
  /** Get a unique key for each item */
  getItemKey?: (item: T, index: number) => string | number;
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
    if (items.length === 0 || containerHeight === 0) return [];

    const startIndex = Math.max(0, findStartIndex(scrollTop) - overscan);
    const visibleEnd = scrollTop + containerHeight;
    
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

    return result;
  }, [items, containerHeight, scrollTop, findStartIndex, overscan, itemOffsets, measuredHeights, estimatedItemHeight, getItemKey]);

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

  // Auto-scroll to bottom when new items are added
  useEffect(() => {
    if (!autoScrollToBottom) return;
    
    const newItemCount = items.length;
    const hadNewItems = newItemCount > prevItemCountRef.current;
    prevItemCountRef.current = newItemCount;

    if (hadNewItems && isNearBottom) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container) {
          container.scrollTop = totalHeight;
        }
      });
    }
  }, [items.length, autoScrollToBottom, isNearBottom, totalHeight]);

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
