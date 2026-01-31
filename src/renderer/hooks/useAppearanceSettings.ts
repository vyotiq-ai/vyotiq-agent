/**
 * useAppearanceSettings Hook
 * 
 * Applies appearance settings to CSS variables and document classes on initial load
 * and whenever settings change. This ensures the UI reflects the user's preferences
 * immediately when the app starts.
 */

import { useEffect } from 'react';
import { useAgentSelector } from '../state/AgentProvider';
import {
  type AppearanceSettings,
  FONT_SIZE_SCALES,
  ACCENT_COLOR_PRESETS,
  DEFAULT_APPEARANCE_SETTINGS,
} from '../../shared/types';

/**
 * Apply appearance settings to the document
 * This is also exported so it can be called during initial load before React renders
 */
export function applyAppearanceSettings(settings: AppearanceSettings): void {
  const doc = document.documentElement;

  // Apply font size scale
  const scale = FONT_SIZE_SCALES[settings.fontSizeScale] ?? FONT_SIZE_SCALES.default;
  doc.style.setProperty('--font-size-base', `${scale.base}px`);
  doc.style.setProperty('--font-size-sm', `${scale.sm}px`);
  doc.style.setProperty('--font-size-xs', `${scale.xs}px`);
  doc.style.setProperty('--font-size-lg', `${scale.lg}px`);

  // Apply accent color
  if (settings.accentColor === 'custom' && settings.customAccentColor) {
    doc.style.setProperty('--color-accent-primary', settings.customAccentColor);
  } else if (settings.accentColor !== 'custom') {
    const preset = ACCENT_COLOR_PRESETS[settings.accentColor];
    if (preset) {
      doc.style.setProperty('--color-accent-primary', preset.primary);
      doc.style.setProperty('--color-accent-hover', preset.hover);
      doc.style.setProperty('--color-accent-active', preset.active);
    }
  }

  // Apply compact mode
  if (settings.compactMode) {
    doc.classList.add('compact-mode');
  } else {
    doc.classList.remove('compact-mode');
  }

  // Apply terminal font
  const fontFamily = settings.terminalFont === 'system'
    ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    : `"${settings.terminalFont}", monospace`;
  doc.style.setProperty('--font-terminal', fontFamily);
  doc.style.setProperty('--font-terminal-size', `${settings.terminalFontSize}px`);

  // Apply animations setting
  if (settings.enableAnimations) {
    doc.setAttribute('data-animations', 'true');
  } else {
    doc.removeAttribute('data-animations');
  }
}

/**
 * Hook that applies appearance settings from the agent state
 * Call this once in your App component to ensure settings are applied
 */
export function useAppearanceSettings(): void {
  const appearanceSettings = useAgentSelector(
    (state) => state.settings?.appearanceSettings ?? DEFAULT_APPEARANCE_SETTINGS,
    // Custom equality check for appearance settings
    (a, b) => JSON.stringify(a) === JSON.stringify(b)
  );

  useEffect(() => {
    applyAppearanceSettings(appearanceSettings);
  }, [appearanceSettings]);
}

export default useAppearanceSettings;
