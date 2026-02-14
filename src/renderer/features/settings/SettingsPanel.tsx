/**
 * SettingsPanel Component
 * 
 * Full-screen settings panel with sidebar navigation.
 * Uses modular hooks and layout components for clean architecture.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSettingsComposed } from './hooks';
import { DEFAULT_TAB, type SettingsTabId } from './config/tabConfig';
import { 
  SettingsHeader, 
  SettingsSidebar, 
  SettingsContent, 
  SettingsFooter 
} from './components/layout';
import { useConfirm } from '../../components/ui/ConfirmModal';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(DEFAULT_TAB);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  
  // Use composed settings hook for all settings operations
  const settingsActions = useSettingsComposed(open);
  
  // Handle tab change and close mobile sidebar
  const handleTabChange = useCallback((tab: SettingsTabId) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  }, []);
  
  const {
    localSettings,
    isDirty,
    isSaving,
    saveState,
    errorMessage,
    saveSettings,
  } = settingsActions;

  // Track dirty state in a ref so the escape handler always has the latest value
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Safe close: warn if there are unsaved changes
  const handleClose = useCallback(async () => {
    if (isDirtyRef.current) {
      const shouldDiscard = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved settings changes. Close without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep Editing',
        variant: 'warning',
      });
      if (!shouldDiscard) return;
    }
    onClose();
  }, [onClose, confirm]);

  // Handle Escape key to close settings panel
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sidebarOpen) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, handleClose, sidebarOpen]);

  // Don't render if not open
  if (!open) {
    return null;
  }

  return (
    <div className="fixed top-[32px] left-0 right-0 bottom-0 z-50 flex flex-col bg-[var(--color-surface-1)] font-mono animate-in fade-in duration-150">
      {/* Header */}
      <SettingsHeader 
        onClose={handleClose}
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        showMenuButton
        activeTab={activeTab}
      />

      {/* Content with sidebar */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Sidebar navigation - responsive */}
        <SettingsSidebar 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content area */}
        <SettingsContent 
          activeTab={activeTab}
          localSettings={localSettings}
          settingsActions={settingsActions}
        />
      </div>

      {/* Footer */}
      <SettingsFooter
        saveState={saveState}
        errorMessage={errorMessage}
        isDirty={isDirty}
        isSaving={isSaving}
        hasSettings={!!localSettings}
        activeTab={activeTab}
        onClose={handleClose}
        onSave={saveSettings}
      />
      <ConfirmDialog />
    </div>
  );
};

export default SettingsPanel;