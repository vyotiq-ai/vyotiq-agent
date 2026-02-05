/**
 * Settings Group Component
 * 
 * A group header for sub-sections within settings.
 * Displays an optional icon and title with border styling.
 */
import React from 'react';
import { cn } from '../../../utils/cn';
import type { GroupProps } from './types';

export const SettingsGroup: React.FC<GroupProps> = ({
  title,
  icon,
  children,
  className,
  testId,
}) => {
  // Format title as lowercase (terminal style)
  const formattedTitle = title.toLowerCase();

  return (
    <div data-testid={testId} className={cn('space-y-2.5 sm:space-y-3', className)}>
      {/* Group Header */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1.5 mb-0.5">
        {icon && (
          <span className="text-[var(--color-accent-primary)] flex-shrink-0">
            {icon}
          </span>
        )}
        <span className="font-medium tracking-wide">{formattedTitle}</span>
      </div>

      {/* Group Content */}
      {children && (
        <div className="space-y-2 sm:space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
};

export default SettingsGroup;
