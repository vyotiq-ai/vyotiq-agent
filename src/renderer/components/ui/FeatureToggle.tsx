/**
 * Feature Toggle Component
 * 
 * A shared component for feature toggle switches with icon, title, and description.
 * Extracted from SettingsEditorAI.tsx and SettingsIndexing.tsx to avoid duplication.
 */
import React, { memo } from 'react';
import { cn } from '../../utils/cn';
import { Toggle } from './Toggle';

// =============================================================================
// Types
// =============================================================================

export interface FeatureToggleProps {
  /** Icon to display */
  icon: React.ReactNode;
  /** Background class for the icon container */
  iconBgClass?: string;
  /** Title text */
  title: string;
  /** Description text */
  description: string;
  /** Current checked state */
  checked: boolean;
  /** Callback when toggle changes */
  onChange: (checked: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional CSS classes */
  className?: string;
  /** Optional badge (e.g., "Beta", "New") */
  badge?: string;
  /** Badge color variant */
  badgeVariant?: 'default' | 'info' | 'warning' | 'success';
}

// =============================================================================
// Badge Colors
// =============================================================================

const badgeColors = {
  default: 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
  info: 'bg-blue-500/20 text-blue-400',
  warning: 'bg-amber-500/20 text-amber-400',
  success: 'bg-green-500/20 text-green-400',
};

// =============================================================================
// Feature Toggle Component
// =============================================================================

export const FeatureToggle: React.FC<FeatureToggleProps> = memo(({
  icon,
  iconBgClass = 'bg-[var(--color-accent-primary)]/10',
  title,
  description,
  checked,
  onChange,
  disabled = false,
  size = 'md',
  className,
  badge,
  badgeVariant = 'default',
}) => {
  const sizeClasses = {
    sm: {
      container: 'p-2',
      icon: 'p-1',
      title: 'text-[10px]',
      description: 'text-[8px]',
    },
    md: {
      container: 'p-3',
      icon: 'p-1.5',
      title: 'text-[11px]',
      description: 'text-[9px]',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded',
        'bg-[var(--color-surface-2)]/50 border border-[var(--color-border-subtle)]',
        'transition-colors',
        disabled && 'opacity-50',
        sizes.container,
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('rounded', iconBgClass, sizes.icon)}>
          {icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={cn('text-[var(--color-text-primary)] font-medium', sizes.title)}>
              {title}
            </span>
            {badge && (
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[8px] font-medium',
                badgeColors[badgeVariant]
              )}>
                {badge}
              </span>
            )}
          </div>
          <div className={cn('text-[var(--color-text-muted)]', sizes.description)}>
            {description}
          </div>
        </div>
      </div>
      <Toggle
        checked={checked}
        onToggle={() => !disabled && onChange(!checked)}
        size="sm"
        disabled={disabled}
      />
    </div>
  );
});

FeatureToggle.displayName = 'FeatureToggle';

// =============================================================================
// Feature Toggle Group (for grouping multiple toggles)
// =============================================================================

export interface FeatureToggleGroupProps {
  /** Group label */
  label?: string;
  /** Children toggle items */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export const FeatureToggleGroup: React.FC<FeatureToggleGroupProps> = memo(({
  label,
  children,
  className,
}) => (
  <div className={cn('space-y-2', className)}>
    {label && (
      <h4 className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
        {label}
      </h4>
    )}
    <div className="space-y-2">
      {children}
    </div>
  </div>
));

FeatureToggleGroup.displayName = 'FeatureToggleGroup';

export default FeatureToggle;
