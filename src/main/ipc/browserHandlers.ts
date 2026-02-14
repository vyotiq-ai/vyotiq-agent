/**
 * Browser IPC Handlers
 * 
 * Handles all browser-related IPC operations including:
 * - Browser navigation and control
 * - Content extraction and screenshots
 * - Security management
 * - Console and network debugging
 */

import { ipcMain } from 'electron';
import { createLogger } from '../logger';
import type { IpcContext } from './types';
import { withErrorGuard } from './guards';

const logger = createLogger('IPC:Browser');

// Cache browser module imports to avoid repeated dynamic import overhead per IPC call
let cachedBrowserModule: typeof import('../browser') | null = null;

const getBrowserManagerCached = async () => {
  if (!cachedBrowserModule) {
    cachedBrowserModule = await import('../browser');
  }
  return cachedBrowserModule.getBrowserManager();
};

const getBrowserSecurityCached = async () => {
  if (!cachedBrowserModule) {
    cachedBrowserModule = await import('../browser');
  }
  return cachedBrowserModule.getBrowserSecurity();
};

export function registerBrowserHandlers(_context: IpcContext): void {
  logger.info('Registering browser IPC handlers');

  // NOTE: Browser state-changed events are forwarded to the renderer in main.ts
  // via the emitToRenderer → eventBatcher path. No need to duplicate here.

  // ==========================================================================
  // Browser Navigation & Control
  // ==========================================================================

  ipcMain.handle('browser:navigate', async (_event, url: string) => {
    // Validate URL format
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'URL is required', url: url ?? '', title: '' };
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: `Unsupported protocol: ${parsed.protocol}`, url, title: '' };
      }
    } catch {
      return { success: false, error: 'Invalid URL format', url, title: '' };
    }

    return withErrorGuard('browser:navigate', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.navigate(url);
    });
  });

  ipcMain.handle('browser:extract', async (_event, options?: { includeHtml?: boolean; maxLength?: number }) => {
    return withErrorGuard('browser:extract', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.extractContent(options);
    });
  });

  ipcMain.handle('browser:screenshot', async (_event, options?: { fullPage?: boolean; selector?: string; format?: 'png' | 'jpeg' }) => {
    return withErrorGuard('browser:screenshot', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.screenshot(options);
    });
  });

  ipcMain.handle('browser:back', async () => {
    return withErrorGuard('browser:back', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.goBack();
    });
  });

  ipcMain.handle('browser:forward', async () => {
    return withErrorGuard('browser:forward', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.goForward();
    });
  });

  ipcMain.handle('browser:reload', async () => {
    return withErrorGuard('browser:reload', async () => {
      const browser = await getBrowserManagerCached();
      await browser.reload();
      return { success: true };
    });
  });

  ipcMain.handle('browser:stop', async () => {
    return withErrorGuard('browser:stop', async () => {
      const browser = await getBrowserManagerCached();
      browser.stop();
      return { success: true };
    });
  });

  ipcMain.handle('browser:state', async () => {
    return withErrorGuard('browser:state', async () => {
      const browser = await getBrowserManagerCached();
      return browser.getState();
    });
  });

  // ==========================================================================
  // Browser View Management
  // ==========================================================================

  ipcMain.handle('browser:attach', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    return withErrorGuard('browser:attach', async () => {
      const browser = await getBrowserManagerCached();
      browser.attach(bounds);
      return { success: true };
    });
  });

  ipcMain.handle('browser:detach', async () => {
    return withErrorGuard('browser:detach', async () => {
      const browser = await getBrowserManagerCached();
      browser.detach();
      return { success: true };
    });
  });

  ipcMain.handle('browser:setBounds', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    return withErrorGuard('browser:setBounds', async () => {
      const browser = await getBrowserManagerCached();
      browser.setBounds(bounds);
      return { success: true };
    });
  });

  // ==========================================================================
  // Browser Interaction
  // ==========================================================================

  ipcMain.handle('browser:click', async (_event, selector: string) => {
    return withErrorGuard('browser:click', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.click(selector);
    });
  });

  ipcMain.handle('browser:type', async (_event, selector: string, text: string) => {
    return withErrorGuard('browser:type', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.type(selector, text);
    });
  });

  ipcMain.handle('browser:hover', async (_event, selector: string) => {
    return withErrorGuard('browser:hover', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.hover(selector);
    });
  });

  ipcMain.handle('browser:fill', async (_event, selector: string, value: string) => {
    return withErrorGuard('browser:fill', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.fill(selector, value);
    });
  });

  ipcMain.handle('browser:scroll', async (_event, direction: 'up' | 'down' | 'top' | 'bottom', amount?: number) => {
    return withErrorGuard('browser:scroll', async () => {
      const browser = await getBrowserManagerCached();
      browser.scroll(direction, amount);
      return { success: true };
    });
  });

  ipcMain.handle('browser:evaluate', async (_event, script: string) => {
    return withErrorGuard('browser:evaluate', async () => {
      // Validate script to prevent dangerous operations
      if (typeof script !== 'string' || script.length === 0) {
        throw new Error('Script must be a non-empty string');
      }
      if (script.length > 100_000) {
        throw new Error('Script exceeds maximum length (100KB)');
      }
      // Block known dangerous patterns
      const dangerousPatterns = [
        /\brequire\s*\(/i,
        /\bprocess\s*\.\s*(env|exit|kill|binding)/i,
        /\b__dirname\b/i,
        /\b__filename\b/i,
        /\bchild_process\b/i,
        /\bfs\s*\.\s*(readFile|writeFile|unlink|rmdir|mkdir)/i,
        /\beval\s*\(/i,
        /\bFunction\s*\(/i,
      ];
      for (const pattern of dangerousPatterns) {
        if (pattern.test(script)) {
          throw new Error(`Script contains blocked pattern: ${pattern.source}`);
        }
      }
      const browser = await getBrowserManagerCached();
      return await browser.evaluate(script);
    });
  });

  ipcMain.handle('browser:query', async (_event, selector: string, limit?: number) => {
    return withErrorGuard('browser:query', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.queryElements(selector, limit);
    });
  });

  ipcMain.handle('browser:waitForElement', async (_event, selector: string, timeout?: number) => {
    return withErrorGuard('browser:waitForElement', async () => {
      const browser = await getBrowserManagerCached();
      return await browser.waitForElement(selector, timeout);
    });
  });

  ipcMain.handle('browser:clearData', async () => {
    return withErrorGuard('browser:clearData', async () => {
      const browser = await getBrowserManagerCached();
      browser.clearData();
      return { success: true };
    });
  });

  // ==========================================================================
  // Browser Security
  // ==========================================================================

  ipcMain.handle('browser:security:getConfig', async () => {
    return withErrorGuard('browser:security:getConfig', async () => {
      const security = await getBrowserSecurityCached();
      return security.getConfig();
    });
  });

  ipcMain.handle('browser:security:updateConfig', async (_event, config: Record<string, unknown>) => {
    return withErrorGuard('browser:security:updateConfig', async () => {
      const security = await getBrowserSecurityCached();
      security.updateConfig(config);
      return { success: true };
    });
  });

  ipcMain.handle('browser:security:getStats', async () => {
    return withErrorGuard('browser:security:getStats', async () => {
      const security = await getBrowserSecurityCached();
      return security.getStats();
    });
  });

  ipcMain.handle('browser:security:getEvents', async (_event, limit?: number) => {
    return withErrorGuard('browser:security:getEvents', async () => {
      const security = await getBrowserSecurityCached();
      return security.getEvents(limit);
    });
  });

  ipcMain.handle('browser:security:checkUrl', async (_event, url: string) => {
    return withErrorGuard('browser:security:checkUrl', async () => {
      const security = await getBrowserSecurityCached();
      return security.checkUrlSafety(url);
    });
  });

  ipcMain.handle('browser:security:addToAllowList', async (_event, url: string) => {
    return withErrorGuard('browser:security:addToAllowList', async () => {
      const security = await getBrowserSecurityCached();
      security.addToAllowList(url);
      return { success: true };
    });
  });

  ipcMain.handle('browser:security:removeFromAllowList', async (_event, url: string) => {
    return withErrorGuard('browser:security:removeFromAllowList', async () => {
      const security = await getBrowserSecurityCached();
      security.removeFromAllowList(url);
      return { success: true };
    });
  });

  ipcMain.handle('browser:security:addToBlockList', async (_event, url: string) => {
    return withErrorGuard('browser:security:addToBlockList', async () => {
      const security = await getBrowserSecurityCached();
      security.addToBlockList(url);
      return { success: true };
    });
  });

  ipcMain.handle('browser:security:removeFromBlockList', async (_event, url: string) => {
    return withErrorGuard('browser:security:removeFromBlockList', async () => {
      const security = await getBrowserSecurityCached();
      security.removeFromBlockList(url);
      return { success: true };
    });
  });

  ipcMain.handle('browser:security:resetStats', async () => {
    return withErrorGuard('browser:security:resetStats', async () => {
      const security = await getBrowserSecurityCached();
      security.resetStats();
      return { success: true };
    });
  });

  // ==========================================================================
  // Browser Debugging (Console & Network)
  // ==========================================================================

  ipcMain.handle('browser:console:getLogs', async (_event, options?: {
    level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
    limit?: number;
    filter?: string;
  }) => {
    return withErrorGuard('browser:console:getLogs', async () => {
      const { getConsoleLogs } = await import('../tools/implementations/browser/console');
      return { success: true, logs: getConsoleLogs(options) };
    });
  });

  ipcMain.handle('browser:console:clear', async () => {
    return withErrorGuard('browser:console:clear', async () => {
      const { clearConsoleLogs } = await import('../tools/implementations/browser/console');
      clearConsoleLogs();
      return { success: true };
    });
  });

  ipcMain.handle('browser:network:getRequests', async (_event, options?: {
    type?: string;
    status?: string;
    limit?: number;
    urlPattern?: string;
  }) => {
    return withErrorGuard('browser:network:getRequests', async () => {
      const { getNetworkRequests } = await import('../tools/implementations/browser/network');
      return { success: true, requests: getNetworkRequests(options) };
    });
  });

  ipcMain.handle('browser:network:clear', async () => {
    return withErrorGuard('browser:network:clear', async () => {
      const { clearNetworkRequests } = await import('../tools/implementations/browser/network');
      clearNetworkRequests();
      return { success: true };
    });
  });

  // ==========================================================================
  // Browser Behavior Settings
  // ==========================================================================

  ipcMain.handle('browser:applyBehaviorSettings', async (_event, settings: {
    navigationTimeout?: number;
    maxContentLength?: number;
    customUserAgent?: string;
    enableJavaScript?: boolean;
    enableCookies?: boolean;
    clearDataOnExit?: boolean;
  }) => {
    return withErrorGuard('browser:applyBehaviorSettings', async () => {
      const browser = await getBrowserManagerCached();
      browser.applyBehaviorSettings(settings);
      return { success: true };
    });
  });
}
