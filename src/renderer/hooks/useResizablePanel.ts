/**
 * useResizablePanel Hook
 * 
 * Provides reusable resize functionality for panels.
 * Supports both horizontal and vertical resize directions.
 * 
 * @module hooks/useResizablePanel
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ResizeDirection = 'horizontal' | 'vertical';

export interface ResizablePanelOptions {
  /** Direction of resize: 'horizontal' for width, 'vertical' for height */
  direction: ResizeDirection;
  /** Initial size in pixels */
  initialSize: number;
  /** Minimum size in pixels */
  minSize: number;
  /** Maximum size in pixels */
  maxSize: number;
  /** Callback when resize completes */
  onResizeEnd?: (size: number) => void;
  /** Callback when resize starts */
  onResizeStart?: () => void;
  /** Whether to persist size in localStorage */
  persistKey?: string;
  /**
   * Invert drag delta direction. Use for panels anchored to the right or
   * bottom edge of the viewport where dragging left/up should *increase* size.
   * For vertical panels this is already the default behaviour.
   */
  invertDelta?: boolean;
}

export interface ResizablePanelResult {
  /** Current size (percentage or pixels based on direction) */
  size: number;
  /** Whether currently resizing */
  isResizing: boolean;
  /** Props to spread on the resize handle */
  resizeHandleProps: {
    onMouseDown: (e: React.MouseEvent) => void;
    role: string;
    tabIndex: number;
    'aria-label': string;
    'aria-orientation': 'horizontal' | 'vertical';
    'aria-valuenow': number;
    'aria-valuemin': number;
    'aria-valuemax': number;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  /** Set size programmatically */
  setSize: (size: number) => void;
  /** Reset to initial size */
  reset: () => void;
  /** Toggle between initial and max size */
  toggleMaximize: () => void;
  /** Whether currently maximized */
  isMaximized: boolean;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for creating resizable panels with drag-to-resize functionality.
 * 
 * @example
 * // Horizontal split (width percentage)
 * const { size, resizeHandleProps, isResizing } = useResizablePanel({
 *   direction: 'horizontal',
 *   initialSize: 50,
 *   minSize: 20,
 *   maxSize: 80,
 * });
 * 
 * // Vertical split (height pixels)
 * const { size, resizeHandleProps } = useResizablePanel({
 *   direction: 'vertical',
 *   initialSize: 300,
 *   minSize: 100,
 *   maxSize: 600,
 *   persistKey: 'bottom-panel-height',
 * });
 */
export function useResizablePanel({
  direction,
  initialSize,
  minSize,
  maxSize,
  onResizeEnd,
  onResizeStart,
  persistKey,
  invertDelta = false,
}: ResizablePanelOptions): ResizablePanelResult {
  // Load persisted size if available
  const getInitialSize = (): number => {
    if (persistKey) {
      try {
        const stored = localStorage.getItem(persistKey);
        if (stored) {
          const parsed = parseFloat(stored);
          if (!isNaN(parsed) && parsed >= minSize && parsed <= maxSize) {
            return parsed;
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    }
    return initialSize;
  };

  const [size, setSize] = useState(getInitialSize);
  const [isResizing, setIsResizing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  
  // Track resize start position and size
  const startPosRef = useRef<number>(0);
  const startSizeRef = useRef<number>(0);

  // Persist size changes
  useEffect(() => {
    if (persistKey && !isResizing) {
      try {
        localStorage.setItem(persistKey, size.toString());
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [size, persistKey, isResizing]);

  // Clamp size to valid range
  const clampSize = useCallback((value: number): number => {
    return Math.max(minSize, Math.min(maxSize, value));
  }, [minSize, maxSize]);

  // Handle mouse down on resize handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    onResizeStart?.();
    
    startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSizeRef.current = size;
  }, [direction, size, onResizeStart]);

  // Handle mouse move during resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      // For vertical panels or right/bottom-anchored panels, invert delta so
      // moving up/left increases size. Default horizontal (left-anchored)
      // panels grow when the mouse moves right (positive delta).
      const shouldInvert = direction === 'vertical' || invertDelta;
      const newSize = clampSize(startSizeRef.current + (shouldInvert ? -delta : delta));
      setSize(newSize);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      onResizeEnd?.(size);
    };

    // Add event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Set cursor style
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, direction, invertDelta, size, clampSize, onResizeEnd]);

  // Handle keyboard navigation for accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = 10; // 10px step for keyboard navigation
    let newSize = size;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        newSize = clampSize(size - step);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        newSize = clampSize(size + step);
        break;
      case 'Home':
        newSize = minSize;
        break;
      case 'End':
        newSize = maxSize;
        break;
      default:
        return;
    }

    e.preventDefault();
    setSize(newSize);
    onResizeEnd?.(newSize);
  }, [size, clampSize, minSize, maxSize, onResizeEnd]);

  // Reset to initial size
  const reset = useCallback(() => {
    setSize(initialSize);
    setIsMaximized(false);
    onResizeEnd?.(initialSize);
  }, [initialSize, onResizeEnd]);

  // Toggle between initial and max size
  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      setSize(initialSize);
      setIsMaximized(false);
      onResizeEnd?.(initialSize);
    } else {
      setSize(maxSize);
      setIsMaximized(true);
      onResizeEnd?.(maxSize);
    }
  }, [isMaximized, initialSize, maxSize, onResizeEnd]);

  // Build resize handle props
  const resizeHandleProps = {
    onMouseDown: handleMouseDown,
    role: 'separator',
    tabIndex: 0,
    'aria-label': `Resize ${direction === 'horizontal' ? 'panels horizontally' : 'panel height'}`,
    'aria-orientation': direction === 'horizontal' ? 'vertical' as const : 'horizontal' as const,
    'aria-valuenow': Math.round(size),
    'aria-valuemin': minSize,
    'aria-valuemax': maxSize,
    onKeyDown: handleKeyDown,
  };

  return {
    size,
    isResizing,
    resizeHandleProps,
    setSize: (newSize: number) => setSize(clampSize(newSize)),
    reset,
    toggleMaximize,
    isMaximized,
  };
}

// =============================================================================
// Utility: ResizeObserver Hook
// =============================================================================

export interface UseResizeObserverOptions {
  /** Callback when element resizes */
  onResize: (entry: ResizeObserverEntry) => void;
  /** Debounce delay in ms (default: 0 for immediate) */
  debounceMs?: number;
}

/**
 * Hook for observing element size changes.
 * 
 * @example
 * const ref = useRef<HTMLDivElement>(null);
 * useResizeObserver(ref, {
 *   onResize: (entry) => {
 *     console.log('New size:', entry.contentRect);
 *   },
 * });
 */
export function useResizeObserver<T extends HTMLElement>(
  ref: React.RefObject<T>,
  { onResize, debounceMs = 0 }: UseResizeObserverOptions
): void {
  const observerRef = useRef<ResizeObserver | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const handleResize = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;

      if (debounceMs > 0) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => onResize(entry), debounceMs);
      } else {
        // Use requestAnimationFrame for smooth updates
        requestAnimationFrame(() => onResize(entry));
      }
    };

    observerRef.current = new ResizeObserver(handleResize);
    observerRef.current.observe(ref.current);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      observerRef.current?.disconnect();
    };
  }, [ref, onResize, debounceMs]);
}
