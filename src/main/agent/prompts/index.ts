/**
 * Prompt Modules Index
 * 
 * Central export for all prompt components used in system prompt construction.
 * Each module serves a specific purpose in steering agent behavior.
 */

// Core identity - who the agent is
export { CORE_IDENTITY } from './identity';

// Critical rules - highest priority execution guidelines
export { CRITICAL_RULES } from './rules';

// Tool workflows - patterns for using tools effectively
export { TOOL_WORKFLOWS } from './workflows';

// Tool hints - specific parameter guidance for commonly misused tools
export { TOOL_HINTS } from './toolHints';

// Output formatting - response structure and code formatting rules
export { OUTPUT_FORMATTING } from './formatting';

// Sub-agent prompts have been removed

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
