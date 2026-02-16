import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    hoverable?: boolean;
    /** Visual variant */
    variant?: 'default' | 'elevated' | 'terminal';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, hoverable, variant = 'default', children, ...props }, ref) => {
        const variantStyles = {
            default: 'bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)]',
            elevated: 'bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] shadow-lg shadow-black/10 dark:shadow-black/40',
            terminal: 'bg-[var(--color-surface-1)] border border-[var(--color-border-default)] font-mono text-[var(--color-text-secondary)]',
        };

        return (
            <div
                ref={ref}
                className={cn(
                    'overflow-hidden font-mono transition-colors duration-150 rounded-sm',
                    variantStyles[variant],
                    hoverable && 'hover:border-[var(--color-border-default)]/50 hover:bg-[var(--color-surface-2)] transition-all duration-150 cursor-pointer',
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = 'Card';

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Optional title text */
    title?: string;
    /** Optional subtitle/description */
    subtitle?: string;
    /** Right-side action content */
    action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ 
    className, 
    title, 
    subtitle, 
    action, 
    children,
    ...props 
}) => (
    <div 
        className={cn(
            'px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)] flex items-center justify-between transition-colors', 
            className
        )} 
        {...props}
    >
        {title || subtitle ? (
            <div>
                {title && (
                    <h3 className="text-[11px] text-[var(--color-text-primary)] font-mono">{title}</h3>
                )}
                {subtitle && (
                    <p className="text-[9px] text-[var(--color-text-dim)] font-mono"># {subtitle}</p>
                )}
            </div>
        ) : (
            children
        )}
        {action && (
            <div className="flex items-center gap-2">{action}</div>
        )}
    </div>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
    <div className={cn('p-3 sm:p-4', className)} {...props} />
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
    <div className={cn('p-3 sm:p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-header)] transition-colors', className)} {...props} />
);

