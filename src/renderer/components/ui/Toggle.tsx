/**
 * Terminal-styled Toggle Switch Component
 * 
 * CLI aesthetic toggle switch with size variants and state indicators.
 * 
 * For Checkbox, see ./Checkbox.tsx
 * For RadioGroup, see ./RadioGroup.tsx
 */
import React from 'react';
import { cn } from '../../utils/cn';

// Re-export sibling components for backward compatibility
export { Checkbox } from './Checkbox';
export { RadioGroup } from './RadioGroup';

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