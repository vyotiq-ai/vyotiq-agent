/**
 * Settings Appearance Section
 * 
 * Theme and appearance settings including light/dark mode.
 * Uses CSS variables for theme-aware styling.
 */
import React, { useMemo } from 'react';
import { Monitor, Moon, Sun, Palette, Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '../../../utils/themeMode.tsx';
import { cn } from '../../../utils/cn';

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

export const SettingsAppearance: React.FC = () => {
  const { mode, setMode, resolved } = useTheme();

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
                    <div
                      className="flex items-center gap-1"
                    >
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
        {/* Mini preview swatch using current theme colors */}
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

      {/* Coming Soon Features */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-2">
          <span className="text-[var(--color-text-muted)]">#</span>
          <span>upcoming features</span>
        </div>

        <div className="p-3 border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] rounded-sm">
          <ul className="text-[9px] text-[var(--color-text-muted)] space-y-1">
            <li className="flex items-center gap-2">
              <span className="text-[var(--color-text-placeholder)]">-</span>
              <span>Font size adjustments</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[var(--color-text-placeholder)]">-</span>
              <span>Custom accent colors</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[var(--color-text-placeholder)]">-</span>
              <span>Compact mode</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[var(--color-text-placeholder)]">-</span>
              <span>Custom terminal fonts</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
};
