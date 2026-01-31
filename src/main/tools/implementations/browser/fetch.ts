/**
 * Browser Fetch Tool
 * 
 * Fetch web content using the browser for real-time information retrieval.
 * Combines navigation and extraction in one step for convenience.
 * 
 * Includes improved SPA handling and detailed error reporting.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface FetchWebArgs extends Record<string, unknown> {
  /** URL to fetch */
  url: string;
  /** What to extract from the page */
  extract?: ('text' | 'links' | 'images' | 'metadata' | 'html')[];
  /** Maximum text content length */
  maxLength?: number;
  /** Wait for specific element before extracting */
  waitFor?: string;
  /** Timeout for page load in ms */
  timeout?: number;
  /** Selector to extract from (default: main content) */
  selector?: string;
  /** Wait for dynamic content to load (default: true) */
  waitForContent?: boolean;
}

/**
 * Categorize fetch errors for better user feedback
 */
function categorizeFetchError(error: Error | string, url: string): { 
  category: string; 
  userMessage: string; 
  suggestion: string;
  isRetryable: boolean;
} {
  const errorMsg = typeof error === 'string' ? error : error.message;
  const errorLower = errorMsg.toLowerCase();
  
  // DNS/Network errors
  if (errorLower.includes('name_not_resolved') || errorLower.includes('could not find')) {
    return {
      category: 'dns_error',
      userMessage: `Could not find the website "${new URL(url).hostname}"`,
      suggestion: 'Check if the URL is spelled correctly. The domain may not exist or DNS may be temporarily unavailable.',
      isRetryable: false,
    };
  }
  
  // Connection errors
  if (errorLower.includes('connection refused') || errorLower.includes('err_connection_refused')) {
    return {
      category: 'connection_refused',
      userMessage: `Connection refused by ${new URL(url).hostname}`,
      suggestion: 'The server is not accepting connections. It may be down or blocking requests.',
      isRetryable: false,
    };
  }
  
  // Timeout errors
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      category: 'timeout',
      userMessage: 'Page took too long to load',
      suggestion: 'Try increasing the timeout or the page may be slow/unresponsive. You can retry with a longer timeout.',
      isRetryable: true,
    };
  }
  
  // SSL/Certificate errors
  if (errorLower.includes('certificate') || errorLower.includes('ssl') || errorLower.includes('cert')) {
    return {
      category: 'ssl_error',
      userMessage: 'Security certificate error',
      suggestion: 'The website has an invalid or expired SSL certificate. This may indicate a security issue.',
      isRetryable: false,
    };
  }
  
  // Security blocked
  if (errorLower.includes('blocked') || errorLower.includes('dangerous')) {
    return {
      category: 'security_blocked',
      userMessage: 'URL blocked for security reasons',
      suggestion: 'The URL was blocked because it matches known dangerous patterns. If you believe this is a false positive, check the URL carefully.',
      isRetryable: false,
    };
  }
  
  // Network disconnected
  if (errorLower.includes('internet_disconnected') || errorLower.includes('no internet')) {
    return {
      category: 'no_network',
      userMessage: 'No internet connection',
      suggestion: 'Check your network connection and try again.',
      isRetryable: true,
    };
  }
  
  // Browser not attached
  if (errorLower.includes('not initialized') || errorLower.includes('not attached')) {
    return {
      category: 'browser_not_ready',
      userMessage: 'Browser is not ready',
      suggestion: 'The browser panel may need to be opened first. Try opening the browser panel in the UI.',
      isRetryable: true,
    };
  }
  
  // Content extraction errors
  if (errorLower.includes('extract') || errorLower.includes('content')) {
    return {
      category: 'extraction_error',
      userMessage: 'Failed to extract content from page',
      suggestion: 'The page may use JavaScript rendering. Try using waitFor with a specific selector, or increase the timeout.',
      isRetryable: true,
    };
  }
  
  // Default unknown error
  return {
    category: 'unknown',
    userMessage: errorMsg,
    suggestion: 'An unexpected error occurred. Check the URL and try again.',
    isRetryable: true,
  };
}

async function executeFetchWeb(
  args: FetchWebArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { 
    url, 
    extract = ['text', 'links', 'metadata'], 
    maxLength = 40000, 
    waitFor,
    timeout = 30000,
    selector,
    waitForContent = true,
  } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Fetching web content', { url, extract, maxLength, waitFor, waitForContent });

  if (!url) {
    return {
      toolName: 'browser_fetch',
      success: false,
      output: 'Error: URL is required\n\nUsage: browser_fetch requires a URL parameter.\nExample: { "url": "https://react.dev/reference/react/useState" }',
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
      toolName: 'browser_fetch',
      success: false,
      output: `Error: Invalid URL format "${url}"\n\nThe URL could not be parsed. Make sure it's a valid URL.\nExamples:\n- https://react.dev\n- developer.mozilla.org\n- localhost:3000`,
    };
  }

  try {
    // Set timeout
    browser.setNavigationTimeout(timeout);

    // Navigate to URL
    const navResult = await browser.navigate(normalizedUrl);
    
    if (!navResult.success) {
      const errorInfo = categorizeFetchError(navResult.error || 'Navigation failed', normalizedUrl);
      
      return {
        toolName: 'browser_fetch',
        success: false,
        output: `Failed to load page: ${errorInfo.userMessage}\n\n` +
          `URL: ${normalizedUrl}\n` +
          `Error Category: ${errorInfo.category}\n` +
          `Suggestion: ${errorInfo.suggestion}\n` +
          (errorInfo.isRetryable ? '\nThis error may be temporary - you can try again.' : ''),
        metadata: { 
          url: normalizedUrl, 
          error: navResult.error,
          errorCategory: errorInfo.category,
          isRetryable: errorInfo.isRetryable,
        },
      };
    }

    // Wait for element if specified
    if (waitFor) {
      context.logger.info('Waiting for selector', { waitFor });
      const found = await browser.waitForElement(waitFor, 10000);
      if (!found) {
        context.logger.warn('Wait selector not found, continuing with available content', { waitFor });
      }
    }

    // Extract content with SPA handling
    let content;
    try {
      content = await browser.extractContent({
        includeHtml: extract.includes('html'),
        maxLength,
        waitForContent,
      });
    } catch (extractError) {
      const errorInfo = categorizeFetchError(extractError as Error, normalizedUrl);
      return {
        toolName: 'browser_fetch',
        success: false,
        output: `Page loaded but content extraction failed: ${errorInfo.userMessage}\n\n` +
          `URL: ${navResult.url}\n` +
          `Title: ${navResult.title}\n` +
          `Suggestion: ${errorInfo.suggestion}`,
        metadata: { 
          url: navResult.url, 
          title: navResult.title,
          error: (extractError as Error).message,
          errorCategory: errorInfo.category,
        },
      };
    }

    // Get specific selector content if specified
    let text = content.text;
    if (selector) {
      try {
        text = await browser.extractText(selector);
        if (!text || text.trim().length === 0) {
          context.logger.warn('Selector returned empty content, using full page', { selector });
          text = content.text;
        }
      } catch {
        context.logger.warn('Selector extraction failed, using full page', { selector });
        text = content.text;
      }
    }

    // Check if we got meaningful content
    if (!text || text.trim().length < 50) {
      return {
        toolName: 'browser_fetch',
        success: true, // Navigation succeeded but content is minimal
        output: `Page loaded but content appears minimal or empty.\n\n` +
          `URL: ${content.url}\n` +
          `Title: ${content.title}\n` +
          `Load time: ${navResult.loadTime}ms\n` +
          `Text length: ${text?.length || 0} characters\n\n` +
          `This may be a JavaScript-heavy page that requires more time to render.\n` +
          `Suggestions:\n` +
          `- Try using waitFor with a specific CSS selector\n` +
          `- Increase the timeout\n` +
          `- Use browser_screenshot to see what's actually rendered`,
        metadata: {
          url: content.url,
          title: content.title,
          loadTime: navResult.loadTime,
          textLength: text?.length || 0,
          warning: 'minimal_content',
        },
      };
    }

    // Build output
    let output = `# ${content.title}\n\n`;
    output += `**URL:** ${content.url}\n`;
    output += `**Loaded in:** ${navResult.loadTime}ms\n\n`;

    // Metadata
    if (extract.includes('metadata')) {
      if (content.metadata.description) {
        output += `**Description:** ${content.metadata.description}\n`;
      }
      if (content.metadata.author) {
        output += `**Author:** ${content.metadata.author}\n`;
      }
      if (content.metadata.publishedDate) {
        output += `**Published:** ${content.metadata.publishedDate}\n`;
      }
      output += '\n';
    }

    // Main content
    if (extract.includes('text')) {
      output += `## Content\n\n`;
      const truncatedText = text.slice(0, maxLength);
      output += truncatedText;
      if (text.length > maxLength) {
        output += `\n\n...[Content truncated. Total: ${text.length} chars, showing: ${maxLength}]`;
      }
      output += '\n\n';
    }

    // Links
    if (extract.includes('links') && content.links.length > 0) {
      output += `## Links (${content.links.length})\n\n`;
      const maxLinks = 25;
      content.links.slice(0, maxLinks).forEach(link => {
        const linkText = link.text.slice(0, 50) || '[link]';
        output += `- [${linkText}](${link.href})\n`;
      });
      if (content.links.length > maxLinks) {
        output += `\n...[${content.links.length - maxLinks} more links]\n`;
      }
      output += '\n';
    }

    // Images
    if (extract.includes('images') && content.images.length > 0) {
      output += `## Images (${content.images.length})\n\n`;
      const maxImages = 15;
      content.images.slice(0, maxImages).forEach(img => {
        output += `- ${img.alt || '[image]'}: ${img.src.slice(0, 100)}\n`;
      });
      if (content.images.length > maxImages) {
        output += `\n...[${content.images.length - maxImages} more images]\n`;
      }
    }

    return {
      toolName: 'browser_fetch',
      success: true,
      output,
      metadata: {
        url: content.url,
        title: content.title,
        loadTime: navResult.loadTime,
        textLength: content.text.length,
        linkCount: content.links.length,
        imageCount: content.images.length,
        metadata: content.metadata,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorInfo = categorizeFetchError(error as Error, normalizedUrl);
    
    context.logger.error('Fetch web error', { 
      url: normalizedUrl, 
      error: errorMessage,
      errorCategory: errorInfo.category,
    });
    
    return {
      toolName: 'browser_fetch',
      success: false,
      output: `Failed to fetch ${normalizedUrl}\n\n` +
        `Error: ${errorInfo.userMessage}\n` +
        `Category: ${errorInfo.category}\n` +
        `Suggestion: ${errorInfo.suggestion}\n` +
        (errorInfo.isRetryable ? '\nThis error may be temporary - you can try again.' : ''),
      metadata: {
        url: normalizedUrl,
        error: errorMessage,
        errorCategory: errorInfo.category,
        isRetryable: errorInfo.isRetryable,
      },
    };
  }
}

export const browserFetchTool: ToolDefinition<FetchWebArgs> = {
  name: 'browser_fetch',
  description: `Fetch web content from a URL - combines navigation and extraction in one step.

## When to Use
- **Documentation**: Fetch React docs, MDN, Node.js docs, etc.
- **Real-time info**: Get current information from the web
- **Research**: Read articles, tutorials, API references
- **Quick content**: When you just need the content, not interactions

## Workflow Integration
Simplest way to get web content:
\`\`\`
browser_fetch(url) → get content in one step
[use content to inform decisions]
\`\`\`

## Documentation Pattern
\`\`\`
browser_fetch("https://react.dev/reference/react/useState")
[read the useState documentation]
[apply knowledge to code]
\`\`\`

## vs browser_navigate + browser_extract
- **browser_fetch**: One step, best for reading content
- **navigate + extract**: Two steps, better when you need to interact

## Extracts
- **text**: Main page content
- **links**: All links on page
- **images**: Image URLs and alt text
- **metadata**: Title, description, author
- **html**: Raw HTML (use sparingly)

## SPA Support
- Automatically waits for dynamic content to load
- Detects React, Vue, Angular, and other frameworks
- Use waitFor with a CSS selector for specific elements

## Parameters
- **url** (required): URL to fetch content from
- **extract** (optional): What to extract (default: text, links, metadata)
- **maxLength** (optional): Maximum text length (default: 40000)
- **waitFor** (optional): CSS selector to wait for (useful for SPAs)
- **timeout** (optional): Page load timeout in ms (default: 30000)
- **selector** (optional): Extract from specific element
- **waitForContent** (optional): Wait for dynamic content (default: true)

## Error Handling
- Provides detailed error messages with suggestions
- Categorizes errors (DNS, timeout, SSL, etc.)
- Indicates if errors are retryable

## Best Practices
- Use for documentation and research
- Use waitFor for JavaScript-heavy pages
- Use selector to focus on specific content areas`,

  requiresApproval: false,
  category: 'browser-read',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],

  schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch content from',
      },
      extract: {
        type: 'array',
        description: 'What to extract: text, links, images, metadata, html',
        items: { type: 'string', enum: ['text', 'links', 'images', 'metadata', 'html'] },
      },
      maxLength: {
        type: 'number',
        description: 'Maximum text length (default: 40000)',
      },
      waitFor: {
        type: 'string',
        description: 'CSS selector to wait for before extracting (useful for SPAs)',
      },
      timeout: {
        type: 'number',
        description: 'Page load timeout in ms (default: 30000)',
      },
      selector: {
        type: 'string',
        description: 'CSS selector to extract from specific element',
      },
      waitForContent: {
        type: 'boolean',
        description: 'Wait for dynamic content to load (default: true). Set to false for static pages.',
      },
    },
    required: ['url'],
  },

  ui: {
    icon: 'Download',
    label: 'Fetch Web',
    color: 'text-green-400',
    runningLabel: 'Fetching...',
    completedLabel: 'Fetched',
  },

  inputExamples: [
    { url: 'https://react.dev/reference/react/useState' },
    { url: 'https://nodejs.org/docs/latest/api/', extract: ['text', 'links'], maxLength: 30000 },
    { url: 'http://localhost:3000', waitFor: '#app', timeout: 5000 },
    { url: 'https://vuejs.org/guide/', waitForContent: true, waitFor: '.content' },
  ],

  execute: executeFetchWeb,
};
