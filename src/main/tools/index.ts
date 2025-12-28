/**
 * Tools System Index
 * 
 * Central export point for the enhanced modular tool system.
 * This system provides:
 * - Type-safe tool definitions with UI metadata
 * - Enhanced executor with lifecycle management
 * - Registry with tool aliasing and schema generation
 * - Dynamic tool discovery with deferred loading
 * - Programmatic Tool Calling (PTC) for code-based execution
 * - Dynamic tool creation and composition (Phase 2)
 */

// Core system setup - main entry point
export { buildToolingSystem } from './setup';

// Registry for tool management
export { ToolRegistry } from './registry';

// Executor for running tools
export { ToolExecutor } from './executor';

// Terminal manager for process execution
export { ProcessTerminalManager } from './terminalManager';

// File tracking for read-before-write safety
export {
  markFileAsRead,
  wasFileRead,
  getFileReadTime,
  clearFileTracking,
  clearAllFileTracking,
  getTrackedFiles,
  getReadFilesCache,
} from './fileTracker';

// Discovery system for deferred tool loading
export {
  ToolSearchManager,
  createToolSearchTool,
  DEFAULT_SEARCH_CONFIG,
  type ToolSearchConfig,
  type ToolReference,
  type ToolSearchResult,
  type TokenSavings,
  type SessionToolState,
  // Phase 2: Enhanced discovery
  DynamicToolIndexer,
  getDynamicToolIndexer,
  ToolUsageTracker,
  getToolUsageTracker,
  ToolRankingEngine,
  getToolRankingEngine,
  CapabilityMatcher,
  getCapabilityMatcher,
  ToolSuggestionEngine,
  getToolSuggestionEngine,
} from './discovery';

// Phase 2: Tool Factory for dynamic tool creation
export {
  DynamicToolFactory,
  getDynamicToolFactory,
} from './factory';

// Phase 2: Tool Composer for workflow composition
export {
  ToolComposer,
  getToolComposer,
  WorkflowBuilder,
  workflow,
  WorkflowValidator,
  getWorkflowValidator,
  DataTransformer,
  getDataTransformer,
} from './composer';

// All type definitions
export * from './types';

// Individual tool implementations (for advanced usage)
export {
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  grepTool,
  globTool,
  runTerminalTool,
  checkTerminalTool,
  killTerminalTool,
  // Browser tools - modular
  BROWSER_TOOLS,
  PRIMARY_BROWSER_TOOLS,
  SECONDARY_BROWSER_TOOLS,
  browserNavigateTool,
  browserExtractTool,
  browserScreenshotTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserSnapshotTool,
  browserFillFormTool,
  browserEvaluateTool,
  browserWaitTool,
  browserStateTool,
  browserBackTool,
  browserForwardTool,
  browserReloadTool,
  browserFetchTool,
  browserHoverTool,
  browserSecurityStatusTool,
  browserCheckUrlTool,
  // Browser debugging tools
  browserConsoleTool,
  browserNetworkTool,
  browserTabsTool,
  // Browser utilities for integration
  addConsoleLog,
  clearConsoleLogs,
  getConsoleLogs,
  addNetworkRequest,
  updateNetworkRequest,
  clearNetworkRequests,
  getNetworkRequests,
  ALL_TOOLS,
} from './implementations';

// Re-export buildToolingSystem as default for convenience
import { buildToolingSystem } from './setup';
export default buildToolingSystem;
