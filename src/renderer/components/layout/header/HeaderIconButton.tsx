/**
 * HeaderIconButton
 *
 * Compact icon button with consistent hit target for header alignment.
 * 28×28 (w-7 h-7) interactive region, optional active highlight.
 */
import React, { memo } from 'react';
import { cn } from '../../../utils/cn';

export interface HeaderIconButtonProps {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const HeaderIconButton: React.FC<HeaderIconButtonProps> = memo(
  function HeaderIconButton({ onClick, label, active, children, className }) {
    return (
      <button
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] no-drag cursor-pointer',
          'transition-all duration-100',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
          active
            ? 'text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
            : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]/50',
          className
        )}
        onClick={onClick}
        aria-label={label}
        type="button"
      >
        {children}
      </button>
    );
  }
);
