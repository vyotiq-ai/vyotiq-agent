/**
 * Browser Hook
 * 
 * React hook for interacting with the embedded browser
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { BrowserState, BrowserBounds, NavigationResult, PageContent, ElementInfo } from './types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('useBrowser');

interface UseBrowserOptions {
  /** Auto-poll state every N milliseconds (0 to disable) */
  pollInterval?: number;
}

interface UseBrowserReturn {
  // State
  state: BrowserState;
  isAttached: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Navigation
  navigate: (url: string) => Promise<NavigationResult>;
  goBack: () => Promise<boolean>;
  goForward: () => Promise<boolean>;
  reload: () => Promise<void>;
  stop: () => void;
  
  // View Management
  attach: (bounds: BrowserBounds) => Promise<boolean>;
  detach: () => Promise<void>;
  setBounds: (bounds: BrowserBounds) => void;
  
  // Content
  extractContent: (options?: { includeHtml?: boolean; maxLength?: number }) => Promise<PageContent | null>;
  takeScreenshot: (options?: { fullPage?: boolean; selector?: string; format?: 'png' | 'jpeg' }) => Promise<string | null>;
  
  // Interaction
  click: (selector: string) => Promise<boolean>;
  type: (selector: string, text: string) => Promise<boolean>;
  hover: (selector: string) => Promise<boolean>;
  fill: (selector: string, value: string) => Promise<boolean>;
  scroll: (direction: 'up' | 'down' | 'top' | 'bottom', amount?: number) => Promise<void>;
  
  // Query
  queryElements: (selector: string, limit?: number) => Promise<ElementInfo[]>;
  waitForElement: (selector: string, timeout?: number) => Promise<boolean>;
  evaluate: <T = unknown>(script: string) => Promise<T | null>;
  
  // Security
  getSecurityStats: () => Promise<SecurityStats | null>;
  getSecurityEvents: (limit?: number) => Promise<SecurityEvent[]>;
  checkUrlSafety: (url: string) => Promise<UrlSafetyResult | null>;
  
  // Debugging
  getConsoleLogs: (options?: ConsoleLogOptions) => Promise<ConsoleLog[]>;
  clearConsoleLogs: () => Promise<void>;
  getNetworkRequests: (options?: NetworkRequestOptions) => Promise<NetworkRequestInfo[]>;
  clearNetworkRequests: () => Promise<void>;
  
  // Utils
  refreshState: () => Promise<void>;
  clearData: () => Promise<void>;
}

// Security types
interface SecurityStats {
  blockedUrls: number;
  blockedPopups: number;
  blockedAds: number;
  blockedTrackers: number;
  blockedDownloads: number;
  warnings: number;
}

interface SecurityEvent {
  type: 'blocked' | 'warning' | 'allowed';
  category: string;
  url: string;
  reason: string;
  timestamp: number;
}

// Debugging types
interface ConsoleLogOptions {
  level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
  limit?: number;
  filter?: string;
}

interface ConsoleLog {
  level: 'error' | 'warning' | 'info' | 'debug' | 'log';
  message: string;
  timestamp: number;
  source?: string;
  line?: number;
}

interface NetworkRequestOptions {
  type?: string;
  status?: string;
  limit?: number;
  urlPattern?: string;
}

interface NetworkRequestInfo {
  id: string;
  url: string;
  method: string;
  resourceType: string;
  status: number | null;
  statusText: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  size?: number;
  error?: string;
}

interface UrlSafetyResult {
  safe: boolean;
  warnings: string[];
  riskScore: number;
}

const DEFAULT_STATE: BrowserState = {
  id: '',
  url: '',
  title: 'New Tab',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
};

export function useBrowser(options: UseBrowserOptions = {}): UseBrowserReturn {
  const { pollInterval = 0 } = options;
  
  const [state, setState] = useState<BrowserState>(DEFAULT_STATE);
  const [isAttached, setIsAttached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refresh state from main process
  const refreshState = useCallback(async () => {
    try {
      const newState = await window.vyotiq.browser.state();
      setState(newState);
      setError(newState.error ?? null);
    } catch (err) {
      logger.error('Failed to refresh browser state', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // Setup real-time state change listener for instant UI updates
  useEffect(() => {
    // Subscribe to real-time browser state changes from main process
    const unsubscribe = window.vyotiq.browser.onStateChange((newState) => {
      setState(newState);
      setError(newState.error ?? null);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Setup polling as fallback (reduced frequency since we have real-time updates)
  useEffect(() => {
    if (pollInterval > 0 && isAttached) {
      // Use longer interval as fallback since real-time events handle most updates
      const fallbackInterval = Math.max(pollInterval, 3000);
      pollRef.current = setInterval(refreshState, fallbackInterval);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
        }
      };
    }
  }, [pollInterval, isAttached, refreshState]);

  // Navigation
  const navigate = useCallback(async (url: string): Promise<NavigationResult> => {
    setError(null);
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await window.vyotiq.browser.navigate(url);
      await refreshState();
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setState(prev => ({ ...prev, isLoading: false }));
      return { success: false, url, title: '', error: errorMsg };
    }
  }, [refreshState]);

  const goBack = useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.vyotiq.browser.back();
      await refreshState();
      return result;
    } catch (err) {
      logger.error('Go back failed', { error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, [refreshState]);

  const goForward = useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.vyotiq.browser.forward();
      await refreshState();
      return result;
    } catch (err) {
      logger.error('Go forward failed', { error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, [refreshState]);

  const reload = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await window.vyotiq.browser.reload();
      await refreshState();
    } catch (err) {
      logger.error('Reload failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, [refreshState]);

  const stop = useCallback((): void => {
    window.vyotiq.browser.stop();
    setState(prev => ({ ...prev, isLoading: false }));
  }, []);

  // View Management
  const attach = useCallback(async (bounds: BrowserBounds): Promise<boolean> => {
    try {
      const result = await window.vyotiq.browser.attach(bounds);
      if (result.success) {
        setIsAttached(true);
        await refreshState();
      } else {
        setError(result.error ?? 'Failed to attach browser');
      }
      return result.success;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      return false;
    }
  }, [refreshState]);

  const detach = useCallback(async (): Promise<void> => {
    try {
      await window.vyotiq.browser.detach();
      setIsAttached(false);
    } catch (err) {
      logger.error('Detach failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const setBounds = useCallback((bounds: BrowserBounds): void => {
    window.vyotiq.browser.setBounds(bounds);
  }, []);

  // Content Extraction
  const extractContent = useCallback(async (
    options?: { includeHtml?: boolean; maxLength?: number }
  ): Promise<PageContent | null> => {
    try {
      return await window.vyotiq.browser.extract(options);
    } catch (err) {
      logger.error('Extract content failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  const takeScreenshot = useCallback(async (
    options?: { fullPage?: boolean; selector?: string; format?: 'png' | 'jpeg' }
  ): Promise<string | null> => {
    try {
      return await window.vyotiq.browser.screenshot(options);
    } catch (err) {
      logger.error('Screenshot failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  // Interaction
  const click = useCallback(async (selector: string): Promise<boolean> => {
    try {
      return await window.vyotiq.browser.click(selector);
    } catch (err) {
      logger.error('Click failed', { selector, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, []);

  const type = useCallback(async (selector: string, text: string): Promise<boolean> => {
    try {
      return await window.vyotiq.browser.type(selector, text);
    } catch (err) {
      logger.error('Type failed', { selector, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, []);

  const hover = useCallback(async (selector: string): Promise<boolean> => {
    try {
      return await window.vyotiq.browser.hover(selector);
    } catch (err) {
      logger.error('Hover failed', { selector, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, []);

  const fill = useCallback(async (selector: string, value: string): Promise<boolean> => {
    try {
      return await window.vyotiq.browser.fill(selector, value);
    } catch (err) {
      logger.error('Fill failed', { selector, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, []);

  const scroll = useCallback(async (
    direction: 'up' | 'down' | 'top' | 'bottom',
    amount?: number
  ): Promise<void> => {
    try {
      await window.vyotiq.browser.scroll(direction, amount);
    } catch (err) {
      logger.error('Scroll failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // Query
  const queryElements = useCallback(async (selector: string, limit?: number): Promise<ElementInfo[]> => {
    try {
      return await window.vyotiq.browser.query(selector, limit);
    } catch (err) {
      logger.error('Query elements failed', { selector, limit, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }, []);

  const waitForElement = useCallback(async (selector: string, timeout?: number): Promise<boolean> => {
    try {
      return await window.vyotiq.browser.waitForElement(selector, timeout);
    } catch (err) {
      logger.error('Wait for element failed', { selector, timeout, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }, []);

  const evaluate = useCallback(async <T = unknown>(script: string): Promise<T | null> => {
    try {
      return await window.vyotiq.browser.evaluate<T>(script);
    } catch (err) {
      logger.error('Evaluate failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  // Utils
  const clearData = useCallback(async (): Promise<void> => {
    try {
      await window.vyotiq.browser.clearData();
    } catch (err) {
      logger.error('Clear data failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // Security
  const getSecurityStats = useCallback(async (): Promise<SecurityStats | null> => {
    try {
      return await window.vyotiq.browser.security.getStats();
    } catch (err) {
      logger.error('Get security stats failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  const getSecurityEvents = useCallback(async (limit?: number): Promise<SecurityEvent[]> => {
    try {
      return await window.vyotiq.browser.security.getEvents(limit);
    } catch (err) {
      logger.error('Get security events failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }, []);

  const checkUrlSafety = useCallback(async (url: string): Promise<UrlSafetyResult | null> => {
    try {
      return await window.vyotiq.browser.security.checkUrl(url);
    } catch (err) {
      logger.error('Check URL safety failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }, []);

  // Debugging
  const getConsoleLogs = useCallback(async (options?: ConsoleLogOptions): Promise<ConsoleLog[]> => {
    try {
      const result = await window.vyotiq.browser.console.getLogs(options);
      return result.success ? result.logs : [];
    } catch (err) {
      logger.error('Get console logs failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }, []);

  const clearConsoleLogs = useCallback(async (): Promise<void> => {
    try {
      await window.vyotiq.browser.console.clear();
    } catch (err) {
      logger.error('Clear console logs failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const getNetworkRequests = useCallback(async (options?: NetworkRequestOptions): Promise<NetworkRequestInfo[]> => {
    try {
      const result = await window.vyotiq.browser.network.getRequests(options);
      return result.success ? result.requests : [];
    } catch (err) {
      logger.error('Get network requests failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }, []);

  const clearNetworkRequests = useCallback(async (): Promise<void> => {
    try {
      await window.vyotiq.browser.network.clear();
    } catch (err) {
      logger.error('Clear network requests failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  return {
    // State
    state,
    isAttached,
    isLoading: state.isLoading,
    error,
    
    // Navigation
    navigate,
    goBack,
    goForward,
    reload,
    stop,
    
    // View Management
    attach,
    detach,
    setBounds,
    
    // Content
    extractContent,
    takeScreenshot,
    
    // Interaction
    click,
    type,
    hover,
    fill,
    scroll,
    
    // Query
    queryElements,
    waitForElement,
    evaluate,
    
    // Security
    getSecurityStats,
    getSecurityEvents,
    checkUrlSafety,
    
    // Debugging
    getConsoleLogs,
    clearConsoleLogs,
    getNetworkRequests,
    clearNetworkRequests,
    
    // Utils
    refreshState,
    clearData,
  };
}
