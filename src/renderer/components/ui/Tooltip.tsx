/**
 * Terminal-styled Tooltip Component
 * 
 * A lightweight tooltip component with CLI aesthetics.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

// =============================================================================
// Types
// =============================================================================

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
    /** Tooltip content */
    content: React.ReactNode;
    /** Trigger element */
    children: React.ReactElement<{
        onMouseEnter?: React.MouseEventHandler;
        onMouseLeave?: React.MouseEventHandler;
        onFocus?: React.FocusEventHandler;
        onBlur?: React.FocusEventHandler;
    }>;
    /** Placement of the tooltip */
    placement?: TooltipPlacement;
    /** Delay before showing (ms) */
    delayShow?: number;
    /** Delay before hiding (ms) */
    delayHide?: number;
    /** Disable the tooltip */
    disabled?: boolean;
    /** Additional class for the tooltip */
    className?: string;
    /** Show keyboard shortcut */
    shortcut?: string;
}

// =============================================================================
// Position Calculator
// =============================================================================

/** Opposite placement for auto-flip */
const flipMap: Record<TooltipPlacement, TooltipPlacement> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
};

function computePosition(
    triggerRect: DOMRect,
    tooltipRect: DOMRect,
    placement: TooltipPlacement,
    offset: number,
): { top: number; left: number } {
    switch (placement) {
        case 'top':
            return {
                top: triggerRect.top - tooltipRect.height - offset,
                left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
            };
        case 'bottom':
            return {
                top: triggerRect.bottom + offset,
                left: triggerRect.left + (triggerRect.width - tooltipRect.width) / 2,
            };
        case 'left':
            return {
                top: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
                left: triggerRect.left - tooltipRect.width - offset,
            };
        case 'right':
            return {
                top: triggerRect.top + (triggerRect.height - tooltipRect.height) / 2,
                left: triggerRect.right + offset,
            };
    }
}

function getTooltipPosition(
    triggerRect: DOMRect,
    tooltipRect: DOMRect,
    placement: TooltipPlacement,
    offset = 8
): { top: number; left: number } {
    const padding = 8;
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    let pos = computePosition(triggerRect, tooltipRect, placement, offset);

    // Auto-flip when tooltip would overflow on the placement axis
    const overflowsTop = pos.top < padding;
    const overflowsBottom = pos.top + tooltipRect.height > viewport.height - padding;
    const overflowsLeft = pos.left < padding;
    const overflowsRight = pos.left + tooltipRect.width > viewport.width - padding;

    const needsFlip =
        (placement === 'top' && overflowsTop) ||
        (placement === 'bottom' && overflowsBottom) ||
        (placement === 'left' && overflowsLeft) ||
        (placement === 'right' && overflowsRight);

    if (needsFlip) {
        const flipped = computePosition(triggerRect, tooltipRect, flipMap[placement], offset);
        // Only flip if the opposite side has room
        const flippedFits =
            flipped.top >= padding &&
            flipped.top + tooltipRect.height <= viewport.height - padding &&
            flipped.left >= padding &&
            flipped.left + tooltipRect.width <= viewport.width - padding;
        if (flippedFits) {
            pos = flipped;
        }
    }

    // Final boundary clamp (for the cross-axis and any edge cases)
    if (pos.left < padding) pos.left = padding;
    if (pos.left + tooltipRect.width > viewport.width - padding) {
        pos.left = viewport.width - tooltipRect.width - padding;
    }
    if (pos.top < padding) pos.top = padding;
    if (pos.top + tooltipRect.height > viewport.height - padding) {
        pos.top = viewport.height - tooltipRect.height - padding;
    }

    return pos;
}

// =============================================================================
// Tooltip Component
// =============================================================================

export function Tooltip({
    content,
    children,
    placement = 'top',
    delayShow = 300,
    delayHide = 100,
    disabled = false,
    className,
    shortcut,
}: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const updatePosition = useCallback(() => {
        if (triggerRef.current && tooltipRef.current) {
            const triggerRect = triggerRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();
            setPosition(getTooltipPosition(triggerRect, tooltipRect, placement));
        }
    }, [placement]);

    const show = useCallback(() => {
        if (disabled) return;
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        showTimeoutRef.current = setTimeout(() => {
            setIsVisible(true);
        }, delayShow);
    }, [delayShow, disabled]);

    const hide = useCallback(() => {
        if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
            setIsVisible(false);
        }, delayHide);
    }, [delayHide]);

    // Update position when visible
    useEffect(() => {
        if (isVisible) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [isVisible, updatePosition]);

    // Cleanup timeouts
    useEffect(() => {
        return () => {
            if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        };
    }, []);

    return (
        <>
            <span
                ref={triggerRef}
                className="inline-flex no-drag"
                onPointerEnter={show}
                onPointerLeave={hide}
            >
                {children}
            </span>
            {isVisible && createPortal(
                <div
                    ref={tooltipRef}
                    role="tooltip"
                    style={{
                        position: 'fixed',
                        top: position.top,
                        left: position.left,
                        zIndex: 9999,
                        pointerEvents: 'none',
                    }}
                    className={cn(
                        'px-2 py-1.5 rounded-sm bg-[var(--color-surface-header)] border border-[var(--color-border-subtle)] shadow-lg shadow-black/40',
                        'font-mono text-[10px] text-[var(--color-text-primary)]',
                        'animate-in fade-in-0 zoom-in-95 duration-150',
                        className
                    )}
                >
                    <div className="flex items-center gap-2">
                        <span>{content}</span>
                        {shortcut && (
                            <kbd className="text-[9px] text-[var(--color-text-muted)] bg-[var(--color-surface-2)]/50 px-1 py-0.5 rounded-sm border border-[var(--color-border-default)]/50">
                                {shortcut}
                            </kbd>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

// =============================================================================
// Keyboard Shortcut Display
// =============================================================================

interface KbdProps {
    children: React.ReactNode;
    className?: string;
}

export function Kbd({ children, className }: KbdProps) {
    return (
        <kbd
            className={cn(
                'inline-flex items-center justify-center',
                'font-mono text-[9px] text-[var(--color-text-secondary)]',
                'bg-[var(--color-surface-2)]/60 border border-[var(--color-border-subtle)]',
                'px-1.5 py-0.5 min-w-[20px] rounded-sm',
                className
            )}
        >
            {children}
        </kbd>
    );
}

// Common keyboard symbols
export const KeySymbols = {
    cmd: '⌘',
    ctrl: 'Ctrl',
    alt: 'Alt',
    shift: '⇧',
    enter: '↵',
    escape: 'Esc',
    backspace: '⌫',
    delete: 'Del',
    tab: '⇥',
    arrowUp: '↑',
    arrowDown: '↓',
    arrowLeft: '←',
    arrowRight: '→',
} as const;
