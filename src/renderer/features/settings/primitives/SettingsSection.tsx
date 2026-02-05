/**
 * Settings Section Component
 * 
 * A wrapper component for grouping related settings with a title and description.
 * Uses terminal aesthetics with # prefix headers and monospace font.
 */
import React from 'react';
import { cn } from '../../../utils/cn';
import type { SectionProps } from './types';

export const SettingsSection: React.FC<SectionProps> = ({
  title,
  description,
  children,
  className,
  id,
  testId,
}) => {
  // Format title as lowercase with dashes (terminal style)
  const formattedTitle = title.toLowerCase().replace(/\s+/g, '-');

  return (
    <section
      id={id}
      data-testid={testId}
      className={cn('space-y-4 sm:space-y-5 font-mono', className)}
    >
      {/* Section Header */}
      <header className="pb-2 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px] sm:text-[12px] font-medium">#</span>
          <h3 className="text-[11px] sm:text-[12px] text-[var(--color-text-primary)] font-medium tracking-wide">
            {formattedTitle}
          </h3>
        </div>
        {description && (
          <p className="text-[9px] sm:text-[10px] text-[var(--color-text-dim)] leading-relaxed ml-4">
            <span className="text-[var(--color-text-placeholder)]">#</span> {description}
          </p>
        )}
      </header>

      {/* Section Content */}
      <div className="space-y-3 sm:space-y-4">
        {children}
      </div>
    </section>
  );
};

export default SettingsSection;
