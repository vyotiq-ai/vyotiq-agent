/**
 * Browser Scroll Tool
 * 
 * Scroll the page in various directions.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface ScrollArgs extends Record<string, unknown> {
  /** Scroll direction */
  direction: 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom';
  /** Scroll amount in pixels (for up/down/left/right) */
  amount?: number;
  /** Scroll within specific element */
  selector?: string;
  /** Scroll to make element visible */
  scrollToElement?: string;
  /** Smooth scroll animation */
  smooth?: boolean;
}

async function executeScroll(
  args: ScrollArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { direction, amount = 500, selector, scrollToElement, smooth = false } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Scrolling page', { direction, amount, selector, scrollToElement });

  try {
    // If scrolling to element, use scrollIntoView
    if (scrollToElement) {
      const script = `
        (function() {
          const el = document.querySelector('${scrollToElement.replace(/'/g, "\\'")}');
          if (!el) return { success: false, reason: 'Element not found' };
          
          el.scrollIntoView({ 
            behavior: '${smooth ? 'smooth' : 'instant'}',
            block: 'center',
            inline: 'nearest'
          });
          
          return { success: true, element: el.tagName.toLowerCase() };
        })()
      `;
      
      const result = await browser.evaluate<{ success: boolean; reason?: string; element?: string }>(script);
      
      if (result?.success) {
        return {
          toolName: 'browser_scroll',
          success: true,
          output: `Scrolled to element: ${scrollToElement} (<${result.element}>)`,
          metadata: { scrollToElement, element: result.element },
        };
      } else {
        return {
          toolName: 'browser_scroll',
          success: false,
          output: `Element not found: ${scrollToElement}`,
        };
      }
    }

    // Build scroll script based on direction and target
    const behavior = smooth ? 'smooth' : 'instant';
    let scrollScript: string;

    if (selector) {
      // Scroll within specific element
      scrollScript = `
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return { success: false, reason: 'Container not found' };
          
          const scrollMap = {
            up: { top: -${amount} },
            down: { top: ${amount} },
            left: { left: -${amount} },
            right: { left: ${amount} },
            top: { top: -el.scrollHeight },
            bottom: { top: el.scrollHeight }
          };
          
          el.scrollBy({ ...scrollMap['${direction}'], behavior: '${behavior}' });
          
          return { 
            success: true, 
            scrollTop: el.scrollTop,
            scrollLeft: el.scrollLeft,
            scrollHeight: el.scrollHeight,
            scrollWidth: el.scrollWidth
          };
        })()
      `;
    } else {
      // Scroll the main page
      scrollScript = `
        (function() {
          const scrollMap = {
            up: { top: -${amount} },
            down: { top: ${amount} },
            left: { left: -${amount} },
            right: { left: ${amount} },
            top: { top: -document.body.scrollHeight },
            bottom: { top: document.body.scrollHeight }
          };
          
          window.scrollBy({ ...scrollMap['${direction}'], behavior: '${behavior}' });
          
          return {
            success: true,
            scrollY: window.scrollY,
            scrollX: window.scrollX,
            pageHeight: document.body.scrollHeight,
            pageWidth: document.body.scrollWidth,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth
          };
        })()
      `;
    }

    const result = await browser.evaluate<{
      success: boolean;
      reason?: string;
      scrollY?: number;
      scrollX?: number;
      scrollTop?: number;
      scrollLeft?: number;
      pageHeight?: number;
      scrollHeight?: number;
    }>(scrollScript);

    if (result?.success) {
      const yPos = result.scrollY ?? result.scrollTop ?? 0;
      const height = result.pageHeight ?? result.scrollHeight ?? 0;
      const percentage = height > 0 ? Math.round((yPos / height) * 100) : 0;
      
      return {
        toolName: 'browser_scroll',
        success: true,
        output: `Scrolled ${direction}${amount ? ` by ${amount}px` : ''}\nPosition: ${percentage}% from top`,
        metadata: result,
      };
    } else {
      return {
        toolName: 'browser_scroll',
        success: false,
        output: `Scroll failed: ${result?.reason ?? 'Unknown error'}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Scroll error', { error: errorMessage });
    
    return {
      toolName: 'browser_scroll',
      success: false,
      output: `Scroll failed: ${errorMessage}`,
    };
  }
}

export const browserScrollTool: ToolDefinition<ScrollArgs> = {
  name: 'browser_scroll',
  description: `Scroll the browser page or a specific element. Essential for accessing content below the fold.

## When to Use
- **View more content**: Scroll to see content below the viewport
- **Navigate long pages**: Jump to top/bottom of page
- **Scroll to elements**: Make specific elements visible
- **Scrollable containers**: Scroll within sidebars, modals, etc.

## Workflow Integration
Use to access content not in viewport:
\`\`\`
browser_navigate(url) → load page
browser_scroll(direction: "down") → see more content
browser_extract() → get visible content
[repeat as needed]
\`\`\`

## Scroll to Element Pattern
\`\`\`
browser_scroll(scrollToElement: "#section-3")
browser_screenshot() → verify element is visible
browser_click("#section-3 button") → interact
\`\`\`

## Infinite Scroll Pattern
\`\`\`
browser_navigate(url)
browser_scroll(direction: "bottom")
browser_wait(selector: ".new-content")
browser_extract()
\`\`\`

## Directions
- **up/down**: Scroll vertically by amount
- **left/right**: Scroll horizontally by amount
- **top/bottom**: Jump to start/end of page

## Parameters
- **direction** (required): up, down, left, right, top, bottom
- **amount** (optional): Pixels to scroll (default: 500)
- **selector** (optional): Scroll within specific element
- **scrollToElement** (optional): Scroll to make element visible
- **smooth** (optional): Use smooth animation

## Best Practices
- Use scrollToElement to ensure specific content is visible
- Use direction: "bottom" for infinite scroll pages
- Combine with browser_wait for dynamic content`,

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',
  allowedCallers: ['direct'],

  schema: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        description: 'Scroll direction',
        enum: ['up', 'down', 'left', 'right', 'top', 'bottom'],
      },
      amount: {
        type: 'number',
        description: 'Pixels to scroll (default: 500)',
      },
      selector: {
        type: 'string',
        description: 'Scroll within this container element',
      },
      scrollToElement: {
        type: 'string',
        description: 'Scroll to make this element visible',
      },
      smooth: {
        type: 'boolean',
        description: 'Use smooth scroll animation',
      },
    },
    required: ['direction'],
  },

  ui: {
    icon: 'ArrowDown',
    label: 'Scroll',
    color: 'text-cyan-400',
    runningLabel: 'Scrolling...',
    completedLabel: 'Scrolled',
  },

  inputExamples: [
    { direction: 'down', amount: 500 },
    { direction: 'bottom' },
    { direction: 'down', scrollToElement: '#section-3', smooth: true },
    { direction: 'down', selector: '.sidebar', amount: 200 },
  ],

  execute: executeScroll,
};
