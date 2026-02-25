/**
 * Browser Tools Index
 * 
 * Exports all browser tools for registration with the tool system.
 * 
 * Tool categories:
 * - Navigation: navigate, fetch, back, forward, reload
 * - Content: extract, snapshot, screenshot
 * - Interaction: click, type, scroll, hover, fill_form, evaluate
 * - Waiting: wait
 * - State: state, tabs
 * - Security: check_url, security_status
 * - Debugging: console, network
 * 
 * Primary tools are always loaded.
 * browser_interact is a single deferred tool that consolidates 10 secondary tools
 * (fill_form, hover, evaluate, state, back, forward, reload, network, tabs,
 * security_status) — reducing the model's decision surface per the
 * "addition by subtraction" principle.
 */

// Type exports
export * from './types';

// Individual tool exports
export { browserNavigateTool } from './navigate';
export { browserExtractTool } from './extract';
export { browserScreenshotTool } from './screenshot';
export { browserClickTool } from './click';
export { browserTypeTool } from './type';
export { browserScrollTool } from './scroll';
export { browserSnapshotTool } from './snapshot';
export { browserFillFormTool } from './fillForm';
export { browserEvaluateTool } from './evaluate';
export { browserWaitTool } from './wait';
export { browserStateTool } from './state';
export { browserBackTool, browserForwardTool, browserReloadTool } from './navigation';
export { browserFetchTool } from './fetch';
export { browserHoverTool } from './hover';
export { browserSecurityStatusTool } from './securityStatus';
export { browserCheckUrlTool } from './checkUrl';
// New debugging tools
export { browserConsoleTool, addConsoleLog, clearConsoleLogs, getConsoleLogs, setupConsoleListener } from './console';
export { browserNetworkTool, addNetworkRequest, updateNetworkRequest, clearNetworkRequests, getNetworkRequests, type NetworkRequest } from './network';
export { browserTabsTool } from './tabs';

// Unified deferred tool (replaces 10 separate deferred tools)
export { browserInteractTool } from './interact';

// Import all tools for array export
import { browserNavigateTool } from './navigate';
import { browserExtractTool } from './extract';
import { browserScreenshotTool } from './screenshot';
import { browserClickTool } from './click';
import { browserTypeTool } from './type';
import { browserScrollTool } from './scroll';
import { browserSnapshotTool } from './snapshot';
import { browserWaitTool } from './wait';
import { browserFetchTool } from './fetch';
import { browserCheckUrlTool } from './checkUrl';
import { browserConsoleTool } from './console';
import { browserInteractTool } from './interact';

// Legacy imports (kept for backwards-compatible named exports)
import { browserFillFormTool } from './fillForm';
import { browserHoverTool } from './hover';
import { browserEvaluateTool } from './evaluate';
import { browserStateTool } from './state';
import { browserBackTool, browserForwardTool, browserReloadTool } from './navigation';
import { browserNetworkTool } from './network';
import { browserTabsTool } from './tabs';
import { browserSecurityStatusTool } from './securityStatus';

import type { ToolDefinition } from '../../types';
import { markAsDeferred as markAsDeferredBase } from '../index';

/** Mark a browser tool as deferred with browser-specific keywords */
function markAsDeferred<T extends ToolDefinition>(tool: T): T {
  return markAsDeferredBase(tool, ['browser', 'web', 'automation']);
}

/**
 * All browser tools in a single array for easy registration.
 * 
 * Primary tools (11) are always loaded.
 * browser_interact (1 deferred tool) consolidates all 10 former secondary tools
 * into a single action-dispatched tool — reducing context overhead by ~85%.
 */
export const BROWSER_TOOLS: ToolDefinition[] = [
  // Primary tools (always loaded for browser tasks)
  browserFetchTool,
  browserNavigateTool,
  browserExtractTool,
  browserSnapshotTool,
  browserScreenshotTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserWaitTool,
  browserConsoleTool,
  browserCheckUrlTool,
  // Unified secondary tool (deferred, loaded on-demand)
  // Replaces: fill_form, hover, evaluate, state, back, forward, reload,
  //           network, tabs, security_status
  markAsDeferred(browserInteractTool),
];

/**
 * Primary browser tools loaded by default.
 * These are the most commonly used tools for web browsing and testing.
 */
export const PRIMARY_BROWSER_TOOLS: ToolDefinition[] = [
  browserFetchTool,
  browserNavigateTool,
  browserExtractTool,
  browserSnapshotTool,
  browserScreenshotTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserWaitTool,
  browserConsoleTool,
  browserCheckUrlTool,
];

/**
 * Secondary browser tools that are deferred.
 * Now consolidated into a single browser_interact tool.
 * Legacy individual exports kept for backwards compatibility.
 */
export const SECONDARY_BROWSER_TOOLS: ToolDefinition[] = [
  browserFillFormTool,
  browserHoverTool,
  browserEvaluateTool,
  browserStateTool,
  browserBackTool,
  browserForwardTool,
  browserReloadTool,
  browserNetworkTool,
  browserTabsTool,
  browserSecurityStatusTool,
];
