/**
 * Virtualized List Component
 * 
 * Provides efficient rendering for large lists using windowing.
 * Only renders items that are visible in the viewport.
 */

import React, { 
  useRef, 
  useState, 
  useEffect, 
  useCallback, 
  useMemo,
  type ReactNode,
  type CSSProperties,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export interface VirtualizedListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels (can be a function for variable heights) */
  itemHeight: number | ((index: number, item: T) => number);
  /** Height of the container */
  containerHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Number of items to render outside the visible area */
  overscan?: number;
  /** Key extractor for items */
  getKey?: (item: T, index: number) => string | number;
  /** Class name for container */
  className?: string;
  /** Callback when scroll position changes */
  onScroll?: (scrollTop: number) => void;
  /** Index to scroll to (when changed, will scroll to that index) */
  scrollToIndex?: number;
}

interface VirtualizedItem<T> {
  item: T;
  index: number;
  style: CSSProperties;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getItemHeight<T>(
  itemHeight: number | ((index: number, item: T) => number),
  index: number,
  item: T
): number {
  if (typeof itemHeight === 'function') {
    return itemHeight(index, item);
  }
  return itemHeight;
}

function getItemOffsets<T>(
  items: T[],
  itemHeight: number | ((index: number, item: T) => number)
): number[] {
  const offsets: number[] = [];
  let offset = 0;
  
  for (let i = 0; i < items.length; i++) {
    offsets.push(offset);
    offset += getItemHeight(itemHeight, i, items[i]);
  }
  
  return offsets;
}

function findStartIndex(offsets: number[], scrollTop: number): number {
  // Binary search for the first item that is visible
  let low = 0;
  let high = offsets.length - 1;
  
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] < scrollTop) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  
  return Math.max(0, low - 1);
}

// =============================================================================
// VirtualizedList Component
// =============================================================================

export function VirtualizedList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  getKey,
  className = '',
  onScroll,
  scrollToIndex,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  
  // Calculate item offsets (for variable heights)
  const itemOffsets = useMemo(
    () => getItemOffsets(items, itemHeight),
    [items, itemHeight]
  );
  
  // Scroll to index when scrollToIndex changes
  useEffect(() => {
    if (scrollToIndex !== undefined && scrollToIndex >= 0 && scrollToIndex < items.length) {
      const targetOffset = itemOffsets[scrollToIndex] || 0;
      containerRef.current?.scrollTo({ top: targetOffset, behavior: 'smooth' });
    }
  }, [scrollToIndex, itemOffsets, items.length]);
  
  // Calculate total height
  const totalHeight = useMemo(() => {
    if (items.length === 0) return 0;
    const lastOffset = itemOffsets[items.length - 1] || 0;
    const lastHeight = getItemHeight(itemHeight, items.length - 1, items[items.length - 1]);
    return lastOffset + lastHeight;
  }, [items, itemOffsets, itemHeight]);
  
  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startIndex = findStartIndex(itemOffsets, scrollTop);
    
    let endIndex = startIndex;
    let accumulatedHeight = 0;
    
    while (endIndex < items.length && accumulatedHeight < containerHeight + scrollTop - (itemOffsets[startIndex] || 0)) {
      accumulatedHeight += getItemHeight(itemHeight, endIndex, items[endIndex]);
      endIndex++;
    }
    
    return {
      start: Math.max(0, startIndex - overscan),
      end: Math.min(items.length, endIndex + overscan),
    };
  }, [items, itemHeight, itemOffsets, scrollTop, containerHeight, overscan]);
  
  // Build visible items with positions
  const visibleItems = useMemo((): VirtualizedItem<T>[] => {
    const result: VirtualizedItem<T>[] = [];
    
    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      const item = items[i];
      const height = getItemHeight(itemHeight, i, item);
      const top = itemOffsets[i] || 0;
      
      result.push({
        item,
        index: i,
        style: {
          position: 'absolute',
          top,
          left: 0,
          right: 0,
          height,
        },
      });
    }
    
    return result;
  }, [items, itemHeight, itemOffsets, visibleRange]);
  
  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    onScroll?.(newScrollTop);
  }, [onScroll]);
  
  // Default key extractor
  const keyExtractor = useCallback((item: T, index: number): string | number => {
    if (getKey) {
      return getKey(item, index);
    }
    // Try to use common key properties
    const obj = item as Record<string, unknown>;
    if (typeof obj === 'object' && obj !== null) {
      if (typeof obj.id === 'string' || typeof obj.id === 'number') {
        return obj.id;
      }
      if (typeof obj.key === 'string' || typeof obj.key === 'number') {
        return obj.key;
      }
    }
    return index;
  }, [getKey]);
  
  return (
    <div
      ref={containerRef}
      className={`overflow-auto relative ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map(({ item, index, style }) => (
          <div key={keyExtractor(item, index)} style={style}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// VirtualizedText Component (for large text outputs)
// =============================================================================

export interface VirtualizedTextProps {
  /** The text content to display */
  text: string;
  /** Line height in pixels */
  lineHeight?: number;
  /** Container height */
  containerHeight: number;
  /** Number of lines to overscan */
  overscan?: number;
  /** Class name for the container */
  className?: string;
  /** Class name for each line */
  lineClassName?: string;
  /** Syntax highlighting function */
  highlightLine?: (line: string, lineNumber: number) => ReactNode;
}

export function VirtualizedText({
  text,
  lineHeight = 20,
  containerHeight,
  overscan = 5,
  className = '',
  lineClassName = '',
  highlightLine,
}: VirtualizedTextProps) {
  // Split text into lines
  const lines = useMemo(() => text.split('\n'), [text]);
  
  // Render each line
  const renderLine = useCallback((line: string, index: number) => {
    return (
      <div 
        className={`font-mono text-xs whitespace-pre ${lineClassName}`}
        style={{ height: lineHeight }}
      >
        <span className="text-[var(--color-text-dim)] select-none w-12 inline-block text-right mr-3">
          {index + 1}
        </span>
        {highlightLine ? highlightLine(line, index) : line}
      </div>
    );
  }, [lineHeight, lineClassName, highlightLine]);
  
  // Get key for line
  const getKey = useCallback((_line: string, index: number) => index, []);
  
  return (
    <VirtualizedList
      items={lines}
      itemHeight={lineHeight}
      containerHeight={containerHeight}
      renderItem={renderLine}
      overscan={overscan}
      getKey={getKey}
      className={className}
    />
  );
}

// =============================================================================
// useVirtualScroll Hook
// =============================================================================

export interface VirtualScrollOptions {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export interface VirtualScrollResult {
  startIndex: number;
  endIndex: number;
  scrollTop: number;
  setScrollTop: (scrollTop: number) => void;
  totalHeight: number;
  getItemStyle: (index: number) => CSSProperties;
}

export function useVirtualScroll(options: VirtualScrollOptions): VirtualScrollResult {
  const { itemCount, itemHeight, containerHeight, overscan = 3 } = options;
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(itemCount, startIndex + visibleCount + overscan * 2);
  const totalHeight = itemCount * itemHeight;
  
  const getItemStyle = useCallback((index: number): CSSProperties => ({
    position: 'absolute',
    top: index * itemHeight,
    left: 0,
    right: 0,
    height: itemHeight,
  }), [itemHeight]);
  
  return {
    startIndex,
    endIndex,
    scrollTop,
    setScrollTop,
    totalHeight,
    getItemStyle,
  };
}

export default {
  VirtualizedList,
  VirtualizedText,
  useVirtualScroll,
};
