/**
 * Browser Fetch Tool
 * 
 * Fetch web content using the browser for real-time information retrieval.
 * Combines navigation and extraction in one step for convenience.
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
    selector 
  } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Fetching web content', { url, extract, maxLength });

  if (!url) {
    return {
      toolName: 'browser_fetch',
      success: false,
      output: 'Error: URL is required',
    };
  }

  try {
    // Set timeout
    browser.setNavigationTimeout(timeout);

    // Navigate to URL
    const navResult = await browser.navigate(url);
    
    if (!navResult.success) {
      return {
        toolName: 'browser_fetch',
        success: false,
        output: `Failed to load page: ${navResult.error}\nURL: ${url}`,
        metadata: { url, error: navResult.error },
      };
    }

    // Wait for element if specified
    if (waitFor) {
      const found = await browser.waitForElement(waitFor, 10000);
      if (!found) {
        context.logger.warn('Wait selector not found, continuing anyway', { waitFor });
      }
    }

    // Extract content
    const content = await browser.extractContent({
      includeHtml: extract.includes('html'),
      maxLength,
    });

    // Get specific selector content if specified
    let text = content.text;
    if (selector) {
      text = await browser.extractText(selector);
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
    context.logger.error('Fetch web error', { url, error: errorMessage });
    
    return {
      toolName: 'browser_fetch',
      success: false,
      output: `Failed to fetch ${url}: ${errorMessage}`,
    };
  }
}

export const browserFetchTool: ToolDefinition<FetchWebArgs> = {
  name: 'browser_fetch',
  description: `Fetch web content from a URL - combines navigation and extraction.

**Perfect for:**
- Fetching documentation (React docs, MDN, Node.js docs)
- Getting real-time information
- Reading articles and tutorials
- Checking API references

**Extracts:**
- text: Main page content
- links: All links on page
- images: Image URLs and alt text
- metadata: Title, description, author
- html: Raw HTML (use sparingly)

This is the fastest way to get web content into context.`,

  requiresApproval: false,
  category: 'other',
  riskLevel: 'safe',

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
        description: 'CSS selector to wait for before extracting',
      },
      timeout: {
        type: 'number',
        description: 'Page load timeout in ms (default: 30000)',
      },
      selector: {
        type: 'string',
        description: 'CSS selector to extract from specific element',
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
  ],

  execute: executeFetchWeb,
};
