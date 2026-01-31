/**
 * Browser Hover Tool
 * 
 * Hover over elements to trigger hover states and tooltips.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface HoverArgs extends Record<string, unknown> {
  /** CSS selector or element reference */
  selector: string;
  /** Time to hover in milliseconds */
  duration?: number;
}

async function executeHover(
  args: HoverArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { selector, duration = 500 } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Hovering over element', { selector, duration });

  if (!selector) {
    return {
      toolName: 'browser_hover',
      success: false,
      output: 'Error: selector is required',
    };
  }

  try {
    const script = `
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return { success: false, error: 'Element not found' };
        
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        // Dispatch mouse events
        el.dispatchEvent(new MouseEvent('mouseenter', {
          bubbles: true,
          clientX: x,
          clientY: y
        }));
        el.dispatchEvent(new MouseEvent('mouseover', {
          bubbles: true,
          clientX: x,
          clientY: y
        }));
        el.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          clientX: x,
          clientY: y
        }));
        
        return {
          success: true,
          element: {
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 50),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          }
        };
      })()
    `;

    const result = await browser.evaluate<{
      success: boolean;
      error?: string;
      element?: { tag: string; text: string; rect: { x: number; y: number; width: number; height: number } };
    }>(script);

    if (!result?.success) {
      return {
        toolName: 'browser_hover',
        success: false,
        output: result?.error ?? 'Unknown error',
      };
    }

    // Wait for hover duration
    await new Promise(resolve => setTimeout(resolve, duration));

    // Dispatch mouseleave
    await browser.evaluate(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (el) {
          el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
          el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        }
      })()
    `);

    return {
      toolName: 'browser_hover',
      success: true,
      output: `Hovered over: ${selector}\nElement: <${result.element?.tag}> "${result.element?.text}"`,
      metadata: { selector, element: result.element, duration },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Hover error', { selector, error: errorMessage });
    
    return {
      toolName: 'browser_hover',
      success: false,
      output: `Hover failed: ${errorMessage}`,
    };
  }
}

export const browserHoverTool: ToolDefinition<HoverArgs> = {
  name: 'browser_hover',
  description: `Hover over an element to trigger hover states. Useful for menus and tooltips.

## When to Use
- **Dropdown menus**: Trigger hover-activated menus
- **Tooltips**: Show tooltip content
- **Hover effects**: Test CSS hover states
- **Preview content**: Trigger hover previews

## Workflow Integration
Use for hover-triggered interactions:
\`\`\`
browser_navigate(url)
browser_hover(selector: ".dropdown-trigger")
browser_wait(selector: ".dropdown-menu")
browser_click(".dropdown-menu .item")
\`\`\`

## Tooltip Pattern
\`\`\`
browser_hover(selector: "[data-tooltip]", duration: 1000)
browser_screenshot() → capture tooltip
\`\`\`

## Menu Pattern
\`\`\`
browser_hover(selector: ".nav-item")
browser_wait(selector: ".submenu")
browser_snapshot() → see submenu items
browser_click(".submenu-item")
\`\`\`

## Parameters
- **selector** (required): CSS selector for the element to hover
- **duration** (optional): How long to hover in ms (default: 500)

## Best Practices
- Use with browser_wait for hover-triggered content
- Increase duration for slow animations
- Combine with screenshot to capture hover states`,

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',
  allowedCallers: ['direct'],

  schema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector for the element to hover',
      },
      duration: {
        type: 'number',
        description: 'How long to hover in milliseconds (default: 500)',
      },
    },
    required: ['selector'],
  },

  ui: {
    icon: 'MousePointer2',
    label: 'Hover',
    color: 'text-pink-400',
    runningLabel: 'Hovering...',
    completedLabel: 'Hovered',
  },

  inputExamples: [
    { selector: '.dropdown-trigger' },
    { selector: '[data-tooltip]', duration: 1000 },
  ],

  execute: executeHover,
};
