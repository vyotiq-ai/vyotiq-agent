/**
 * Browser Screenshot Tool
 * 
 * Capture screenshots of the current page for visual verification.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

interface ScreenshotArgs extends Record<string, unknown> {
  /** Capture full page (scrolls and stitches) */
  fullPage?: boolean;
  /** Capture specific element by CSS selector */
  selector?: string;
  /** Image format */
  format?: 'png' | 'jpeg';
  /** JPEG quality (1-100, only for jpeg) */
  quality?: number;
}

/** Default timeout for screenshot operations (30 seconds) */
const SCREENSHOT_TIMEOUT_MS = 30000;

async function executeScreenshot(
  args: ScreenshotArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { fullPage = false, selector, format = 'png', quality = 80 } = args;
  const browser = getBrowserManager();
  
  // Check if already cancelled before starting
  if (context.signal?.aborted) {
    return {
      toolName: 'browser_screenshot',
      success: false,
      output: 'Screenshot cancelled by user',
    };
  }
  
  context.logger.info('Taking screenshot', { fullPage, selector, format });

  try {
    // Use the browser's built-in timeout, but also add a safety timeout at tool level
    const screenshotPromise = browser.screenshot({
      fullPage,
      selector,
      format,
      quality,
    }, SCREENSHOT_TIMEOUT_MS);

    // Create abort promise that rejects when signal is aborted
    const abortPromise = context.signal 
      ? new Promise<never>((_, reject) => {
          if (context.signal!.aborted) {
            reject(new Error('Screenshot cancelled by user'));
            return;
          }
          context.signal!.addEventListener('abort', () => {
            reject(new Error('Screenshot cancelled by user'));
          }, { once: true });
        })
      : new Promise<never>(() => {
          // Intentionally never resolves (keeps Promise.race pending without a signal)
          void 0;
        });

    // Double-wrap with a slightly longer timeout as safety net
    const safetyTimeoutMs = SCREENSHOT_TIMEOUT_MS + 5000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(
        `Screenshot tool timeout (${safetyTimeoutMs / 1000}s). ` +
        (fullPage ? 'Full page capture on this page is too slow. Try without fullPage option.' : 'Page may be unresponsive.')
      )), safetyTimeoutMs)
    );
    
    const screenshot = await Promise.race([
      screenshotPromise,
      abortPromise,
      timeoutPromise,
    ]);

    const state = browser.getState();
    let description = 'Screenshot captured';
    if (selector) {
      description = `Screenshot of element "${selector}" captured`;
    } else if (fullPage) {
      description = 'Full page screenshot captured';
    } else {
      description = 'Viewport screenshot captured';
    }

    return {
      toolName: 'browser_screenshot',
      success: true,
      output: `${description}\nPage: ${state.title}\nURL: ${state.url}`,
      metadata: {
        screenshot, // Base64 encoded image
        format,
        fullPage,
        selector,
        url: state.url,
        title: state.title,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Screenshot error', { error: errorMessage });
    
    // Provide helpful suggestions based on the error
    let helpText = '';
    if (errorMessage.includes('timeout')) {
      helpText = fullPage 
        ? '\n\nTip: Full page screenshots on complex pages can timeout. Try `fullPage: false` for viewport only.'
        : '\n\nTip: The page may be loading slow content. Try waiting or refreshing.';
    }
    
    return {
      toolName: 'browser_screenshot',
      success: false,
      output: `Failed to take screenshot: ${errorMessage}${helpText}`,
    };
  }
}

export const browserScreenshotTool: ToolDefinition<ScreenshotArgs> = {
  name: 'browser_screenshot',
  description: `Take a screenshot of the current browser page for visual verification.

## When to Use
- **Verify rendering**: Confirm UI elements are displayed correctly
- **Capture state**: Document visual state at specific workflow steps
- **Debug issues**: See what's actually rendered vs expected
- **Visual testing**: Compare before/after states

## Workflow Integration
Use for visual verification:
\`\`\`
browser_navigate(url) → load page
browser_screenshot() → capture initial state
browser_click(selector) → interact
browser_screenshot() → capture result
[compare screenshots to verify behavior]
\`\`\`

## Testing Pattern
\`\`\`
browser_navigate("http://localhost:3000")
browser_screenshot() → baseline
[make code changes]
browser_navigate("http://localhost:3000")
browser_screenshot() → compare
\`\`\`

## Options
- **Viewport only** (default): Captures visible area of the page
- **Full page**: Scrolls and captures entire page
- **Element**: Captures specific element by CSS selector
- **Format**: PNG (default) or JPEG with quality setting

## Parameters
- **fullPage** (optional): Capture full page (scrolls entire page)
- **selector** (optional): CSS selector for element to capture
- **format** (optional): Image format - png or jpeg
- **quality** (optional): JPEG quality 1-100 (only for jpeg)

## Use Cases
- Verify web app renders correctly
- Capture visual changes after interactions
- Document visual state for reports
- Validate responsive design
- Monitor visual regressions
- Capture error states for debugging

## Best Practices
- Use viewport screenshots for quick checks
- Use fullPage sparingly (can timeout on complex pages)
- Use selector for specific component verification`,

  requiresApproval: false,
  category: 'browser-read',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],

  schema: {
    type: 'object',
    properties: {
      fullPage: {
        type: 'boolean',
        description: 'Capture full page (scrolls entire page)',
      },
      selector: {
        type: 'string',
        description: 'CSS selector for element to capture',
      },
      format: {
        type: 'string',
        description: 'Image format',
        enum: ['png', 'jpeg'],
      },
      quality: {
        type: 'number',
        description: 'JPEG quality 1-100 (only for jpeg format)',
      },
    },
    required: [],
  },

  ui: {
    icon: 'Camera',
    label: 'Screenshot',
    color: 'text-purple-400',
    runningLabel: 'Capturing...',
    completedLabel: 'Captured',
  },

  inputExamples: [
    {},
    { fullPage: true },
    { selector: '.main-content' },
    { format: 'jpeg', quality: 90 },
  ],

  execute: executeScreenshot,
};
