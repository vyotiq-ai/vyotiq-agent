/**
 * Settings Appearance Section
 * 
 * Theme and appearance settings including:
 * - Light/dark/system mode
 * - Font size scale
 * - Accent color selection
 * - Compact mode toggle
 * - Terminal font customization
 * - Animation settings
 * 
 * Uses CSS variables for theme-aware styling.
 * Refactored to use shared primitives from primitives/.
 */
import React, { useCallback } from 'react';
import { useTheme, type ThemeMode } from '../../../utils/themeMode.tsx';
import { 
  type AppearanceSettings,
  type FontSizeScale,
  type AccentColorPreset,
  type TerminalFont,
  type LoadingIndicatorStyle,
  type AnimationSpeed,
  type ReduceMotionPreference,
  FONT_SIZE_SCALES,
  ACCENT_COLOR_PRESETS,
  DEFAULT_APPEARANCE_SETTINGS,
} from '../../../../shared/types';
import { SettingsSection } from '../primitives/SettingsSection';
import { SettingsGroup } from '../primitives/SettingsGroup';
import { SettingsToggleRow } from '../primitives/SettingsToggleRow';
import { SettingsSelect } from '../primitives/SettingsSelect';
import type { SelectOption } from '../primitives/types';

interface SettingsAppearanceProps {
  settings?: AppearanceSettings;
  onChange?: (field: keyof AppearanceSettings, value: AppearanceSettings[keyof AppearanceSettings]) => void;
}

// Option definitions
const themeOptions: SelectOption<ThemeMode>[] = [
  { value: 'system', label: 'System (auto)' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const fontSizeOptions: SelectOption<FontSizeScale>[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'default', label: 'Default' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'large', label: 'Large' },
];

const accentColorOptions: SelectOption<AccentColorPreset>[] = [
  { value: 'emerald', label: 'Emerald' },
  { value: 'violet', label: 'Violet' },
  { value: 'blue', label: 'Blue' },
  { value: 'amber', label: 'Amber' },
  { value: 'rose', label: 'Rose' },
  { value: 'cyan', label: 'Cyan' },
];

const terminalFontOptions: SelectOption<TerminalFont>[] = [
  { value: 'system', label: 'System Default' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'Cascadia Code', label: 'Cascadia Code' },
  { value: 'Consolas', label: 'Consolas' },
  { value: 'Monaco', label: 'Monaco' },
  { value: 'Menlo', label: 'Menlo' },
];

const terminalFontSizeOptions: SelectOption<string>[] = [
  { value: '10', label: '10px' },
  { value: '11', label: '11px' },
  { value: '12', label: '12px' },
  { value: '13', label: '13px' },
  { value: '14', label: '14px' },
  { value: '16', label: '16px' },
  { value: '18', label: '18px' },
  { value: '20', label: '20px' },
];

const loadingIndicatorOptions: SelectOption<LoadingIndicatorStyle>[] = [
  { value: 'spinner', label: 'Spinner' },
  { value: 'dots', label: 'Dots' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'minimal', label: 'Minimal' },
];

const animationSpeedOptions: SelectOption<AnimationSpeed>[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];

const reduceMotionOptions: SelectOption<ReduceMotionPreference>[] = [
  { value: 'system', label: 'System' },
  { value: 'always', label: 'Always' },
  { value: 'never', label: 'Never' },
];

export const SettingsAppearance: React.FC<SettingsAppearanceProps> = ({ 
  settings = DEFAULT_APPEARANCE_SETTINGS,
  onChange,
}) => {
  const { mode, setMode, resolved } = useTheme();

  // Note: CSS variable application is handled by the root-level
  // useAppearanceSettings hook in App.tsx, so we don't duplicate it here.
  // That hook watches settings changes from the agent state and applies
  // them to the document regardless of which tab is active.

  // Handle setting changes
  const handleChange = useCallback(<K extends keyof AppearanceSettings>(
    field: K, 
    value: AppearanceSettings[K]
  ) => {
    onChange?.(field, value);
  }, [onChange]);

  return (
    <SettingsSection
      title="Appearance"
      description="Customize the look and feel of the application"
    >
      {/* Theme Selection */}
      <SettingsGroup title="theme">
        <SettingsSelect
          label="color-mode"
          description={`Current: ${resolved}${mode === 'system' ? ' (detected from system)' : ''}`}
          value={mode}
          options={themeOptions}
          onChange={(value) => setMode(value)}
        />
      </SettingsGroup>

      {/* Font Size */}
      <SettingsGroup title="font-size">
        <SettingsSelect
          label="ui-scale"
          description={`Adjust text size throughout the application (base: ${FONT_SIZE_SCALES[settings.fontSizeScale].base}px)`}
          value={settings.fontSizeScale}
          options={fontSizeOptions}
          onChange={(value) => handleChange('fontSizeScale', value)}
        />
      </SettingsGroup>

      {/* Accent Color */}
      <SettingsGroup title="accent-color">
        <SettingsSelect
          label="accent-color"
          description={`Primary highlight color for interactive elements${settings.accentColor !== 'custom' ? ` (${ACCENT_COLOR_PRESETS[settings.accentColor as Exclude<AccentColorPreset, 'custom'>]?.primary ?? ''})` : ''}`}
          value={settings.accentColor}
          options={accentColorOptions}
          onChange={(value) => handleChange('accentColor', value)}
        />
      </SettingsGroup>

      {/* Terminal Font */}
      <SettingsGroup title="terminal">
        <SettingsSelect
          label="font-family"
          description="Monospace font for code and terminal"
          value={settings.terminalFont}
          options={terminalFontOptions}
          onChange={(value) => handleChange('terminalFont', value)}
        />
        <SettingsSelect
          label="font-size"
          description="Terminal and code block text size"
          value={String(settings.terminalFontSize)}
          options={terminalFontSizeOptions}
          onChange={(value) => handleChange('terminalFontSize', parseInt(value))}
        />
      </SettingsGroup>

      {/* Animation Settings */}
      <SettingsGroup title="animations">
        <SettingsToggleRow
          label="enable-animations"
          description="Toggle smooth transitions and effects"
          checked={settings.enableAnimations}
          onToggle={() => handleChange('enableAnimations', !settings.enableAnimations)}
        />

        {settings.enableAnimations && (
          <>
            <SettingsSelect
              label="loading-indicator"
              description="Style of loading indicators"
              value={settings.loadingIndicatorStyle}
              options={loadingIndicatorOptions}
              onChange={(value) => handleChange('loadingIndicatorStyle', value)}
            />
            <SettingsSelect
              label="animation-speed"
              description="Speed of UI animations"
              value={settings.animationSpeed}
              options={animationSpeedOptions}
              onChange={(value) => handleChange('animationSpeed', value)}
            />
            <SettingsSelect
              label="reduce-motion"
              description="Accessibility preference for motion"
              value={settings.reduceMotion}
              options={reduceMotionOptions}
              onChange={(value) => handleChange('reduceMotion', value)}
            />
          </>
        )}

        <SettingsToggleRow
          label="compact-mode"
          description="Reduce padding for more content on screen"
          checked={settings.compactMode}
          onToggle={() => handleChange('compactMode', !settings.compactMode)}
        />
      </SettingsGroup>

      {/* Code Display */}
      <SettingsGroup title="code-display">
        <SettingsToggleRow
          label="show-line-numbers"
          description="Display line numbers in code blocks"
          checked={settings.showLineNumbers}
          onToggle={() => handleChange('showLineNumbers', !settings.showLineNumbers)}
        />
        <SettingsToggleRow
          label="syntax-highlighting"
          description="Enable colored syntax highlighting"
          checked={settings.enableSyntaxHighlighting}
          onToggle={() => handleChange('enableSyntaxHighlighting', !settings.enableSyntaxHighlighting)}
        />
      </SettingsGroup>
    </SettingsSection>
  );
};
