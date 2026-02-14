/**
 * LSP Tools Index
 * 
 * Exports all LSP-related tools for code intelligence.
 * 
 * Primary tools are always loaded for coding tasks.
 * Secondary tools are deferred and loaded on-demand via request_tools.
 */

import type { ToolDefinition } from '../../types';
import { markAsDeferred as markAsDeferredBase } from '../index';

export { lspHoverTool } from './hover';
export { lspDefinitionTool } from './definition';
export { lspReferencesTool } from './references';
export { lspSymbolsTool } from './symbols';
export { lspDiagnosticsTool } from './diagnostics';
export { lspCompletionsTool } from './completions';
export { lspCodeActionsTool } from './codeActions';
export { lspRenameTool } from './rename';

// Import all tools
import { lspHoverTool } from './hover';
import { lspDefinitionTool } from './definition';
import { lspReferencesTool } from './references';
import { lspSymbolsTool } from './symbols';
import { lspDiagnosticsTool } from './diagnostics';
import { lspCompletionsTool } from './completions';
import { lspCodeActionsTool } from './codeActions';
import { lspRenameTool } from './rename';

/** Mark an LSP tool as deferred with LSP-specific keywords */
function markAsDeferred<T extends ToolDefinition>(tool: T): T {
  return markAsDeferredBase(tool, ['lsp', 'code', 'intelligence', 'symbol']);
}

/**
 * All LSP tools as an array for registration
 */
export const LSP_TOOLS: ToolDefinition[] = [
  // Primary LSP tools (always loaded for coding tasks)
  lspHoverTool,
  lspDefinitionTool,
  lspReferencesTool,
  lspDiagnosticsTool,
  // Secondary LSP tools (deferred, loaded on-demand)
  markAsDeferred(lspSymbolsTool),
  markAsDeferred(lspCompletionsTool),
  markAsDeferred(lspCodeActionsTool),
  markAsDeferred(lspRenameTool),
];

/**
 * Primary LSP tools (most commonly used)
 */
export const PRIMARY_LSP_TOOLS: ToolDefinition[] = [
  lspHoverTool,
  lspDefinitionTool,
  lspReferencesTool,
  lspDiagnosticsTool,
];

/**
 * Secondary LSP tools (less frequently used)
 */
export const SECONDARY_LSP_TOOLS: ToolDefinition[] = [
  lspSymbolsTool,
  lspCompletionsTool,
  lspCodeActionsTool,
  lspRenameTool,
];
