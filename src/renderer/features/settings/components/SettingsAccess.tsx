/**
 * Settings Access Component
 * 
 * Configure what the AI agent is allowed to do.
 */
import React from 'react';
import { Eye, Shield, ShieldCheck, ShieldAlert, Lock, Unlock, FolderOpen } from 'lucide-react';
import type { AccessLevelSettings, AccessLevel, ToolCategory, CategoryPermission } from '../../../../shared/types';
import { ACCESS_LEVEL_DEFAULTS, ACCESS_LEVEL_DESCRIPTIONS } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { SettingsSection, SettingsGroup, SettingsToggleRow, SettingsListManager } from '../primitives';
import { Toggle } from '../../../components/ui/Toggle';

interface SettingsAccessProps {
  settings: AccessLevelSettings;
  onChange: (field: keyof AccessLevelSettings, value: AccessLevelSettings[keyof AccessLevelSettings]) => void;
}

const ACCESS_LEVELS: AccessLevel[] = ['read-only', 'standard', 'elevated', 'admin'];

const TOOL_CATEGORIES: { id: ToolCategory; label: string; description: string }[] = [
  { id: 'read', label: 'Read', description: 'File reading, searching, listing' },
  { id: 'write', label: 'Write', description: 'File creation, editing, deletion' },
  { id: 'terminal', label: 'Terminal', description: 'Command execution' },
  { id: 'git', label: 'Git', description: 'Version control operations' },
  { id: 'system', label: 'System', description: 'System-level operations' },
  { id: 'destructive', label: 'Destructive', description: 'Potentially dangerous operations' },
];

const LevelIcon: React.FC<{ level: AccessLevel; size?: number }> = ({ level, size = 16 }) => {
  switch (level) {
    case 'read-only': return <Eye size={size} className="text-[var(--color-info)]" />;
    case 'standard': return <Shield size={size} className="text-[var(--color-success)]" />;
    case 'elevated': return <ShieldCheck size={size} className="text-[var(--color-warning)]" />;
    case 'admin': return <ShieldAlert size={size} className="text-[var(--color-error)]" />;
  }
};

export const SettingsAccess: React.FC<SettingsAccessProps> = ({ settings, onChange }) => {
  const handleCategoryPermissionChange = (category: ToolCategory, field: 'allowed' | 'requiresConfirmation', value: boolean) => {
    const currentPermissions = { ...settings.categoryPermissions };
    const defaultPermission = ACCESS_LEVEL_DEFAULTS[settings.level][category];
    const currentPermission = currentPermissions[category] ?? { ...defaultPermission };
    currentPermissions[category] = { ...currentPermission, [field]: value };
    onChange('categoryPermissions', currentPermissions);
  };

  const getEffectivePermission = (category: ToolCategory): CategoryPermission => {
    return settings.categoryPermissions[category] ?? ACCESS_LEVEL_DEFAULTS[settings.level][category];
  };

  const resetCategoryToDefault = (category: ToolCategory) => {
    const currentPermissions = { ...settings.categoryPermissions };
    delete currentPermissions[category];
    onChange('categoryPermissions', currentPermissions);
  };

  const isCustomized = (category: ToolCategory): boolean => {
    return settings.categoryPermissions[category] !== undefined;
  };

  return (
    <SettingsSection title="access level" description="Configure what the AI agent is allowed to do">
      {/* Access Level Selector */}
      <SettingsGroup title="level" icon={<Shield size={11} />}>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCESS_LEVELS.map((level) => {
            const info = ACCESS_LEVEL_DESCRIPTIONS[level];
            const isSelected = settings.level === level;
            return (
              <button
                key={level}
                onClick={() => {
                  onChange('level', level);
                  onChange('categoryPermissions', {});
                }}
                className={cn(
                  'flex items-start gap-2 p-2 sm:p-2.5 border text-left transition-all',
                  isSelected
                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
                    : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-default)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              >
                <LevelIcon level={level} size={14} />
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] sm:text-[10px] font-medium text-[var(--color-text-primary)]">{info.name}</div>
                  <div className="text-[8px] sm:text-[9px] text-[var(--color-text-dim)] leading-tight mt-0.5">{info.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {settings.level === 'admin' && (
          <div className="flex items-start gap-2 p-2 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-[9px] text-[var(--color-text-secondary)]">
            <ShieldAlert size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              <strong>Warning:</strong> Admin level grants unrestricted access. The AI can execute any command and modify any file.
            </span>
          </div>
        )}
      </SettingsGroup>

      {/* Category Permissions */}
      <SettingsGroup title="category permissions" icon={<Lock size={11} />}>
        <div className="space-y-2">
          {TOOL_CATEGORIES.map((category) => {
            const permission = getEffectivePermission(category.id);
            const customized = isCustomized(category.id);

            return (
              <div
                key={category.id}
                className={cn(
                  'p-2.5 border transition-colors',
                  customized
                    ? 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5'
                    : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--color-text-primary)]">{category.label}</span>
                    {customized && (
                      <span className="text-[8px] px-1 py-0.5 bg-[var(--color-warning)]/20 text-[var(--color-text-secondary)]">customized</span>
                    )}
                  </div>
                  {customized && (
                    <button
                      onClick={() => resetCategoryToDefault(category.id)}
                      className="text-[9px] text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                    >
                      reset
                    </button>
                  )}
                </div>
                <p className="text-[9px] text-[var(--color-text-dim)] mb-2">{category.description}</p>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Toggle
                      checked={permission.allowed}
                      onToggle={() => handleCategoryPermissionChange(category.id, 'allowed', !permission.allowed)}
                      size="sm"
                    />
                    <span className="text-[9px] text-[var(--color-text-muted)]">allowed</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Toggle
                      checked={permission.requiresConfirmation}
                      onToggle={() => handleCategoryPermissionChange(category.id, 'requiresConfirmation', !permission.requiresConfirmation)}
                      size="sm"
                      disabled={!permission.allowed}
                    />
                    <span className="text-[9px] text-[var(--color-text-muted)]">requires confirmation</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsGroup>

      {/* Restricted Paths */}
      <SettingsGroup title="restricted paths">
        <p className="text-[9px] text-[var(--color-text-dim)]"># Glob patterns for paths the AI cannot access</p>
        <SettingsListManager
          items={settings.restrictedPaths}
          onAdd={(path) => onChange('restrictedPaths', [...settings.restrictedPaths, path])}
          onRemove={(index) => onChange('restrictedPaths', settings.restrictedPaths.filter((_, i) => i !== index))}
          placeholder="**/secrets/**"
        />
      </SettingsGroup>

      {/* Allowed Paths */}
      <SettingsGroup title="allowed paths" icon={<Unlock size={11} />}>
        <p className="text-[9px] text-[var(--color-text-dim)]"># Paths explicitly allowed (overrides restrictions)</p>
        <SettingsListManager
          items={settings.allowedPaths}
          onAdd={(path) => onChange('allowedPaths', [...settings.allowedPaths, path])}
          onRemove={(index) => onChange('allowedPaths', settings.allowedPaths.filter((_, i) => i !== index))}
          placeholder="./src/**"
        />
      </SettingsGroup>

      {/* Additional Options */}
      <SettingsGroup title="options">
        <SettingsToggleRow
          label="allow-outside-workspace"
          description="Allow AI to access files outside the workspace"
          checked={settings.allowOutsideWorkspace}
          onToggle={() => onChange('allowOutsideWorkspace', !settings.allowOutsideWorkspace)}
        />

        {settings.allowOutsideWorkspace && (
          <div className="flex items-start gap-2 p-2 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 text-[9px] text-[var(--color-text-secondary)]">
            <FolderOpen size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              <strong>Warning:</strong> The AI can now access any file on your system.
            </span>
          </div>
        )}

        <SettingsToggleRow
          label="show-in-system-prompt"
          description="Include access level info in AI's context"
          checked={settings.showInSystemPrompt}
          onToggle={() => onChange('showInSystemPrompt', !settings.showInSystemPrompt)}
        />
      </SettingsGroup>
    </SettingsSection>
  );
};

export default SettingsAccess;
