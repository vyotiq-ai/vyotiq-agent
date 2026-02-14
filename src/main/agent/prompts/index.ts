/**
 * Prompt Modules Index
 * 
 * Central export for all prompt components used in system prompt construction.
 * 
 * ## Architecture
 * 
 * Core prompt sections are in ../systemPrompt/ module with unified structure.
 * This module provides:
 * - Re-exports from systemPrompt for convenience
 * - Tool creation prompts for dynamic tool guidance
 * - Dynamic prompt builder for context-aware construction
 * - Response parsers for structured data extraction
 * - Reusable prompt templates
 * 
 * ## Usage
 * 
 * For system prompts, prefer importing directly from '../systemPrompt':
 * ```typescript
 * import { buildSystemPrompt, getStaticContent } from '../systemPrompt';
 * ```
 */

// Core prompt sections - re-export from systemPrompt module
// Note: CORE_IDENTITY, CRITICAL_RULES, TOOL_CHAINING are deprecated aliases
// that all point to the unified system prompt. Use getStaticContent() instead.
export {
  PROMPT_SECTIONS,
  getStaticContent,
} from '../systemPrompt';

// Tool creation prompts - dynamic tool creation guidance
export {
  DYNAMIC_TOOL_CREATION_PROMPT,
  TOOL_COMPOSITION_PROMPT,
  TOOL_VALIDATION_PROMPT,
  TOOL_DISCOVERY_PROMPT,
  TOOL_EXECUTION_PROMPT,
  buildToolDefinitionPrompt,
  buildToolMatchingPrompt,
  buildToolChainPrompt,
} from './toolCreation';

// Dynamic prompt builder - context-aware prompt construction
export {
  DynamicPromptBuilder,
  getPromptBuilder,
  type PromptBuildOptions,
  type BuiltPrompt,
} from './DynamicPromptBuilder';

// Response parsers - extract structured data from responses
export {
  parseTasks,
  parseSpawnRequest,
  parseProgress,
  parseCompletion,
  extractCodeBlocks,
  extractFilePaths,
  type ParsedTask,
  type ParsedSpawnRequest,
  type ParsedProgress,
  type ParsedCompletion,
} from './responseParsers';

// Prompt templates - reusable prompt templates
export {
  confirmDestructiveAction,
  askUserChoice,
  reportError,
  toolExecutionError,
  progressReport,
  completionSummary,
  workspaceContext,
  fileContext,
  stepByStepInstructions,
  constraintsAndRequirements,
} from './templates';
