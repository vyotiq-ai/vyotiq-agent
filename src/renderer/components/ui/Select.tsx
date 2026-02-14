/**
 * Terminal-styled Select Component
 * 
 * Custom dropdown select with CLI aesthetics.
 */
import React, { useState, useRef, useCallback, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useClickOutside } from '../../hooks/useClickOutside';

// =============================================================================
// Types
// =============================================================================

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Position of dropdown */
  position?: 'bottom' | 'top';
}

// =============================================================================
// Size Configuration
// =============================================================================

const sizeStyles = {
  sm: {
    trigger: 'h-7 px-2 text-[10px]',
    option: 'px-2 py-1.5 text-[10px]',
    icon: 10,
    dropdown: 'max-h-40',
  },
  md: {
    trigger: 'h-8 px-2.5 text-[11px]',
    option: 'px-2.5 py-2 text-[11px]',
    icon: 12,
    dropdown: 'max-h-48',
  },
  lg: {
    trigger: 'h-9 px-3 text-xs',
    option: 'px-3 py-2.5 text-xs',
    icon: 14,
    dropdown: 'max-h-56',
  },
};

// =============================================================================
// Component
// =============================================================================

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  hint,
  error,
  disabled = false,
  className,
  size = 'md',
  position = 'bottom',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  
  const config = sizeStyles[size];
  const selectedOption = options.find(opt => opt.value === value);
  const getOptionId = (index: number) => `${listboxId}-option-${index}`;

  // Close on click outside
  const containerRef = useClickOutside<HTMLDivElement>(() => {
    setIsOpen(false);
  });

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          const opt = options[highlightedIndex];
          if (opt && !opt.disabled) {
            onChange(opt.value);
            setIsOpen(false);
          }
        } else {
          setIsOpen(true);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex(prev => {
            const nextIdx = prev < options.length - 1 ? prev + 1 : 0;
            // Skip disabled options
            let idx = nextIdx;
            while (options[idx]?.disabled && idx !== prev) {
              idx = idx < options.length - 1 ? idx + 1 : 0;
            }
            return idx;
          });
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex(prev => {
            const nextIdx = prev > 0 ? prev - 1 : options.length - 1;
            // Skip disabled options
            let idx = nextIdx;
            while (options[idx]?.disabled && idx !== prev) {
              idx = idx > 0 ? idx - 1 : options.length - 1;
            }
            return idx;
          });
        }
        break;
      case 'Escape':
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  }, [disabled, isOpen, highlightedIndex, options, onChange]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, highlightedIndex]);

  // Reset highlighted index when opening
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex(opt => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, options, value]);

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [onChange]);

  return (
    <div className={cn('relative font-mono', className)} ref={containerRef}>
      {/* Label */}
      {label && (
        <label className="text-[10px] text-[var(--color-text-muted)] ml-0.5 mb-1.5 flex items-center gap-1">
          <span className="text-[var(--color-accent-primary)]">--</span>
          {label.toLowerCase().replace(/\s+/g, '-')}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          'w-full flex items-center justify-between gap-2',
          'bg-[var(--color-surface-1)] text-[var(--color-text-primary)]',
          'border border-[var(--color-border-subtle)] rounded-sm',
          'transition-all duration-150',
          'hover:border-[var(--color-border-default)]',
          'focus:outline-none focus-visible:border-[var(--color-accent-primary)]/50 focus-visible:shadow-[0_0_0_2px_rgba(52,211,153,0.1)]',
          disabled && 'opacity-50 cursor-not-allowed',
          isOpen && 'border-[var(--color-accent-primary)]/50 bg-[var(--color-surface-header)]',
          error && 'border-[var(--color-error)]/40',
          config.trigger
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-activedescendant={isOpen && highlightedIndex >= 0 ? getOptionId(highlightedIndex) : undefined}
        aria-invalid={error ? 'true' : undefined}
      >
        <span className={cn(
          'truncate',
          !selectedOption && 'text-[var(--color-text-placeholder)]'
        )}>
          {selectedOption ? (
            <span className="flex items-center gap-2">
              {selectedOption.icon}
              {selectedOption.label}
            </span>
          ) : placeholder}
        </span>
        <ChevronDown 
          size={config.icon} 
          className={cn(
            'text-[var(--color-text-muted)] transition-transform flex-shrink-0',
            isOpen && 'rotate-180'
          )} 
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <ul
          ref={listRef}
          role="listbox"
          className={cn(
            'absolute z-50 w-full mt-1 py-1',
            'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
            'shadow-lg shadow-black/30 overflow-y-auto',
            'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent',
            'animate-in fade-in slide-in-from-top-1 duration-150',
            position === 'top' && 'bottom-full mb-1 mt-0',
            config.dropdown
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightedIndex;
            
            return (
              <li
                key={option.value}
                id={getOptionId(index)}
                role="option"
                aria-selected={isSelected}
                onClick={() => !option.disabled && handleSelect(option.value)}
                onMouseEnter={() => !option.disabled && setHighlightedIndex(index)}
                className={cn(
                  'flex items-center justify-between gap-2 cursor-pointer transition-colors',
                  config.option,
                  isHighlighted && 'bg-[var(--color-surface-3)]/50',
                  isSelected && 'text-[var(--color-accent-primary)]',
                  option.disabled && 'opacity-40 cursor-not-allowed',
                  !option.disabled && !isHighlighted && 'hover:bg-[var(--color-surface-2)]'
                )}
              >
                <span className="flex items-center gap-2 truncate min-w-0">
                  {option.icon}
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="text-[9px] text-[var(--color-text-dim)] truncate">
                        {option.description}
                      </span>
                    )}
                  </span>
                </span>
                {isSelected && <Check size={config.icon} className="flex-shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}

      {/* Hint or Error */}
      {hint && !error && (
        <p className="text-[9px] text-[var(--color-text-dim)] ml-0.5 mt-1.5">
          <span className="text-[var(--color-text-placeholder)]">#</span> {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[10px] text-[var(--color-error)] ml-0.5 mt-1.5 animate-in slide-in-from-top-1 fade-in duration-200 flex items-center gap-1">
          <span className="text-[var(--color-error)]">[ERR]</span> {error}
        </p>
      )}
    </div>
  );
};

export default Select;
