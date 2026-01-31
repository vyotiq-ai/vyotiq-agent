/**
 * Browser Back/Forward Tools
 * 
 * Navigation history tools.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserManager } from '../../../browser';

// =============================================================================
// Browser Back
// =============================================================================

async function executeBack(
  _args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const browser = getBrowserManager();
  
  context.logger.info('Navigating back');

  try {
    const success = await browser.goBack();
    
    if (success) {
      // Wait a moment for navigation
      await new Promise(resolve => setTimeout(resolve, 500));
      const state = browser.getState();
      
      return {
        toolName: 'browser_back',
        success: true,
        output: `Navigated back to: ${state.url}\nTitle: ${state.title}`,
        metadata: { url: state.url, title: state.title },
      };
    } else {
      return {
        toolName: 'browser_back',
        success: false,
        output: 'Cannot go back - no history',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Back navigation error', { error: errorMessage });
    
    return {
      toolName: 'browser_back',
      success: false,
      output: `Back navigation failed: ${errorMessage}`,
    };
  }
}

export const browserBackTool: ToolDefinition<Record<string, unknown>> = {
  name: 'browser_back',
  description: 'Navigate back in browser history (like clicking the back button).',

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',
  allowedCallers: ['direct'],

  schema: {
    type: 'object',
    properties: {},
    required: [],
  },

  ui: {
    icon: 'ArrowLeft',
    label: 'Back',
    color: 'text-blue-400',
    runningLabel: 'Going back...',
    completedLabel: 'Went back',
  },

  inputExamples: [{}],

  execute: executeBack,
};

// =============================================================================
// Browser Forward
// =============================================================================

async function executeForward(
  _args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const browser = getBrowserManager();
  
  context.logger.info('Navigating forward');

  try {
    const success = await browser.goForward();
    
    if (success) {
      // Wait a moment for navigation
      await new Promise(resolve => setTimeout(resolve, 500));
      const state = browser.getState();
      
      return {
        toolName: 'browser_forward',
        success: true,
        output: `Navigated forward to: ${state.url}\nTitle: ${state.title}`,
        metadata: { url: state.url, title: state.title },
      };
    } else {
      return {
        toolName: 'browser_forward',
        success: false,
        output: 'Cannot go forward - no forward history',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Forward navigation error', { error: errorMessage });
    
    return {
      toolName: 'browser_forward',
      success: false,
      output: `Forward navigation failed: ${errorMessage}`,
    };
  }
}

export const browserForwardTool: ToolDefinition<Record<string, unknown>> = {
  name: 'browser_forward',
  description: 'Navigate forward in browser history (like clicking the forward button).',

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',
  allowedCallers: ['direct'],

  schema: {
    type: 'object',
    properties: {},
    required: [],
  },

  ui: {
    icon: 'ArrowRight',
    label: 'Forward',
    color: 'text-blue-400',
    runningLabel: 'Going forward...',
    completedLabel: 'Went forward',
  },

  inputExamples: [{}],

  execute: executeForward,
};

// =============================================================================
// Browser Reload
// =============================================================================

async function executeReload(
  _args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const browser = getBrowserManager();
  
  context.logger.info('Reloading page');

  try {
    await browser.reload();
    
    // Wait for reload to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    const state = browser.getState();
    
    return {
      toolName: 'browser_reload',
      success: true,
      output: `Page reloaded: ${state.url}\nTitle: ${state.title}`,
      metadata: { url: state.url, title: state.title },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Reload error', { error: errorMessage });
    
    return {
      toolName: 'browser_reload',
      success: false,
      output: `Reload failed: ${errorMessage}`,
    };
  }
}

export const browserReloadTool: ToolDefinition<Record<string, unknown>> = {
  name: 'browser_reload',
  description: 'Reload the current page in the browser.',

  requiresApproval: false,
  category: 'browser-write',
  riskLevel: 'safe',
  allowedCallers: ['direct'],

  schema: {
    type: 'object',
    properties: {},
    required: [],
  },

  ui: {
    icon: 'RotateCw',
    label: 'Reload',
    color: 'text-blue-400',
    runningLabel: 'Reloading...',
    completedLabel: 'Reloaded',
  },

  inputExamples: [{}],

  execute: executeReload,
};
