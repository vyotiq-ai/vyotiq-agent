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
import { bulkOperationsTool } from './bulkOperations';
import { runTerminalTool } from './runTerminal';
import { checkTerminalTool } from './checkTerminal';
import { killTerminalTool } from './killTerminal';
import { readLintsTool } from './readLints';

import { createToolTool } from './createTool';
// Browser tools - now modular (separate tools for each action)
import { BROWSER_TOOLS } from './browser';
// LSP tools - multi-language code intelligence
import { LSP_TOOLS } from './lsp';
import type { ToolDefinition } from '../types';

// Re-export individual tools
export { readFileTool } from './readFile';
export { writeFileTool } from './writeFile';
export { editFileTool } from './editFile';
export { listDirTool } from './listDir';
export { grepTool } from './grep';
export { globTool } from './glob';
export { bulkOperationsTool } from './bulkOperations';
export { runTerminalTool } from './runTerminal';
export { checkTerminalTool } from './checkTerminal';
export { killTerminalTool } from './killTerminal';
export { readLintsTool } from './readLints';

// Dynamic tool creation
export { createToolTool } from './createTool';
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
  bulkOperationsTool,
  // Terminal operations
  runTerminalTool,
  checkTerminalTool,
  killTerminalTool,
  // Code intelligence (legacy)
  readLintsTool,
  // Dynamic tool creation
  createToolTool,
  // Browser/Web operations (modular tools)
  ...BROWSER_TOOLS,
  // LSP code intelligence (multi-language)
  ...LSP_TOOLS,
];
