import React, { useState } from 'react';
import { Loader2, Save, X, PlugZap, Layers, Bot, SlidersHorizontal, Palette, ShieldAlert, Gauge, Bug, MessageSquare, ShieldCheck, Shield, Globe, GitBranch, Sparkles, Database, Server } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SettingsProviders } from './components/SettingsProviders';
import { SettingsModels } from './components/SettingsModels';
import { SettingsAgent } from './components/SettingsAgent';
import { SettingsAdvanced } from './components/SettingsAdvanced';
import { SettingsAppearance } from './components/SettingsAppearance';
import { SettingsSafety } from './components/SettingsSafety';
import { SettingsCompliance } from './components/SettingsCompliance';
import { SettingsAccess } from './components/SettingsAccess';
import { SettingsPerformance } from './components/SettingsPerformance';
import { SettingsDebugging } from './components/SettingsDebugging';
import { SettingsPrompts } from './components/SettingsPrompts';
import { SettingsBrowser } from './components/SettingsBrowser';
import { SettingsRouting } from './components/SettingsRouting';
import { SettingsEditorAI } from './components/SettingsEditorAI';
import { SettingsIndexing } from './components/SettingsIndexing';
import { SettingsMCP } from './components/SettingsMCP';

import { useSettings } from '../../hooks';
import { cn } from '../../utils/cn';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'providers' | 'models' | 'routing' | 'agent' | 'prompts' | 'editor-ai' | 'browser' | 'indexing' | 'mcp' | 'access' | 'safety' | 'compliance' | 'performance' | 'debugging' | 'appearance' | 'advanced';

interface TabConfig {
  id: SettingsTab;
  label: string;
  command: string;
  icon: React.ReactNode;
}

const tabs: TabConfig[] = [
  { id: 'providers', label: 'Providers', command: 'providers', icon: <PlugZap size={14} /> },
  { id: 'models', label: 'Models', command: 'models', icon: <Layers size={14} /> },
  { id: 'routing', label: 'Routing', command: 'routing', icon: <GitBranch size={14} /> },
  { id: 'agent', label: 'Agent', command: 'agent', icon: <Bot size={14} /> },
  { id: 'prompts', label: 'Prompts', command: 'prompts', icon: <MessageSquare size={14} /> },
  { id: 'editor-ai', label: 'Editor AI', command: 'editor-ai', icon: <Sparkles size={14} /> },
  { id: 'browser', label: 'Browser', command: 'browser', icon: <Globe size={14} /> },
  { id: 'indexing', label: 'Indexing', command: 'indexing', icon: <Database size={14} /> },
  { id: 'mcp', label: 'MCP Servers', command: 'mcp', icon: <Server size={14} /> },
  { id: 'access', label: 'Access', command: 'access', icon: <Shield size={14} /> },
  { id: 'safety', label: 'Safety', command: 'safety', icon: <ShieldAlert size={14} /> },
  { id: 'compliance', label: 'Compliance', command: 'compliance', icon: <ShieldCheck size={14} /> },
  { id: 'performance', label: 'Performance', command: 'performance', icon: <Gauge size={14} /> },
  { id: 'debugging', label: 'Debugging', command: 'debugging', icon: <Bug size={14} /> },
  { id: 'appearance', label: 'Appearance', command: 'appearance', icon: <Palette size={14} /> },
  { id: 'advanced', label: 'Advanced', command: 'advanced', icon: <SlidersHorizontal size={14} /> },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');

  const {
    localSettings,
    isDirty,
    isSaving,
    saveState,
    errorMessage,
    updateConfig,
    updateApiKey,
    updateRateLimit,
    updateProviderSetting,
    updateModelSelection,
    updateSafetySetting,
    updateComplianceSetting,
    updateAccessLevelSetting,
    updateCacheSetting,
    updateDebugSetting,
    updatePromptSetting,
    updateBrowserSetting,
    updateTaskRoutingSetting,
    updateTaskMapping,
    updateEditorAISetting,
    updateSemanticSetting,
    updateAppearanceSetting,
    saveSettings,
  } = useSettings(open);

  if (!open) {
    return null;
  }

  const renderTabContent = () => {
    if (!localSettings) {
      return (
        <div className="flex items-center justify-center py-16 text-[var(--color-text-muted)] font-mono text-[11px]">
          <Loader2 className="animate-spin mr-2" size={14} /> loading config...
        </div>
      );
    }

    switch (activeTab) {
      case 'providers':
        return (
          <SettingsProviders
            apiKeys={localSettings.apiKeys}
            providerSettings={localSettings.providerSettings}
            onApiKeyChange={updateApiKey}
            onProviderSettingChange={updateProviderSetting}
          />
        );
      case 'models':
        return (
          <SettingsModels
            providerSettings={localSettings.providerSettings}
            apiKeys={localSettings.apiKeys}
            onChange={updateModelSelection}
          />
        );
      case 'routing':
        return (
          <SettingsRouting
            settings={localSettings.taskRoutingSettings}
            providerSettings={localSettings.providerSettings}
            apiKeys={localSettings.apiKeys}
            onSettingChange={updateTaskRoutingSetting}
            onMappingChange={updateTaskMapping}
          />
        );
      case 'agent':
        return (
          <SettingsAgent
            config={localSettings.defaultConfig}
            apiKeys={localSettings.apiKeys}
            onChange={updateConfig}
          />
        );
      case 'prompts':
        return localSettings.promptSettings ? (
          <SettingsPrompts
            settings={localSettings.promptSettings}
            onChange={updatePromptSetting}
          />
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
            # loading prompt settings...
          </div>
        );
      case 'editor-ai':
        return (
          <SettingsEditorAI
            settings={localSettings.editorAISettings}
            onChange={updateEditorAISetting}
          />
        );
      case 'browser':
        return localSettings.browserSettings ? (
          <SettingsBrowser
            settings={localSettings.browserSettings}
            onChange={updateBrowserSetting}
          />
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
            # loading browser settings...
          </div>
        );
      case 'indexing':
        return localSettings.semanticSettings ? (
          <SettingsIndexing
            settings={localSettings.semanticSettings}
            onChange={updateSemanticSetting}
          />
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
            # loading indexing settings...
          </div>
        );
      case 'mcp':
        return <SettingsMCP />;
      case 'access':
        return localSettings.accessLevelSettings ? (
          <SettingsAccess
            settings={localSettings.accessLevelSettings}
            onChange={updateAccessLevelSetting}
          />
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
            # loading access settings...
          </div>
        );
      case 'safety':
        return localSettings.safetySettings ? (
          <SettingsSafety
            settings={localSettings.safetySettings}
            onChange={updateSafetySetting}
          />
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
            # loading safety settings...
          </div>
        );
      case 'compliance':
        return localSettings.complianceSettings ? (
          <SettingsCompliance
            settings={localSettings.complianceSettings}
            onChange={updateComplianceSetting}
          />
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
            # loading compliance settings...
          </div>
        );
      case 'performance':
        return localSettings.cacheSettings ? (
          <SettingsPerformance
            settings={localSettings.cacheSettings}
            onChange={updateCacheSetting}
          />
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
            # loading performance settings...
          </div>
        );
      case 'debugging':
        return localSettings.debugSettings ? (
          <SettingsDebugging
            settings={localSettings.debugSettings}
            onChange={updateDebugSetting}
          />
        ) : (
          <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
            # loading debug settings...
          </div>
        );
      case 'appearance':
        return (
          <SettingsAppearance 
            settings={localSettings?.appearanceSettings}
            onChange={updateAppearanceSetting}
          />
        );
      case 'advanced':
        return (
          <SettingsAdvanced
            rateLimits={localSettings.rateLimits}
            providerSettings={localSettings.providerSettings}
            apiKeys={localSettings.apiKeys}
            onRateLimitChange={updateRateLimit}
            onProviderSettingChange={updateProviderSetting}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-4xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 font-mono transition-colors"
        role="dialog"
        aria-modal="true"
      >
        {/* Terminal header bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)] transition-colors">
          <div className="flex items-center gap-3">
            {/* Traffic lights */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onClose}
                className="w-2.5 h-2.5 rounded-full bg-[var(--color-error)] opacity-80 hover:opacity-100 transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                aria-label="Close"
              />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning)] opacity-80" />
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] opacity-80" />
            </div>
            <div>
              <h2 className="text-[11px] text-[var(--color-text-primary)]">config</h2>
              <p className="text-[9px] text-[var(--color-text-muted)] hidden sm:block"># Configure providers, models, and agent behavior</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            aria-label="Close settings"
          >
            <X size={14} />
          </Button>
        </div>

        {/* Content with sidebar */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0">
          {/* Sidebar navigation */}
          <nav className="w-full md:w-44 border-b md:border-b-0 md:border-r border-[var(--color-border-subtle)] p-2 flex-shrink-0 overflow-x-auto md:overflow-x-visible bg-[var(--color-surface-sidebar)] transition-colors">
            <div className="text-[9px] text-[var(--color-text-muted)] px-2 py-1 hidden md:block">
              # select section
            </div>
            <div className="flex md:flex-col gap-0.5 min-w-max md:min-w-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-left transition-all duration-100 whitespace-nowrap md:whitespace-normal md:w-full rounded-sm",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40",
                    activeTab === tab.id
                      ? "bg-[var(--color-surface-2)] text-[var(--color-accent-primary)] border-l-2 border-[var(--color-accent-primary)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] border-l-2 border-transparent"
                  )}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="text-[10px] text-[var(--color-text-muted)]">&gt;</span>
                  <span className={cn(
                    "transition-colors",
                    activeTab === tab.id ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-muted)]"
                  )}>
                    {tab.icon}
                  </span>
                  <span className="text-[10px]">--{tab.command}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Main content area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent bg-[var(--color-surface-1)] transition-colors">
            {renderTabContent()}
          </div>
        </div>

        {/* Footer / Status bar */}
        <div className="border-t border-[var(--color-border-subtle)] px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-[var(--color-surface-header)] transition-colors">
          <div className="text-[10px] font-mono">
            {saveState === 'success' && (
              <span className="inline-flex items-center gap-1.5 text-[var(--color-success)] animate-in slide-in-from-bottom-1 fade-in">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                [OK] config saved
              </span>
            )}
            {saveState === 'error' && (
              <span className="inline-flex items-center gap-1.5 text-[var(--color-error)] animate-in slide-in-from-bottom-1 fade-in">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-error)]" />
                [ERR] {errorMessage || 'failed to save'}
              </span>
            )}
            {saveState === 'idle' && isDirty && (
              <span className="inline-flex items-center gap-1.5 text-[var(--color-warning)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />
                [MODIFIED] unsaved changes
              </span>
            )}
            {saveState === 'idle' && !isDirty && (
              <span className="text-[var(--color-text-muted)]">
                # changes apply to new sessions
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {isDirty ? ':q!' : ':q'}
            </Button>
            <Button
              variant="primary"
              onClick={saveSettings}
              disabled={!isDirty || isSaving || !localSettings}
              isLoading={isSaving}
              leftIcon={!isSaving && <Save size={12} />}
            >
              :w
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
