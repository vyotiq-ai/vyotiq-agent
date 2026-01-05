/**
 * System Prompt Module
 * 
 * Clean, consolidated system prompt with:
 * - Dynamic context injection
 * - Caching support for provider-level optimization
 * - Modular sections for maintainability
 * 
 * Structure follows 2025/2026 best practices:
 * - XML-structured sections for clear parsing
 * - Single persistent prompt (not chains)
 * - Recency effect placement for critical rules
 * - Specific, literal instructions
 */

// Main builder
export { buildSystemPrompt } from './builder';
export type { SystemPromptContext } from './types';

// Cache
export { SystemPromptCache, getSystemPromptCache } from './cache';

// Sections
export { PROMPT_SECTIONS, getStaticSections, getStaticContent } from './sections';

// Static section content (for backward compatibility)
import { PROMPT_SECTIONS as _SECTIONS } from './sections';
export const CORE_IDENTITY = _SECTIONS.IDENTITY.content as string;
export const CRITICAL_RULES = _SECTIONS.CRITICAL_RULES.content as string;
export const TOOL_USAGE = _SECTIONS.TOOL_USAGE.content as string;
export const IMPORTANT_REMINDERS = _SECTIONS.REMINDERS.content as string;
export const CLOSING_REMINDER = _SECTIONS.FINAL_REMINDER.content as string;

// Legacy exports for backward compatibility (point to closest equivalent)
export const TOOL_CHAINING = TOOL_USAGE;
export const TOOL_WORKFLOWS = TOOL_USAGE;
export const TOOL_HINTS = TOOL_USAGE;
export const TOOLS_REFERENCE = TOOL_USAGE;
export const EDIT_TOOL_GUIDE = TOOL_USAGE;
export const COMMON_TASKS = TOOL_USAGE;
export const OUTPUT_FORMATTING = _SECTIONS.OUTPUT_FORMATTING.content as string;

// Types
export type {
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
} from './types';

// Dynamic section builders (for backward compatibility)
export {
  buildCoreContext,
  buildCoreTools,
  buildTerminalContext,
  buildEditorContext,
  buildWorkspaceDiagnostics as buildWorkspaceDiagnosticsContext,
  buildTaskAnalysis as buildTaskAnalysisContext,
  buildWorkspaceStructure as buildWorkspaceStructureContext,
  buildAccessLevel as buildAccessLevelSection,
  buildPersona as buildPersonaSection,
  buildCustomPrompt as buildCustomPromptSection,
  buildAdditionalInstructions,
  buildCommunicationStyle,
} from './dynamicSections';

// Context injection
export {
  buildInjectedContext,
  evaluateContextInjectionCondition,
  processContextRuleTemplate,
} from './contextInjection';

// Re-export DEFAULT_PROMPT_SETTINGS from shared/types for convenience
export { DEFAULT_PROMPT_SETTINGS } from '../../../shared/types';
