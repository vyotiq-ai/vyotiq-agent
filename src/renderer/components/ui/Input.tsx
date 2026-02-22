import React, { useId } from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    /** Size variant */
    inputSize?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
    sm: 'px-2 py-1.5 text-[10px]',
    md: 'px-2.5 py-2 text-[11px]',
    lg: 'px-3 py-2.5 text-xs',
};

const iconSizes = {
    sm: 'left-2',
    md: 'left-2.5',
    lg: 'left-3',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, hint, leftIcon, rightIcon, inputSize = 'md', id: externalId, ...props }, ref) => {
        const autoId = useId();
        const inputId = externalId || autoId;
        return (
            <div className="space-y-1.5 w-full font-mono">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="text-[10px] text-[var(--color-text-muted)] ml-0.5 flex items-center gap-1 transition-colors group-focus-within:text-[var(--color-accent-primary)]"
                    >
                        <span className="text-[var(--color-accent-primary)]">--</span>
                        {label.toLowerCase().replace(/\s+/g, '-')}
                    </label>
                )}
                <div className="relative group">
                    {leftIcon && (
                        <div className={cn(
                            'absolute top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] pointer-events-none',
                            'group-focus-within:text-[var(--color-accent-primary)] transition-colors duration-150',
                            iconSizes[inputSize]
                        )}>
                            {leftIcon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        id={inputId}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
                        className={cn(
                            'w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] outline-none transition-[border-color,box-shadow,background-color] duration-150 rounded-sm',
                            'placeholder:text-[var(--color-text-placeholder)]',
                            'focus-visible:border-[var(--color-accent-primary)]/50 focus-visible:bg-[var(--color-surface-header)] focus-visible:shadow-[0_0_0_2px_rgba(52,211,153,0.1)]',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            'hover:border-[var(--color-border-default)]',
                            sizeStyles[inputSize],
                            leftIcon && 'pl-8',
                            rightIcon && 'pr-8',
                            error && 'border-[var(--color-error)]/40 focus-visible:border-[var(--color-error)]/40 focus-visible:shadow-[0_0_0_2px_rgba(239,68,68,0.1)]',
                            className
                        )}
                        {...props}
                    />
                    {rightIcon && (
                        <div className={cn(
                            'absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]',
                            'group-focus-within:text-[var(--color-text-secondary)] transition-colors duration-150'
                        )}>
                            {rightIcon}
                        </div>
                    )}
                    {/* Focus indicator line */}
                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--color-accent-primary)] scale-x-0 group-focus-within:scale-x-100 transition-transform duration-200 origin-left" />
                </div>
                {hint && !error && (
                    <p id={`${inputId}-hint`} className="text-[9px] text-[var(--color-text-dim)] ml-0.5">
                        <span className="text-[var(--color-text-placeholder)]">#</span> {hint}
                    </p>
                )}
                {error && (
                    <p id={`${inputId}-error`} role="alert" className="text-[10px] text-[var(--color-error)] ml-0.5 animate-in slide-in-from-top-1 fade-in duration-200 flex items-center gap-1">
                        <span className="text-[var(--color-error)]">[ERR]</span> {error}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';

// =============================================================================
// Textarea Component
// =============================================================================

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    hint?: string;
    /** Size variant */
    inputSize?: 'sm' | 'md' | 'lg';
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, label, error, hint, inputSize = 'md', id: externalId, ...props }, ref) => {
        const autoId = useId();
        const textareaId = externalId || autoId;
        return (
            <div className="space-y-1.5 w-full font-mono group">
                {label && (
                    <label
                        htmlFor={textareaId}
                        className="text-[10px] text-[var(--color-text-muted)] ml-0.5 flex items-center gap-1 transition-colors group-focus-within:text-[var(--color-accent-primary)]"
                    >
                        <span className="text-[var(--color-accent-primary)]">--</span>
                        {label.toLowerCase().replace(/\s+/g, '-')}
                    </label>
                )}
                <div className="relative">
                    <textarea
                        ref={ref}
                        id={textareaId}
                        aria-invalid={error ? 'true' : undefined}
                        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
                        className={cn(
                            'w-full bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] outline-none transition-[border-color,box-shadow,background-color] duration-150 rounded-sm',
                            'placeholder:text-[var(--color-text-placeholder)] resize-none',
                            'focus-visible:border-[var(--color-accent-primary)]/50 focus-visible:bg-[var(--color-surface-header)] focus-visible:shadow-[0_0_0_2px_rgba(52,211,153,0.1)]',
                            'disabled:opacity-50 disabled:cursor-not-allowed',
                            'hover:border-[var(--color-border-default)]',
                            'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent',
                            sizeStyles[inputSize],
                            error && 'border-[var(--color-error)]/40 focus-visible:border-[var(--color-error)]/40 focus-visible:shadow-[0_0_0_2px_rgba(239,68,68,0.1)]',
                            className
                        )}
                        {...props}
                    />
                    {/* Focus indicator line */}
                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--color-accent-primary)] scale-x-0 group-focus-within:scale-x-100 transition-transform duration-200 origin-left" />
                </div>
                {hint && !error && (
                    <p id={`${textareaId}-hint`} className="text-[9px] text-[var(--color-text-dim)] ml-0.5">
                        <span className="text-[var(--color-text-placeholder)]">#</span> {hint}
                    </p>
                )}
                {error && (
                    <p id={`${textareaId}-error`} role="alert" className="text-[10px] text-[var(--color-error)] ml-0.5 animate-in slide-in-from-top-1 fade-in duration-200 flex items-center gap-1">
                        <span className="text-[var(--color-error)]">[ERR]</span> {error}
                    </p>
                )}
            </div>
        );
    }
);

Textarea.displayName = 'Textarea';
