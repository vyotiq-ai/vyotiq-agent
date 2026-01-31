/**
 * EnvVarEditor Component
 * 
 * Component for editing environment variables with add/remove functionality.
 * Used for configuring MCP server environment variables.
 * 
 * @module renderer/features/settings/components/mcp/EnvVarEditor
 */

import React, { memo, useState, useCallback } from 'react';
import { Plus, Trash2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';

interface EnvVar {
  key: string;
  value: string;
  required?: boolean;
  description?: string;
}

interface EnvVarEditorProps {
  /** Current environment variables */
  envVars: Record<string, string>;
  /** Callback when env vars change */
  onChange: (envVars: Record<string, string>) => void;
  /** Required env vars with descriptions */
  requiredEnvVars?: Array<{ name: string; description: string; required: boolean }>;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

export const EnvVarEditor: React.FC<EnvVarEditorProps> = memo(
  ({ envVars, onChange, requiredEnvVars = [], disabled, className }) => {
    const [showValues, setShowValues] = useState<Set<string>>(new Set());
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Build list of env vars with required info
    const envVarList: EnvVar[] = [
      // Required env vars first
      ...requiredEnvVars.map((r) => ({
        key: r.name,
        value: envVars[r.name] || '',
        required: r.required,
        description: r.description,
      })),
      // Custom env vars
      ...Object.entries(envVars)
        .filter(([key]) => !requiredEnvVars.some((r) => r.name === key))
        .map(([key, value]) => ({ key, value })),
    ];

    const toggleShowValue = useCallback((key: string) => {
      setShowValues((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    }, []);

    const handleValueChange = useCallback(
      (key: string, value: string) => {
        onChange({ ...envVars, [key]: value });
      },
      [envVars, onChange]
    );

    const handleRemove = useCallback(
      (key: string) => {
        const next = { ...envVars };
        delete next[key];
        onChange(next);
      },
      [envVars, onChange]
    );

    const handleAdd = useCallback(() => {
      if (!newKey.trim()) {
        setError('Variable name is required');
        return;
      }
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(newKey.trim())) {
        setError('Invalid variable name format');
        return;
      }
      if (envVars[newKey.trim()] !== undefined) {
        setError('Variable already exists');
        return;
      }
      setError(null);
      onChange({ ...envVars, [newKey.trim()]: newValue });
      setNewKey('');
      setNewValue('');
    }, [newKey, newValue, envVars, onChange]);

    const missingRequired = requiredEnvVars.filter(
      (r) => r.required && !envVars[r.name]
    );

    return (
      <div className={cn('space-y-3', className)}>
        {/* Warning for missing required vars */}
        {missingRequired.length > 0 && (
          <div className="flex items-start gap-2 p-2 rounded bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30">
            <AlertCircle className="w-4 h-4 text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
            <div className="text-[10px] text-[var(--color-warning)]">
              <span className="font-medium">Required:</span>{' '}
              {missingRequired.map((r) => r.name).join(', ')}
            </div>
          </div>
        )}

        {/* Env var list */}
        <div className="space-y-2">
          {envVarList.map((envVar) => (
            <div
              key={envVar.key}
              className="flex items-start gap-2 p-2 rounded-sm bg-[var(--color-surface-base)] border border-[var(--color-border)]"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--color-accent)]">
                    {envVar.key}
                  </span>
                  {envVar.required && (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-error)]/10 text-[var(--color-error)]">
                      required
                    </span>
                  )}
                </div>
                {envVar.description && (
                  <p className="text-[9px] text-[var(--color-text-muted)]">
                    {envVar.description}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <input
                    type={showValues.has(envVar.key) ? 'text' : 'password'}
                    value={envVar.value}
                    onChange={(e) => handleValueChange(envVar.key, e.target.value)}
                    placeholder={`Enter ${envVar.key}...`}
                    disabled={disabled}
                    className={cn(
                      'flex-1 px-2 py-1 text-[10px] font-mono rounded-sm',
                      'bg-[var(--color-surface-elevated)] border border-[var(--color-border)]',
                      'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]',
                      'focus:outline-none focus:border-[var(--color-accent)]/50',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  />
                  <button
                    onClick={() => toggleShowValue(envVar.key)}
                    className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                    disabled={disabled}
                    type="button"
                  >
                    {showValues.has(envVar.key) ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
              {!envVar.required && (
                <button
                  onClick={() => handleRemove(envVar.key)}
                  disabled={disabled}
                  className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors disabled:opacity-50"
                  type="button"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add new env var */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="VARIABLE_NAME"
              inputSize="sm"
              disabled={disabled}
              error={error || undefined}
            />
          </div>
          <div className="flex-1">
            <Input
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="value"
              inputSize="sm"
              disabled={disabled}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleAdd}
            disabled={disabled || !newKey.trim()}
            leftIcon={<Plus className="w-3 h-3" />}
          >
            Add
          </Button>
        </div>
      </div>
    );
  }
);

EnvVarEditor.displayName = 'EnvVarEditor';

export default EnvVarEditor;
