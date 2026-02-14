/**
 * SettingsInfoBox Primitive
 * 
 * Standardized info/warning box for settings panels.
 * Supports multiple variants for different message types.
 */
import React from 'react';
import { cn } from '../../../utils/cn';

type InfoBoxVariant = 'info' | 'warning' | 'neutral';

interface SettingsInfoBoxProps {
  variant?: InfoBoxVariant;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<InfoBoxVariant, string> = {
  info: 'border-[var(--color-info)]/20 bg-[var(--color-info)]/5',
  warning: 'border-[var(--color-warning)]/20 bg-[var(--color-warning)]/5',
  neutral: 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]',
};

const titleStyles: Record<InfoBoxVariant, string> = {
  info: 'text-[var(--color-info)]',
  warning: 'text-[var(--color-warning)]',
  neutral: 'text-[var(--color-text-secondary)]',
};

export const SettingsInfoBox: React.FC<SettingsInfoBoxProps> = ({
  variant = 'neutral',
  icon,
  title,
  children,
  className,
}) => {
  return (
    <div className={cn('border p-3 space-y-2', variantStyles[variant], className)}>
      {(icon || title) && (
        <div className="flex items-center gap-2">
          {icon && <span className={cn('flex-shrink-0', titleStyles[variant])}>{icon}</span>}
          {title && (
            <div className={cn('text-[10px]', titleStyles[variant])}>
              {title}
            </div>
          )}
        </div>
      )}
      <div className="text-[9px] text-[var(--color-text-dim)] leading-relaxed">
        {children}
      </div>
    </div>
  );
};
