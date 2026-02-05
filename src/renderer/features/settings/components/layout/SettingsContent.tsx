/**
 * SettingsContent Component
 * 
 * Main content area that renders the active settings tab.
 * Uses a mapping approach instead of switch statement.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import type { AgentSettings } from '../../../../../shared/types';
import type { SettingsTabId } from '../../config/tabConfig';
import type { UseSettingsComposedReturn } from '../../hooks/useSettingsComposed';

// Settings components
import { SettingsProviders } from '../SettingsProviders';
import { SettingsModels } from '../SettingsModels';
import { SettingsRouting } from '../SettingsRouting';
import { SettingsAgent } from '../SettingsAgent';
import { SettingsPrompts } from '../SettingsPrompts';
import { SettingsEditorAI } from '../SettingsEditorAI';
import { SettingsBrowser } from '../SettingsBrowser';
import { SettingsMCP } from '../SettingsMCP';
import { SettingsAutonomous } from '../SettingsAutonomous';
import { SettingsAccess } from '../SettingsAccess';
import { SettingsSafety } from '../SettingsSafety';
import { SettingsCompliance } from '../SettingsCompliance';
import { SettingsPerformance } from '../SettingsPerformance';
import { SettingsDebugging } from '../SettingsDebugging';
import { SettingsAppearance } from '../SettingsAppearance';
import { SettingsAdvanced } from '../SettingsAdvanced';

interface SettingsContentProps {
  activeTab: SettingsTabId;
  localSettings: AgentSettings | null;
  settingsActions: UseSettingsComposedReturn;
}

/**
 * Loading placeholder component
 */
const LoadingPlaceholder: React.FC<{ section: string }> = ({ section }) => (
  <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
    loading {section} settings...
  </div>
);

export const SettingsContent: React.FC<SettingsContentProps> = ({
  activeTab,
  localSettings,
  settingsActions,
}) => {
  // Show loading state if settings not loaded
  if (!localSettings) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-muted)] font-mono text-[11px]">
        <Loader2 className="animate-spin mr-2" size={14} /> loading config...
      </div>
    );
  }

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'providers':
        return (
          <SettingsProviders
            apiKeys={localSettings.apiKeys}
            providerSettings={localSettings.providerSettings}
            onApiKeyChange={settingsActions.updateApiKey}
            onProviderSettingChange={settingsActions.updateProviderSetting}
          />
        );
        
      case 'models':
        return (
          <SettingsModels
            providerSettings={localSettings.providerSettings}
            apiKeys={localSettings.apiKeys}
            onChange={settingsActions.updateModelSelection}
          />
        );
        
      case 'routing':
        return (
          <SettingsRouting
            settings={localSettings.taskRoutingSettings}
            providerSettings={localSettings.providerSettings}
            apiKeys={localSettings.apiKeys}
            onSettingChange={settingsActions.updateTaskRoutingSetting}
            onMappingChange={settingsActions.updateTaskMapping}
          />
        );
        
      case 'agent':
        return (
          <SettingsAgent
            config={localSettings.defaultConfig}
            apiKeys={localSettings.apiKeys}
            onChange={settingsActions.updateConfig}
          />
        );
        
      case 'prompts':
        return localSettings.promptSettings ? (
          <SettingsPrompts
            settings={localSettings.promptSettings}
            onChange={settingsActions.updatePromptSetting}
          />
        ) : (
          <LoadingPlaceholder section="prompt" />
        );
        
      case 'editor-ai':
        return (
          <SettingsEditorAI
            settings={localSettings.editorAISettings}
            onChange={settingsActions.updateEditorAISetting}
          />
        );
        
      case 'browser':
        return localSettings.browserSettings ? (
          <SettingsBrowser
            settings={localSettings.browserSettings}
            onChange={settingsActions.updateBrowserSetting}
          />
        ) : (
          <LoadingPlaceholder section="browser" />
        );
        
      case 'mcp':
        return <SettingsMCP />;
        
      case 'autonomous':
        return (
          <SettingsAutonomous
            settings={localSettings.autonomousFeatureFlags}
            onChange={settingsActions.updateAutonomousSetting}
          />
        );
        
      case 'access':
        return localSettings.accessLevelSettings ? (
          <SettingsAccess
            settings={localSettings.accessLevelSettings}
            onChange={settingsActions.updateAccessLevelSetting}
          />
        ) : (
          <LoadingPlaceholder section="access" />
        );
        
      case 'safety':
        return localSettings.safetySettings ? (
          <SettingsSafety
            settings={localSettings.safetySettings}
            onChange={settingsActions.updateSafetySetting}
          />
        ) : (
          <LoadingPlaceholder section="safety" />
        );
        
      case 'compliance':
        return localSettings.complianceSettings ? (
          <SettingsCompliance
            settings={localSettings.complianceSettings}
            onChange={settingsActions.updateComplianceSetting}
          />
        ) : (
          <LoadingPlaceholder section="compliance" />
        );
        
      case 'performance':
        return localSettings.cacheSettings ? (
          <SettingsPerformance
            settings={localSettings.cacheSettings}
            onChange={settingsActions.updateCacheSetting}
          />
        ) : (
          <LoadingPlaceholder section="performance" />
        );
        
      case 'debugging':
        return localSettings.debugSettings ? (
          <SettingsDebugging
            settings={localSettings.debugSettings}
            onChange={settingsActions.updateDebugSetting}
          />
        ) : (
          <LoadingPlaceholder section="debug" />
        );
        
      case 'appearance':
        return (
          <SettingsAppearance 
            settings={localSettings.appearanceSettings}
            onChange={settingsActions.updateAppearanceSetting}
          />
        );
        
      case 'advanced':
        return (
          <SettingsAdvanced
            rateLimits={localSettings.rateLimits}
            providerSettings={localSettings.providerSettings}
            apiKeys={localSettings.apiKeys}
            onRateLimitChange={settingsActions.updateRateLimit}
            onProviderSettingChange={settingsActions.updateProviderSetting}
          />
        );
        
      default:
        return null;
    }
  };

  return (
    <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 md:px-6 py-3 sm:py-4 scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent bg-[var(--color-surface-1)] transition-colors">
      <div className="max-w-4xl mx-auto w-full">
        {renderContent()}
      </div>
    </main>
  );
};

export default SettingsContent;
