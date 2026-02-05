/**
 * SettingsPanel Component
 * 
 * Full-screen settings panel with sidebar navigation.
 * Uses modular hooks and layout components for clean architecture.
 */

import React, { useState, useCallback } from 'react';
import { useSettingsComposed } from './hooks';
import { DEFAULT_TAB, type SettingsTabId } from './config/tabConfig';
import { 
  SettingsHeader, 
  SettingsSidebar, 
  SettingsContent, 
  SettingsFooter 
} from './components/layout';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(DEFAULT_TAB);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
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

  // Don't render if not open
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-surface-1)] font-mono animate-in fade-in duration-150">
      {/* Header */}
      <SettingsHeader 
        onClose={onClose}
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
        onClose={onClose}
        onSave={saveSettings}
      />
    </div>
  );
};

export default SettingsPanel;