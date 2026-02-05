/**
 * Shared types for settings primitive components
 * 
 * These types ensure consistency across all settings components
 * and provide proper TypeScript support.
 */

import type { ReactNode } from 'react';

// =============================================================================
// Base Component Props
// =============================================================================

/**
 * Base props that all settings components share
 */
export interface SettingsBaseProps {
  /** Additional CSS classes */
  className?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Props for components that have a label
 */
export interface SettingsLabeledProps extends SettingsBaseProps {
  /** Label text (will be formatted with -- prefix) */
  label: string;
  /** Optional description (will be formatted with # prefix) */
  description?: string;
}

/**
 * Generic props for settings components with a value
 */
export interface SettingsComponentProps<T> extends SettingsLabeledProps {
  /** Current value */
  value: T;
  /** Callback when value changes */
  onChange: (value: T) => void;
}

// =============================================================================
// Option Types
// =============================================================================

/**
 * Option for select dropdowns
 */
export interface SelectOption<T = string> {
  /** Option value */
  value: T;
  /** Display label */
  label: string;
  /** Whether the option is disabled */
  disabled?: boolean;
  /** Optional description for the option */
  description?: string;
}

/**
 * Option group for grouped selects
 */
export interface SelectOptionGroup<T = string> {
  /** Group label */
  label: string;
  /** Options in the group */
  options: SelectOption<T>[];
}

// =============================================================================
// Slider Types
// =============================================================================

/**
 * Format function for slider display values
 */
export type SliderFormatFn = (value: number) => string;

/**
 * Common slider constraints
 */
export interface SliderConstraints {
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step increment */
  step?: number;
}

// =============================================================================
// Section Types
// =============================================================================

/**
 * Props for section wrapper
 */
export interface SectionProps extends SettingsBaseProps {
  /** Section title (will be formatted with # prefix) */
  title: string;
  /** Optional description text */
  description?: string;
  /** Section content */
  children: ReactNode;
  /** Optional ID for navigation/anchoring */
  id?: string;
}

/**
 * Props for group header
 */
export interface GroupProps extends SettingsBaseProps {
  /** Group title */
  title: string;
  /** Optional icon component */
  icon?: ReactNode;
  /** Optional children to render inside the group */
  children?: ReactNode;
}

// =============================================================================
// List Types
// =============================================================================

/**
 * Item in a managed list
 */
export interface ListItem {
  /** Unique identifier */
  id: string;
  /** Display value */
  value: string;
}

/**
 * Props for list manager
 */
export interface ListManagerProps extends SettingsBaseProps {
  /** List items (strings or objects) */
  items: string[];
  /** Callback when item is added */
  onAdd: (value: string) => void;
  /** Callback when item is removed */
  onRemove: (index: number) => void;
  /** Placeholder text for input */
  placeholder?: string;
  /** Optional description */
  description?: string;
  /** Optional label */
  label?: string;
  /** Maximum number of items allowed */
  maxItems?: number;
  /** Validation function for new items */
  validate?: (value: string) => string | null;
}

// =============================================================================
// Input Types
// =============================================================================

/**
 * Supported input types
 */
export type InputType = 'text' | 'password' | 'email' | 'url' | 'number';

/**
 * Props for text input
 */
export interface InputProps extends SettingsComponentProps<string> {
  /** Input type */
  type?: InputType;
  /** Placeholder text */
  placeholder?: string;
  /** Autocomplete attribute */
  autoComplete?: string;
  /** Max length */
  maxLength?: number;
  /** Pattern for validation */
  pattern?: string;
  /** Whether input is required */
  required?: boolean;
}

// =============================================================================
// Toggle Types
// =============================================================================

/**
 * Props for toggle row
 */
export interface ToggleRowProps extends SettingsBaseProps {
  /** Label text (will be formatted with -- prefix) */
  label: string;
  /** Optional description (will be formatted with # prefix) */
  description?: string;
  /** Whether the toggle is checked */
  checked: boolean;
  /** Callback when toggled */
  onToggle: () => void;
  /** Size of the toggle */
  size?: 'sm' | 'md' | 'lg';
  /** Show [ON]/[OFF] indicator */
  showState?: boolean;
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Extract value type from component props
 */
export type ValueOf<T extends SettingsComponentProps<unknown>> = T['value'];

/**
 * Make certain props required
 */
export type RequireProps<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Common size variants
 */
export type SizeVariant = 'sm' | 'md' | 'lg';
