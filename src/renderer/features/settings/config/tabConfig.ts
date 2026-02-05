/**
 * Settings Tab Configuration
 * 
 * Centralized configuration for settings tabs and routing.
 * Eliminates the giant switch statement in SettingsPanel.
 */

import type { AgentSettings, LLMProviderName, SafetySettings, ComplianceSettings, AccessLevelSettings, CacheSettings, DebugSettings, PromptSettings, BrowserSettings, TaskRoutingSettings, EditorAISettings, AppearanceSettings, AutonomousFeatureFlags, RoutingTaskType, TaskModelMapping } from '../../../../shared/types';

// =============================================================================
// Tab Types
// =============================================================================

/**
 * Available settings tab identifiers
 */
export type SettingsTabId = 
  | 'providers' 
  | 'models' 
  | 'routing' 
  | 'agent' 
  | 'prompts' 
  | 'editor-ai' 
  | 'browser' 
  | 'mcp' 
  | 'autonomous' 
  | 'access' 
  | 'safety' 
  | 'compliance' 
  | 'performance' 
  | 'debugging' 
  | 'appearance' 
  | 'advanced';

/**
 * Tab configuration
 */
export interface TabConfig {
  id: SettingsTabId;
  label: string;
}

/**
 * Tab group configuration
 */
export interface TabGroup {
  title: string;
  tabs: TabConfig[];
}

// =============================================================================
// Tab Groups Configuration
// =============================================================================

/**
 * Organized tab groups for sidebar navigation
 */
export const TAB_GROUPS: TabGroup[] = [
  {
    title: 'AI & Models',
    tabs: [
      { id: 'providers', label: 'providers' },
      { id: 'models', label: 'models' },
      { id: 'routing', label: 'routing' },
      { id: 'agent', label: 'agent' },
      { id: 'prompts', label: 'prompts' },
    ],
  },
  {
    title: 'Features',
    tabs: [
      { id: 'editor-ai', label: 'editor-ai' },
      { id: 'browser', label: 'browser' },
      { id: 'mcp', label: 'mcp-servers' },
      { id: 'autonomous', label: 'autonomous' },
    ],
  },
  {
    title: 'Security',
    tabs: [
      { id: 'access', label: 'access' },
      { id: 'safety', label: 'safety' },
      { id: 'compliance', label: 'compliance' },
    ],
  },
  {
    title: 'System',
    tabs: [
      { id: 'performance', label: 'performance' },
      { id: 'debugging', label: 'debugging' },
      { id: 'appearance', label: 'appearance' },
      { id: 'advanced', label: 'advanced' },
    ],
  },
];

// =============================================================================
// Component Props Types
// =============================================================================

/**
 * Props for the Providers settings component
 */
export interface ProvidersSettingsProps {
  apiKeys: AgentSettings['apiKeys'];
  providerSettings: AgentSettings['providerSettings'];
  onApiKeyChange: (provider: LLMProviderName, value: string) => void;
  onProviderSettingChange: (provider: LLMProviderName, field: string, value: unknown) => void;
}

/**
 * Props for the Models settings component
 */
export interface ModelsSettingsProps {
  providerSettings: AgentSettings['providerSettings'];
  apiKeys: AgentSettings['apiKeys'];
  onChange: (provider: LLMProviderName, modelId: string) => void;
}

/**
 * Props for the Routing settings component
 */
export interface RoutingSettingsProps {
  settings: TaskRoutingSettings | undefined;
  providerSettings: AgentSettings['providerSettings'];
  apiKeys: AgentSettings['apiKeys'];
  onSettingChange: <K extends keyof TaskRoutingSettings>(field: K, value: TaskRoutingSettings[K]) => void;
  onMappingChange: (taskType: RoutingTaskType, mapping: TaskModelMapping) => void;
}

/**
 * Props for the Agent settings component
 */
export interface AgentSettingsProps {
  config: AgentSettings['defaultConfig'];
  apiKeys: AgentSettings['apiKeys'];
  onChange: (field: keyof AgentSettings['defaultConfig'], value: AgentSettings['defaultConfig'][keyof AgentSettings['defaultConfig']]) => void;
}

/**
 * Props for the Prompts settings component
 */
export interface PromptsSettingsProps {
  settings: PromptSettings;
  onChange: <K extends keyof PromptSettings>(field: K, value: PromptSettings[K]) => void;
}

/**
 * Props for the Editor AI settings component
 */
export interface EditorAISettingsProps {
  settings: EditorAISettings | undefined;
  onChange: (field: keyof EditorAISettings, value: EditorAISettings[keyof EditorAISettings]) => void;
}

/**
 * Props for the Browser settings component
 */
export interface BrowserSettingsProps {
  settings: BrowserSettings;
  onChange: (field: keyof BrowserSettings, value: BrowserSettings[keyof BrowserSettings]) => void;
}

/**
 * Props for the Autonomous settings component
 */
export interface AutonomousSettingsProps {
  settings: AutonomousFeatureFlags | undefined;
  onChange: <K extends keyof AutonomousFeatureFlags>(field: K, value: AutonomousFeatureFlags[K]) => void;
}

/**
 * Props for the Access settings component
 */
export interface AccessSettingsProps {
  settings: AccessLevelSettings;
  onChange: (field: keyof AccessLevelSettings, value: AccessLevelSettings[keyof AccessLevelSettings]) => void;
}

/**
 * Props for the Safety settings component
 */
export interface SafetySettingsProps {
  settings: SafetySettings;
  onChange: (field: keyof SafetySettings, value: SafetySettings[keyof SafetySettings]) => void;
}

/**
 * Props for the Compliance settings component
 */
export interface ComplianceSettingsProps {
  settings: ComplianceSettings;
  onChange: (field: keyof ComplianceSettings, value: ComplianceSettings[keyof ComplianceSettings]) => void;
}

/**
 * Props for the Performance settings component
 */
export interface PerformanceSettingsProps {
  settings: CacheSettings;
  onChange: (field: keyof CacheSettings, value: CacheSettings[keyof CacheSettings]) => void;
}

/**
 * Props for the Debugging settings component
 */
export interface DebuggingSettingsProps {
  settings: DebugSettings;
  onChange: (field: keyof DebugSettings, value: DebugSettings[keyof DebugSettings]) => void;
}

/**
 * Props for the Appearance settings component
 */
export interface AppearanceSettingsProps {
  settings: AppearanceSettings | undefined;
  onChange: (field: keyof AppearanceSettings, value: AppearanceSettings[keyof AppearanceSettings]) => void;
}

/**
 * Props for the Advanced settings component
 */
export interface AdvancedSettingsProps {
  rateLimits: AgentSettings['rateLimits'];
  providerSettings: AgentSettings['providerSettings'];
  apiKeys: AgentSettings['apiKeys'];
  onRateLimitChange: (provider: LLMProviderName, value: number) => void;
  onProviderSettingChange: (provider: LLMProviderName, field: string, value: unknown) => void;
}

// =============================================================================
// Default Tab
// =============================================================================

/**
 * Default tab to show when settings panel opens
 */
export const DEFAULT_TAB: SettingsTabId = 'providers';
