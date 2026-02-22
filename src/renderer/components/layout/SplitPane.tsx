/**
 * Split Pane Component
 * 
 * Resizable split view using react-split with custom styling.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';

export type SplitDirection = 'horizontal' | 'vertical';

interface SplitPaneProps {
  direction?: SplitDirection;
  initialSizes?: [number, number];
  minSizes?: [number, number];
  maxSizes?: [number, number];
  children: [React.ReactNode, React.ReactNode];
  className?: string;
  gutterClassName?: string;
  onSizesChange?: (sizes: [number, number]) => void;
  collapsed?: 'first' | 'second' | null;
}

export const SplitPane: React.FC<SplitPaneProps> = memo(({
  direction = 'horizontal',
  initialSizes = [50, 50],
  minSizes = [200, 200],
  maxSizes = [Infinity, Infinity],
  children,
  className,
  gutterClassName,
  onSizesChange,
  collapsed = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState(initialSizes);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);
  const startSizes = useRef(sizes);
  // Track whether user has manually resized to avoid resetting on re-render
  const userResized = useRef(false);
  // Stable reference to initialSizes to avoid re-triggering effects
  const initialSizesRef = useRef(initialSizes);
  initialSizesRef.current = initialSizes;

  // Handle collapse — only reset to initialSizes if user hasn't resized
  useEffect(() => {
    if (collapsed === 'first') {
      setSizes([0, 100]);
      userResized.current = false;
    } else if (collapsed === 'second') {
      setSizes([100, 0]);
      userResized.current = false;
    } else if (!userResized.current) {
      setSizes(initialSizesRef.current);
    }
  }, [collapsed]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;
    startSizes.current = sizes;
  }, [direction, sizes]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const containerSize = direction === 'horizontal' 
        ? container.offsetWidth 
        : container.offsetHeight;
      
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      const deltaPercent = (delta / containerSize) * 100;

      let newFirst = startSizes.current[0] + deltaPercent;
      let newSecond = startSizes.current[1] - deltaPercent;

      // Apply min/max constraints
      const minFirst = (minSizes[0] / containerSize) * 100;
      const minSecond = (minSizes[1] / containerSize) * 100;
      const maxFirst = Math.min((maxSizes[0] / containerSize) * 100, 100 - minSecond);
      const maxSecond = Math.min((maxSizes[1] / containerSize) * 100, 100 - minFirst);

      newFirst = Math.max(minFirst, Math.min(maxFirst, newFirst));
      newSecond = Math.max(minSecond, Math.min(maxSecond, newSecond));

      // Normalize to 100%
      const total = newFirst + newSecond;
      newFirst = (newFirst / total) * 100;
      newSecond = (newSecond / total) * 100;

      setSizes([newFirst, newSecond]);
      onSizesChange?.([newFirst, newSecond]);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      userResized.current = true;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, direction, minSizes, maxSizes, onSizesChange]);

  // Keyboard accessibility for gutter
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    let delta = 0;

    if (direction === 'horizontal') {
      if (e.key === 'ArrowLeft') delta = -step;
      if (e.key === 'ArrowRight') delta = step;
    } else {
      if (e.key === 'ArrowUp') delta = -step;
      if (e.key === 'ArrowDown') delta = step;
    }

    if (delta !== 0) {
      e.preventDefault();
      const newFirst = Math.max(10, Math.min(90, sizes[0] + delta));
      const newSecond = 100 - newFirst;
      setSizes([newFirst, newSecond]);
      onSizesChange?.([newFirst, newSecond]);
    }
  }, [direction, sizes, onSizesChange]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex',
        isHorizontal ? 'flex-row' : 'flex-col',
        isDragging && `select-none ${isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize'}`,
        className
      )}
      style={{ height: '100%', width: '100%' }}
    >
      {/* First pane */}
      <div
        className="overflow-hidden flex flex-col min-w-0 min-h-0"
        style={{
          [isHorizontal ? 'width' : 'height']: `${sizes[0]}%`,
          minWidth: isHorizontal ? minSizes[0] : undefined,
          minHeight: !isHorizontal ? minSizes[0] : undefined,
        }}
      >
        {children[0]}
      </div>

      {/* Gutter */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
        className={cn(
          'relative flex items-center justify-center shrink-0 group',
          'bg-[var(--color-surface-2)] transition-colors',
          isHorizontal ? 'w-1 cursor-col-resize hover:bg-[var(--color-accent-primary)]/30' : 'h-1 cursor-row-resize hover:bg-[var(--color-accent-primary)]/30',
          isDragging && 'bg-[var(--color-accent-primary)]/50',
          gutterClassName
        )}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        {/* Visual grip */}
        <div
          className={cn(
            'absolute bg-[var(--color-text-placeholder)] rounded-full opacity-0 group-hover:opacity-100 transition-opacity',
            isHorizontal ? 'w-0.5 h-8' : 'h-0.5 w-8'
          )}
        />
      </div>

      {/* Second pane */}
      <div
        className="overflow-hidden flex flex-col min-w-0 min-h-0"
        style={{
          [isHorizontal ? 'width' : 'height']: `${sizes[1]}%`,
          minWidth: isHorizontal ? minSizes[1] : undefined,
          minHeight: !isHorizontal ? minSizes[1] : undefined,
        }}
      >
        {children[1]}
      </div>
    </div>
  );
});

SplitPane.displayName = 'SplitPane';

export default SplitPane;
