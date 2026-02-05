/**
 * Settings List Manager Component
 * 
 * A component for managing a list of string items.
 * Provides add/remove functionality with terminal styling.
 */
import React, { useCallback, useState } from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ListManagerProps } from './types';

export const SettingsListManager: React.FC<ListManagerProps> = ({
  items,
  onAdd,
  onRemove,
  placeholder = 'Add item...',
  description,
  label,
  maxItems,
  validate,
  disabled,
  className,
  testId,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Format label as lowercase with dashes (terminal style)
  const formattedLabel = label?.toLowerCase().replace(/\s+/g, '-');

  // Check if we've reached max items
  const isMaxReached = maxItems !== undefined && items.length >= maxItems;

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      setError(null);
    },
    []
  );

  // Handle add item
  const handleAdd = useCallback(() => {
    const trimmedValue = inputValue.trim();
    
    if (!trimmedValue) {
      return;
    }

    // Check for duplicates
    if (items.includes(trimmedValue)) {
      setError('Item already exists');
      return;
    }

    // Run custom validation
    if (validate) {
      const validationError = validate(trimmedValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    // Check max items
    if (isMaxReached) {
      setError(`Maximum ${maxItems} items allowed`);
      return;
    }

    onAdd(trimmedValue);
    setInputValue('');
    setError(null);
  }, [inputValue, items, validate, isMaxReached, maxItems, onAdd]);

  // Handle key press (Enter to add)
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  // Handle remove item
  const handleRemove = useCallback(
    (index: number) => {
      onRemove(index);
    },
    [onRemove]
  );

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
      {label && (
        <label className="text-[10px] sm:text-[11px] text-[var(--color-text-primary)] flex items-center gap-1 mb-1.5 sm:mb-2">
          <span className="text-[var(--color-accent-secondary)]">--</span>
          <span className="truncate">{formattedLabel}</span>
          {maxItems && (
            <span className="text-[var(--color-text-dim)] ml-1 flex-shrink-0">
              ({items.length}/{maxItems})
            </span>
          )}
        </label>
      )}

      {/* Input Row */}
      <div className="flex gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled || isMaxReached}
          className={cn(
            'flex-1 min-w-0',
            'px-2.5 sm:px-3 py-2 sm:py-1.5',
            'text-[10px] sm:text-[11px] text-[var(--color-text-primary)]',
            'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
            'font-mono',
            'placeholder:text-[var(--color-text-placeholder)]',
            'transition-colors duration-150',
            // Hover
            !disabled && !isMaxReached && 'hover:border-[var(--color-border-default)]',
            // Focus
            'focus:outline-none',
            'focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
            'focus-visible:border-[var(--color-accent-primary)]/30',
            // Error state
            error && 'border-[var(--color-status-error)]/50',
            // Disabled
            (disabled || isMaxReached) && 'cursor-not-allowed'
          )}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled || isMaxReached || !inputValue.trim()}
          className={cn(
            'px-2.5 sm:px-3 py-2 sm:py-1.5',
            'text-[10px] sm:text-[11px]',
            'border border-[var(--color-border-subtle)]',
            'bg-[var(--color-surface-2)]',
            'text-[var(--color-text-secondary)]',
            'transition-colors duration-150 flex-shrink-0',
            // Enabled state
            !disabled && !isMaxReached && inputValue.trim() && [
              'hover:bg-[var(--color-accent-primary)]/10',
              'hover:border-[var(--color-accent-primary)]/30',
              'hover:text-[var(--color-accent-primary)]',
            ],
            // Focus
            'focus:outline-none',
            'focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
            // Disabled
            (disabled || isMaxReached || !inputValue.trim()) && 'cursor-not-allowed opacity-50'
          )}
          aria-label="Add item"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-[var(--color-status-error)] mb-1.5 sm:mb-2">
          <AlertCircle size={11} className="flex-shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Items List */}
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((item, index) => (
            <div
              key={`${item}-${index}`}
              className={cn(
                'flex items-center justify-between gap-2',
                'px-3 py-1.5',
                'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
                'group'
              )}
            >
              <span className="text-[11px] text-[var(--color-text-primary)] truncate flex-1">
                {item}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                className={cn(
                  'p-0.5',
                  'text-[var(--color-text-dim)]',
                  'opacity-0 group-hover:opacity-100',
                  'transition-all duration-150',
                  !disabled && [
                    'hover:text-[var(--color-status-error)]',
                    'hover:bg-[var(--color-status-error)]/10',
                  ],
                  'focus:outline-none focus:opacity-100',
                  'focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
                  disabled && 'cursor-not-allowed'
                )}
                aria-label={`Remove ${item}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {items.length === 0 && (
        <div className="px-3 py-2 text-[10px] text-[var(--color-text-dim)] text-center border border-dashed border-[var(--color-border-subtle)]">
          No items added
        </div>
      )}

      {/* Description */}
      {description && (
        <p className="text-[10px] text-[var(--color-text-dim)] mt-2">
          <span className="text-[var(--color-text-placeholder)]">#</span> {description}
        </p>
      )}
    </div>
  );
};

export default SettingsListManager;
