import React, { useState } from 'react';
import { Eye, Shield, ShieldCheck, ShieldAlert, Lock, Unlock, FolderLock, Plus, X, Info, FolderOpen } from 'lucide-react';
import { Toggle } from '../../../components/ui/Toggle';
import type { AccessLevelSettings, AccessLevel, ToolCategory, CategoryPermission } from '../../../../shared/types';
import { ACCESS_LEVEL_DEFAULTS, ACCESS_LEVEL_DESCRIPTIONS } from '../../../../shared/types';
import { cn } from '../../../utils/cn';

interface SettingsAccessProps {
  settings: AccessLevelSettings;
  onChange: (field: keyof AccessLevelSettings, value: AccessLevelSettings[keyof AccessLevelSettings]) => void;
}

const ACCESS_LEVELS: AccessLevel[] = ['read-only', 'standard', 'elevated', 'admin'];

const TOOL_CATEGORIES: { id: ToolCategory; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'read', label: 'Read', description: 'File reading, searching, listing', icon: <Eye size={12} /> },
  { id: 'write', label: 'Write', description: 'File creation, editing, deletion', icon: <Lock size={12} /> },
  { id: 'terminal', label: 'Terminal', description: 'Command execution', icon: <Shield size={12} /> },
  { id: 'git', label: 'Git', description: 'Version control operations', icon: <Shield size={12} /> },
  { id: 'system', label: 'System', description: 'System-level operations', icon: <ShieldCheck size={12} /> },
  { id: 'destructive', label: 'Destructive', description: 'Potentially dangerous operations', icon: <ShieldAlert size={12} /> },
];

const LevelIcon: React.FC<{ level: AccessLevel; size?: number }> = ({ level, size = 16 }) => {
  switch (level) {
    case 'read-only':
      return <Eye size={size} className="text-[var(--color-info)]" />;
    case 'standard':
      return <Shield size={size} className="text-[var(--color-success)]" />;
    case 'elevated':
      return <ShieldCheck size={size} className="text-[var(--color-warning)]" />;
    case 'admin':
      return <ShieldAlert size={size} className="text-[var(--color-error)]" />;
  }
};

export const SettingsAccess: React.FC<SettingsAccessProps> = ({ settings, onChange }) => {
  const [newRestrictedPath, setNewRestrictedPath] = useState('');
  const [newAllowedPath, setNewAllowedPath] = useState('');

  const handleAddRestrictedPath = () => {
    if (newRestrictedPath.trim() && !settings.restrictedPaths.includes(newRestrictedPath.trim())) {
      onChange('restrictedPaths', [...settings.restrictedPaths, newRestrictedPath.trim()]);
      setNewRestrictedPath('');
    }
  };

  const handleRemoveRestrictedPath = (path: string) => {
    onChange('restrictedPaths', settings.restrictedPaths.filter(p => p !== path));
  };

  const handleAddAllowedPath = () => {
    if (newAllowedPath.trim() && !settings.allowedPaths.includes(newAllowedPath.trim())) {
      onChange('allowedPaths', [...settings.allowedPaths, newAllowedPath.trim()]);
      setNewAllowedPath('');
    }
  };

  const handleRemoveAllowedPath = (path: string) => {
    onChange('allowedPaths', settings.allowedPaths.filter(p => p !== path));
  };

  const handleCategoryPermissionChange = (
    category: ToolCategory,
    field: 'allowed' | 'requiresConfirmation',
    value: boolean
  ) => {
    const currentPermissions = { ...settings.categoryPermissions };
    const defaultPermission = ACCESS_LEVEL_DEFAULTS[settings.level][category];
    const currentPermission = currentPermissions[category] ?? { ...defaultPermission };

    currentPermissions[category] = {
      ...currentPermission,
      [field]: value,
    };

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
    <section className="space-y-4 font-mono">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[var(--color-accent-primary)] text-[11px]">#</span>
          <h3 className="text-[11px] text-[var(--color-text-primary)]">access_level</h3>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)]">
          # Configure what the AI agent is allowed to do
        </p>
      </header>

      {/* Access Level Selector */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Shield size={11} className="text-[var(--color-success)]" />
          level
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ACCESS_LEVELS.map((level) => {
            const info = ACCESS_LEVEL_DESCRIPTIONS[level];
            const isSelected = settings.level === level;
            return (
              <button
                key={level}
                onClick={() => {
                  onChange('level', level);
                  // Reset category overrides when changing level
                  onChange('categoryPermissions', {});
                }}
                className={cn(
                  'flex items-start gap-2 p-2.5 border text-left transition-all',
                  isSelected
                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
                    : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-default)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                )}
              >
                <LevelIcon level={level} size={14} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-medium text-[var(--color-text-primary)]">
                    {info.name}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-dim)] leading-tight mt-0.5">
                    {info.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {settings.level === 'admin' && (
          <div className="flex items-start gap-2 p-2 bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-[9px] text-[var(--color-text-secondary)]">
            <ShieldAlert size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              <strong>Warning:</strong> Admin level grants unrestricted access. The AI can execute any command and modify any file. Use only when absolutely necessary.
            </span>
          </div>
        )}
      </div>

      {/* Category Permissions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Lock size={11} className="text-[var(--color-warning)]" />
          category_permissions
        </div>

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
                    {category.icon}
                    <span className="text-[10px] text-[var(--color-text-primary)]">{category.label}</span>
                    {customized && (
                      <span className="text-[8px] px-1 py-0.5 bg-[var(--color-warning)]/20 text-[var(--color-text-secondary)] rounded">
                        customized
                      </span>
                    )}
                  </div>
                  {customized && (
                    <button
                      onClick={() => resetCategoryToDefault(category.id)}
                      className={cn(
                        "text-[9px] text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]",
                        'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                      )}
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
      </div>

      {/* Restricted Paths */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <FolderLock size={11} className="text-[var(--color-error)]" />
          restricted_paths
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # Glob patterns for paths the AI cannot access
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="**/secrets/**"
            value={newRestrictedPath}
            onChange={(e) => setNewRestrictedPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddRestrictedPath()}
            className="flex-1 px-2 py-1.5 text-[10px] bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus-visible:border-[var(--color-accent-primary)] focus-visible:outline-none"
          />
          <button
            onClick={handleAddRestrictedPath}
            disabled={!newRestrictedPath.trim()}
            className={cn(
              "px-2 py-1.5 text-[10px] bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed",
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
          >
            <Plus size={12} />
          </button>
        </div>

        {settings.restrictedPaths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {settings.restrictedPaths.map((path) => (
              <div
                key={path}
                className="inline-flex items-center gap-1 px-2 py-1 text-[9px] bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-[var(--color-text-secondary)]"
              >
                <span>{path}</span>
                <button
                  onClick={() => handleRemoveRestrictedPath(path)}
                  className={cn(
                    "hover:text-[var(--color-error)]",
                    'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                  )}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Allowed Paths (Overrides) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Unlock size={11} className="text-[var(--color-success)]" />
          allowed_paths
        </div>

        <p className="text-[9px] text-[var(--color-text-dim)]">
          # Paths explicitly allowed (overrides restrictions)
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="./src/**"
            value={newAllowedPath}
            onChange={(e) => setNewAllowedPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddAllowedPath()}
            className="flex-1 px-2 py-1.5 text-[10px] bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus-visible:border-[var(--color-accent-primary)] focus-visible:outline-none"
          />
          <button
            onClick={handleAddAllowedPath}
            disabled={!newAllowedPath.trim()}
            className={cn(
              "px-2 py-1.5 text-[10px] bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed",
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
            )}
          >
            <Plus size={12} />
          </button>
        </div>

        {settings.allowedPaths.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {settings.allowedPaths.map((path) => (
              <div
                key={path}
                className="inline-flex items-center gap-1 px-2 py-1 text-[9px] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30 text-[var(--color-text-secondary)]"
              >
                <span>{path}</span>
                <button
                  onClick={() => handleRemoveAllowedPath(path)}
                  className={cn(
                    "hover:text-[var(--color-success)]",
                    'rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
                  )}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Additional Options */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Info size={11} className="text-[var(--color-info)]" />
          options
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-primary)]">--allow-outside-workspace</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Allow AI to access files outside the workspace</p>
            </div>
            <Toggle
              checked={settings.allowOutsideWorkspace}
              onToggle={() => onChange('allowOutsideWorkspace', !settings.allowOutsideWorkspace)}
              size="sm"
            />
          </div>

          {settings.allowOutsideWorkspace && (
            <div className="flex items-start gap-2 p-2 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 text-[9px] text-[var(--color-text-secondary)]">
              <FolderOpen size={12} className="flex-shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> The AI can now access any file on your system. It will respect restricted paths patterns but can read/write anywhere.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-primary)]">--show-in-system-prompt</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Include access level info in AI's context</p>
            </div>
            <Toggle
              checked={settings.showInSystemPrompt}
              onToggle={() => onChange('showInSystemPrompt', !settings.showInSystemPrompt)}
              size="sm"
            />
          </div>

          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2.5 border border-[var(--color-border-subtle)]">
            <div className="space-y-0.5">
              <label className="text-[10px] text-[var(--color-text-primary)]">--allow-access-requests</label>
              <p className="text-[9px] text-[var(--color-text-dim)]"># Let AI request elevated permissions</p>
            </div>
            <Toggle
              checked={settings.allowAccessRequests}
              onToggle={() => onChange('allowAccessRequests', !settings.allowAccessRequests)}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Custom Denied Message */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)] pb-1">
          <Shield size={11} className="text-[var(--color-accent-secondary)]" />
          access_denied_message
        </div>

        <textarea
          value={settings.accessDeniedMessage}
          onChange={(e) => onChange('accessDeniedMessage', e.target.value)}
          placeholder="Custom message when access is denied..."
          className="w-full px-2 py-1.5 text-[10px] bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus-visible:border-[var(--color-accent-primary)] focus-visible:outline-none resize-none h-16"
        />
      </div>
    </section>
  );
};
