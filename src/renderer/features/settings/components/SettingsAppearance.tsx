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
import React, { useEffect, useCallback } from 'react';
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

  // Apply font size scale to CSS variables
  useEffect(() => {
    const scale = FONT_SIZE_SCALES[settings.fontSizeScale] ?? FONT_SIZE_SCALES.default;
    document.documentElement.style.setProperty('--font-size-base', `${scale.base}px`);
    document.documentElement.style.setProperty('--font-size-sm', `${scale.sm}px`);
    document.documentElement.style.setProperty('--font-size-xs', `${scale.xs}px`);
    document.documentElement.style.setProperty('--font-size-lg', `${scale.lg}px`);
  }, [settings.fontSizeScale]);

  // Apply accent color to CSS variables
  useEffect(() => {
    if (settings.accentColor === 'custom' && settings.customAccentColor) {
      document.documentElement.style.setProperty('--color-accent-primary', settings.customAccentColor);
    } else if (settings.accentColor !== 'custom') {
      const preset = ACCENT_COLOR_PRESETS[settings.accentColor];
      if (preset) {
        document.documentElement.style.setProperty('--color-accent-primary', preset.primary);
        document.documentElement.style.setProperty('--color-accent-hover', preset.hover);
        document.documentElement.style.setProperty('--color-accent-active', preset.active);
      }
    }
  }, [settings.accentColor, settings.customAccentColor]);

  // Apply compact mode
  useEffect(() => {
    if (settings.compactMode) {
      document.documentElement.classList.add('compact-mode');
    } else {
      document.documentElement.classList.remove('compact-mode');
    }
  }, [settings.compactMode]);

  // Apply terminal font settings
  useEffect(() => {
    const fontFamily = settings.terminalFont === 'system' 
      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      : `"${settings.terminalFont}", monospace`;
    document.documentElement.style.setProperty('--font-terminal', fontFamily);
    document.documentElement.style.setProperty('--font-terminal-size', `${settings.terminalFontSize}px`);
  }, [settings.terminalFont, settings.terminalFontSize]);

  // Apply animations setting
  useEffect(() => {
    if (settings.enableAnimations) {
      document.documentElement.setAttribute('data-animations', 'true');
    } else {
      document.documentElement.removeAttribute('data-animations');
    }
  }, [settings.enableAnimations]);

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
          label="Color Mode"
          description={`Current: ${resolved}${mode === 'system' ? ' (detected from system)' : ''}`}
          value={mode}
          options={themeOptions}
          onChange={(value) => setMode(value)}
        />
      </SettingsGroup>

      {/* Font Size */}
      <SettingsGroup title="font-size">
        <SettingsSelect
          label="UI Scale"
          description="Adjust text size throughout the application"
          value={settings.fontSizeScale}
          options={fontSizeOptions}
          onChange={(value) => handleChange('fontSizeScale', value)}
        />
      </SettingsGroup>

      {/* Accent Color */}
      <SettingsGroup title="accent-color">
        <SettingsSelect
          label="Accent Color"
          description="Primary highlight color for interactive elements"
          value={settings.accentColor}
          options={accentColorOptions}
          onChange={(value) => handleChange('accentColor', value)}
        />
      </SettingsGroup>

      {/* Terminal Font */}
      <SettingsGroup title="terminal">
        <SettingsSelect
          label="Font Family"
          description="Monospace font for code and terminal"
          value={settings.terminalFont}
          options={terminalFontOptions}
          onChange={(value) => handleChange('terminalFont', value)}
        />
        <SettingsSelect
          label="Font Size"
          description="Terminal and code block text size"
          value={String(settings.terminalFontSize)}
          options={terminalFontSizeOptions}
          onChange={(value) => handleChange('terminalFontSize', parseInt(value))}
        />
      </SettingsGroup>

      {/* Animation Settings */}
      <SettingsGroup title="animations">
        <SettingsToggleRow
          label="Enable Animations"
          description="Toggle smooth transitions and effects"
          checked={settings.enableAnimations}
          onToggle={() => handleChange('enableAnimations', !settings.enableAnimations)}
        />

        {settings.enableAnimations && (
          <>
            <SettingsSelect
              label="Loading Indicator"
              description="Style of loading indicators"
              value={settings.loadingIndicatorStyle}
              options={loadingIndicatorOptions}
              onChange={(value) => handleChange('loadingIndicatorStyle', value)}
            />
            <SettingsSelect
              label="Animation Speed"
              description="Speed of UI animations"
              value={settings.animationSpeed}
              options={animationSpeedOptions}
              onChange={(value) => handleChange('animationSpeed', value)}
            />
            <SettingsSelect
              label="Reduce Motion"
              description="Accessibility preference for motion"
              value={settings.reduceMotion}
              options={reduceMotionOptions}
              onChange={(value) => handleChange('reduceMotion', value)}
            />
          </>
        )}

        <SettingsToggleRow
          label="Compact Mode"
          description="Reduce padding for more content on screen"
          checked={settings.compactMode}
          onToggle={() => handleChange('compactMode', !settings.compactMode)}
        />
      </SettingsGroup>

      {/* Code Display */}
      <SettingsGroup title="code-display">
        <SettingsToggleRow
          label="Show Line Numbers"
          description="Display line numbers in code blocks"
          checked={settings.showLineNumbers}
          onToggle={() => handleChange('showLineNumbers', !settings.showLineNumbers)}
        />
        <SettingsToggleRow
          label="Syntax Highlighting"
          description="Enable colored syntax highlighting"
          checked={settings.enableSyntaxHighlighting}
          onToggle={() => handleChange('enableSyntaxHighlighting', !settings.enableSyntaxHighlighting)}
        />
      </SettingsGroup>
    </SettingsSection>
  );
};
