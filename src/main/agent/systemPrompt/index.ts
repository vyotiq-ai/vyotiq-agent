/**
 * System Prompt Module
 * 
 * Unified system prompt with single priority structure:
 * - Single coherent instruction set (no fragmented priorities)
 * - Dynamic context injection
 * - Caching support for provider-level optimization
 * - Modular sections for maintainability
 * 
 * ## Architecture
 * 
 * The system prompt is built from:
 * 1. Static unified prompt (sections.ts) - Core identity, rules, tools, workflows
 * 2. Dynamic sections (dynamicSections.ts) - Context-aware sections per-request
 * 3. Context injection (contextInjection.ts) - User-defined injection rules
 * 4. Caching (cache.ts) - Performance optimization for static content
 * 
 * ## Usage
 * 
 * ```typescript
 * import { buildSystemPrompt, getStaticContent } from './systemPrompt';
 * 
 * // Build complete prompt with context
 * const prompt = buildSystemPrompt(context);
 * 
 * // Get just the static content
 * const staticPrompt = getStaticContent();
 * ```
 * 
 * ## Best Practices (2025/2026)
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

// Sections - PRIMARY EXPORTS (use these)
export { PROMPT_SECTIONS, getStaticSections, getStaticContent } from './sections';

// =============================================================================
// DEPRECATED LEGACY EXPORTS
// =============================================================================
// These are kept for backward compatibility only. Use getStaticContent() instead.
// All these exports point to the same unified prompt content.

/** @deprecated Use getStaticContent() */
export { CORE_IDENTITY } from './sections';
/** @deprecated Use getStaticContent() */
export { CRITICAL_RULES_CONTENT as CRITICAL_RULES } from './sections';
/** @deprecated Use getStaticContent() */
export { TOOL_CHAINING } from './sections';
/** @deprecated Use getStaticContent() */
export { TOOL_WORKFLOWS } from './sections';
/** @deprecated Use getStaticContent() */
export { TOOL_HINTS } from './sections';
/** @deprecated Use getStaticContent() */
export { EDIT_TOOL_GUIDE_CONTENT as EDIT_TOOL_GUIDE } from './sections';
/** @deprecated Use getStaticContent() */
export { COMMON_TASKS } from './sections';
/** @deprecated Use getStaticContent() */
export { TASK_MANAGEMENT_CONTENT as TASK_MANAGEMENT } from './sections';
/** @deprecated Use getStaticContent() */
export { OUTPUT_FORMATTING_CONTENT as OUTPUT_FORMATTING } from './sections';
/** @deprecated Use getStaticContent() */
export { SAFETY_GUIDELINES } from './sections';

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
  MCPContextInfo,
  GitContextInfo,
} from './types';

// Dynamic section builders
export {
  buildCoreContext,
  buildCoreTools,
  buildToolsReference,
  buildTerminalContext,
  buildEditorContext,
  buildGitContext,
  buildWorkspaceDiagnostics as buildWorkspaceDiagnosticsContext,
  buildTaskAnalysis as buildTaskAnalysisContext,
  buildWorkspaceStructure as buildWorkspaceStructureContext,
  buildAccessLevel as buildAccessLevelSection,
  buildPersona as buildPersonaSection,
  buildCustomPrompt as buildCustomPromptSection,
  /** @deprecated Use AGENTS.md instead */
  buildAdditionalInstructions,
  buildCommunicationStyle,
  buildToolCategories,
  buildMCPContext,
  buildAgentsMdContext,
  buildInstructionFilesContext,
  DYNAMIC_TOOL_CATEGORIES,
} from './dynamicSections';

// Context injection
export {
  buildInjectedContext,
  evaluateContextInjectionCondition,
  processContextRuleTemplate,
} from './contextInjection';

// Re-export DEFAULT_PROMPT_SETTINGS from shared/types for convenience
export { DEFAULT_PROMPT_SETTINGS } from '../../../shared/types';
