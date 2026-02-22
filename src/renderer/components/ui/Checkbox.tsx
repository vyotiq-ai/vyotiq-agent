/**
 * Terminal-styled Checkbox Component
 * 
 * CLI aesthetic checkbox with indeterminate state support.
 */
import React from 'react';
import { cn } from '../../utils/cn';

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
    sm: 'w-3.5 h-3.5 text-[9px]',
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
                'border font-bold transition-colors duration-150',
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
