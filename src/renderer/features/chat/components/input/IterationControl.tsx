/**
 * Iteration Control Component
 * 
 * An inline control for adjusting maxIterations while the agent is running.
 * Displays as a clickable iteration counter that expands to show a slider control.
 * 
 * @example
 * <IterationControl
 *   currentIteration={5}
 *   maxIterations={20}
 *   onMaxIterationsChange={(value) => updateSessionConfig({ maxIterations: value })}
 *   isWorking={true}
 * />
 */
import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Settings2, X, Plus, Minus } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { SETTINGS_CONSTRAINTS } from '../../../../../shared/types';

// =============================================================================
// Types
// =============================================================================

export interface IterationControlProps {
  /** Current iteration number */
  currentIteration?: number;
  /** Maximum iterations allowed */
  maxIterations?: number;
  /** Callback when max iterations is changed */
  onMaxIterationsChange?: (value: number) => void;
  /** Whether the agent is currently working */
  isWorking: boolean;
  /** Additional className */
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_ITERATIONS = SETTINGS_CONSTRAINTS.maxIterations.min;
// Slider max is 500 for UI convenience, but actual max is unlimited
const SLIDER_MAX = 500;
const STEP = 5;

// =============================================================================
// Sub-Components
// =============================================================================

/** Compact slider control */
const IterationSlider: React.FC<{
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}> = memo(({ value, onChange, min, max, step }) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange]
  );

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      className={cn(
        'w-full h-1 appearance-none cursor-pointer',
        'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
        '[&::-webkit-slider-thumb]:appearance-none',
        '[&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5',
        '[&::-webkit-slider-thumb]:bg-[var(--color-accent-primary)]',
        '[&::-webkit-slider-thumb]:border-none',
        '[&::-webkit-slider-thumb]:cursor-pointer',
        '[&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5',
        '[&::-moz-range-thumb]:bg-[var(--color-accent-primary)]',
        '[&::-moz-range-thumb]:border-none',
        '[&::-moz-range-thumb]:cursor-pointer'
      )}
      aria-label="Max iterations"
    />
  );
});
IterationSlider.displayName = 'IterationSlider';

// =============================================================================
// Main Component
// =============================================================================

export const IterationControl: React.FC<IterationControlProps> = memo(({
  currentIteration,
  maxIterations,
  onMaxIterationsChange,
  isWorking,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localValue, setLocalValue] = useState(maxIterations ?? SETTINGS_CONSTRAINTS.maxIterations.default);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local value with prop changes
  useEffect(() => {
    if (maxIterations !== undefined) {
      setLocalValue(maxIterations);
    }
  }, [maxIterations]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleSliderChange = useCallback((value: number) => {
    // Only enforce minimum, no upper limit
    const clampedValue = Math.max(MIN_ITERATIONS, value);
    setLocalValue(clampedValue);
    onMaxIterationsChange?.(clampedValue);
  }, [onMaxIterationsChange]);

  const handleIncrement = useCallback(() => {
    const newValue = localValue + STEP;
    setLocalValue(newValue);
    onMaxIterationsChange?.(newValue);
  }, [localValue, onMaxIterationsChange]);

  const handleDecrement = useCallback(() => {
    // Ensure we don't go below the current iteration
    const minAllowed = Math.max(MIN_ITERATIONS, currentIteration ?? 1);
    const newValue = Math.max(minAllowed, localValue - STEP);
    setLocalValue(newValue);
    onMaxIterationsChange?.(newValue);
  }, [localValue, currentIteration, onMaxIterationsChange]);

  const handleClose = useCallback(() => {
    setIsExpanded(false);
  }, []);

  // Don't render if not working or no iteration info
  if (!isWorking || currentIteration === undefined || maxIterations === undefined) {
    return null;
  }

  return (
    <div ref={containerRef} className={cn('relative flex items-center', className)}>
      {/* Collapsed state: Clickable iteration counter */}
      {!isExpanded && (
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'flex items-center gap-0.5 text-[10px] font-mono',
            'px-1.5 py-0.5 rounded-sm',
            'hover:bg-[var(--color-surface-2)] transition-colors duration-150',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
            'text-[var(--color-text-muted)]'
          )}
          title="Click to adjust max iterations"
          aria-label={`Iteration ${currentIteration} of ${maxIterations}. Click to adjust.`}
        >
          <span className="text-[var(--color-text-dim)]">iter</span>
          <span className="text-[var(--color-accent-primary)]">{currentIteration}</span>
          <span className="text-[var(--color-text-dim)]">/</span>
          <span>{maxIterations}</span>
          <Settings2 size={8} className="ml-0.5 text-[var(--color-text-dim)] opacity-60" />
        </button>
      )}

      {/* Expanded state: Inline slider control */}
      {isExpanded && (
        <div className={cn(
          'flex items-center gap-2 px-2 py-1',
          'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
          'rounded-sm',
          'animate-in fade-in-0 zoom-in-95 duration-150'
        )}>
          {/* Current iteration indicator */}
          <span className="text-[9px] font-mono text-[var(--color-text-muted)] whitespace-nowrap">
            <span className="text-[var(--color-accent-primary)]">{currentIteration}</span>
            <span className="text-[var(--color-text-dim)]">/</span>
          </span>

          {/* Decrement button */}
          <button
            type="button"
            onClick={handleDecrement}
            disabled={localValue <= (currentIteration ?? MIN_ITERATIONS)}
            className={cn(
              'p-0.5 rounded-sm',
              'hover:bg-[var(--color-surface-3)] transition-colors duration-150',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              'text-[var(--color-text-muted)]'
            )}
            title="Decrease max iterations"
            aria-label="Decrease max iterations"
          >
            <Minus size={10} />
          </button>

          {/* Slider */}
          <div className="w-20 flex-shrink-0">
            <IterationSlider
              value={Math.min(localValue, SLIDER_MAX)}
              onChange={handleSliderChange}
              min={Math.max(MIN_ITERATIONS, currentIteration ?? 1)}
              max={SLIDER_MAX}
              step={STEP}
            />
          </div>

          {/* Increment button */}
          <button
            type="button"
            onClick={handleIncrement}
            className={cn(
              'p-0.5 rounded-sm',
              'hover:bg-[var(--color-surface-3)] transition-colors duration-150',
              'text-[var(--color-text-muted)]'
            )}
            title="Increase max iterations"
            aria-label="Increase max iterations"
          >
            <Plus size={10} />
          </button>

          {/* Current value display */}
          <span className="text-[10px] font-mono text-[var(--color-accent-primary)] tabular-nums min-w-[24px] text-right">
            {localValue}
          </span>

          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'p-0.5 rounded-sm ml-1',
              'hover:bg-[var(--color-surface-3)] transition-colors duration-150',
              'text-[var(--color-text-dim)]'
            )}
            title="Close"
            aria-label="Close iteration control"
          >
            <X size={10} />
          </button>
        </div>
      )}
    </div>
  );
});

IterationControl.displayName = 'IterationControl';
