import React from 'react';
import { Shield, FileWarning, Terminal, Lock, Globe } from 'lucide-react';
import type { SafetySettings } from '../../../../shared/types';
import {
  SettingsSection,
  SettingsGroup,
  SettingsSlider,
  SettingsToggleRow,
  SettingsListManager,
  SettingsSelect,
} from '../primitives';

interface SettingsSafetyProps {
  settings: SafetySettings;
  onChange: (field: keyof SafetySettings, value: SafetySettings[keyof SafetySettings]) => void;
}

// Format bytes for display
const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
};

// Network policy options
const networkPolicyOptions = [
  { value: 'none' as const, label: 'none (no network)' },
  { value: 'localhost' as const, label: 'localhost only' },
  { value: 'allowlist' as const, label: 'allowlist' },
];

export const SettingsSafety: React.FC<SettingsSafetyProps> = ({ settings, onChange }) => {
  return (
    <SettingsSection
      title="Safety"
      description="Configure guardrails and safety limits"
    >
      {/* Operation Limits */}
      <SettingsGroup
        title="Limits"
        icon={<FileWarning size={11} className="text-[var(--color-warning)]" />}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSlider
            label="Max Files"
            description="max files modified per run"
            value={settings.maxFilesPerRun}
            onChange={(value) => onChange('maxFilesPerRun', value)}
            min={10}
            max={200}
            step={5}
          />
          <SettingsSlider
            label="Max Bytes"
            description="max data written per run"
            value={settings.maxBytesPerRun}
            onChange={(value) => onChange('maxBytesPerRun', value)}
            min={1024 * 1024}
            max={100 * 1024 * 1024}
            step={1024 * 1024}
            format={formatBytes}
          />
        </div>
      </SettingsGroup>

      {/* Protected Paths */}
      <SettingsGroup
        title="Protected Paths"
        icon={<Lock size={11} className="text-[var(--color-error)]" />}
      >
        <SettingsListManager
          label="Protected Paths"
          description="glob patterns for paths that cannot be modified"
          items={settings.protectedPaths}
          onAdd={(value) => onChange('protectedPaths', [...settings.protectedPaths, value])}
          onRemove={(index) => onChange('protectedPaths', settings.protectedPaths.filter((_, i) => i !== index))}
          placeholder="**/secret/**"
        />
      </SettingsGroup>

      {/* Blocked Commands */}
      <SettingsGroup
        title="Blocked Commands"
        icon={<Terminal size={11} className="text-[var(--color-error)]" />}
      >
        <SettingsListManager
          label="Blocked Commands"
          description="commands that will always be rejected"
          items={settings.blockedCommands}
          onAdd={(value) => onChange('blockedCommands', [...settings.blockedCommands, value])}
          onRemove={(index) => onChange('blockedCommands', settings.blockedCommands.filter((_, i) => i !== index))}
          placeholder="rm -rf /"
        />
      </SettingsGroup>

      {/* Backup Settings */}
      <SettingsGroup
        title="Backup"
        icon={<Shield size={11} className="text-[var(--color-info)]" />}
      >
        <SettingsToggleRow
          label="Auto Backup"
          description="create backups before file modifications"
          checked={settings.enableAutoBackup}
          onToggle={() => onChange('enableAutoBackup', !settings.enableAutoBackup)}
        />

        {settings.enableAutoBackup && (
          <div className="animate-in slide-in-from-top-1 duration-150">
            <SettingsSlider
              label="Backup Retention"
              description="max backups to keep per file"
              value={settings.backupRetentionCount}
              onChange={(value) => onChange('backupRetentionCount', value)}
              min={1}
              max={50}
              step={1}
            />
          </div>
        )}
      </SettingsGroup>

      {/* Confirmation Settings */}
      <SettingsGroup
        title="Confirmation"
        icon={<Shield size={11} className="text-[var(--color-warning)]" />}
      >
        <SettingsToggleRow
          label="Confirm Dangerous"
          description="always prompt before destructive operations"
          checked={settings.alwaysConfirmDangerous}
          onToggle={() => onChange('alwaysConfirmDangerous', !settings.alwaysConfirmDangerous)}
        />

        {!settings.alwaysConfirmDangerous && (
          <div className="p-2 border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 text-[10px] animate-in slide-in-from-top-1 duration-150 font-mono">
            <div className="flex items-start gap-2">
              <span className="text-[var(--color-warning)] flex-shrink-0">[WARN]</span>
              <div className="space-y-0.5">
                <p className="text-[var(--color-warning)]">confirmation disabled</p>
                <p className="text-[var(--color-text-muted)] text-[9px]">
                  Destructive operations will execute without prompts
                </p>
              </div>
            </div>
          </div>
        )}
      </SettingsGroup>

      {/* Sandbox Settings */}
      <SettingsGroup
        title="Sandbox"
        icon={<Shield size={11} className="text-[var(--color-success)]" />}
      >
        <SettingsToggleRow
          label="Sandbox"
          description="run code in isolated environment"
          checked={settings.enableSandbox}
          onToggle={() => onChange('enableSandbox', !settings.enableSandbox)}
        />

        {settings.enableSandbox && (
          <div className="space-y-3 animate-in slide-in-from-top-1 duration-150">
            <SettingsSelect
              label="Network Policy"
              description="control network access in sandbox"
              value={settings.sandboxNetworkPolicy}
              options={networkPolicyOptions}
              onChange={(value) => onChange('sandboxNetworkPolicy', value as 'none' | 'localhost' | 'allowlist')}
            />

            {/* Network Allowlist */}
            {settings.sandboxNetworkPolicy === 'allowlist' && (
              <div className="animate-in slide-in-from-top-1 duration-150">
                <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] mb-2 font-mono">
                  <Globe size={10} className="text-[var(--color-info)]" />
                  network allowlist
                </div>
                <SettingsListManager
                  items={settings.sandboxNetworkAllowlist ?? []}
                  onAdd={(value) => onChange('sandboxNetworkAllowlist', [...(settings.sandboxNetworkAllowlist ?? []), value])}
                  onRemove={(index) => onChange('sandboxNetworkAllowlist', (settings.sandboxNetworkAllowlist ?? []).filter((_, i) => i !== index))}
                  placeholder="api.example.com"
                />
              </div>
            )}
          </div>
        )}
      </SettingsGroup>
    </SettingsSection>
  );
};
