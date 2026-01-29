/**
 * Tool Implementations Index
 * 
 * Central export for all tool implementations
 */
// Import all tools
import { readFileTool } from './readFile';
import { writeFileTool } from './writeFile';
import { editFileTool } from './editFile';
import { listDirTool } from './listDir';
import { grepTool } from './grep';
import { globTool } from './glob';
import { codebaseSearchTool } from './codebaseSearch';
import { bulkOperationsTool } from './bulkOperations';
import { runTerminalTool } from './runTerminal';
import { checkTerminalTool } from './checkTerminal';
import { killTerminalTool } from './killTerminal';
import { readLintsTool } from './readLints';

import { createToolTool } from './createTool';
import { requestToolsTool } from './requestTools';
// Todo/Task tracking tools
import { todoWriteTool } from './todoWrite';
import { createPlanTool as _createPlanTool, verifyTasksTool as _verifyTasksTool, getActivePlanTool as _getActivePlanTool, listPlansTool as _listPlansTool, deletePlanTool as _deletePlanTool } from './todo';
// Browser tools - now modular (separate tools for each action)
import { BROWSER_TOOLS } from './browser';
// LSP tools - multi-language code intelligence
import { LSP_TOOLS } from './lsp';
import type { ToolDefinition } from '../types';

/**
 * Mark a tool as deferred for context-aware loading.
 * Deferred tools are not loaded by default but can be requested by the agent.
 * 
 * @param tool - The tool definition to mark as deferred
 * @param keywords - Additional search keywords for tool discovery
 * @returns The tool with deferLoading=true and merged keywords
 */
export function markAsDeferred<T extends ToolDefinition>(tool: T, keywords: string[] = []): T {
  return {
    ...tool,
    deferLoading: true,
    searchKeywords: [
      ...(tool.searchKeywords || []),
      ...keywords,
    ],
  };
}

// Task tools are always available - they're essential for autonomous task management
// The agent should use these tools for any multi-step task to track progress
const createPlanTool = _createPlanTool;
const verifyTasksTool = _verifyTasksTool;
const getActivePlanTool = _getActivePlanTool;
const listPlansTool = _listPlansTool;
const deletePlanTool = _deletePlanTool;

// Re-export the modified tools
export { createPlanTool, verifyTasksTool, getActivePlanTool, listPlansTool, deletePlanTool };

// Re-export individual tools
export { readFileTool } from './readFile';
export { writeFileTool } from './writeFile';
export { editFileTool } from './editFile';
export { listDirTool } from './listDir';
export { grepTool } from './grep';
export { globTool } from './glob';
export { codebaseSearchTool } from './codebaseSearch';
export { bulkOperationsTool } from './bulkOperations';
export { runTerminalTool } from './runTerminal';
export { checkTerminalTool } from './checkTerminal';
export { killTerminalTool } from './killTerminal';
export { readLintsTool } from './readLints';

// Dynamic tool creation
export { createToolTool } from './createTool';

// Agent tool control
export { requestToolsTool } from './requestTools';

// Todo/Task tracking
export { todoWriteTool } from './todoWrite';
export { getTodoManager, resetTodoManager } from './todo';
// Re-export the task tools (always available for autonomous task management)
export { getTaskManager, resetTaskManager } from './todo';

// Browser tools exports
export {
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
  // New debugging tools
  browserConsoleTool,
  browserNetworkTool,
  browserTabsTool,
  // Console/Network utilities for integration
  addConsoleLog,
  clearConsoleLogs,
  getConsoleLogs,
  setupConsoleListener,
  addNetworkRequest,
  updateNetworkRequest,
  clearNetworkRequests,
  getNetworkRequests,
} from './browser';

// LSP tools exports
export {
  LSP_TOOLS,
  PRIMARY_LSP_TOOLS,
  SECONDARY_LSP_TOOLS,
  lspHoverTool,
  lspDefinitionTool,
  lspReferencesTool,
  lspSymbolsTool,
  lspDiagnosticsTool,
  lspCompletionsTool,
  lspCodeActionsTool,
  lspRenameTool,
} from './lsp';

// Export all tools as an array for easy registration
export const ALL_TOOLS: ToolDefinition[] = [
  // File operations
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  grepTool,
  globTool,
  codebaseSearchTool,
  bulkOperationsTool,
  // Terminal operations
  runTerminalTool,
  checkTerminalTool,
  killTerminalTool,
  // Code intelligence (legacy)
  readLintsTool,
  // Dynamic tool creation
  createToolTool,
  // Agent tool control
  requestToolsTool,
  // Todo/Task tracking (basic)
  todoWriteTool,
  // Todo/Task tracking (enhanced - persistent)
  createPlanTool,
  verifyTasksTool,
  getActivePlanTool,
  listPlansTool,
  deletePlanTool,
  // Browser/Web operations (modular tools)
  ...BROWSER_TOOLS,
  // LSP code intelligence (multi-language)
  ...LSP_TOOLS,
];
