/**
 * SettingsFooter Component
 * 
 * Footer bar with save state indicator and action buttons.
 */

import React from 'react';
import { Save } from 'lucide-react';
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

  return (
    <footer className="border-t border-[var(--color-border-subtle)] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 bg-[var(--color-surface-header)] flex-shrink-0 min-h-[44px]">
      <div className="text-[9px] sm:text-[10px] font-mono min-w-0 flex-1 truncate">
        {isAutoSaveTab ? (
          <span className="text-[var(--color-text-muted)] truncate hidden sm:inline">changes auto-saved</span>
        ) : (
          <>
            {saveState === 'success' && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[var(--color-success)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] flex-shrink-0" />
                <span className="truncate">[OK] saved</span>
              </span>
            )}
            {saveState === 'error' && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[var(--color-error)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-error)] flex-shrink-0" />
                <span className="truncate">[ERR] {errorMessage || 'failed'}</span>
              </span>
            )}
            {saveState === 'idle' && isDirty && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 text-[var(--color-warning)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] flex-shrink-0" />
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
