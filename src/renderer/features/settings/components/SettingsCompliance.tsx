import React from 'react';
import { ShieldCheck, FileEdit, AlertTriangle, Bug, Zap } from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import type { ComplianceSettings } from '../../../../shared/types';

interface SettingsComplianceProps {
  settings: ComplianceSettings;
  onChange: (field: keyof ComplianceSettings, value: ComplianceSettings[keyof ComplianceSettings]) => void;
}

export const SettingsCompliance: React.FC<SettingsComplianceProps> = ({ settings, onChange }) => {
  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">compliance</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Runtime enforcement of system prompt rules
        </p>
      </header>

      {/* Master Toggle */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <ShieldCheck size={11} className="text-[var(--color-success)]" />
          status
        </div>

        <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
          <div className="space-y-0.5">
            <label className="text-[10px] text-[var(--color-text-primary)]">--enabled</label>
            <p className="text-[9px] text-[var(--color-text-dim)]"># Enable compliance checking</p>
          </div>
          <Toggle
            checked={settings.enabled}
            onToggle={() => onChange('enabled', !settings.enabled)}
            size="sm"
          />
        </div>
      </div>

      {/* Rule Enforcement */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <FileEdit size={11} className="text-[var(--color-info)]" />
          rules
        </div>

        <div className="space-y-2">
          {/* Read Before Write */}
          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-primary)]">--enforce-read-before-write</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Require reading files before editing</p>
            </div>
            <Toggle
              checked={settings.enforceReadBeforeWrite}
              onToggle={() => onChange('enforceReadBeforeWrite', !settings.enforceReadBeforeWrite)}
              size="sm"
              disabled={!settings.enabled}
            />
          </div>

          {/* Lint After Edit */}
          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-primary)]">--enforce-lint-after-edit</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Require lint check after editing files</p>
            </div>
            <Toggle
              checked={settings.enforceLintAfterEdit}
              onToggle={() => onChange('enforceLintAfterEdit', !settings.enforceLintAfterEdit)}
              size="sm"
              disabled={!settings.enabled}
            />
          </div>

          {/* Block Unnecessary Files */}
          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-primary)]">--block-unnecessary-files</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Warn when creating files that could be edited</p>
            </div>
            <Toggle
              checked={settings.blockUnnecessaryFiles}
              onToggle={() => onChange('blockUnnecessaryFiles', !settings.blockUnnecessaryFiles)}
              size="sm"
              disabled={!settings.enabled}
            />
          </div>
        </div>
      </div>

      {/* Behavior */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <AlertTriangle size={11} className="text-[var(--color-warning)]" />
          behavior
        </div>

        <div className="space-y-2">
          {/* Inject Corrective Messages */}
          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-primary)]">--inject-corrective-messages</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Add reminders to conversation on violations</p>
            </div>
            <Toggle
              checked={settings.injectCorrectiveMessages}
              onToggle={() => onChange('injectCorrectiveMessages', !settings.injectCorrectiveMessages)}
              size="sm"
              disabled={!settings.enabled}
            />
          </div>

          {/* Strict Mode */}
          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-primary)]">--strict-mode</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Block actions on any violation (strict enforcement)</p>
            </div>
            <Toggle
              checked={settings.strictMode}
              onToggle={() => onChange('strictMode', !settings.strictMode)}
              size="sm"
              disabled={!settings.enabled}
            />
          </div>
        </div>

        {/* Max Violations Slider */}
        <div className="space-y-1.5 bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-[var(--color-text-muted)]">--max-violations-before-block</label>
            <span className="text-[10px] text-[var(--color-accent-primary)]">{settings.maxViolationsBeforeBlock}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-base)] appearance-none cursor-pointer disabled:opacity-50"
            value={settings.maxViolationsBeforeBlock}
            onChange={(e) => onChange('maxViolationsBeforeBlock', Number(e.target.value))}
            disabled={!settings.enabled || settings.strictMode}
          />
          <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
            <span>1</span>
            <span>5</span>
            <span>10</span>
          </div>
          <p className="text-[9px] text-[var(--color-text-dim)]"># Number of violations before blocking actions</p>
        </div>
      </div>

      {/* Debugging */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Bug size={11} className="text-[var(--color-accent-secondary)]" />
          debugging
        </div>

        <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
          <div className="space-y-0.5">
            <label className="text-[10px] text-[var(--color-text-primary)]">--log-violations</label>
            <p className="text-[9px] text-[var(--color-text-dim)]"># Log violations to console for debugging</p>
          </div>
          <Toggle
            checked={settings.logViolations}
            onToggle={() => onChange('logViolations', !settings.logViolations)}
            size="sm"
            disabled={!settings.enabled}
          />
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] p-3 space-y-2">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
          <Zap size={11} className="text-[var(--color-warning)]" />
          about compliance
        </div>
        <p className="text-[9px] text-[var(--color-text-dim)] leading-relaxed">
          Compliance rules help ensure the AI assistant follows best practices:
        </p>
        <ul className="text-[9px] text-[var(--color-text-dim)] space-y-1 ml-2">
          <li className="flex items-start gap-1.5">
            <span className="text-[var(--color-accent-primary)]">•</span>
            <span><strong className="text-[var(--color-text-muted)]">Read-before-write:</strong> Prevents blind edits by requiring file reads first</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-[var(--color-accent-primary)]">•</span>
            <span><strong className="text-[var(--color-text-muted)]">Lint-after-edit:</strong> Ensures code changes are validated</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="text-[var(--color-accent-primary)]">•</span>
            <span><strong className="text-[var(--color-text-muted)]">Corrective messages:</strong> Guides the AI back on track when rules are broken</span>
          </li>
        </ul>
      </div>
    </section>
  );
};
