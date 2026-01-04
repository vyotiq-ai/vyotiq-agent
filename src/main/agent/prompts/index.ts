/**
 * Prompt Modules Index
 * 
 * Central export for all prompt components used in system prompt construction.
 * Core prompt sections are now in ../systemPrompt/ module.
 */

// Core prompt sections - re-export from systemPrompt module
export {
  CORE_IDENTITY,
  CRITICAL_RULES,
  TOOL_CHAINING,
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
