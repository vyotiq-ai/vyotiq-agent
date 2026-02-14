/**
 * Settings Tab Configuration
 * 
 * Centralized configuration for settings tabs and routing.
 * Eliminates the giant switch statement in SettingsPanel.
 */

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
  | 'browser' 
  | 'mcp' 
  | 'autonomous'
  | 'workspace' 
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
      { id: 'workspace', label: 'workspace' },
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
// Default Tab
// =============================================================================

/**
 * Default tab to show when settings panel opens
 */
export const DEFAULT_TAB: SettingsTabId = 'providers';
