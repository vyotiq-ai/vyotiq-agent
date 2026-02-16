/**
 * Settings Input Component
 * 
 * A text input with terminal styling.
 * Supports various input types including password with show/hide toggle.
 */
import React, { useCallback, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { InputProps } from './types';

export const SettingsInput: React.FC<InputProps> = ({
  label,
  description,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
  autoComplete,
  maxLength,
  pattern,
  required,
  className,
  testId,
}) => {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);

  // Format label as lowercase with dashes (terminal style)
  const formattedLabel = label.toLowerCase().replace(/\s+/g, '-');

  // Determine actual input type (for password toggle)
  const actualType = type === 'password' && showPassword ? 'text' : type;

  // Handle input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Toggle password visibility
  const togglePasswordVisibility = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

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
        {required && (
          <span className="text-[var(--color-status-error)] flex-shrink-0">*</span>
        )}
      </label>

      {/* Input Wrapper */}
      <div className="relative">
        <input
          id={id}
          type={actualType}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          maxLength={maxLength}
          pattern={pattern}
          required={required}
          className={cn(
            'w-full',
            'px-2.5 sm:px-3 py-2 sm:py-1.5',
            type === 'password' && 'pr-9 sm:pr-10',
            'text-[10px] sm:text-[11px] text-[var(--color-text-primary)]',
            'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
            'font-mono',
            'placeholder:text-[var(--color-text-placeholder)]',
            'transition-colors duration-150',
            // Hover
            !disabled && 'hover:border-[var(--color-border-default)]',
            // Focus
            'focus:outline-none',
            'focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
            'focus-visible:border-[var(--color-accent-primary)]/30',
            // Disabled
            disabled && 'cursor-not-allowed'
          )}
        />

        {/* Password Toggle Button */}
        {type === 'password' && (
          <button
            type="button"
            onClick={togglePasswordVisibility}
            disabled={disabled}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2',
              'p-1',
              'text-[var(--color-text-muted)]',
              'transition-colors duration-150',
              !disabled && 'hover:text-[var(--color-text-secondary)]',
              'focus:outline-none',
              'focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
              disabled && 'cursor-not-allowed'
            )}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff size={14} />
            ) : (
              <Eye size={14} />
            )}
          </button>
        )}
      </div>

      {/* Character Count (for maxLength) */}
      {maxLength && (
        <div className="flex justify-end mt-0.5 sm:mt-1">
          <span className={cn(
            'text-[9px] sm:text-[10px]',
            value.length >= maxLength 
              ? 'text-[var(--color-status-warning)]' 
              : 'text-[var(--color-text-dim)]'
          )}>
            {value.length}/{maxLength}
          </span>
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="text-[9px] sm:text-[10px] text-[var(--color-text-dim)] mt-1.5 sm:mt-2 leading-relaxed">
          <span className="text-[var(--color-text-placeholder)]">#</span> {description}
        </p>
      )}
    </div>
  );
};

export default SettingsInput;
