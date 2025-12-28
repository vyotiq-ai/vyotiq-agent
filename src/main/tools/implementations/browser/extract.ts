/**
 * Browser Extract Content Tool
 * 
 * Extract text content, links, images, and metadata from the current page.
 * Essential for fetching documentation and understanding page content.
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
}

async function executeExtract(
  args: ExtractArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { includeHtml, maxLength = 50000, selector, extract } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Extracting page content', { includeHtml, maxLength, selector });

  try {
    const content = await browser.extractContent({
      includeHtml,
      maxLength,
    });

    // If selector specified, extract only from that element
    let text = content.text;
    if (selector) {
      text = await browser.extractText(selector);
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
    
    return {
      toolName: 'browser_extract',
      success: false,
      output: `Failed to extract content: ${errorMessage}`,
    };
  }
}

export const browserExtractTool: ToolDefinition<ExtractArgs> = {
  name: 'browser_extract',
  description: `Extract content from the current page in the browser.

**Extracts:**
- Text content (main content area by default)
- Page metadata (title, description, author, keywords)
- Links (with external flag)
- Images (with dimensions and alt text)

**Best for:**
- Reading documentation after navigating to a docs page
- Extracting article content for analysis
- Getting page structure overview

Always use after browser_navigate to read the page content.`,

  requiresApproval: false,
  category: 'other',
  riskLevel: 'safe',

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
  ],

  execute: executeExtract,
};
