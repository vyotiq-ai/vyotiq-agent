/**
 * Browser Click Tool
 * 
 * Click on elements in the browser page.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface ClickArgs extends Record<string, unknown> {
  /** CSS selector or element reference from snapshot */
  selector: string;
  /** Button to click */
  button?: 'left' | 'right' | 'middle';
  /** Double click instead of single */
  doubleClick?: boolean;
  /** Wait for element before clicking (ms) */
  waitTimeout?: number;
  /** Modifier keys to hold */
  modifiers?: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
}

async function executeClick(
  args: ClickArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { selector, button = 'left', doubleClick = false, waitTimeout, modifiers } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Clicking element', { selector, button, doubleClick });

  if (!selector) {
    return {
      toolName: 'browser_click',
      success: false,
      output: 'Error: selector is required',
    };
  }

  try {
    // Wait for element if timeout specified
    if (waitTimeout) {
      const found = await browser.waitForElement(selector, waitTimeout);
      if (!found) {
        return {
          toolName: 'browser_click',
          success: false,
          output: `Element not found within ${waitTimeout}ms: ${selector}`,
        };
      }
    }

    // Build the click script with options
    let clickScript: string;
    
    if (button === 'left' && !doubleClick && !modifiers?.length) {
      // Simple click
      clickScript = `
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return false;
          el.click();
          return true;
        })()
      `;
    } else {
      // Advanced click with options
      clickScript = `
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return false;
          
          const rect = el.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          
          const eventInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            button: ${button === 'left' ? 0 : button === 'middle' ? 1 : 2},
            ${modifiers?.includes('Alt') ? 'altKey: true,' : ''}
            ${modifiers?.includes('Control') ? 'ctrlKey: true,' : ''}
            ${modifiers?.includes('Meta') ? 'metaKey: true,' : ''}
            ${modifiers?.includes('Shift') ? 'shiftKey: true,' : ''}
          };
          
          el.dispatchEvent(new MouseEvent('mousedown', eventInit));
          el.dispatchEvent(new MouseEvent('mouseup', eventInit));
          el.dispatchEvent(new MouseEvent('click', eventInit));
          ${doubleClick ? "el.dispatchEvent(new MouseEvent('dblclick', eventInit));" : ''}
          
          return true;
        })()
      `;
    }

    const clicked = await browser.evaluate<boolean>(clickScript);

    if (clicked) {
      // Get element info for feedback
      const elements = await browser.queryElements(selector, 1);
      const elementInfo = elements[0];
      
      let output = `Clicked: ${selector}`;
      if (elementInfo) {
        output += `\nElement: <${elementInfo.tag}>`;
        if (elementInfo.text) {
          output += ` "${elementInfo.text.slice(0, 50)}"`;
        }
      }
      if (doubleClick) output += ' (double-click)';
      if (modifiers?.length) output += ` (modifiers: ${modifiers.join('+')})`;

      return {
        toolName: 'browser_click',
        success: true,
        output,
        metadata: { selector, element: elementInfo },
      };
    } else {
      return {
        toolName: 'browser_click',
        success: false,
        output: `Element not found: ${selector}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Click error', { selector, error: errorMessage });
    
    return {
      toolName: 'browser_click',
      success: false,
      output: `Click failed: ${errorMessage}`,
    };
  }
}

export const browserClickTool: ToolDefinition<ClickArgs> = {
  name: 'browser_click',
  description: `Click on an element in the browser. Core interaction tool for web automation.

## When to Use
- **Click buttons**: Submit forms, trigger actions
- **Navigate links**: Click navigation elements
- **UI interactions**: Toggle menus, expand sections
- **Testing**: Verify click handlers work correctly

## Workflow Integration
Use as part of interaction sequences:
\`\`\`
browser_navigate(url) → load page
browser_snapshot() → see available elements
browser_click(selector) → interact
browser_screenshot() → verify result
\`\`\`

## Form Interaction Pattern
\`\`\`
browser_navigate("http://localhost:3000/login")
browser_type("#email", "user@example.com")
browser_type("#password", "password")
browser_click("button[type='submit']")
browser_screenshot() → verify login result
\`\`\`

## Selector Tips
- Use IDs when available: #submit-btn
- Use classes: .nav-link
- Use attributes: [data-testid="login"]
- Use text content: button:contains("Submit")
- Use browser_snapshot to find selectors

## Parameters
- **selector** (required): CSS selector for the element to click
- **button** (optional): Mouse button - left, right, middle (default: left)
- **doubleClick** (optional): Perform double-click instead of single
- **waitTimeout** (optional): Wait for element to appear (ms)
- **modifiers** (optional): Modifier keys - Alt, Control, Meta, Shift

## Best Practices
- Use browser_snapshot first to find correct selectors
- Use waitTimeout for dynamically loaded elements
- Verify results with browser_screenshot`,

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',
  allowedCallers: ['direct'],

  schema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector for the element to click',
      },
      button: {
        type: 'string',
        description: 'Mouse button to click',
        enum: ['left', 'right', 'middle'],
      },
      doubleClick: {
        type: 'boolean',
        description: 'Perform double-click instead of single',
      },
      waitTimeout: {
        type: 'number',
        description: 'Wait for element to appear (ms)',
      },
      modifiers: {
        type: 'array',
        description: 'Modifier keys to hold during click',
        items: { type: 'string', enum: ['Alt', 'Control', 'Meta', 'Shift'] },
      },
    },
    required: ['selector'],
  },

  ui: {
    icon: 'MousePointer',
    label: 'Click',
    color: 'text-orange-400',
    runningLabel: 'Clicking...',
    completedLabel: 'Clicked',
  },

  inputExamples: [
    { selector: 'button[type="submit"]' },
    { selector: '.nav-link', waitTimeout: 5000 },
    { selector: '#menu', button: 'right' },
    { selector: 'a.edit', modifiers: ['Control'] },
  ],

  execute: executeClick,
};
