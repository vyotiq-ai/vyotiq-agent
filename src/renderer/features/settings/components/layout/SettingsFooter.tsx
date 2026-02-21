/**
 * SettingsFooter Component
 * 
 * Footer bar with save state indicator and action buttons.
 * Includes export, import, and reset functionality.
 */

import React, { useCallback, useState } from 'react';
import { Save, Download, Upload, RotateCcw } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import type { SaveState } from '../../hooks';
import type { SettingsTabId } from '../../config/tabConfig';

/** Tabs that manage their own persistence (auto-save) */
const AUTO_SAVE_TABS: SettingsTabId[] = ['mcp'];

interface SettingsFooterProps {
  saveState: SaveState;
  errorMessage: string | null;
  isDirty: boolean;
  isSaving: boolean;
  hasSettings: boolean;
  activeTab?: SettingsTabId;
  onClose: () => void;
  onSave: () => void;
}

export const SettingsFooter: React.FC<SettingsFooterProps> = ({
  saveState,
  errorMessage,
  isDirty,
  isSaving,
  hasSettings,
  activeTab,
  onClose,
  onSave,
}) => {
  const isAutoSaveTab = activeTab ? AUTO_SAVE_TABS.includes(activeTab) : false;
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const showMessage = useCallback((msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const result = await window.vyotiq.settings.export();
      if (result.success && result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vyotiq-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showMessage('[OK] exported');
      } else {
        showMessage(`[ERR] ${result.error || 'export failed'}`);
      }
    } catch {
      showMessage('[ERR] export failed');
    }
  }, [showMessage]);

  const handleImport = useCallback(async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const settings = JSON.parse(text);
          const result = await window.vyotiq.settings.import(settings);
          if (result.success) {
            showMessage('[OK] imported — reload to apply');
          } else {
            showMessage(`[ERR] ${result.error || 'import failed'}`);
          }
        } catch {
          showMessage('[ERR] invalid JSON file');
        }
      };
      input.click();
    } catch {
      showMessage('[ERR] import failed');
    }
  }, [showMessage]);

  const handleReset = useCallback(async () => {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
    try {
      const result = await window.vyotiq.settings.reset();
      if (result.success) {
        showMessage('[OK] reset to defaults — reload to apply');
      } else {
        showMessage(`[ERR] ${result.error || 'reset failed'}`);
      }
    } catch {
      showMessage('[ERR] reset failed');
    }
  }, [showMessage]);

  return (
    <footer className="border-t border-[var(--color-border-subtle)] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 bg-[var(--color-surface-header)] flex-shrink-0 min-h-[44px]">
      <div className="text-[9px] sm:text-[10px] font-mono min-w-0 flex-1 truncate">
        {actionMsg ? (
          <span className="text-[var(--color-accent-primary)] truncate">{actionMsg}</span>
        ) : isAutoSaveTab ? (
          <span className="text-[var(--color-text-muted)] truncate hidden sm:inline">changes auto-saved</span>
        ) : (
          <>
            {saveState === 'success' && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[var(--color-success)]">
                <span className="truncate">[OK] saved</span>
              </span>
            )}
            {saveState === 'error' && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[var(--color-error)]">
                <span className="truncate">[ERR] {errorMessage || 'failed'}</span>
              </span>
            )}
            {saveState === 'idle' && isDirty && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[var(--color-warning)]">
                <span className="truncate">[MOD] unsaved</span>
              </span>
            )}
            {saveState === 'idle' && !isDirty && (
              <span className="text-[var(--color-text-muted)] truncate hidden sm:inline">all changes saved</span>
            )}
          </>
        )}
      </div>
      <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={handleExport} title="Export settings" className="text-[10px] sm:text-xs px-1.5 h-7">
          <Download size={12} />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleImport} title="Import settings" className="text-[10px] sm:text-xs px-1.5 h-7">
          <Upload size={12} />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleReset} title="Reset to defaults" className="text-[10px] sm:text-xs px-1.5 h-7 text-[var(--color-error)]">
          <RotateCcw size={12} />
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose} className="text-[10px] sm:text-xs px-2 sm:px-3 h-7">
          {isDirty && !isAutoSaveTab ? ':q!' : ':q'}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={isAutoSaveTab || !isDirty || isSaving || !hasSettings}
          isLoading={isSaving}
          leftIcon={!isSaving && <Save size={12} />}
          className="text-[10px] sm:text-xs px-2 sm:px-3 h-7"
        >
          :w
        </Button>
      </div>
    </footer>
  );
};

export default SettingsFooter;
