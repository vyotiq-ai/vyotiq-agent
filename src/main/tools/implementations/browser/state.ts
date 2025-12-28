/**
 * Browser State Tool
 * 
 * Get current browser state and page information.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';
import { createLogger } from '../../../logger';
import { getConsoleLogs } from './console';
import { getNetworkRequests } from './network';

const logger = createLogger('browser_state');

interface StateArgs extends Record<string, unknown> {
  /** Include console messages */
  includeConsole?: boolean;
  /** Include network requests */
  includeNetwork?: boolean;
}

async function executeState(
  args: StateArgs,
  _context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { includeConsole = false, includeNetwork = false } = args;
  const browser = getBrowserManager();
  const state = browser.getState();

  let output = `# Browser State\n\n`;
  output += `**URL:** ${state.url || '(no page loaded)'}\n`;
  output += `**Title:** ${state.title}\n`;
  output += `**Loading:** ${state.isLoading ? 'Yes' : 'No'}\n`;
  output += `**Can go back:** ${state.canGoBack ? 'Yes' : 'No'}\n`;
  output += `**Can go forward:** ${state.canGoForward ? 'Yes' : 'No'}\n`;
  
  if (state.error) {
    output += `\n**Error:** ${state.error}\n`;
  }

  // Get additional page info
  if (state.url) {
    let pageInfoUnavailableLogged = false;
    try {
      const pageInfo = await browser.evaluate<{
        documentReady: boolean;
        viewport: { width: number; height: number };
        scroll: { x: number; y: number; maxX: number; maxY: number };
        forms: number;
        links: number;
        images: number;
      }>(`
        (function() {
          return {
            documentReady: document.readyState === 'complete',
            viewport: { width: window.innerWidth, height: window.innerHeight },
            scroll: {
              x: window.scrollX,
              y: window.scrollY,
              maxX: document.body.scrollWidth - window.innerWidth,
              maxY: document.body.scrollHeight - window.innerHeight
            },
            forms: document.forms.length,
            links: document.links.length,
            images: document.images.length
          };
        })()
      `);

      if (pageInfo) {
        output += `\n## Page Info\n\n`;
        output += `**Ready:** ${pageInfo.documentReady ? 'Complete' : 'Loading'}\n`;
        output += `**Viewport:** ${pageInfo.viewport.width}x${pageInfo.viewport.height}px\n`;
        output += `**Scroll position:** ${pageInfo.scroll.x}, ${pageInfo.scroll.y} (max: ${pageInfo.scroll.maxX}, ${pageInfo.scroll.maxY})\n`;
        output += `**Forms:** ${pageInfo.forms}\n`;
        output += `**Links:** ${pageInfo.links}\n`;
        output += `**Images:** ${pageInfo.images}\n`;
      }
    } catch (error) {
      // Page info unavailable
      if (!pageInfoUnavailableLogged) {
        pageInfoUnavailableLogged = true;
        logger.debug('Page info unavailable in browser_state', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Include console logs if requested
  if (includeConsole) {
    const consoleLogs = getConsoleLogs({ limit: 20 });
    if (consoleLogs.length > 0) {
      output += `\n## Console Logs (${consoleLogs.length})\n\n`;
      for (const log of consoleLogs) {
        const icon = log.level === 'error' ? '❌' : log.level === 'warning' ? '⚠️' : 'ℹ️';
        output += `${icon} **[${log.level.toUpperCase()}]** ${log.message.slice(0, 200)}${log.message.length > 200 ? '...' : ''}\n`;
      }
    } else {
      output += `\n## Console Logs\n\nNo console messages captured.\n`;
    }
  }

  // Include network requests if requested
  if (includeNetwork) {
    const networkReqs = getNetworkRequests({ limit: 20 });
    if (networkReqs.length > 0) {
      output += `\n## Network Requests (${networkReqs.length})\n\n`;
      for (const req of networkReqs) {
        const icon = req.status && req.status >= 200 && req.status < 400 ? '✅' : '❌';
        const statusStr = req.status ? `${req.status}` : 'pending';
        output += `${icon} **${req.method}** \`${req.url.slice(0, 60)}${req.url.length > 60 ? '...' : ''}\` → ${statusStr}\n`;
      }
    } else {
      output += `\n## Network Requests\n\nNo network requests captured.\n`;
    }
  }

  return {
    toolName: 'browser_state',
    success: true,
    output,
    metadata: { ...state },
  };
}

export const browserStateTool: ToolDefinition<StateArgs> = {
  name: 'browser_state',
  description: `Get current browser state and page information.

**Returns:**
- Current URL and title
- Loading status
- Navigation history state
- Page dimensions and scroll position
- Element counts (forms, links, images)

**Use for:**
- Checking if page loaded correctly
- Getting current location
- Understanding page structure overview`,

  requiresApproval: false,
  category: 'other',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      includeConsole: {
        type: 'boolean',
        description: 'Include recent console log messages (default: false)',
      },
      includeNetwork: {
        type: 'boolean',
        description: 'Include recent network requests (default: false)',
      },
    },
    required: [],
  },

  ui: {
    icon: 'Info',
    label: 'State',
    color: 'text-gray-400',
    runningLabel: 'Getting...',
    completedLabel: 'Retrieved',
  },

  inputExamples: [
    {},
  ],

  execute: executeState,
};
