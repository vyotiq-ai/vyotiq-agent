/**
 * Settings Toggle Row Component
 * 
 * A consistent toggle switch row for settings.
 * Wraps the existing Toggle component with standardized layout.
 */
import React from 'react';
import { Toggle } from '../../../components/ui/Toggle';
import { cn } from '../../../utils/cn';
import type { ToggleRowProps } from './types';

export const SettingsToggleRow: React.FC<ToggleRowProps> = ({
  label,
  description,
  checked,
  onToggle,
  disabled,
  size = 'md',
  showState = true,
  className,
  testId,
}) => {
  // The existing Toggle component already handles label formatting with -- prefix
  // and description with # prefix, so we pass through directly
  return (
    <div data-testid={testId} className={cn('font-mono', className)}>
      <Toggle
        checked={checked}
        onToggle={onToggle}
        disabled={disabled}
        label={label}
        description={description}
        size={size}
        showState={showState}
      />
    </div>
  );
};

export default SettingsToggleRow;
