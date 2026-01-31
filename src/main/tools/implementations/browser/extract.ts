/**
 * Browser Extract Content Tool
 * 
 * Extract text content, links, images, and metadata from the current page.
 * Essential for fetching documentation and understanding page content.
 * 
 * Includes improved SPA handling and detailed error reporting.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface ExtractArgs extends Record<string, unknown> {
  /** Include raw HTML in the output */
  includeHtml?: boolean;
  /** Maximum content length (default: 50000 characters) */
  maxLength?: number;
  /** CSS selector to extract content from (default: main content area) */
  selector?: string;
  /** Only extract specific parts */
  extract?: ('text' | 'links' | 'images' | 'metadata')[];
  /** Wait for dynamic content to load (default: true) */
  waitForContent?: boolean;
}

async function executeExtract(
  args: ExtractArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { includeHtml, maxLength = 50000, selector, extract, waitForContent = true } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Extracting page content', { includeHtml, maxLength, selector, waitForContent });

  // Check if browser has a page loaded
  const currentUrl = browser.getUrl();
  if (!currentUrl) {
    return {
      toolName: 'browser_extract',
      success: false,
      output: `Error: No page is currently loaded in the browser.\n\n` +
        `You need to navigate to a page first using browser_navigate or browser_fetch.\n\n` +
        `Example:\n` +
        `1. First: browser_navigate with url="https://react.dev"\n` +
        `2. Then: browser_extract to get the content`,
    };
  }

  try {
    const content = await browser.extractContent({
      includeHtml,
      maxLength,
      waitForContent,
    });

    // If selector specified, extract only from that element
    let text = content.text;
    if (selector) {
      try {
        text = await browser.extractText(selector);
        if (!text || text.trim().length === 0) {
          context.logger.warn('Selector returned empty content', { selector });
          return {
            toolName: 'browser_extract',
            success: true,
            output: `Selector "${selector}" returned empty content.\n\n` +
              `URL: ${content.url}\n` +
              `Title: ${content.title}\n\n` +
              `The selector may not exist on this page or the element may be empty.\n` +
              `Suggestions:\n` +
              `- Use browser_snapshot to see available elements\n` +
              `- Try a different selector\n` +
              `- Extract without a selector to get all content`,
            metadata: {
              url: content.url,
              title: content.title,
              selector,
              warning: 'empty_selector',
            },
          };
        }
      } catch (selectorError) {
        context.logger.warn('Selector extraction failed', { 
          selector, 
          error: (selectorError as Error).message 
        });
        // Fall back to full page content
        text = content.text;
      }
    }

    // Check if we got meaningful content
    if (!text || text.trim().length < 50) {
      return {
        toolName: 'browser_extract',
        success: true,
        output: `Page content appears minimal or empty.\n\n` +
          `URL: ${content.url}\n` +
          `Title: ${content.title}\n` +
          `Text length: ${text?.length || 0} characters\n\n` +
          `This may be a JavaScript-heavy page that requires more time to render.\n` +
          `Suggestions:\n` +
          `- Use browser_fetch with waitFor parameter for specific elements\n` +
          `- Use browser_screenshot to see what's actually rendered\n` +
          `- The page may require user interaction to load content`,
        metadata: {
          url: content.url,
          title: content.title,
          textLength: text?.length || 0,
          warning: 'minimal_content',
        },
      };
    }

    // Build output based on what was requested
    const parts = extract ?? ['text', 'links', 'metadata'];
    let output = `# ${content.title}\n\n`;
    output += `**URL:** ${content.url}\n\n`;

    // Metadata
    if (parts.includes('metadata') && content.metadata) {
      if (content.metadata.description) {
        output += `**Description:** ${content.metadata.description}\n\n`;
      }
      if (content.metadata.author) {
        output += `**Author:** ${content.metadata.author}\n`;
      }
      if (content.metadata.publishedDate) {
        output += `**Published:** ${content.metadata.publishedDate}\n`;
      }
      if (content.metadata.keywords?.length) {
        output += `**Keywords:** ${content.metadata.keywords.join(', ')}\n`;
      }
      output += '\n';
    }

    // Main content
    if (parts.includes('text')) {
      output += `## Content\n\n`;
      const truncatedText = text.slice(0, maxLength);
      output += truncatedText;
      if (text.length > maxLength) {
        output += `\n\n...[Content truncated at ${maxLength} characters. Total length: ${text.length}]`;
      }
      output += '\n\n';
    }

    // Links
    if (parts.includes('links') && content.links.length > 0) {
      output += `## Links (${content.links.length} found)\n\n`;
      const maxLinks = 30;
      content.links.slice(0, maxLinks).forEach(link => {
        const linkText = link.text.slice(0, 60) || '[no text]';
        output += `- [${linkText}](${link.href})${link.isExternal ? ' (external)' : ''}\n`;
      });
      if (content.links.length > maxLinks) {
        output += `\n...[${content.links.length - maxLinks} more links not shown]\n`;
      }
      output += '\n';
    }

    // Images
    if (parts.includes('images') && content.images.length > 0) {
      output += `## Images (${content.images.length} found)\n\n`;
      const maxImages = 20;
      content.images.slice(0, maxImages).forEach(img => {
        output += `- ${img.alt || '[no alt]'}: ${img.src}`;
        if (img.width && img.height) {
          output += ` (${img.width}x${img.height})`;
        }
        output += '\n';
      });
      if (content.images.length > maxImages) {
        output += `\n...[${content.images.length - maxImages} more images not shown]\n`;
      }
    }

    return {
      toolName: 'browser_extract',
      success: true,
      output,
      metadata: {
        url: content.url,
        title: content.title,
        textLength: content.text.length,
        linkCount: content.links.length,
        imageCount: content.images.length,
        metadata: content.metadata,
        html: includeHtml ? content.html : undefined,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Extract content error', { error: errorMessage });
    
    // Provide helpful error message
    let suggestion = 'Try refreshing the page or navigating again.';
    if (errorMessage.includes('not initialized') || errorMessage.includes('not attached')) {
      suggestion = 'The browser may not be ready. Try opening the browser panel first.';
    } else if (errorMessage.includes('timeout')) {
      suggestion = 'The page may be slow to respond. Try increasing the timeout.';
    }
    
    return {
      toolName: 'browser_extract',
      success: false,
      output: `Failed to extract content: ${errorMessage}\n\n` +
        `Current URL: ${currentUrl}\n` +
        `Suggestion: ${suggestion}`,
    };
  }
}

export const browserExtractTool: ToolDefinition<ExtractArgs> = {
  name: 'browser_extract',
  description: `Extract content from the current page in the browser. Essential for reading documentation and web content.

## When to Use
- **Read documentation**: Extract text content from docs pages
- **Analyze pages**: Get page structure, links, and metadata
- **Content extraction**: Pull specific content using selectors
- **Research**: Gather information from web pages

## Workflow Integration
Use after navigation to read content:
\`\`\`
browser_navigate(url) → load the page
browser_extract() → get all content
[or]
browser_extract(selector: "article") → get specific section
[use content to inform decisions]
\`\`\`

## Documentation Pattern
\`\`\`
browser_navigate("https://docs.example.com/api") → load docs
browser_extract(extract: ["text", "links"]) → get docs + navigation
[read and understand the documentation]
[apply knowledge to code changes]
\`\`\`

## Extracts
- **Text content**: Main content area by default
- **Page metadata**: Title, description, author, keywords
- **Links**: All links with external flag
- **Images**: With dimensions and alt text

## SPA Support
- Automatically waits for dynamic content to load
- Detects React, Vue, Angular, and other frameworks
- Use selector parameter for specific elements

## Parameters
- **selector** (optional): CSS selector to extract from specific element
- **extract** (optional): Specific parts: text, links, images, metadata
- **maxLength** (optional): Maximum text content length (default: 50000)
- **includeHtml** (optional): Include raw HTML (large, use sparingly)
- **waitForContent** (optional): Wait for dynamic content (default: true)

## Best Practices
- Always use after browser_navigate
- Use selector for specific content areas
- Limit maxLength for large pages
- Use browser_snapshot first to find selectors`,

  requiresApproval: false,
  category: 'browser-read',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],

  schema: {
    type: 'object',
    properties: {
      includeHtml: {
        type: 'boolean',
        description: 'Include raw HTML in output (large, use sparingly)',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum text content length (default: 50000)',
      },
      selector: {
        type: 'string',
        description: 'CSS selector to extract from specific element',
      },
      extract: {
        type: 'array',
        description: 'Specific parts to extract: text, links, images, metadata',
        items: { type: 'string', enum: ['text', 'links', 'images', 'metadata'] },
      },
      waitForContent: {
        type: 'boolean',
        description: 'Wait for dynamic content to load (default: true). Set to false for static pages.',
      },
    },
    required: [],
  },

  ui: {
    icon: 'FileText',
    label: 'Extract Content',
    color: 'text-green-400',
    runningLabel: 'Extracting...',
    completedLabel: 'Extracted',
  },

  inputExamples: [
    { maxLength: 30000 },
    { selector: 'article', extract: ['text', 'links'] },
    { includeHtml: true, maxLength: 10000 },
    { waitForContent: true, selector: '.main-content' },
  ],

  execute: executeExtract,
};
