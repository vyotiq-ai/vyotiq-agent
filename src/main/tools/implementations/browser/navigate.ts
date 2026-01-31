/**
 * Browser Navigate Tool
 * 
 * Navigate to any URL to fetch documentation, web content, or test web apps.
 * Includes improved error handling with detailed feedback.
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

/**
 * Categorize navigation errors for better user feedback
 */
function categorizeNavigationError(error: string): { 
  category: string; 
  suggestion: string;
  isRetryable: boolean;
} {
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes('could not find') || errorLower.includes('name_not_resolved')) {
    return {
      category: 'dns_error',
      suggestion: 'Check if the URL is spelled correctly. The domain may not exist.',
      isRetryable: false,
    };
  }
  
  if (errorLower.includes('connection refused')) {
    return {
      category: 'connection_refused',
      suggestion: 'The server is not accepting connections. It may be down or blocking requests.',
      isRetryable: false,
    };
  }
  
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      category: 'timeout',
      suggestion: 'Try increasing the timeout parameter or the page may be slow/unresponsive.',
      isRetryable: true,
    };
  }
  
  if (errorLower.includes('certificate') || errorLower.includes('ssl')) {
    return {
      category: 'ssl_error',
      suggestion: 'The website has an invalid SSL certificate. This may indicate a security issue.',
      isRetryable: false,
    };
  }
  
  if (errorLower.includes('blocked') || errorLower.includes('dangerous')) {
    return {
      category: 'security_blocked',
      suggestion: 'The URL was blocked for security reasons. Check if the URL is correct.',
      isRetryable: false,
    };
  }
  
  if (errorLower.includes('did you mean')) {
    return {
      category: 'typo_detected',
      suggestion: error, // The error message already contains the suggestion
      isRetryable: false,
    };
  }
  
  return {
    category: 'unknown',
    suggestion: 'Check the URL and try again.',
    isRetryable: true,
  };
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
      output: 'Error: URL is required for navigation\n\n' +
        'Usage: browser_navigate requires a url parameter.\n' +
        'Examples:\n' +
        '- { "url": "https://react.dev" }\n' +
        '- { "url": "localhost:3000", "waitForSelector": "#app" }',
    };
  }

  // Validate URL format early
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://') && !normalizedUrl.startsWith('file://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  
  try {
    new URL(normalizedUrl);
  } catch {
    return {
      toolName: 'browser_navigate',
      success: false,
      output: `Error: Invalid URL format "${url}"\n\n` +
        'The URL could not be parsed. Make sure it\'s a valid URL.\n' +
        'Examples:\n' +
        '- https://react.dev\n' +
        '- developer.mozilla.org\n' +
        '- localhost:3000',
    };
  }

  try {
    // Set custom timeout if provided
    if (timeout) {
      browser.setNavigationTimeout(timeout);
    }

    const result = await browser.navigate(normalizedUrl);
    
    if (!result.success) {
      const errorInfo = categorizeNavigationError(result.error || 'Navigation failed');
      
      return {
        toolName: 'browser_navigate',
        success: false,
        output: `Navigation failed: ${result.error}\n\n` +
          `URL: ${normalizedUrl}\n` +
          `Error Category: ${errorInfo.category}\n` +
          `Suggestion: ${errorInfo.suggestion}` +
          (errorInfo.isRetryable ? '\n\nThis error may be temporary - you can try again.' : ''),
        metadata: { 
          url: normalizedUrl, 
          error: result.error,
          errorCategory: errorInfo.category,
          isRetryable: errorInfo.isRetryable,
        },
      };
    }

    // Wait for selector if specified
    if (waitForSelector) {
      context.logger.info('Waiting for selector', { waitForSelector });
      const found = await browser.waitForElement(waitForSelector, timeout ?? 10000);
      if (!found) {
        return {
          toolName: 'browser_navigate',
          success: true, // Navigation succeeded, but selector not found
          output: `Navigated to: ${result.url}\n` +
            `Title: ${result.title}\n` +
            `Load time: ${result.loadTime}ms\n\n` +
            `[WARN] Selector "${waitForSelector}" not found after navigation.\n\n` +
            `The page loaded but the expected element wasn't found.\n` +
            `Suggestions:\n` +
            `- The selector may be incorrect - use browser_snapshot to see available elements\n` +
            `- The element may load later - try increasing the timeout\n` +
            `- The page structure may have changed`,
          metadata: {
            url: result.url,
            title: result.title,
            loadTime: result.loadTime,
            selectorFound: false,
            warning: 'selector_not_found',
          },
        };
      }
    }

    return {
      toolName: 'browser_navigate',
      success: true,
      output: `Successfully navigated to: ${result.url}\n` +
        `Title: ${result.title}\n` +
        `Load time: ${result.loadTime}ms`,
      metadata: {
        url: result.url,
        title: result.title,
        loadTime: result.loadTime,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorInfo = categorizeNavigationError(errorMessage);
    
    context.logger.error('Navigation error', { 
      url: normalizedUrl, 
      error: errorMessage,
      errorCategory: errorInfo.category,
    });
    
    return {
      toolName: 'browser_navigate',
      success: false,
      output: `Navigation error: ${errorMessage}\n\n` +
        `URL: ${normalizedUrl}\n` +
        `Suggestion: ${errorInfo.suggestion}` +
        (errorInfo.isRetryable ? '\n\nThis error may be temporary - you can try again.' : ''),
      metadata: {
        url: normalizedUrl,
        error: errorMessage,
        errorCategory: errorInfo.category,
        isRetryable: errorInfo.isRetryable,
      },
    };
  }
}

export const browserNavigateTool: ToolDefinition<NavigateArgs> = {
  name: 'browser_navigate',
  description: `Navigate to a URL in the embedded browser. The starting point for all browser automation.

## When to Use
- **Fetch documentation**: Navigate to official docs for up-to-date API information
- **Test web apps**: Navigate to localhost URLs to verify app functionality
- **Research**: Browse to any website to gather information
- **Web automation**: Start of any browser-based workflow

## Workflow Integration
Browser automation pattern:
\`\`\`
browser_navigate(url) → load the page
browser_extract() → get page content
[or]
browser_snapshot() → see page structure
browser_click(selector) → interact with elements
browser_screenshot() → capture visual state
\`\`\`

## Documentation Fetching Pattern
\`\`\`
browser_navigate("https://react.dev/reference") → load docs
browser_extract(selector: "article") → get documentation text
[use extracted content to inform code changes]
\`\`\`

## Testing Pattern
\`\`\`
browser_navigate("http://localhost:3000") → load app
browser_screenshot() → capture initial state
browser_click("#login-btn") → interact
browser_screenshot() → capture result
\`\`\`

## Error Handling
- Provides detailed error messages with suggestions
- Detects common URL typos (gogle.com → google.com)
- Categorizes errors (DNS, timeout, SSL, etc.)
- Indicates if errors are retryable

## Parameters
- **url** (required): URL to navigate to (auto-adds https:// if no protocol)
- **waitForSelector** (optional): CSS selector to wait for after navigation
- **timeout** (optional): Navigation timeout in ms (default: 30000)

## Example URLs
- Documentation: https://react.dev, https://nodejs.org/docs
- Local testing: http://localhost:3000, http://127.0.0.1:8080
- Search: https://www.google.com/search?q=query`,

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',
  allowedCallers: ['direct'],

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
    { url: 'https://vuejs.org/guide/', waitForSelector: '.content', timeout: 15000 },
  ],

  execute: executeNavigate,
};
