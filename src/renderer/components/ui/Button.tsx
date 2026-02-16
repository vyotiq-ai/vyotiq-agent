import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';
import { Spinner } from './LoadingState';
import { useMicroInteraction, useReducedMotion } from '../../utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    /** Whether to show rounded corners (default: true) */
    rounded?: boolean;
}

// Map button sizes to spinner sizes
const spinnerSizeMap = {
    xs: 'sm' as const,
    sm: 'sm' as const,
    md: 'sm' as const,
    lg: 'sm' as const,
    icon: 'sm' as const,
};

// Custom spinner sizing classes for buttons
const spinnerClassMap = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3 h-3',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
    icon: 'w-3.5 h-3.5',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, children, disabled, rounded = true, ...props }, ref) => {
        const prefersReducedMotion = useReducedMotion();
        const { handlers, style } = useMicroInteraction({
          scale: prefersReducedMotion ? 1 : 0.97,
          duration: 100,
        });
        
        // Theme-aware variants using CSS custom properties
        const variants = {
            primary: 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/25 border border-[var(--color-accent-primary)]/30 hover:border-[var(--color-accent-primary)]/50',
            secondary: 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]',
            ghost: 'bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/70',
            danger: 'bg-[var(--color-error)]/10 text-[var(--color-error)] hover:bg-[var(--color-error)]/20 border border-[var(--color-error)]/30 hover:border-[var(--color-error)]/50',
            outline: 'bg-transparent text-[var(--color-text-secondary)] border border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)]',
            success: 'bg-[var(--color-success)]/15 text-[var(--color-success)] hover:bg-[var(--color-success)]/25 border border-[var(--color-success)]/30 hover:border-[var(--color-success)]/50',
        };

        const sizes = {
            xs: 'h-6 px-2 text-[9px]',
            sm: 'h-7 px-2.5 text-[10px]',
            md: 'h-8 px-3 text-[11px]',
            lg: 'h-9 px-4 text-xs',
            icon: 'h-7 w-7 p-0 flex items-center justify-center',
        };

        return (
            <button
                ref={ref}
                className={cn(
                    'inline-flex items-center justify-center gap-1.5 font-mono transition-all duration-150',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
                    'active:scale-[0.97]',
                    variants[variant],
                    sizes[size],
                    rounded && 'rounded-sm',
                    className
                )}
                style={!disabled && !isLoading ? style : undefined}
                disabled={disabled || isLoading}
                aria-busy={isLoading || undefined}
                aria-disabled={disabled || isLoading || undefined}
                {...(!disabled && !isLoading ? handlers : {})}
                {...props}
            >
                {isLoading && <Spinner size={spinnerSizeMap[size]} className={spinnerClassMap[size]} />}
                {!isLoading && leftIcon}
                {children}
                {!isLoading && rightIcon}
            </button>
        );
    }
);

Button.displayName = 'Button';
