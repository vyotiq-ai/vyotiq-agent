/**
 * LSP Tools Index
 * 
 * Exports all LSP-related tools for code intelligence.
 */

import type { ToolDefinition } from '../../types';

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

/**
 * All LSP tools as an array for registration
 */
export const LSP_TOOLS: ToolDefinition[] = [
  lspHoverTool,
  lspDefinitionTool,
  lspReferencesTool,
  lspSymbolsTool,
  lspDiagnosticsTool,
  lspCompletionsTool,
  lspCodeActionsTool,
  lspRenameTool,
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
