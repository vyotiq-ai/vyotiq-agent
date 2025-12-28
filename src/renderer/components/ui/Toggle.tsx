/**
 * Terminal-styled Form Controls
 * 
 * Toggle, Checkbox, and RadioGroup components with CLI aesthetics.
 */
import React from 'react';
import { cn } from '../../utils/cn';

// =============================================================================
// Toggle Component
// =============================================================================

interface ToggleProps {
    checked: boolean;
    onToggle: () => void;
    disabled?: boolean;
    label?: string;
    description?: string;
    className?: string;
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Show [ON]/[OFF] indicator */
    showState?: boolean;
}

const toggleSizes = {
    sm: {
        track: 'h-4 w-8',
        thumb: 'h-2.5 w-2.5',
        translateOn: 'translate-x-4',
        translateOff: 'translate-x-1',
    },
    md: {
        track: 'h-5 w-10',
        thumb: 'h-3 w-3',
        translateOn: 'translate-x-5',
        translateOff: 'translate-x-1.5',
    },
    lg: {
        track: 'h-6 w-12',
        thumb: 'h-4 w-4',
        translateOn: 'translate-x-6',
        translateOff: 'translate-x-1.5',
    },
};

export const Toggle: React.FC<ToggleProps> = ({
    checked,
    onToggle,
    disabled,
    label,
    description,
    className,
    size = 'md',
    showState = true,
}) => {
    const config = toggleSizes[size];

    const toggleControl = (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onToggle}
            disabled={disabled}
            className={cn(
                'relative inline-flex items-center transition-all duration-200 border',
                config.track,
                checked 
                    ? 'bg-[var(--color-accent-primary)]/20 border-[var(--color-accent-primary)]/30' 
                    : 'bg-[var(--color-surface-2)]/50 border-[var(--color-border-subtle)]',
                disabled && 'opacity-50 cursor-not-allowed',
                !disabled && 'hover:border-[var(--color-border-default)]',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
                className
            )}
        >
            <span
                className={cn(
                    'inline-block transform transition-transform duration-200',
                    config.thumb,
                    checked 
                        ? cn(config.translateOn, 'bg-[var(--color-accent-primary)]') 
                        : cn(config.translateOff, 'bg-[var(--color-text-muted)]'),
                )}
            />
        </button>
    );

    if (!label) {
        return toggleControl;
    }

    return (
        <div className="flex items-center justify-between gap-3 py-2 font-mono">
            <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[var(--color-text-primary)] flex items-center gap-1">
                    <span className="text-[var(--color-accent-secondary)]">--</span>
                    {label.toLowerCase().replace(/\s+/g, '-')}
                </p>
                {description && (
                    <p className="text-[10px] text-[var(--color-text-dim)] mt-0.5">
                        <span className="text-[var(--color-text-placeholder)]">#</span> {description}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {showState && (
                    <span className={cn(
                        'text-[9px]',
                        checked ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)]'
                    )}>
                        {checked ? '[ON]' : '[OFF]'}
                    </span>
                )}
                {toggleControl}
            </div>
        </div>
    );
};

// =============================================================================
// Checkbox Component
// =============================================================================

interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    label?: string;
    description?: string;
    className?: string;
    /** Indeterminate state */
    indeterminate?: boolean;
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
}

const checkboxSizes = {
    sm: 'w-3.5 h-3.5 text-[8px]',
    md: 'w-4 h-4 text-[10px]',
    lg: 'w-5 h-5 text-[11px]',
};

export const Checkbox: React.FC<CheckboxProps> = ({
    checked,
    onChange,
    disabled = false,
    label,
    description,
    className,
    indeterminate = false,
    size = 'md',
}) => {
    const handleChange = () => {
        if (!disabled) {
            onChange(!checked);
        }
    };

    const getStateSymbol = () => {
        if (indeterminate) return '−';
        if (checked) return '×';
        return '';
    };

    const checkbox = (
        <button
            type="button"
            role="checkbox"
            aria-checked={indeterminate ? 'mixed' : checked}
            disabled={disabled}
            onClick={handleChange}
            className={cn(
                'flex items-center justify-center flex-shrink-0',
                'border font-bold transition-all duration-150',
                checkboxSizes[size],
                checked || indeterminate
                    ? 'bg-[var(--color-accent-primary)]/20 border-[var(--color-accent-primary)]/40 text-[var(--color-accent-primary)]'
                    : 'bg-[var(--color-surface-2)]/50 border-[var(--color-border-subtle)] text-transparent',
                disabled && 'opacity-50 cursor-not-allowed',
                !disabled && 'hover:border-[var(--color-border-default)]',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
                className
            )}
        >
            {getStateSymbol()}
        </button>
    );

    if (!label) {
        return checkbox;
    }

    return (
        <label
            className={cn(
                'inline-flex items-start gap-2.5 cursor-pointer font-mono',
                disabled && 'opacity-50 cursor-not-allowed'
            )}
        >
            {checkbox}
            <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-[var(--color-text-primary)]">{label}</span>
                {description && (
                    <span className="text-[9px] text-[var(--color-text-dim)]">{description}</span>
                )}
            </div>
        </label>
    );
};

// =============================================================================
// Radio Group Component
// =============================================================================

interface RadioOption {
    value: string;
    label: string;
    description?: string;
    disabled?: boolean;
}

interface RadioGroupProps {
    options: RadioOption[];
    value: string;
    onChange: (value: string) => void;
    name: string;
    disabled?: boolean;
    className?: string;
    /** Layout direction */
    direction?: 'horizontal' | 'vertical';
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
}

const radioSizes = {
    sm: { outer: 'w-3.5 h-3.5', inner: 'w-1.5 h-1.5' },
    md: { outer: 'w-4 h-4', inner: 'w-2 h-2' },
    lg: { outer: 'w-5 h-5', inner: 'w-2.5 h-2.5' },
};

export const RadioGroup: React.FC<RadioGroupProps> = ({
    options,
    value,
    onChange,
    name,
    disabled = false,
    className,
    direction = 'vertical',
    size = 'md',
}) => {
    const config = radioSizes[size];

    return (
        <div
            role="radiogroup"
            className={cn(
                'flex gap-3 font-mono',
                direction === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
                className
            )}
        >
            {options.map((option) => {
                const isSelected = value === option.value;
                const isDisabled = disabled || option.disabled;

                return (
                    <label
                        key={option.value}
                        className={cn(
                            'inline-flex items-start gap-2.5 cursor-pointer',
                            isDisabled && 'opacity-50 cursor-not-allowed'
                        )}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={option.value}
                            checked={isSelected}
                            disabled={isDisabled}
                            onChange={() => onChange(option.value)}
                            className="sr-only"
                        />

                        <button
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            disabled={isDisabled}
                            onClick={() => !isDisabled && onChange(option.value)}
                            className={cn(
                                'flex items-center justify-center flex-shrink-0',
                                'border rounded-full transition-all duration-150',
                                config.outer,
                                isSelected
                                    ? 'bg-[var(--color-accent-primary)]/20 border-[var(--color-accent-primary)]/40'
                                    : 'bg-[var(--color-surface-2)]/50 border-[var(--color-border-subtle)]',
                                !isDisabled && 'hover:border-[var(--color-border-default)]',
                                'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50'
                            )}
                        >
                            {isSelected && (
                                <span className={cn('rounded-full bg-[var(--color-accent-primary)]', config.inner)} />
                            )}
                        </button>

                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[10px] text-[var(--color-text-primary)]">{option.label}</span>
                            {option.description && (
                                <span className="text-[9px] text-[var(--color-text-dim)]">{option.description}</span>
                            )}
                        </div>
                    </label>
                );
            })}
        </div>
    );
};
