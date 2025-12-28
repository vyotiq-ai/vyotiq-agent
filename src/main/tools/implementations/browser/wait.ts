/**
 * Browser Wait Tool
 * 
 * Wait for elements, navigation, or time.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface WaitArgs extends Record<string, unknown> {
  /** Wait for element to appear */
  selector?: string;
  /** Wait for text to appear on page */
  text?: string;
  /** Wait for text to disappear */
  textGone?: string;
  /** Wait for fixed time in milliseconds */
  time?: number;
  /** Maximum wait time in milliseconds (default: 30000) */
  timeout?: number;
}

async function executeWait(
  args: WaitArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { selector, text, textGone, time, timeout = 30000 } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Waiting', { selector, text, textGone, time, timeout });

  // Must specify something to wait for
  if (!selector && !text && !textGone && !time) {
    return {
      toolName: 'browser_wait',
      success: false,
      output: 'Error: Must specify selector, text, textGone, or time',
    };
  }

  try {
    // Wait for fixed time
    if (time) {
      await new Promise(resolve => setTimeout(resolve, time));
      return {
        toolName: 'browser_wait',
        success: true,
        output: `Waited ${time}ms`,
        metadata: { waitedMs: time },
      };
    }

    const startTime = Date.now();

    // Wait for selector
    if (selector) {
      const found = await browser.waitForElement(selector, timeout);
      const elapsed = Date.now() - startTime;
      
      if (found) {
        return {
          toolName: 'browser_wait',
          success: true,
          output: `Element found: ${selector} (after ${elapsed}ms)`,
          metadata: { selector, elapsed },
        };
      } else {
        return {
          toolName: 'browser_wait',
          success: false,
          output: `Timeout waiting for element: ${selector} (waited ${elapsed}ms)`,
          metadata: { selector, elapsed, timeout },
        };
      }
    }

    // Wait for text to appear
    if (text) {
      const pollInterval = 200;
      
      while (Date.now() - startTime < timeout) {
        const found = await browser.evaluate<boolean>(`
          document.body.innerText.includes('${text.replace(/'/g, "\\'")}')
        `);
        
        if (found) {
          const elapsed = Date.now() - startTime;
          return {
            toolName: 'browser_wait',
            success: true,
            output: `Text found: "${text.slice(0, 50)}" (after ${elapsed}ms)`,
            metadata: { text, elapsed },
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      
      const elapsed = Date.now() - startTime;
      return {
        toolName: 'browser_wait',
        success: false,
        output: `Timeout waiting for text: "${text.slice(0, 50)}" (waited ${elapsed}ms)`,
        metadata: { text, elapsed, timeout },
      };
    }

    // Wait for text to disappear
    if (textGone) {
      const pollInterval = 200;
      
      while (Date.now() - startTime < timeout) {
        const found = await browser.evaluate<boolean>(`
          document.body.innerText.includes('${textGone.replace(/'/g, "\\'")}')
        `);
        
        if (!found) {
          const elapsed = Date.now() - startTime;
          return {
            toolName: 'browser_wait',
            success: true,
            output: `Text disappeared: "${textGone.slice(0, 50)}" (after ${elapsed}ms)`,
            metadata: { textGone, elapsed },
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      
      const elapsed = Date.now() - startTime;
      return {
        toolName: 'browser_wait',
        success: false,
        output: `Timeout waiting for text to disappear: "${textGone.slice(0, 50)}" (waited ${elapsed}ms)`,
        metadata: { textGone, elapsed, timeout },
      };
    }

    return {
      toolName: 'browser_wait',
      success: false,
      output: 'Unknown wait condition',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Wait error', { error: errorMessage });
    
    return {
      toolName: 'browser_wait',
      success: false,
      output: `Wait failed: ${errorMessage}`,
    };
  }
}

export const browserWaitTool: ToolDefinition<WaitArgs> = {
  name: 'browser_wait',
  description: `Wait for conditions in the browser.

**Wait types:**
- selector: Wait for element to appear
- text: Wait for text to appear on page
- textGone: Wait for text to disappear
- time: Wait for fixed duration

**Use for:**
- Waiting for specific elements or text to appear or disappear
- Waiting for page load
- Waiting for animations to complete
- Waiting for network requests to finish
- Waiting for async content to load 
- Waiting for loading spinners to disappear
- Adding delays between actions`,

  requiresApproval: false,
  category: 'other',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector to wait for',
      },
      text: {
        type: 'string',
        description: 'Text to wait to appear',
      },
      textGone: {
        type: 'string',
        description: 'Text to wait to disappear',
      },
      time: {
        type: 'number',
        description: 'Fixed wait time in milliseconds',
      },
      timeout: {
        type: 'number',
        description: 'Maximum wait time (default: 30000ms)',
      },
    },
    required: [],
  },

  ui: {
    icon: 'Clock',
    label: 'Wait',
    color: 'text-slate-400',
    runningLabel: 'Waiting...',
    completedLabel: 'Done',
  },

  inputExamples: [
    { selector: '.loaded' },
    { text: 'Welcome back' },
    { textGone: 'Loading...', timeout: 10000 },
    { time: 2000 },
  ],

  execute: executeWait,
};
