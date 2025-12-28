import React, { useState } from 'react';
import { Shield, FileWarning, Terminal, Archive, Lock, Globe, Plus, X, TriangleAlert } from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import type { SafetySettings } from '../../../../shared/types';
import { cn } from '../../../utils/cn';

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

export const SettingsSafety: React.FC<SettingsSafetyProps> = ({ settings, onChange }) => {
  const [newProtectedPath, setNewProtectedPath] = useState('');
  const [newBlockedCommand, setNewBlockedCommand] = useState('');
  const [newAllowlistEntry, setNewAllowlistEntry] = useState('');

  const handleAddProtectedPath = () => {
    if (newProtectedPath.trim() && !settings.protectedPaths.includes(newProtectedPath.trim())) {
      onChange('protectedPaths', [...settings.protectedPaths, newProtectedPath.trim()]);
      setNewProtectedPath('');
    }
  };

  const handleRemoveProtectedPath = (path: string) => {
    onChange('protectedPaths', settings.protectedPaths.filter(p => p !== path));
  };

  const handleAddBlockedCommand = () => {
    if (newBlockedCommand.trim() && !settings.blockedCommands.includes(newBlockedCommand.trim())) {
      onChange('blockedCommands', [...settings.blockedCommands, newBlockedCommand.trim()]);
      setNewBlockedCommand('');
    }
  };

  const handleRemoveBlockedCommand = (cmd: string) => {
    onChange('blockedCommands', settings.blockedCommands.filter(c => c !== cmd));
  };

  const handleAddAllowlistEntry = () => {
    const allowlist = settings.sandboxNetworkAllowlist ?? [];
    if (newAllowlistEntry.trim() && !allowlist.includes(newAllowlistEntry.trim())) {
      onChange('sandboxNetworkAllowlist', [...allowlist, newAllowlistEntry.trim()]);
      setNewAllowlistEntry('');
    }
  };

  const handleRemoveAllowlistEntry = (entry: string) => {
    onChange('sandboxNetworkAllowlist', (settings.sandboxNetworkAllowlist ?? []).filter(e => e !== entry));
  };

  return (
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">safety</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Configure guardrails and safety limits
        </p>
      </header>

      {/* Operation Limits */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <FileWarning size={11} className="text-[var(--color-warning)]" />
          limits
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Max Files Per Run */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--max-files</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{settings.maxFilesPerRun}</span>
            </div>
            <input
              type="range"
              min={10}
              max={200}
              step={5}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.maxFilesPerRun}
              onChange={(e) => onChange('maxFilesPerRun', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>10</span>
              <span>100</span>
              <span>200</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max files modified per run</p>
          </div>

          {/* Max Bytes Per Run */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--max-bytes</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{formatBytes(settings.maxBytesPerRun)}</span>
            </div>
            <input
              type="range"
              min={1024 * 1024}
              max={100 * 1024 * 1024}
              step={1024 * 1024}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.maxBytesPerRun}
              onChange={(e) => onChange('maxBytesPerRun', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>1 MB</span>
              <span>50 MB</span>
              <span>100 MB</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max data written per run</p>
          </div>
        </div>
      </div>

      {/* Protected Paths */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Lock size={11} className="text-[var(--color-error)]" />
          protected paths
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # glob patterns for paths that cannot be modified
        </p>

        <div className="space-y-2">
          {settings.protectedPaths.map((path, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-[var(--color-surface-2)] px-2 py-1.5 border border-[var(--color-border-subtle)]"
            >
              <code className="text-[10px] text-[var(--color-text-secondary)] flex-1 truncate">
                {path}
              </code>
              <button
                onClick={() => handleRemoveProtectedPath(path)}
                className={cn(
                  "text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors",
                  'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
                aria-label={`Remove ${path}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
            placeholder="**/secret/**"
            value={newProtectedPath}
            onChange={(e) => setNewProtectedPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddProtectedPath()}
          />
          <button
            onClick={handleAddProtectedPath}
            className={cn(
              "px-2 py-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] hover:border-[var(--color-accent-primary)]/30 transition-all",
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
            aria-label="Add protected path"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Blocked Commands */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Terminal size={11} className="text-[var(--color-error)]" />
          blocked commands
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # commands that will always be rejected
        </p>

        <div className="space-y-2">
          {settings.blockedCommands.map((cmd, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-[var(--color-surface-2)] px-2 py-1.5 border border-[var(--color-border-subtle)]"
            >
              <code className="text-[10px] text-[var(--color-error)] flex-1 truncate">
                {cmd}
              </code>
              <button
                onClick={() => handleRemoveBlockedCommand(cmd)}
                className={cn(
                  "text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors",
                  'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
                aria-label={`Remove ${cmd}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-[var(--color-surface-1)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
            placeholder="rm -rf /"
            value={newBlockedCommand}
            onChange={(e) => setNewBlockedCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddBlockedCommand()}
          />
          <button
            onClick={handleAddBlockedCommand}
            className={cn(
              "px-2 py-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] hover:border-[var(--color-accent-primary)]/30 transition-all",
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
            aria-label="Add blocked command"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Backup Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Archive size={11} className="text-[var(--color-info)]" />
          backup
        </div>

        <Toggle
          label="--auto-backup"
          description="# create backups before file modifications"
          checked={settings.enableAutoBackup}
          onToggle={() => onChange('enableAutoBackup', !settings.enableAutoBackup)}
        />

        {settings.enableAutoBackup && (
          <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-150">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-text-muted)]">--backup-retention</label>
              <span className="text-[10px] text-[var(--color-accent-primary)]">{settings.backupRetentionCount}</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              className="w-full accent-[var(--color-accent-primary)] h-1 bg-[var(--color-surface-2)] appearance-none cursor-pointer"
              value={settings.backupRetentionCount}
              onChange={(e) => onChange('backupRetentionCount', Number(e.target.value))}
            />
            <div className="flex justify-between text-[9px] text-[var(--color-text-dim)]">
              <span>1</span>
              <span>25</span>
              <span>50</span>
            </div>
            <p className="text-[9px] text-[var(--color-text-dim)]"># max backups to keep per file</p>
          </div>
        )}
      </div>

      {/* Confirmation Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <TriangleAlert size={11} className="text-[var(--color-warning)]" />
          confirmation
        </div>

        <Toggle
          label="--confirm-dangerous"
          description="# always prompt before destructive operations"
          checked={settings.alwaysConfirmDangerous}
          onToggle={() => onChange('alwaysConfirmDangerous', !settings.alwaysConfirmDangerous)}
        />

        {!settings.alwaysConfirmDangerous && (
          <div className="p-2 border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 text-[10px] animate-in slide-in-from-top-1 duration-150">
            <div className="flex items-start gap-2">
              <TriangleAlert size={12} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-[var(--color-warning)]">[WARN] confirmation disabled</p>
                <p className="text-[var(--color-text-muted)] text-[9px]">
                  Destructive operations will execute without prompts
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sandbox Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Shield size={11} className="text-[var(--color-success)]" />
          sandbox
        </div>

        <Toggle
          label="--sandbox"
          description="# run code in isolated environment"
          checked={settings.enableSandbox}
          onToggle={() => onChange('enableSandbox', !settings.enableSandbox)}
        />

        {settings.enableSandbox && (
          <div className="space-y-3 animate-in slide-in-from-top-1 duration-150">
            {/* Network Policy */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-[var(--color-text-muted)]">--network-policy</label>
              <select
                className="w-full bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30"
                value={settings.sandboxNetworkPolicy}
                onChange={(e) => onChange('sandboxNetworkPolicy', e.target.value as 'none' | 'localhost' | 'allowlist')}
              >
                <option value="none">none (no network)</option>
                <option value="localhost">localhost only</option>
                <option value="allowlist">allowlist</option>
              </select>
              <p className="text-[9px] text-[var(--color-text-dim)]"># control network access in sandbox</p>
            </div>

            {/* Network Allowlist */}
            {settings.sandboxNetworkPolicy === 'allowlist' && (
              <div className="space-y-2 animate-in slide-in-from-top-1 duration-150">
                <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                  <Globe size={10} className="text-[var(--color-info)]" />
                  network allowlist
                </div>

                <div className="space-y-2">
                  {(settings.sandboxNetworkAllowlist ?? []).map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 bg-[var(--color-surface-2)] px-2 py-1.5 border border-[var(--color-border-subtle)]"
                    >
                      <code className="text-[10px] text-[var(--color-info)] flex-1 truncate">
                        {entry}
                      </code>
                      <button
                        onClick={() => handleRemoveAllowlistEntry(entry)}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
                        aria-label={`Remove ${entry}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 bg-[var(--color-surface-editor)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] px-2 py-1.5 text-[10px] outline-none transition-all focus-visible:border-[var(--color-accent-primary)]/30 placeholder:text-[var(--color-text-placeholder)]"
                    placeholder="api.example.com"
                    value={newAllowlistEntry}
                    onChange={(e) => setNewAllowlistEntry(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddAllowlistEntry()}
                  />
                  <button
                    onClick={handleAddAllowlistEntry}
                    className="px-2 py-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)] hover:border-[var(--color-accent-primary)]/30 transition-all"
                    aria-label="Add allowlist entry"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
