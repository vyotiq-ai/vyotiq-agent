/**
 * System Prompt Types
 */

import type { InternalSession } from '../types';
import type { PromptSettings, AccessLevelSettings } from '../../../shared/types';
import type { Logger } from '../../logger';

/**
 * Internal terminal settings (hardcoded defaults)
 */
export interface InternalTerminalSettings {
  defaultShell: 'system' | 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish';
  defaultTimeout: number;
  maxConcurrentProcesses: number;
}

/**
 * Tool definition for system prompt
 */
export interface ToolDefForPrompt {
  name: string;
  description: string;
}

/**
 * Terminal process information
 */
export interface TerminalProcessInfo {
  pid: number;
  command: string;
  isRunning: boolean;
  description?: string;
  recentOutput?: string;
  exitCode?: number | null;
  durationMs?: number;
}

/**
 * Terminal context
 */
export interface TerminalContextInfo {
  processes: TerminalProcessInfo[];
  settings: {
    defaultShell: 'system' | 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish';
    defaultTimeout: number;
    maxConcurrentProcesses: number;
  };
  defaultShell: string;
  cwd?: string;
}

/**
 * Editor context
 */
export interface EditorContextInfo {
  openFiles: string[];
  activeFile: string | null;
  cursorPosition: { lineNumber: number; column: number } | null;
  diagnostics?: Array<{
    filePath: string;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    source?: string;
    code?: string | number;
  }>;
}

// Alias for backward compatibility
export type { EditorContextInfo as EditorContext };

/**
 * Workspace diagnostics
 */
export interface WorkspaceDiagnosticsInfo {
  diagnostics: Array<{
    filePath: string;
    fileName: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    message: string;
    severity: 'error' | 'warning' | 'info' | 'hint';
    source: string;
    code?: string | number;
  }>;
  errorCount: number;
  warningCount: number;
  filesWithErrors: string[];
  collectedAt: number;
}

/**
 * Task analysis context
 */
export interface TaskAnalysisContext {
  intent: string;
  secondaryIntents?: string[];
  complexity: string;
  scope: string;
  shouldDecompose: boolean;
  recommendedSpecialization?: string;
  confidence: number;
  estimatedTokens?: number;
  /** Estimated number of steps to complete the task */
  estimatedSteps?: number;
}

/**
 * Workspace structure context
 */
export interface WorkspaceStructureContext {
  projectType?: string;
  configFiles?: string[];
  sourceDirectories?: string[];
  testDirectories?: string[];
  packageManager?: string;
  framework?: string;
  /** Detected frameworks (React, Vue, Angular, etc.) */
  frameworks?: string[];
  /** Detected programming languages */
  languages?: string[];
  /** Test framework (jest, vitest, mocha, etc.) */
  testFramework?: string;
  /** Build tool (vite, webpack, esbuild, etc.) */
  buildTool?: string;
}

/**
 * Complete context for building system prompt
 */
export interface SystemPromptContext {
  session: InternalSession;
  providerName: string;
  modelId: string;
  workspace?: { id: string; path: string; name?: string };
  toolsList: string;
  toolDefinitions?: ToolDefForPrompt[];
  promptSettings: PromptSettings;
  accessLevelSettings?: AccessLevelSettings;
  terminalContext?: TerminalContextInfo;
  editorContext?: EditorContextInfo;
  workspaceDiagnostics?: WorkspaceDiagnosticsInfo;
  taskAnalysis?: TaskAnalysisContext;
  workspaceStructure?: WorkspaceStructureContext;
  logger?: Logger;
}

/**
 * Prompt section definition
 */
export interface PromptSection {
  id: string;
  name: string;
  priority: number;
  isStatic: boolean;
  content: string | ((context: SystemPromptContext) => string);
}

/**
 * Cached prompt structure
 */
export interface CachedPrompt {
  staticContent: string;
  staticHash: string;
  createdAt: number;
  estimatedTokens: number;
}
