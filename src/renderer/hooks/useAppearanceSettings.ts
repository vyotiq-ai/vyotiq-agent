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
  ANIMATION_SPEED_MULTIPLIERS,
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

  // Apply loading indicator style
  doc.setAttribute('data-loading-style', settings.loadingIndicatorStyle ?? 'spinner');

  // Apply animation speed
  const speedMultiplier = ANIMATION_SPEED_MULTIPLIERS[settings.animationSpeed ?? 'normal'];
  doc.style.setProperty('--animation-speed-multiplier', String(speedMultiplier));
  doc.style.setProperty('--animation-duration-spin', `${1 * speedMultiplier}s`);
  doc.style.setProperty('--animation-duration-pulse', `${2 * speedMultiplier}s`);
  doc.style.setProperty('--animation-duration-ping', `${1 * speedMultiplier}s`);
  doc.style.setProperty('--animation-duration-bounce', `${1 * speedMultiplier}s`);

  // Apply reduce motion preference
  const reduceMotion = settings.reduceMotion ?? 'system';
  doc.setAttribute('data-reduce-motion', reduceMotion);
  
  // Force enable/disable animations based on reduceMotion setting
  if (reduceMotion === 'always') {
    doc.classList.add('reduce-motion');
    doc.removeAttribute('data-animations');
  } else if (reduceMotion === 'never') {
    doc.classList.remove('reduce-motion');
    if (settings.enableAnimations) {
      doc.setAttribute('data-animations', 'true');
    }
  } else {
    // 'system' - let CSS media query handle it
    doc.classList.remove('reduce-motion');
  }
}

/**
 * Shallow equality check for appearance settings objects
 * More efficient than JSON.stringify comparison
 */
function shallowAppearanceEqual(a: AppearanceSettings, b: AppearanceSettings): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a) as Array<keyof AppearanceSettings>;
  const keysB = Object.keys(b) as Array<keyof AppearanceSettings>;
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Hook that applies appearance settings from the agent state
 * Call this once in your App component to ensure settings are applied
 */
export function useAppearanceSettings(): void {
  const appearanceSettings = useAgentSelector(
    (state) => state.settings?.appearanceSettings ?? DEFAULT_APPEARANCE_SETTINGS,
    // Shallow equality check — O(k) per key vs O(n) per char for JSON.stringify
    shallowAppearanceEqual
  );

  useEffect(() => {
    applyAppearanceSettings(appearanceSettings);
  }, [appearanceSettings]);
}

export default useAppearanceSettings;
