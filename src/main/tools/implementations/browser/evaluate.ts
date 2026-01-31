/**
 * Browser Evaluate Tool
 * 
 * Execute custom JavaScript in the browser page.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';
import { createLogger } from '../../../logger';

const logger = createLogger('browser_evaluate');

interface EvaluateArgs extends Record<string, unknown> {
  /** JavaScript code to execute */
  script: string;
  /** Element selector to pass to script (accessible as 'element') */
  selector?: string;
}

async function executeEvaluate(
  args: EvaluateArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { script, selector } = args;
  const browser = getBrowserManager();
  
  context.logger.info('Evaluating JavaScript', { scriptLength: script?.length, selector });

  if (!script) {
    return {
      toolName: 'browser_evaluate',
      success: false,
      output: 'Error: script is required',
    };
  }

  try {
    let wrappedScript: string;
    
    if (selector) {
      // If selector provided, pass element to script
      wrappedScript = `
        (function() {
          const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
          if (!element) return { __error: 'Element not found: ${selector.replace(/'/g, "\\'")}' };
          
          try {
            const fn = ${script};
            if (typeof fn === 'function') {
              return fn(element);
            }
            return fn;
          } catch (e) {
            return { __error: e.message };
          }
        })()
      `;
    } else {
      // Execute script directly
      wrappedScript = `
        (function() {
          try {
            const result = ${script};
            if (typeof result === 'function') {
              return result();
            }
            return result;
          } catch (e) {
            return { __error: e.message };
          }
        })()
      `;
    }

    const result = await browser.evaluate<unknown>(wrappedScript);

    // Check for error
    if (result && typeof result === 'object' && '__error' in result) {
      return {
        toolName: 'browser_evaluate',
        success: false,
        output: `Script error: ${(result as { __error: string }).__error}`,
      };
    }

    // Format result
    let output: string;
    if (result === undefined) {
      output = 'Script executed (returned undefined)';
    } else if (result === null) {
      output = 'Script result: null';
    } else if (typeof result === 'object') {
      try {
        output = `Script result:\n${JSON.stringify(result, null, 2)}`;
      } catch (error) {
        logger.debug('Could not stringify browser_evaluate result', {
          error: error instanceof Error ? error.message : String(error),
        });
        output = `Script result: [Object - could not stringify]`;
      }
    } else {
      output = `Script result: ${String(result)}`;
    }

    return {
      toolName: 'browser_evaluate',
      success: true,
      output,
      metadata: { result },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Evaluate error', { error: errorMessage });
    
    return {
      toolName: 'browser_evaluate',
      success: false,
      output: `Evaluation failed: ${errorMessage}`,
    };
  }
}

export const browserEvaluateTool: ToolDefinition<EvaluateArgs> = {
  name: 'browser_evaluate',
  description: `Execute JavaScript code in the browser page context. Advanced tool for custom interactions.

## When to Use
- **Custom DOM queries**: Get computed values, element counts
- **Page state**: Access localStorage, sessionStorage, cookies
- **Complex interactions**: When standard tools don't cover your needs
- **Testing**: Verify JavaScript functionality

## Workflow Integration
Use for advanced page inspection:
\`\`\`
browser_navigate(url)
browser_evaluate("document.querySelectorAll('li').length")
[use result to inform next steps]
\`\`\`

## State Inspection Pattern
\`\`\`
browser_evaluate("localStorage.getItem('user')")
browser_evaluate("() => window.__REDUX_STATE__")
\`\`\`

## Element Inspection Pattern
\`\`\`
browser_evaluate("(el) => el.getBoundingClientRect()", selector: "h1")
browser_evaluate("(el) => getComputedStyle(el).color", selector: ".button")
\`\`\`

## Script Formats
- **Expression**: \`document.title\`
- **Function**: \`() => document.querySelectorAll('li').length\`
- **With element**: \`(el) => el.getBoundingClientRect()\` (requires selector)

## Parameters
- **script** (required): JavaScript code to execute (expression or arrow function)
- **selector** (optional): Element selector - passed to script as first argument

## Security Note
Scripts run in page context with full DOM access. Use responsibly.

## Best Practices
- Use standard tools (click, type, extract) when possible
- Use evaluate for custom queries and state inspection
- Return serializable values (JSON-compatible)`,

  requiresApproval: false, // Read-only by default
  category: 'browser-write',
  riskLevel: 'moderate', // Can modify page
  allowedCallers: ['direct'], // Restricted due to arbitrary JS execution

  schema: {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: 'JavaScript code to execute (expression or arrow function)',
      },
      selector: {
        type: 'string',
        description: 'Element selector - passed to script as first argument',
      },
    },
    required: ['script'],
  },

  ui: {
    icon: 'Code',
    label: 'Evaluate',
    color: 'text-amber-400',
    runningLabel: 'Running...',
    completedLabel: 'Executed',
  },

  inputExamples: [
    { script: 'document.title' },
    { script: '() => document.querySelectorAll("a").length' },
    { script: '(el) => el.textContent', selector: 'h1' },
    { script: '() => localStorage.getItem("theme")' },
  ],

  execute: executeEvaluate,
};
