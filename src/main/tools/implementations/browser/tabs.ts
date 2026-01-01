/**
 * Browser Tabs Tool
 * 
 * Manage multiple browser tabs for complex testing scenarios.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface TabsArgs extends Record<string, unknown> {
  /** Action to perform */
  action: 'list' | 'new' | 'close' | 'switch';
  /** Tab index for close/switch actions */
  index?: number;
  /** URL for new tab */
  url?: string;
}

async function executeTabs(
  args: TabsArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { action, index, url } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Browser tabs action', { action, index, url });

  try {
    switch (action) {
      case 'list': {
        // For now, we have a single browser view
        // This returns the current state
        const state = browser.getState();
        
        const output = `## Browser Tabs\n\n` +
          `**Current Tab:**\n` +
          `- URL: ${state.url || '(empty)'}\n` +
          `- Title: ${state.title || 'New Tab'}\n` +
          `- Loading: ${state.isLoading ? 'Yes' : 'No'}\n\n` +
          `*Note: Single-tab mode. Use browser_navigate to change the current page.*`;

        return {
          toolName: 'browser_tabs',
          success: true,
          output,
          metadata: {
            tabCount: 1,
            currentTab: {
              url: state.url,
              title: state.title,
              isLoading: state.isLoading,
            },
          },
        };
      }
      
      case 'new': {
        // Navigate to a new URL (simulates opening a new tab)
        if (url) {
          const result = await browser.navigate(url);
          return {
            toolName: 'browser_tabs',
            success: result.success,
            output: result.success 
              ? `Navigated to: ${result.url}\nTitle: ${result.title}`
              : `Failed to open: ${result.error}`,
            metadata: {
              url: result.url,
              title: result.title,
              loadTime: result.loadTime,
              success: result.success,
            },
          };
        }
        return {
          toolName: 'browser_tabs',
          success: true,
          output: 'Ready for navigation. Use browser_navigate to go to a URL.',
        };
      }
      
      case 'close': {
        // Clear current page
        browser.stop();
        return {
          toolName: 'browser_tabs',
          success: true,
          output: 'Stopped current page loading. Use browser_navigate to go to a new URL.',
        };
      }
      
      case 'switch': {
        // In single-tab mode, this is essentially a no-op
        return {
          toolName: 'browser_tabs',
          success: true,
          output: 'Single-tab mode - already on the current tab. Use browser_navigate to change pages.',
        };
      }
      
      default:
        return {
          toolName: 'browser_tabs',
          success: false,
          output: `Unknown action: ${action}. Valid actions: list, new, close, switch`,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Tab action error', { action, error: errorMessage });
    
    return {
      toolName: 'browser_tabs',
      success: false,
      output: `Tab action failed: ${errorMessage}`,
    };
  }
}

export const browserTabsTool: ToolDefinition<TabsArgs> = {
  name: 'browser_tabs',
  description: `Manage browser tabs.

**Actions:**
- \`list\`: Show current tab info
- \`new\`: Open a new URL (provide url parameter)
- \`close\`: Stop current page loading
- \`switch\`: Switch to a different tab (if multiple exist)

**Note:** Currently operates in single-tab mode. Use browser_navigate for page changes.`,

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'new', 'close', 'switch'],
        description: 'Action to perform on tabs',
      },
      index: {
        type: 'number',
        description: 'Tab index for close/switch actions',
      },
      url: {
        type: 'string',
        description: 'URL to open in new tab',
      },
    },
    required: ['action'],
  },

  ui: {
    icon: 'LayoutGrid',
    label: 'Tabs',
    color: 'text-purple-400',
    runningLabel: 'Managing tabs...',
    completedLabel: 'Done',
  },

  inputExamples: [
    { action: 'list' },
    { action: 'new', url: 'https://react.dev' },
    { action: 'close', index: 0 },
  ],

  execute: executeTabs,
};
