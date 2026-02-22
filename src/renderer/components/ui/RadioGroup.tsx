/**
 * Terminal-styled RadioGroup Component
 * 
 * CLI aesthetic radio button group with horizontal/vertical layout options.
 */
import React from 'react';
import { cn } from '../../utils/cn';

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
                            readOnly
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

export type { RadioOption, RadioGroupProps };
