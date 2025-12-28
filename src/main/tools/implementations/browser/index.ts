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

// Import all tools for array export
import { browserNavigateTool } from './navigate';
import { browserExtractTool } from './extract';
import { browserScreenshotTool } from './screenshot';
import { browserClickTool } from './click';
import { browserTypeTool } from './type';
import { browserScrollTool } from './scroll';
import { browserSnapshotTool } from './snapshot';
import { browserFillFormTool } from './fillForm';
import { browserEvaluateTool } from './evaluate';
import { browserWaitTool } from './wait';
import { browserStateTool } from './state';
import { browserBackTool, browserForwardTool, browserReloadTool } from './navigation';
import { browserFetchTool } from './fetch';
import { browserHoverTool } from './hover';
import { browserSecurityStatusTool } from './securityStatus';
import { browserCheckUrlTool } from './checkUrl';
import { browserConsoleTool } from './console';
import { browserNetworkTool } from './network';
import { browserTabsTool } from './tabs';
import type { ToolDefinition } from '../../types';

/**
 * All browser tools in a single array for easy registration.
 * 
 * Tools are ordered by frequency of use:
 * 1. browser_fetch - Most common: fetch web content
 * 2. browser_navigate - Go to URLs
 * 3. browser_extract - Extract page content
 * 4. browser_snapshot - Get page structure
 * 5. browser_screenshot - Visual capture
 * 6. browser_click - Click elements
 * 7. browser_type - Type into inputs
 * 8. browser_scroll - Scroll pages
 * 9. browser_fill_form - Fill multiple form fields
 * 10. browser_wait - Wait for conditions
 * 11. browser_hover - Hover interactions
 * 12. browser_evaluate - Custom JS
 * 13. browser_state - Get state
 * 14. browser_back/forward/reload - Navigation
 * 15. browser_console - Debugging console logs
 * 16. browser_network - Network request monitoring
 * 17. browser_tabs - Tab management
 * 18. browser_security_status - Security monitoring
 * 19. browser_check_url - URL safety check
 */
export const BROWSER_TOOLS: ToolDefinition[] = [
  browserFetchTool,
  browserNavigateTool,
  browserExtractTool,
  browserSnapshotTool,
  browserScreenshotTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserFillFormTool,
  browserWaitTool,
  browserHoverTool,
  browserEvaluateTool,
  browserStateTool,
  browserBackTool,
  browserForwardTool,
  browserReloadTool,
  browserConsoleTool,
  browserNetworkTool,
  browserTabsTool,
  browserSecurityStatusTool,
  browserCheckUrlTool,
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
 * Secondary browser tools that can be deferred.
 * These are less frequently used but still valuable.
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
