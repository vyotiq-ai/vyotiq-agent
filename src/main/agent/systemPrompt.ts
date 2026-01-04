/**
 * System Prompt Module
 * 
 * Re-exports from the new modular systemPrompt/ directory.
 * This file maintains backward compatibility for existing imports.
 * 
 * The system prompt is now organized into:
 * - ./systemPrompt/sections.ts - Static prompt sections (cached)
 * - ./systemPrompt/dynamicSections.ts - Context-aware sections
 * - ./systemPrompt/contextInjection.ts - Rule-based context injection
 * - ./systemPrompt/cache.ts - Prompt caching for performance
 * - ./systemPrompt/builder.ts - Main prompt assembly
 */

// Re-export everything from the new module
export {
  // Main builder
  buildSystemPrompt,
  
  // Cache
  SystemPromptCache,
  getSystemPromptCache,
  
  // Sections
  PROMPT_SECTIONS,
  getStaticSections,
  getStaticContent,
  
  // Static section content
  CORE_IDENTITY,
  CRITICAL_RULES,
  TOOL_CHAINING,
  TOOLS_REFERENCE,
  EDIT_TOOL_GUIDE,
  COMMON_TASKS,
  OUTPUT_FORMATTING,
  IMPORTANT_REMINDERS,
  CLOSING_REMINDER,
  
  // Legacy exports
  TOOL_WORKFLOWS,
  TOOL_HINTS,
  
  // Dynamic section builders
  buildCoreContext,
  buildCoreTools,
  buildTerminalContext,
  buildEditorContext,
  buildWorkspaceDiagnosticsContext,
  buildTaskAnalysisContext,
  buildWorkspaceStructureContext,
  buildAccessLevelSection,
  buildPersonaSection,
  buildCustomPromptSection,
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
