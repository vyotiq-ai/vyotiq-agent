/**
 * Browser Navigate Tool
 * 
 * Navigate to any URL to fetch documentation, web content, or test web apps.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface NavigateArgs extends Record<string, unknown> {
  /** URL to navigate to */
  url: string;
  /** Wait for specific element to appear after navigation */
  waitForSelector?: string;
  /** Timeout in milliseconds for navigation (default: 30000) */
  timeout?: number;
}

async function executeNavigate(
  args: NavigateArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { url, waitForSelector, timeout } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Navigating to URL', { url, waitForSelector, timeout });

  if (!url) {
    return {
      toolName: 'browser_navigate',
      success: false,
      output: 'Error: URL is required for navigation',
    };
  }

  try {
    // Set custom timeout if provided
    if (timeout) {
      browser.setNavigationTimeout(timeout);
    }

    const result = await browser.navigate(url);
    
    if (!result.success) {
      return {
        toolName: 'browser_navigate',
        success: false,
        output: `Navigation failed: ${result.error}`,
        metadata: { url, error: result.error },
      };
    }

    // Wait for selector if specified
    if (waitForSelector) {
      const found = await browser.waitForElement(waitForSelector, timeout ?? 10000);
      if (!found) {
        return {
          toolName: 'browser_navigate',
          success: true, // Navigation succeeded, but selector not found
          output: `Navigated to: ${result.url}\nTitle: ${result.title}\nLoad time: ${result.loadTime}ms\n⚠️ Warning: Selector "${waitForSelector}" not found after navigation`,
          metadata: {
            url: result.url,
            title: result.title,
            loadTime: result.loadTime,
            selectorFound: false,
          },
        };
      }
    }

    return {
      toolName: 'browser_navigate',
      success: true,
      output: `Successfully navigated to: ${result.url}\nTitle: ${result.title}\nLoad time: ${result.loadTime}ms`,
      metadata: {
        url: result.url,
        title: result.title,
        loadTime: result.loadTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Navigation error', { url, error: errorMessage });
    
    return {
      toolName: 'browser_navigate',
      success: false,
      output: `Navigation error: ${errorMessage}`,
    };
  }
}

export const browserNavigateTool: ToolDefinition<NavigateArgs> = {
  name: 'browser_navigate',
  description: `Navigate to a URL in the embedded browser.

**Use cases:**
- Fetch documentation: Navigate to official docs to get up-to-date API information
- Test web apps: Navigate to localhost URLs to verify app functionality
- Research: Browse to any website to gather information

**Example URLs:**
- Documentation: https://react.dev, https://nodejs.org/docs
- Local testing: http://localhost:3000, http://127.0.0.1:8080
- Search: https://www.google.com/search?q=query`,

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to navigate to. Will auto-add https:// if no protocol specified.',
      },
      waitForSelector: {
        type: 'string',
        description: 'Optional CSS selector to wait for after navigation (useful for SPAs)',
      },
      timeout: {
        type: 'number',
        description: 'Navigation timeout in milliseconds (default: 30000)',
      },
    },
    required: ['url'],
  },

  ui: {
    icon: 'Globe',
    label: 'Navigate',
    color: 'text-blue-400',
    runningLabel: 'Navigating...',
    completedLabel: 'Navigated',
  },

  inputExamples: [
    { url: 'https://react.dev/reference/react' },
    { url: 'http://localhost:3000', waitForSelector: '#app' },
    { url: 'developer.mozilla.org/en-US/docs/Web/JavaScript' },
  ],

  execute: executeNavigate,
};
