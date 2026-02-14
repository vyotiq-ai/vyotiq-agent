/**
 * Settings Compliance Component
 * 
 * Runtime enforcement of system prompt rules.
 */
import React from 'react';
import { Shield } from 'lucide-react';
import type { ComplianceSettings } from '../../../../shared/types';
import { SettingsSection, SettingsGroup, SettingsToggleRow, SettingsSlider, SettingsInfoBox } from '../primitives';

interface SettingsComplianceProps {
  settings: ComplianceSettings;
  onChange: (field: keyof ComplianceSettings, value: ComplianceSettings[keyof ComplianceSettings]) => void;
}

export const SettingsCompliance: React.FC<SettingsComplianceProps> = ({ settings, onChange }) => {
  return (
    <SettingsSection title="compliance" description="Runtime enforcement of system prompt rules">
      {/* Master Toggle */}
      <SettingsGroup title="status" icon={<Shield size={11} />}>
        <SettingsToggleRow
          label="enabled"
          description="Enable compliance checking"
          checked={settings.enabled}
          onToggle={() => onChange('enabled', !settings.enabled)}
        />
      </SettingsGroup>

      {/* Rule Enforcement */}
      <SettingsGroup title="rules">
        <SettingsToggleRow
          label="enforce-read-before-write"
          description="Require reading files before editing"
          checked={settings.enforceReadBeforeWrite}
          onToggle={() => onChange('enforceReadBeforeWrite', !settings.enforceReadBeforeWrite)}
          disabled={!settings.enabled}
        />
        <SettingsToggleRow
          label="enforce-lint-after-edit"
          description="Require lint check after editing files"
          checked={settings.enforceLintAfterEdit}
          onToggle={() => onChange('enforceLintAfterEdit', !settings.enforceLintAfterEdit)}
          disabled={!settings.enabled}
        />
        <SettingsToggleRow
          label="block-unnecessary-files"
          description="Warn when creating files that could be edited"
          checked={settings.blockUnnecessaryFiles}
          onToggle={() => onChange('blockUnnecessaryFiles', !settings.blockUnnecessaryFiles)}
          disabled={!settings.enabled}
        />
      </SettingsGroup>

      {/* Behavior */}
      <SettingsGroup title="behavior">
        <SettingsToggleRow
          label="inject-corrective-messages"
          description="Add reminders to conversation on violations"
          checked={settings.injectCorrectiveMessages}
          onToggle={() => onChange('injectCorrectiveMessages', !settings.injectCorrectiveMessages)}
          disabled={!settings.enabled}
        />
        <SettingsToggleRow
          label="strict-mode"
          description="Block actions on any violation (strict enforcement)"
          checked={settings.strictMode}
          onToggle={() => onChange('strictMode', !settings.strictMode)}
          disabled={!settings.enabled}
        />
        <SettingsSlider
          label="max-violations-before-block"
          description="Number of violations before blocking actions"
          value={settings.maxViolationsBeforeBlock}
          onChange={(v) => onChange('maxViolationsBeforeBlock', v)}
          min={1}
          max={10}
          step={1}
          disabled={!settings.enabled || settings.strictMode}
        />
      </SettingsGroup>

      {/* Debugging */}
      <SettingsGroup title="debugging">
        <SettingsToggleRow
          label="log-violations"
          description="Log violations to console for debugging"
          checked={settings.logViolations}
          onToggle={() => onChange('logViolations', !settings.logViolations)}
          disabled={!settings.enabled}
        />
      </SettingsGroup>

      {/* Info Box */}
      <SettingsInfoBox title="# about compliance">
        <p>
          Compliance rules help ensure the AI assistant follows best practices:
        </p>
        <ul className="space-y-1 ml-2 mt-1">
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
      </SettingsInfoBox>
    </SettingsSection>
  );
};

export default SettingsCompliance;
