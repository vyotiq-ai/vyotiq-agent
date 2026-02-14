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

// Discovery system for tool usage tracking and capability matching
export {
  ToolUsageTracker,
  getToolUsageTracker,
  CapabilityMatcher,
  getCapabilityMatcher,
} from './discovery';

// Phase 2: Tool Factory for dynamic tool creation
export {
  DynamicToolFactory,
  getDynamicToolFactory,
  initDynamicToolFactory,
  type ToolCreationOptions,
  type CompositeStep,
  type ToolCreationResult,
} from './factory';

// Note: Tool Composer functionality is provided by DynamicToolFactory
// which supports workflow composition through composite tool steps


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
  // Agent tool control
  requestToolsTool,
  // Todo/Task tracking tools
  todoWriteTool,
  createPlanTool,
  verifyTasksTool,
  getActivePlanTool,
  listPlansTool,
  deletePlanTool,
  getTodoManager,
  getTaskManager,
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
