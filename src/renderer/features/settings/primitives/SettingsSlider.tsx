/**
 * Settings Slider Component
 * 
 * A range slider with terminal styling for numeric settings.
 * Displays label, current value, and optional description.
 */
import React, { useCallback, useId } from 'react';
import { cn } from '../../../utils/cn';
import type { SettingsComponentProps, SliderConstraints, SliderFormatFn } from './types';

export interface SettingsSliderProps extends SettingsComponentProps<number>, SliderConstraints {
  /** Format function for displaying the value */
  format?: SliderFormatFn;
}

export const SettingsSlider: React.FC<SettingsSliderProps> = ({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  disabled,
  className,
  testId,
}) => {
  const id = useId();
  
  // Format the display value
  const displayValue = format ? format(value) : String(value);

  // Format label as lowercase with dashes (terminal style)
  const formattedLabel = label.toLowerCase().replace(/\s+/g, '-');

  // Handle slider change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(Number(e.target.value));
    },
    [onChange]
  );

  // Calculate percentage for visual indicator
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div
      data-testid={testId}
      className={cn(
        'py-1.5 sm:py-2 font-mono',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {/* Label Row */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 mb-1.5 sm:mb-2">
        <label
          htmlFor={id}
          className="text-[10px] sm:text-[11px] text-[var(--color-text-primary)] flex items-center gap-1 min-w-0"
        >
          <span className="text-[var(--color-accent-secondary)] flex-shrink-0">--</span>
          <span className="truncate">{formattedLabel}</span>
        </label>
        <span className="text-[10px] sm:text-[11px] text-[var(--color-accent-primary)] tabular-nums flex-shrink-0">
          {displayValue}
        </span>
      </div>

      {/* Slider Track */}
      <div className="relative py-1">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            'w-full h-1.5 sm:h-1 appearance-none cursor-pointer touch-pan-x',
            'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
            // Thumb styling - larger on mobile for touch
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:sm:w-3',
            '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:sm:h-3',
            '[&::-webkit-slider-thumb]:bg-[var(--color-accent-primary)]',
            '[&::-webkit-slider-thumb]:border-none',
            '[&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-webkit-slider-thumb]:transition-transform',
            '[&::-webkit-slider-thumb]:duration-150',
            '[&::-webkit-slider-thumb]:hover:scale-110',
            // Firefox thumb styling
            '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:sm:w-3',
            '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:sm:h-3',
            '[&::-moz-range-thumb]:bg-[var(--color-accent-primary)]',
            '[&::-moz-range-thumb]:border-none',
            '[&::-moz-range-thumb]:cursor-pointer',
            // Focus styling
            'focus:outline-none',
            'focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
            disabled && 'cursor-not-allowed'
          )}
          style={{
            background: `linear-gradient(to right, var(--color-accent-primary) 0%, var(--color-accent-primary) ${percentage}%, var(--color-surface-2) ${percentage}%, var(--color-surface-2) 100%)`,
          }}
        />
      </div>

      {/* Range Indicators */}
      <div className="flex justify-between mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] text-[var(--color-text-dim)]">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>

      {/* Description */}
      {description && (
        <p className="text-[9px] sm:text-[10px] text-[var(--color-text-dim)] mt-1.5 sm:mt-2 leading-relaxed">
          <span className="text-[var(--color-text-placeholder)]">#</span> {description}
        </p>
      )}
    </div>
  );
};

export default SettingsSlider;
