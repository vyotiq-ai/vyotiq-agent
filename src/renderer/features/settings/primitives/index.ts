/**
 * Settings Primitives
 * 
 * Shared primitive components for the settings system.
 * These components ensure consistency across all settings panels
 * and follow the terminal aesthetic design language.
 * 
 * @example
 * ```tsx
 * import {
 *   SettingsSection,
 *   SettingsGroup,
 *   SettingsToggleRow,
 *   SettingsSlider,
 *   SettingsSelect,
 *   SettingsInput,
 *   SettingsListManager,
 * } from '../primitives';
 * 
 * <SettingsSection title="Configuration" description="Main settings">
 *   <SettingsGroup title="General" icon={<Settings size={11} />}>
 *     <SettingsToggleRow
 *       label="Enable feature"
 *       description="Toggle this feature on or off"
 *       checked={enabled}
 *       onToggle={() => setEnabled(!enabled)}
 *     />
 *     <SettingsSlider
 *       label="Max tokens"
 *       value={maxTokens}
 *       onChange={setMaxTokens}
 *       min={100}
 *       max={4000}
 *       step={100}
 *       format={(v) => `${v} tokens`}
 *     />
 *   </SettingsGroup>
 * </SettingsSection>
 * ```
 */

// =============================================================================
// Component Exports
// =============================================================================

export { SettingsSection } from './SettingsSection';
export { default as SettingsSectionDefault } from './SettingsSection';

export { SettingsGroup } from './SettingsGroup';
export { default as SettingsGroupDefault } from './SettingsGroup';

export { SettingsToggleRow } from './SettingsToggleRow';
export { default as SettingsToggleRowDefault } from './SettingsToggleRow';

export { SettingsSlider } from './SettingsSlider';
export { default as SettingsSliderDefault } from './SettingsSlider';
export type { SettingsSliderProps } from './SettingsSlider';

export { SettingsSelect } from './SettingsSelect';
export { default as SettingsSelectDefault } from './SettingsSelect';
export type { SettingsSelectProps } from './SettingsSelect';

export { SettingsInput } from './SettingsInput';
export { default as SettingsInputDefault } from './SettingsInput';

export { SettingsListManager } from './SettingsListManager';
export { default as SettingsListManagerDefault } from './SettingsListManager';

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Base props
  SettingsBaseProps,
  SettingsLabeledProps,
  SettingsComponentProps,
  // Option types
  SelectOption,
  SelectOptionGroup,
  // Slider types
  SliderFormatFn,
  SliderConstraints,
  // Section types
  SectionProps,
  GroupProps,
  // List types
  ListItem,
  ListManagerProps,
  // Input types
  InputType,
  InputProps,
  // Toggle types
  ToggleRowProps,
  // Utility types
  ValueOf,
  RequireProps,
  SizeVariant,
} from './types';
