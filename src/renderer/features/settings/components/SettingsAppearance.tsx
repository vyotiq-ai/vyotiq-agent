/**
 * Settings Appearance Section
 * 
 * Theme and appearance settings including:
 * - Light/dark/system mode
 * - Font size scale
 * - Accent color selection
 * - Compact mode toggle
 * - Terminal font customization
 * 
 * Uses CSS variables for theme-aware styling.
 */
import React, { useMemo, useEffect, useCallback } from 'react';
import { Monitor, Moon, Sun, Palette, Check, Type, Minimize2, Terminal, Sparkles, Loader, Zap, Activity } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../../utils/themeMode.tsx';
import { cn } from '../../../utils/cn';
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

interface SettingsAppearanceProps {
  settings?: AppearanceSettings;
  onChange?: (field: keyof AppearanceSettings, value: AppearanceSettings[keyof AppearanceSettings]) => void;
}

interface ThemeOption {
  id: ThemeMode;
  label: string;
  icon: React.ReactNode;
  description: string;
  preview: {
    bg: string;
    surface: string;
    text: string;
    accent: string;
  };
}

const themeOptions: ThemeOption[] = [
  {
    id: 'system',
    label: 'System',
    icon: <Monitor size={16} />,
    description: 'Automatically match your system preference',
    preview: {
      bg: 'linear-gradient(135deg, #18181b 50%, #f4f4f5 50%)',
      surface: 'linear-gradient(135deg, #27272a 50%, #e4e4e7 50%)',
      text: 'linear-gradient(135deg, #e4e4e7 50%, #18181b 50%)',
      accent: '#34d399',
    },
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: <Moon size={16} />,
    description: 'Dark terminal theme - easier on the eyes',
    preview: {
      bg: '#09090b',
      surface: '#18181b',
      text: '#e4e4e7',
      accent: '#34d399',
    },
  },
  {
    id: 'light',
    label: 'Light',
    icon: <Sun size={16} />,
    description: 'Light theme for bright environments',
    preview: {
      bg: '#ffffff',
      surface: '#f4f4f5',
      text: '#18181b',
      accent: '#059669',
    },
  },
];

const fontSizeOptions: { id: FontSizeScale; label: string; description: string }[] = [
  { id: 'compact', label: 'Compact', description: 'Smaller text, more content visible' },
  { id: 'default', label: 'Default', description: 'Balanced readability' },
  { id: 'comfortable', label: 'Comfortable', description: 'Larger text, easier reading' },
  { id: 'large', label: 'Large', description: 'Maximum readability' },
];

const accentColorOptions: { id: AccentColorPreset; label: string; color: string }[] = [
  { id: 'emerald', label: 'Emerald', color: '#34d399' },
  { id: 'violet', label: 'Violet', color: '#a78bfa' },
  { id: 'blue', label: 'Blue', color: '#60a5fa' },
  { id: 'amber', label: 'Amber', color: '#fbbf24' },
  { id: 'rose', label: 'Rose', color: '#fb7185' },
  { id: 'cyan', label: 'Cyan', color: '#22d3ee' },
];

const terminalFontOptions: TerminalFont[] = [
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'Cascadia Code',
  'Consolas',
  'Monaco',
  'Menlo',
  'system',
];

const terminalFontSizeOptions = [10, 11, 12, 13, 14, 16, 18, 20];
const loadingIndicatorOptions: { id: LoadingIndicatorStyle; label: string; description: string }[] = [
  { id: 'spinner', label: 'Spinner', description: 'Classic rotating spinner' },
  { id: 'dots', label: 'Dots', description: 'Pulsing dots animation' },
  { id: 'pulse', label: 'Pulse', description: 'Gentle pulsing effect' },
  { id: 'minimal', label: 'Minimal', description: 'Subtle static indicator' },
];

const animationSpeedOptions: { id: AnimationSpeed; label: string; description: string }[] = [
  { id: 'slow', label: 'Slow', description: 'Relaxed, slower animations' },
  { id: 'normal', label: 'Normal', description: 'Default animation speed' },
  { id: 'fast', label: 'Fast', description: 'Quick, snappy animations' },
];

const reduceMotionOptions: { id: ReduceMotionPreference; label: string; description: string }[] = [
  { id: 'system', label: 'System', description: 'Follow system preference' },
  { id: 'always', label: 'Always', description: 'Always reduce motion' },
  { id: 'never', label: 'Never', description: 'Always show animations' },
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

  // Derive current theme colors for preview
  const currentPreview = useMemo(() => {
    const option = themeOptions.find(opt => opt.id === mode);
    return option?.preview ?? themeOptions[1].preview;
  }, [mode]);

  return (
    <section className="space-y-6 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">appearance</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Customize the look and feel of the application
        </p>
      </header>

      {/* Theme Selection */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Palette size={11} className="text-[var(--color-accent-secondary)]" />
          theme
        </div>

        <div className="grid gap-3">
          {themeOptions.map((option) => {
            const isActive = mode === option.id;

            return (
              <button
                key={option.id}
                onClick={() => setMode(option.id)}
                className={cn(
                  "group relative flex items-start gap-4 p-4 border text-left transition-all duration-200 rounded-sm",
                  isActive
                    ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5"
                    : "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)]",
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
                aria-pressed={isActive}
              >
                {/* Theme Preview Thumbnail */}
                <div
                  className={cn(
                    "flex-shrink-0 w-16 h-12 rounded-sm overflow-hidden border transition-all",
                    isActive
                      ? "border-[var(--color-accent-primary)] shadow-[0_0_8px_rgba(52,211,153,0.3)]"
                      : "border-[var(--color-border-default)]"
                  )}
                  style={{ background: option.preview.bg }}
                >
                  {/* Mini terminal preview */}
                  <div
                    className="h-2 w-full flex items-center px-1 gap-0.5"
                    style={{ background: option.preview.surface }}
                  >
                    <div className="w-1 h-1 rounded-full bg-[#ff5f57]" />
                    <div className="w-1 h-1 rounded-full bg-[#febc2e]" />
                    <div className="w-1 h-1 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="p-1 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <div
                        className="w-1 h-1 rounded-full"
                        style={{ background: option.preview.accent }}
                      />
                      <div
                        className="h-0.5 w-6 rounded-full"
                        style={{ background: option.preview.text, opacity: 0.6 }}
                      />
                    </div>
                    <div
                      className="h-0.5 w-10 rounded-full"
                      style={{ background: option.preview.text, opacity: 0.3 }}
                    />
                    <div
                      className="h-0.5 w-8 rounded-full"
                      style={{ background: option.preview.text, opacity: 0.3 }}
                    />
                  </div>
                </div>

                {/* Theme Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "transition-colors",
                      isActive
                        ? "text-[var(--color-accent-primary)]"
                        : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"
                    )}>
                      {option.icon}
                    </span>
                    <span className={cn(
                      "text-xs font-medium",
                      isActive
                        ? "text-[var(--color-accent-primary)]"
                        : "text-[var(--color-text-primary)]"
                    )}>
                      {option.label}
                    </span>
                    {isActive && (
                      <span className="text-[8px] px-1.5 py-0.5 bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)] rounded-sm uppercase tracking-wide">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {option.description}
                  </p>
                </div>

                {/* Selection Indicator */}
                <div className={cn(
                  "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                  isActive
                    ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]"
                    : "border-[var(--color-border-strong)]"
                )}>
                  {isActive && <Check size={12} className="text-[var(--color-text-on-accent)]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Theme Info */}
      <div className="flex items-center gap-3 p-3 border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] rounded-sm text-[10px]">
        <div
          className="flex-shrink-0 w-6 h-6 rounded-sm border border-[var(--color-border-default)] overflow-hidden"
          style={{ background: currentPreview.bg }}
          title="Current theme preview"
        >
          <div
            className="w-full h-1/2 flex items-center justify-center"
            style={{ background: currentPreview.surface }}
          >
            <div
              className="w-2 h-1 rounded-full"
              style={{ background: currentPreview.accent }}
            />
          </div>
        </div>
        <span className="text-[var(--color-text-muted)]">#</span>
        <span className="text-[var(--color-text-secondary)]">
          Active theme:
          <span className="text-[var(--color-accent-primary)] ml-1 font-medium">
            {resolved}
          </span>
          {mode === 'system' && (
            <span className="text-[var(--color-text-muted)] ml-1">
              (detected from system)
            </span>
          )}
        </span>
      </div>

      {/* Font Size Scale */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Type size={11} className="text-[var(--color-accent-secondary)]" />
          font size
        </div>

        <div className="grid grid-cols-2 gap-2">
          {fontSizeOptions.map((option) => {
            const isActive = settings.fontSizeScale === option.id;
            const scale = FONT_SIZE_SCALES[option.id];
            
            return (
              <button
                key={option.id}
                onClick={() => handleChange('fontSizeScale', option.id)}
                className={cn(
                  "flex flex-col items-start p-3 border text-left transition-all duration-200 rounded-sm",
                  isActive
                    ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5"
                    : "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)]",
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span 
                    className={cn(
                      "font-medium",
                      isActive ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-primary)]"
                    )}
                    style={{ fontSize: `${scale.base}px` }}
                  >
                    {option.label}
                  </span>
                  {isActive && (
                    <Check size={12} className="text-[var(--color-accent-primary)]" />
                  )}
                </div>
                <span className="text-[9px] text-[var(--color-text-muted)]">
                  {option.description}
                </span>
                <span className="text-[8px] text-[var(--color-text-dim)] mt-1">
                  base: {scale.base}px
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent Color */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Sparkles size={11} className="text-[var(--color-accent-secondary)]" />
          accent color
        </div>

        <div className="flex flex-wrap gap-2">
          {accentColorOptions.map((option) => {
            const isActive = settings.accentColor === option.id;
            
            return (
              <button
                key={option.id}
                onClick={() => handleChange('accentColor', option.id)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-2 border transition-all duration-200 rounded-sm",
                  isActive
                    ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5"
                    : "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)]",
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
                title={option.label}
              >
                <div 
                  className={cn(
                    "w-4 h-4 rounded-full transition-transform",
                    isActive && "ring-2 ring-white/30 ring-offset-1 ring-offset-[var(--color-surface-1)]"
                  )}
                  style={{ backgroundColor: option.color }}
                />
                <span className={cn(
                  "text-[10px]",
                  isActive ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-secondary)]"
                )}>
                  {option.label}
                </span>
                {isActive && (
                  <Check size={10} className="text-[var(--color-accent-primary)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compact Mode */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Minimize2 size={11} className="text-[var(--color-accent-secondary)]" />
          layout density
        </div>

        <button
          onClick={() => handleChange('compactMode', !settings.compactMode)}
          className={cn(
            "w-full flex items-center justify-between p-3 border transition-all duration-200 rounded-sm",
            settings.compactMode
              ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5"
              : "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-2)]",
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
          )}
        >
          <div>
            <div className="text-[11px] text-[var(--color-text-primary)] mb-0.5">
              Compact Mode
            </div>
            <div className="text-[9px] text-[var(--color-text-muted)]">
              Reduce padding and margins for more content on screen
            </div>
          </div>
          <div className={cn(
            "w-10 h-5 rounded-full transition-colors relative",
            settings.compactMode 
              ? "bg-[var(--color-accent-primary)]" 
              : "bg-[var(--color-border-strong)]"
          )}>
            <div className={cn(
              "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
              settings.compactMode ? "left-5" : "left-0.5"
            )} />
          </div>
        </button>
      </div>

      {/* Terminal Font */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Terminal size={11} className="text-[var(--color-accent-secondary)]" />
          terminal font
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <label className="text-[9px] text-[var(--color-text-muted)]">font family</label>
            <select
              value={settings.terminalFont}
              onChange={(e) => handleChange('terminalFont', e.target.value as TerminalFont)}
              className={cn(
                "w-full px-2 py-1.5 text-[10px]",
                "border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]",
                "text-[var(--color-text-primary)]",
                "focus:outline-none focus:border-[var(--color-accent-primary)]",
                "rounded-sm"
              )}
              style={{ fontFamily: settings.terminalFont === 'system' ? 'monospace' : `"${settings.terminalFont}"` }}
            >
              {terminalFontOptions.map((font) => (
                <option key={font} value={font} style={{ fontFamily: font === 'system' ? 'monospace' : `"${font}"` }}>
                  {font === 'system' ? 'System Default' : font}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] text-[var(--color-text-muted)]">font size</label>
            <select
              value={settings.terminalFontSize}
              onChange={(e) => handleChange('terminalFontSize', parseInt(e.target.value))}
              className={cn(
                "w-full px-2 py-1.5 text-[10px]",
                "border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]",
                "text-[var(--color-text-primary)]",
                "focus:outline-none focus:border-[var(--color-accent-primary)]",
                "rounded-sm"
              )}
            >
              {terminalFontSizeOptions.map((size) => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
          </div>
        </div>

        {/* Font Preview */}
        <div 
          className="p-3 border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] rounded-sm"
          style={{ 
            fontFamily: settings.terminalFont === 'system' 
              ? 'ui-monospace, monospace' 
              : `"${settings.terminalFont}", monospace`,
            fontSize: `${settings.terminalFontSize}px`,
          }}
        >
          <div className="flex items-center gap-2 text-[var(--color-accent-primary)]">
            <span>λ</span>
            <span className="text-[var(--color-text-primary)]">echo "Font preview"</span>
          </div>
          <div className="text-[var(--color-text-secondary)] mt-1 pl-4">
            ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />
            abcdefghijklmnopqrstuvwxyz<br />
            0123456789 +-*/= {'{}[]()<>'} 
          </div>
        </div>
      </div>

      {/* Additional Options */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Sparkles size={11} className="text-[var(--color-accent-secondary)]" />
          additional options
        </div>

        <div className="space-y-2">
          {/* Enable Animations */}
          <button
            onClick={() => handleChange('enableAnimations', !settings.enableAnimations)}
            className={cn(
              "w-full flex items-center justify-between p-2 border transition-all duration-200 rounded-sm",
              "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]",
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
          >
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              Enable smooth animations
            </span>
            <div className={cn(
              "w-8 h-4 rounded-full transition-colors relative",
              settings.enableAnimations 
                ? "bg-[var(--color-accent-primary)]" 
                : "bg-[var(--color-border-strong)]"
            )}>
              <div className={cn(
                "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm",
                settings.enableAnimations ? "left-4" : "left-0.5"
              )} />
            </div>
          </button>
        </div>

        {/* Animation Settings - Only show when animations are enabled */}
        {settings.enableAnimations && (
          <div className="space-y-3 pl-2 border-l-2 border-[var(--color-border-subtle)]">
            {/* Loading Indicator Style */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader size={10} className="text-[var(--color-text-muted)]" />
                <span className="text-[9px] text-[var(--color-text-muted)]">loading indicator style</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {loadingIndicatorOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleChange('loadingIndicatorStyle', option.id)}
                    className={cn(
                      "px-2 py-1.5 text-[9px] border rounded-sm transition-all",
                      settings.loadingIndicatorStyle === option.id
                        ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                        : "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                    )}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Animation Speed */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap size={10} className="text-[var(--color-text-muted)]" />
                <span className="text-[9px] text-[var(--color-text-muted)]">animation speed</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {animationSpeedOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleChange('animationSpeed', option.id)}
                    className={cn(
                      "px-2 py-1.5 text-[9px] border rounded-sm transition-all",
                      settings.animationSpeed === option.id
                        ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                        : "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                    )}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reduce Motion */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity size={10} className="text-[var(--color-text-muted)]" />
                <span className="text-[9px] text-[var(--color-text-muted)]">reduce motion</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {reduceMotionOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleChange('reduceMotion', option.id)}
                    className={cn(
                      "px-2 py-1.5 text-[9px] border rounded-sm transition-all",
                      settings.reduceMotion === option.id
                        ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]"
                        : "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
                    )}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Animation Preview */}
            <div className="p-3 border border-[var(--color-border-subtle)] bg-[var(--color-surface-base)] rounded-sm">
              <div className="flex items-center gap-3 text-[9px] text-[var(--color-text-muted)]">
                <span>preview:</span>
                <div className="flex items-center gap-2">
                  {settings.loadingIndicatorStyle === 'spinner' && (
                    <div className="w-3 h-3 border border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin" />
                  )}
                  {settings.loadingIndicatorStyle === 'dots' && (
                    <div className="flex gap-0.5">
                      <div className="w-1.5 h-1.5 bg-[var(--color-accent-primary)] rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-[var(--color-accent-primary)] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-[var(--color-accent-primary)] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                  {settings.loadingIndicatorStyle === 'pulse' && (
                    <div className="w-3 h-3 bg-[var(--color-accent-primary)] rounded-full animate-pulse" />
                  )}
                  {settings.loadingIndicatorStyle === 'minimal' && (
                    <div className="w-3 h-3 bg-[var(--color-accent-primary)]/50 rounded-full" />
                  )}
                  <span className="text-[var(--color-text-secondary)]">Loading...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {/* Show Line Numbers */}
          <button
            onClick={() => handleChange('showLineNumbers', !settings.showLineNumbers)}
            className={cn(
              "w-full flex items-center justify-between p-2 border transition-all duration-200 rounded-sm",
              "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]",
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
          >
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              Show line numbers in code blocks
            </span>
            <div className={cn(
              "w-8 h-4 rounded-full transition-colors relative",
              settings.showLineNumbers 
                ? "bg-[var(--color-accent-primary)]" 
                : "bg-[var(--color-border-strong)]"
            )}>
              <div className={cn(
                "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm",
                settings.showLineNumbers ? "left-4" : "left-0.5"
              )} />
            </div>
          </button>

          {/* Enable Syntax Highlighting */}
          <button
            onClick={() => handleChange('enableSyntaxHighlighting', !settings.enableSyntaxHighlighting)}
            className={cn(
              "w-full flex items-center justify-between p-2 border transition-all duration-200 rounded-sm",
              "border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]",
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
          >
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              Enable syntax highlighting
            </span>
            <div className={cn(
              "w-8 h-4 rounded-full transition-colors relative",
              settings.enableSyntaxHighlighting 
                ? "bg-[var(--color-accent-primary)]" 
                : "bg-[var(--color-border-strong)]"
            )}>
              <div className={cn(
                "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm",
                settings.enableSyntaxHighlighting ? "left-4" : "left-0.5"
              )} />
            </div>
          </button>
        </div>
      </div>

      {/* Live Preview */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-2">
          <span className="text-[var(--color-accent-primary)]">›</span>
          <span>Preview</span>
        </div>

        <div className="p-4 border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] rounded-sm space-y-3">
          {/* Terminal prompt preview */}
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-accent-primary)]">λ</span>
            <span className="text-[var(--color-text-primary)] text-[11px]">echo "Hello, World!"</span>
          </div>

          {/* Output preview */}
          <div className="text-[10px] text-[var(--color-text-secondary)] pl-4">
            Hello, World!
          </div>

          {/* Status badges preview */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
            <span className="px-2 py-1 text-[9px] bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 rounded-sm">
              success
            </span>
            <span className="px-2 py-1 text-[9px] bg-[var(--color-error)]/10 text-[var(--color-error)] border border-[var(--color-error)]/30 rounded-sm">
              error
            </span>
            <span className="px-2 py-1 text-[9px] bg-[var(--color-warning)]/10 text-[var(--color-warning)] border border-[var(--color-warning)]/30 rounded-sm">
              warning
            </span>
            <span className="px-2 py-1 text-[9px] bg-[var(--color-info)]/10 text-[var(--color-info)] border border-[var(--color-info)]/30 rounded-sm">
              info
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
