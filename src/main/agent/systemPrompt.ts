/**
 * System Prompt Module
 * 
 * Re-exports from the modular systemPrompt/ directory.
 * This file maintains backward compatibility for existing imports.
 * 
 * ## Architecture
 * 
 * The system prompt is organized into:
 * - ./systemPrompt/sections.ts - Static unified prompt (cached)
 * - ./systemPrompt/dynamicSections.ts - Context-aware sections
 * - ./systemPrompt/contextInjection.ts - Rule-based context injection
 * - ./systemPrompt/cache.ts - Prompt caching for performance
 * - ./systemPrompt/builder.ts - Main prompt assembly
 * 
 * ## Usage
 * 
 * Prefer importing from './systemPrompt' (the directory):
 * ```typescript
 * import { buildSystemPrompt, getStaticContent } from './systemPrompt';
 * ```
 * 
 * ## Deprecated Exports
 * 
 * Legacy individual section exports have been removed.
 * Use getStaticContent() instead for the complete static prompt.
 */

// Re-export everything from the new module
export {
  // Main builder
  buildSystemPrompt,

  // Cache
  SystemPromptCache,
  getSystemPromptCache,

  // Sections - PRIMARY EXPORTS
  PROMPT_SECTIONS,
  getStaticSections,
  getStaticContent,

  // Dynamic section builders
  buildCoreContext,
  buildCoreTools,
  buildToolsReference,
  buildTerminalContext,
  buildEditorContext,
  buildWorkspaceDiagnosticsContext,
  buildTaskAnalysisContext,
  buildWorkspaceStructureContext,
  buildAccessLevelSection,
  buildPersonaSection,
  buildCustomPromptSection,
  /** @deprecated Use AGENTS.md instead */
  buildAdditionalInstructions,
  buildCommunicationStyle,

  // Context injection
  buildInjectedContext,
  evaluateContextInjectionCondition,
  processContextRuleTemplate,

  // Settings
  DEFAULT_PROMPT_SETTINGS,
} from './systemPrompt/index';

// Re-export types
export type {
  SystemPromptContext,
  PromptSection,
  CachedPrompt,
  ToolDefForPrompt,
  TerminalProcessInfo,
  TerminalContextInfo,
  EditorContextInfo,
  WorkspaceDiagnosticsInfo,
  TaskAnalysisContext,
  WorkspaceStructureContext,
  InternalTerminalSettings,
} from './systemPrompt/index';
