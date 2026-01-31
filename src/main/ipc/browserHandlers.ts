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

const logger = createLogger('IPC:Browser');

export function registerBrowserHandlers(_context: IpcContext): void {
  // ==========================================================================
  // Browser Navigation & Control
  // ==========================================================================

  ipcMain.handle('browser:navigate', async (_event, url: string) => {
    try {
      const { getBrowserManager } = await import('../browser');
      const browser = getBrowserManager();
      return await browser.navigate(url);
    } catch (error) {
      logger.error('Browser navigation failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, url, title: '' };
    }
  });

  ipcMain.handle('browser:extract', async (_event, options?: { includeHtml?: boolean; maxLength?: number }) => {
    try {
      const { getBrowserManager } = await import('../browser');
      const browser = getBrowserManager();
      return await browser.extractContent(options);
    } catch (error) {
      logger.error('Browser extract failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, content: null, title: '', url: '' };
    }
  });

  ipcMain.handle('browser:screenshot', async (_event, options?: { fullPage?: boolean; selector?: string; format?: 'png' | 'jpeg' }) => {
    try {
      const { getBrowserManager } = await import('../browser');
      const browser = getBrowserManager();
      return await browser.screenshot(options);
    } catch (error) {
      logger.error('Browser screenshot failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, data: null };
    }
  });

  ipcMain.handle('browser:back', async () => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().goBack();
    } catch (error) {
      logger.error('Browser back failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:forward', async () => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().goForward();
    } catch (error) {
      logger.error('Browser forward failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:reload', async () => {
    try {
      const { getBrowserManager } = await import('../browser');
      await getBrowserManager().reload();
      return { success: true };
    } catch (error) {
      logger.error('Browser reload failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:stop', async () => {
    try {
      const { getBrowserManager } = await import('../browser');
      getBrowserManager().stop();
      return { success: true };
    } catch (error) {
      logger.error('Browser stop failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:state', async () => {
    try {
      const { getBrowserManager } = await import('../browser');
      return getBrowserManager().getState();
    } catch (error) {
      logger.error('Browser state failed', { error: error instanceof Error ? error.message : String(error) });
      return { url: '', title: '', isLoading: false, canGoBack: false, canGoForward: false };
    }
  });

  // ==========================================================================
  // Browser View Management
  // ==========================================================================

  ipcMain.handle('browser:attach', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      const { getBrowserManager } = await import('../browser');
      const browser = getBrowserManager();
      browser.attach(bounds);
      return { success: true };
    } catch (error) {
      logger.error('Browser attach failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:detach', async () => {
    try {
      const { getBrowserManager } = await import('../browser');
      getBrowserManager().detach();
      return { success: true };
    } catch (error) {
      logger.error('Browser detach failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:setBounds', async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      const { getBrowserManager } = await import('../browser');
      getBrowserManager().setBounds(bounds);
      return { success: true };
    } catch (error) {
      logger.error('Browser setBounds failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Browser Interaction
  // ==========================================================================

  ipcMain.handle('browser:click', async (_event, selector: string) => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().click(selector);
    } catch (error) {
      logger.error('Browser click failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:type', async (_event, selector: string, text: string) => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().type(selector, text);
    } catch (error) {
      logger.error('Browser type failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:hover', async (_event, selector: string) => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().hover(selector);
    } catch (error) {
      logger.error('Browser hover failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:fill', async (_event, selector: string, value: string) => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().fill(selector, value);
    } catch (error) {
      logger.error('Browser fill failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:scroll', async (_event, direction: 'up' | 'down' | 'top' | 'bottom', amount?: number) => {
    try {
      const { getBrowserManager } = await import('../browser');
      await getBrowserManager().scroll(direction, amount);
      return { success: true };
    } catch (error) {
      logger.error('Browser scroll failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:evaluate', async (_event, script: string) => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().evaluate(script);
    } catch (error) {
      logger.error('Browser evaluate failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message, result: null };
    }
  });

  ipcMain.handle('browser:query', async (_event, selector: string, limit?: number) => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().queryElements(selector, limit);
    } catch (error) {
      logger.error('Browser query failed', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('browser:waitForElement', async (_event, selector: string, timeout?: number) => {
    try {
      const { getBrowserManager } = await import('../browser');
      return await getBrowserManager().waitForElement(selector, timeout);
    } catch (error) {
      logger.error('Browser waitForElement failed', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  });

  ipcMain.handle('browser:clearData', async () => {
    try {
      const { getBrowserManager } = await import('../browser');
      await getBrowserManager().clearData();
      return { success: true };
    } catch (error) {
      logger.error('Browser clearData failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Browser Security
  // ==========================================================================

  ipcMain.handle('browser:security:getConfig', async () => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      return getBrowserSecurity().getConfig();
    } catch (error) {
      logger.error('Browser security getConfig failed', { error: error instanceof Error ? error.message : String(error) });
      return {};
    }
  });

  ipcMain.handle('browser:security:updateConfig', async (_event, config: Record<string, unknown>) => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      getBrowserSecurity().updateConfig(config);
      return { success: true };
    } catch (error) {
      logger.error('Browser security updateConfig failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:security:getStats', async () => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      return getBrowserSecurity().getStats();
    } catch (error) {
      logger.error('Browser security getStats failed', { error: error instanceof Error ? error.message : String(error) });
      return { blockedRequests: 0, securityEvents: [] };
    }
  });

  ipcMain.handle('browser:security:getEvents', async (_event, limit?: number) => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      return getBrowserSecurity().getEvents(limit);
    } catch (error) {
      logger.error('Browser security getEvents failed', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  });

  ipcMain.handle('browser:security:checkUrl', async (_event, url: string) => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      return getBrowserSecurity().checkUrlSafety(url);
    } catch (error) {
      logger.error('Browser security checkUrl failed', { error: error instanceof Error ? error.message : String(error) });
      return { safe: false, reason: (error as Error).message };
    }
  });

  ipcMain.handle('browser:security:addToAllowList', async (_event, url: string) => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      getBrowserSecurity().addToAllowList(url);
      return { success: true };
    } catch (error) {
      logger.error('Browser security addToAllowList failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:security:removeFromAllowList', async (_event, url: string) => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      getBrowserSecurity().removeFromAllowList(url);
      return { success: true };
    } catch (error) {
      logger.error('Browser security removeFromAllowList failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:security:addToBlockList', async (_event, url: string) => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      getBrowserSecurity().addToBlockList(url);
      return { success: true };
    } catch (error) {
      logger.error('Browser security addToBlockList failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:security:removeFromBlockList', async (_event, url: string) => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      getBrowserSecurity().removeFromBlockList(url);
      return { success: true };
    } catch (error) {
      logger.error('Browser security removeFromBlockList failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:security:resetStats', async () => {
    try {
      const { getBrowserSecurity } = await import('../browser');
      getBrowserSecurity().resetStats();
      return { success: true };
    } catch (error) {
      logger.error('Browser security resetStats failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  // ==========================================================================
  // Browser Debugging (Console & Network)
  // ==========================================================================

  ipcMain.handle('browser:console:getLogs', async (_event, options?: {
    level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
    limit?: number;
    filter?: string;
  }) => {
    try {
      const { getConsoleLogs } = await import('../tools/implementations/browser/console');
      return { success: true, logs: getConsoleLogs(options) };
    } catch (error) {
      logger.error('Failed to get console logs', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, logs: [], error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:console:clear', async () => {
    try {
      const { clearConsoleLogs } = await import('../tools/implementations/browser/console');
      clearConsoleLogs();
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear console logs', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:network:getRequests', async (_event, options?: {
    type?: string;
    status?: string;
    limit?: number;
    urlPattern?: string;
  }) => {
    try {
      const { getNetworkRequests } = await import('../tools/implementations/browser/network');
      return { success: true, requests: getNetworkRequests(options) };
    } catch (error) {
      logger.error('Failed to get network requests', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, requests: [], error: (error as Error).message };
    }
  });

  ipcMain.handle('browser:network:clear', async () => {
    try {
      const { clearNetworkRequests } = await import('../tools/implementations/browser/network');
      clearNetworkRequests();
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear network requests', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
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
    try {
      const { getBrowserManager } = await import('../browser');
      const browser = getBrowserManager();
      browser.applyBehaviorSettings(settings);
      return { success: true };
    } catch (error) {
      logger.error('Failed to apply browser behavior settings', { error: error instanceof Error ? error.message : String(error) });
      return { success: false, error: (error as Error).message };
    }
  });
}
