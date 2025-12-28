/**
 * Settings Terminal Component
 * 
 * Configure terminal behavior and shell settings.
 */
import React from 'react';
import { Terminal, Monitor, Zap, Layers } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Toggle } from '../../../components/ui/Toggle';
import type { TerminalSettings } from '../../../../shared/types';

interface SettingsTerminalProps {
  settings?: TerminalSettings;
  onChange?: (field: keyof TerminalSettings, value: TerminalSettings[keyof TerminalSettings]) => void;
}

export const SettingsTerminal: React.FC<SettingsTerminalProps> = ({
  settings,
  onChange,
}) => {
  // Use defaults if settings not provided
  const {
    defaultShell = 'system',
    fontSize = 12,
    scrollbackLines = 10000,
    copyOnSelect = true,
    cursorBlink = true,
    cursorStyle = 'block',
    defaultTimeout = 120000,
    maxConcurrentProcesses = 5,
  } = settings ?? {};

  const shellOptions: Array<{ value: TerminalSettings['defaultShell']; label: string }> = [
    { value: 'system', label: 'system' },
    { value: 'powershell', label: 'powershell' },
    { value: 'cmd', label: 'cmd' },
    { value: 'bash', label: 'bash' },
    { value: 'zsh', label: 'zsh' },
  ];

  const cursorStyleOptions: Array<{ value: TerminalSettings['cursorStyle']; label: string }> = [
    { value: 'block', label: '█' },
    { value: 'underline', label: '_' },
    { value: 'bar', label: '│' },
  ];

  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">terminal</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Configure integrated terminal behavior
        </p>
      </header>

      {/* Shell Configuration */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Zap size={11} className="text-[var(--color-warning)]" />
          shell
        </div>

        {/* Default Shell */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--color-text-muted)]">--shell</label>
          <select
            value={defaultShell}
            onChange={(e) => onChange?.('defaultShell', e.target.value as TerminalSettings['defaultShell'])}
            className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
          >
            {shellOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-[9px] text-[var(--color-text-dim)]"># default shell for new terminals</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Command Timeout */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--timeout</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{Math.round(defaultTimeout / 1000)}s</span>
            </div>
            <input
              type="range"
              min={10000}
              max={600000}
              step={10000}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={defaultTimeout}
              onChange={(e) => onChange?.('defaultTimeout', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>10s</span>
              <span>5min</span>
              <span>10min</span>
            </div>
          </div>

          {/* Max Concurrent */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--max-procs</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{maxConcurrentProcesses}</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={maxConcurrentProcesses}
              onChange={(e) => onChange?.('maxConcurrentProcesses', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>1</span>
              <span>10</span>
              <span>20</span>
            </div>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Monitor size={11} className="text-[var(--color-info)]" />
          appearance
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Font Size */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--font-size</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{fontSize}px</span>
            </div>
            <input
              type="range"
              min={8}
              max={24}
              step={1}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={fontSize}
              onChange={(e) => onChange?.('fontSize', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>8</span>
              <span>16</span>
              <span>24</span>
            </div>
          </div>

          {/* Scrollback */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--scrollback</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{(scrollbackLines / 1000).toFixed(0)}k</span>
            </div>
            <input
              type="range"
              min={1000}
              max={100000}
              step={1000}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={scrollbackLines}
              onChange={(e) => onChange?.('scrollbackLines', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>1k</span>
              <span>50k</span>
              <span>100k</span>
            </div>
          </div>
        </div>

        {/* Cursor Style */}
        <div className="space-y-1.5">
          <label className="text-[10px] text-[var(--color-text-muted)]">--cursor</label>
          <div className="flex gap-1">
            {cursorStyleOptions.map((opt) => (
              <button
                key={opt.value}
                className={cn(
                  "flex-1 py-1.5 text-[12px] transition-all border",
                  cursorStyle === opt.value 
                    ? "bg-[var(--color-surface-2)] text-[var(--color-accent-primary)] border-[var(--color-accent-primary)]/30" 
                    : "bg-transparent text-[var(--color-text-dim)] border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)]",
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
                onClick={() => onChange?.('cursorStyle', opt.value)}
                title={opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Behavior */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Layers size={11} className="text-[var(--color-accent-secondary)]" />
          behavior
        </div>
        
        <Toggle
          label="--cursor-blink"
          description="# animate cursor blinking"
          checked={cursorBlink}
          onToggle={() => onChange?.('cursorBlink', !cursorBlink)}
        />
        
        <Toggle
          label="--copy-on-select"
          description="# copy text when selected"
          checked={copyOnSelect}
          onToggle={() => onChange?.('copyOnSelect', !copyOnSelect)}
        />
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Terminal size={11} className="text-[var(--color-accent-primary)]" />
          preview
        </div>
        
        <div 
          className="p-3 bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] overflow-hidden"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}
        >
          <div className="text-[var(--color-accent-primary)]">$ ls -la</div>
          <div className="text-[var(--color-text-primary)]">drwxr-xr-x  5 user  staff   160 Dec  9 10:00 .</div>
          <div className="text-[var(--color-text-primary)]">-rw-r--r--  1 user  staff  1024 Dec  9 09:45 package.json</div>
          <div className="text-[var(--color-accent-primary)]">$ npm install</div>
          <div className="text-[var(--color-text-dim)] italic">added 50 packages in 2s</div>
          <div className="flex items-center">
            <span className="text-[var(--color-accent-primary)]">$ </span>
            <span 
              className={cn(
                "inline-block bg-[var(--color-accent-primary)]",
                cursorBlink && "animate-pulse"
              )} 
              style={{ 
                height: cursorStyle === 'underline' ? '2px' : `${fontSize}px`,
                width: cursorStyle === 'bar' ? '2px' : '8px',
                marginTop: cursorStyle === 'underline' ? `${fontSize - 2}px` : 0,
              }} 
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default SettingsTerminal;
