/**
 * Browser Type Tool
 * 
 * Type text into input fields and editable elements.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface TypeArgs extends Record<string, unknown> {
  /** CSS selector for the input element */
  selector: string;
  /** Text to type */
  text: string;
  /** Clear existing content before typing */
  clearFirst?: boolean;
  /** Type slowly, character by character (triggers key events) */
  slowly?: boolean;
  /** Press Enter after typing */
  submit?: boolean;
  /** Delay between characters in ms (only when slowly=true) */
  delay?: number;
}

async function executeType(
  args: TypeArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { selector, text, clearFirst = true, slowly = false, submit = false, delay = 50 } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Typing into element', { selector, textLength: text?.length, slowly, submit });

  if (!selector) {
    return {
      toolName: 'browser_type',
      success: false,
      output: 'Error: selector is required',
    };
  }

  if (text === undefined) {
    return {
      toolName: 'browser_type',
      success: false,
      output: 'Error: text is required',
    };
  }

  try {
    // Escape the text for JavaScript
    const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

    let typeScript: string;
    
    if (slowly) {
      // Type character by character to trigger key events
      typeScript = `
        (async function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return false;
          
          el.focus();
          ${clearFirst ? "el.value = '';" : ''}
          
          const text = '${escapedText}';
          for (const char of text) {
            el.value += char;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
            await new Promise(r => setTimeout(r, ${delay}));
          }
          
          el.dispatchEvent(new Event('change', { bubbles: true }));
          ${submit ? "el.form?.submit() || el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 }));" : ''}
          
          return true;
        })()
      `;
    } else {
      // Fast typing - set value directly
      typeScript = `
        (function() {
          const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!el) return false;
          
          el.focus();
          ${clearFirst ? "el.value = '';" : ''}
          el.value ${clearFirst ? '=' : '+='} '${escapedText}';
          
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          ${submit ? `
            if (el.form) {
              el.form.submit();
            } else {
              el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
            }
          ` : ''}
          
          return true;
        })()
      `;
    }

    const typed = await browser.evaluate<boolean>(typeScript);

    if (typed) {
      let output = `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into: ${selector}`;
      if (submit) output += ' (submitted)';
      if (slowly) output += ' (character by character)';

      return {
        toolName: 'browser_type',
        success: true,
        output,
        metadata: { selector, textLength: text.length, submitted: submit },
      };
    } else {
      return {
        toolName: 'browser_type',
        success: false,
        output: `Input element not found: ${selector}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Type error', { selector, error: errorMessage });
    
    return {
      toolName: 'browser_type',
      success: false,
      output: `Type failed: ${errorMessage}`,
    };
  }
}

export const browserTypeTool: ToolDefinition<TypeArgs> = {
  name: 'browser_type',
  description: `Type text into an input field or editable element.

**Features:**
- Fast typing (default): Sets value directly
- Slow typing: Character by character with key events
- Auto-submit: Press Enter after typing
- Clear first: Remove existing content before typing

**Use for:**
- Filling form inputs
- Search boxes
- Text areas
- Any editable element`,

  requiresApproval: false,
  category: 'other',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector for the input element',
      },
      text: {
        type: 'string',
        description: 'Text to type',
      },
      clearFirst: {
        type: 'boolean',
        description: 'Clear existing content before typing (default: true)',
      },
      slowly: {
        type: 'boolean',
        description: 'Type character by character (triggers key events)',
      },
      submit: {
        type: 'boolean',
        description: 'Press Enter after typing to submit',
      },
      delay: {
        type: 'number',
        description: 'Delay between characters in ms (only when slowly=true)',
      },
    },
    required: ['selector', 'text'],
  },

  ui: {
    icon: 'Type',
    label: 'Type',
    color: 'text-yellow-400',
    runningLabel: 'Typing...',
    completedLabel: 'Typed',
  },

  inputExamples: [
    { selector: '#search-input', text: 'react hooks tutorial' },
    { selector: 'input[name="email"]', text: 'user@example.com', submit: true },
    { selector: 'textarea', text: 'Long form content...', clearFirst: true },
    { selector: '#password', text: 'secret', slowly: true },
  ],

  execute: executeType,
};
