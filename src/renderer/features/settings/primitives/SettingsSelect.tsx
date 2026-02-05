/**
 * Settings Select Component
 * 
 * A dropdown select with terminal styling.
 * Supports options with labels, values, and disabled states.
 */
import React, { useCallback, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { SettingsComponentProps, SelectOption, SelectOptionGroup } from './types';

export interface SettingsSelectProps<T extends string = string> extends SettingsComponentProps<T> {
  /** Options to display */
  options: SelectOption<T>[] | SelectOptionGroup<T>[];
  /** Placeholder when no value selected */
  placeholder?: string;
}

/**
 * Type guard to check if options are grouped
 */
function isOptionGroups<T extends string>(
  options: SelectOption<T>[] | SelectOptionGroup<T>[]
): options is SelectOptionGroup<T>[] {
  return options.length > 0 && 'options' in options[0];
}

export const SettingsSelect = <T extends string = string>({
  label,
  description,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled,
  className,
  testId,
}: SettingsSelectProps<T>): React.ReactElement => {
  const id = useId();

  // Format label as lowercase with dashes (terminal style)
  const formattedLabel = label.toLowerCase().replace(/\s+/g, '-');

  // Handle select change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value as T);
    },
    [onChange]
  );

  // Render flat options
  const renderOptions = (opts: SelectOption<T>[]) =>
    opts.map((option) => (
      <option
        key={option.value}
        value={option.value}
        disabled={option.disabled}
      >
        {option.label}
      </option>
    ));

  // Render grouped options
  const renderGroupedOptions = (groups: SelectOptionGroup<T>[]) =>
    groups.map((group) => (
      <optgroup key={group.label} label={group.label}>
        {renderOptions(group.options)}
      </optgroup>
    ));

  return (
    <div
      data-testid={testId}
      className={cn(
        'py-1.5 sm:py-2 font-mono',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {/* Label */}
      <label
        htmlFor={id}
        className="text-[10px] sm:text-[11px] text-[var(--color-text-primary)] flex items-center gap-1 mb-1.5 sm:mb-2 min-w-0"
      >
        <span className="text-[var(--color-accent-secondary)] flex-shrink-0">--</span>
        <span className="truncate">{formattedLabel}</span>
      </label>

      {/* Select Wrapper */}
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            'w-full appearance-none min-w-0',
            'px-2.5 sm:px-3 py-2 sm:py-1.5 pr-7 sm:pr-8',
            'text-[10px] sm:text-[11px] text-[var(--color-text-primary)]',
            'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
            'font-mono',
            'transition-colors duration-150',
            // Truncate long option text
            'text-ellipsis',
            // Hover
            !disabled && 'hover:border-[var(--color-border-default)]',
            // Focus
            'focus:outline-none',
            'focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
            'focus-visible:border-[var(--color-accent-primary)]/30',
            // Disabled
            disabled && 'cursor-not-allowed'
          )}
        >
          {/* Placeholder option */}
          {!value && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          
          {/* Options */}
          {isOptionGroups(options)
            ? renderGroupedOptions(options)
            : renderOptions(options)}
        </select>

        {/* Dropdown Icon */}
        <ChevronDown
          size={12}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2',
            'text-[var(--color-text-muted)] pointer-events-none'
          )}
        />
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

export default SettingsSelect;
