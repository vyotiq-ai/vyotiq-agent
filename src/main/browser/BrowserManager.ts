/**
 * Browser Manager
 * 
 * Manages embedded browser instances using Electron's BrowserView
 * Provides navigation, content extraction, and screenshot capabilities for the AI agent
 */
import { BrowserView, BrowserWindow, session, WebContents } from 'electron';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../logger';
import { getBrowserSecurity, initBrowserSecurity } from './BrowserSecurity';

const logger = createLogger('BrowserManager');

// =============================================================================
// Types
// =============================================================================

export interface BrowserState {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
}

export interface PageContent {
  url: string;
  title: string;
  /** Plain text content extracted from the page */
  text: string;
  /** HTML content of the page */
  html?: string;
  /** Metadata extracted from the page */
  metadata: PageMetadata;
  /** Links found on the page */
  links: PageLink[];
  /** Images found on the page */
  images: PageImage[];
}

export interface PageMetadata {
  description?: string;
  keywords?: string[];
  author?: string;
  publishedDate?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export interface PageLink {
  text: string;
  href: string;
  isExternal: boolean;
}

export interface PageImage {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  selector?: string;
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface NavigationResult {
  success: boolean;
  url: string;
  title: string;
  error?: string;
  loadTime?: number;
}

export interface ElementInfo {
  tag: string;
  id?: string;
  className?: string;
  text?: string;
  attributes: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
}

export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// =============================================================================
// Browser Manager Class
// =============================================================================

// Browser settings interface (subset of shared BrowserSettings applicable to BrowserManager)
export interface BrowserBehaviorSettings {
  navigationTimeout?: number;
  maxContentLength?: number;
  customUserAgent?: string;
  enableJavaScript?: boolean;
  enableCookies?: boolean;
  clearDataOnExit?: boolean;
}

export class BrowserManager extends EventEmitter {
  private browserView: BrowserView | null = null;
  private mainWindow: BrowserWindow | null = null;
  private currentState: BrowserState;
  private isAttached = false;
  private bounds: BrowserViewBounds = { x: 0, y: 0, width: 800, height: 600 };
  private navigationTimeout = 30000;
  private maxContentLength = 100000;
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  private enableJavaScript = true;
  private enableCookies = true;
  private clearDataOnExit = false;
  private securityInitialized = false;

  constructor() {
    super();
    this.currentState = {
      id: randomUUID(),
      url: '',
      title: 'New Tab',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    };
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the browser manager with the main window
   */
  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    logger.info('BrowserManager initialized');
  }

  /**
   * Apply browser behavior settings
   */
  applyBehaviorSettings(settings: BrowserBehaviorSettings): void {
    if (settings.navigationTimeout !== undefined) {
      this.navigationTimeout = settings.navigationTimeout;
    }
    if (settings.maxContentLength !== undefined) {
      this.maxContentLength = settings.maxContentLength;
    }
    if (settings.customUserAgent !== undefined && settings.customUserAgent.trim()) {
      this.userAgent = settings.customUserAgent;
      if (this.browserView) {
        this.browserView.webContents.setUserAgent(this.userAgent);
      }
    }
    if (settings.enableJavaScript !== undefined) {
      this.enableJavaScript = settings.enableJavaScript;
    }
    if (settings.enableCookies !== undefined) {
      this.enableCookies = settings.enableCookies;
    }
    if (settings.clearDataOnExit !== undefined) {
      this.clearDataOnExit = settings.clearDataOnExit;
    }
    logger.info('Browser behavior settings applied', {
      navigationTimeout: this.navigationTimeout,
      maxContentLength: this.maxContentLength,
      enableJavaScript: this.enableJavaScript,
      enableCookies: this.enableCookies,
      clearDataOnExit: this.clearDataOnExit,
    });
  }

  /**
   * Get whether to clear data on exit
   */
  shouldClearDataOnExit(): boolean {
    return this.clearDataOnExit;
  }

  /**
   * Create and attach the browser view to the main window
   */
  private ensureBrowserView(): BrowserView {
    if (this.browserView) {
      return this.browserView;
    }

    if (!this.mainWindow) {
      throw new Error('BrowserManager not initialized - main window not set');
    }

    // Create browser view with custom session for isolation
    const browserSession = session.fromPartition('persist:agent-browser', { cache: true });
    
    // Apply cookie settings to session
    if (!this.enableCookies) {
      browserSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
        if (!removed && !this.enableCookies) {
          browserSession.cookies.remove(cookie.domain + cookie.path, cookie.name).catch((err) => {
            // Cookie removal may fail for various reasons (already removed, invalid domain, etc.)
            // This is non-critical cleanup, so we just log at debug level
            logger.debug('Cookie removal failed (non-critical)', { 
              domain: cookie.domain, 
              name: cookie.name,
              error: err instanceof Error ? err.message : String(err)
            });
          });
        }
      });
    }
    
    this.browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // Sandbox can trigger a renderer bootstrap failure in some environments.
        // We keep Node disabled + isolation enabled either way.
        sandbox: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        session: browserSession,
        javascript: this.enableJavaScript,
      },
    });
    
    // Set a transparent background to allow the page content to show
    this.browserView.setBackgroundColor('#00000000');

    // Set user agent
    this.browserView.webContents.setUserAgent(this.userAgent);

    // Setup event handlers
    this.setupEventHandlers(this.browserView.webContents);

    // Setup popup blocking using existing security instance
    // The security singleton handles its own initialization state,
    // so calling initialize() here is safe and idempotent
    const security = getBrowserSecurity();
    security.initialize();
    security.setupPopupBlocking(this.browserView.webContents);
    this.securityInitialized = true;

    logger.info('BrowserView created with security features', {
      enableJavaScript: this.enableJavaScript,
      navigationTimeout: this.navigationTimeout,
    });
    return this.browserView;
  }

  /**
   * Setup event handlers for the browser view
   */
  private setupEventHandlers(webContents: WebContents): void {
    webContents.on('did-start-loading', () => {
      this.updateState({ isLoading: true });
    });

    webContents.on('did-stop-loading', () => {
      this.updateState({ isLoading: false });
    });

    webContents.on('did-navigate', (_event, url) => {
      this.updateState({
        url,
        canGoBack: webContents.navigationHistory.canGoBack(),
        canGoForward: webContents.navigationHistory.canGoForward(),
      });
    });

    webContents.on('did-navigate-in-page', (_event, url) => {
      this.updateState({ url });
    });

    webContents.on('page-title-updated', (_event, title) => {
      this.updateState({ title });
    });

    webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // Only handle main frame failures, ignore sub-frame/resource failures
      // Also ignore ERR_ABORTED (-3) which occurs when navigation is replaced or cancelled
      if (!isMainFrame || errorCode === -3) {
        logger.debug('Ignoring non-critical load failure', { 
          errorCode, 
          errorDescription, 
          url: validatedURL, 
          isMainFrame 
        });
        return;
      }
      
      this.updateState({
        isLoading: false,
        error: `Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`,
      });
      logger.error('Page load failed', { errorCode, errorDescription, url: validatedURL });
    });

    // Handle new window requests - open in the same view
    webContents.setWindowOpenHandler(({ url }) => {
      this.navigate(url);
      return { action: 'deny' };
    });

    // Track network requests for debugging tools
    this.setupNetworkTracking(webContents);

    // Handle console messages for debugging
    // Emit event for external capture (browser console tool listens to this)
    // Using new Event object API (Electron 31+)
    webContents.on('console-message', (event) => {
      const { level, message, lineNumber, sourceId } = event;
      
      // Emit event for external capture
      this.emit('console-message', {
        level,
        message,
        source: sourceId,
        line: lineNumber,
        timestamp: Date.now(),
      });
      
      // Also log warnings and errors to main process logger
      if (level === 'warning' || level === 'error') {
        logger.warn('Browser console', { level, message: message.slice(0, 500) });
      }
    });
  }

  /**
   * Setup network request tracking for the browser session
   * 
   * NOTE: This method no longer sets up onBeforeRequest because that would
   * overwrite the security interceptor from BrowserSecurity. The security
   * interceptor handles both ad blocking AND network tracking now.
   * 
   * This method only sets up response tracking (onHeadersReceived, onCompleted, onErrorOccurred)
   * which don't conflict with the security interceptor.
   */
  private setupNetworkTracking(webContents: WebContents): void {
    // Import the network tracking functions dynamically to avoid circular dependencies
    import('../tools/implementations/browser/network').then(({ addNetworkRequest, updateNetworkRequest }) => {
      const browserSession = webContents.session;

      // NOTE: onBeforeRequest is handled by BrowserSecurity.setupRequestInterceptor()
      // We register a listener on the security events to track requests instead
      const security = getBrowserSecurity();
      
      // Listen for security events to track blocked requests
      security.on('security-event', (event: { type: string; category: string; url: string }) => {
        if (event.type === 'blocked') {
          // Track blocked requests
          const id = `blocked-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          addNetworkRequest({
            id,
            url: event.url,
            method: 'GET',
            resourceType: event.category,
            status: 0,
            statusText: 'Blocked',
            startTime: Date.now(),
          });
          updateNetworkRequest(id, {
            endTime: Date.now(),
            error: `Blocked: ${event.category}`,
          });
        }
      });
      
      // For non-blocked requests, we need to track them via the security interceptor
      // The security interceptor will emit events for allowed requests
      security.on('request-allowed', (details: { id: string; url: string; method: string; resourceType: string }) => {
        addNetworkRequest({
          id: details.id,
          url: details.url,
          method: details.method,
          resourceType: details.resourceType,
          status: null,
          statusText: '',
          startTime: Date.now(),
        });
        
        // Emit event for real-time monitoring
        this.emit('network-request', {
          id: details.id,
          url: details.url,
          method: details.method,
          resourceType: details.resourceType,
        });
      });

      // Track response headers to get status codes
      browserSession.webRequest.onHeadersReceived((details, callback) => {
        // Convert response headers to simple string record (using first value of each header array)
        const headers: Record<string, string> | undefined = details.responseHeaders
          ? Object.fromEntries(
              Object.entries(details.responseHeaders).map(([key, values]) => [key, values[0] || ''])
            )
          : undefined;
        
        updateNetworkRequest(details.id.toString(), {
          status: details.statusCode,
          statusText: details.statusLine?.split(' ').slice(1).join(' ') || '',
          responseHeaders: headers,
        });

        callback({ cancel: false });
      });

      // Track completed requests
      browserSession.webRequest.onCompleted((details) => {
        updateNetworkRequest(details.id.toString(), {
          endTime: Date.now(),
          status: details.statusCode,
        });
      });

      // Track errors
      browserSession.webRequest.onErrorOccurred((details) => {
        updateNetworkRequest(details.id.toString(), {
          endTime: Date.now(),
          error: details.error,
        });
      });

      logger.debug('Network request tracking enabled');
    }).catch((err) => {
      logger.warn('Failed to setup network tracking', { error: err instanceof Error ? err.message : String(err) });
    });
  }

  /**
   * Update internal state and emit event
   */
  private updateState(partial: Partial<BrowserState>): void {
    this.currentState = { ...this.currentState, ...partial, error: partial.error };
    this.emit('state-changed', this.currentState);
  }

  // ===========================================================================
  // View Management
  // ===========================================================================

  /**
   * Attach browser view to the main window at specified bounds
   */
  attach(bounds: BrowserViewBounds): void {
    if (!this.mainWindow) {
      throw new Error('BrowserManager not initialized');
    }

    const view = this.ensureBrowserView();
    this.bounds = bounds;
    
    if (!this.isAttached) {
      this.mainWindow.addBrowserView(view);
      this.isAttached = true;
      logger.info('BrowserView added to window');
    }
    
    // Ensure bounds are valid (positive dimensions)
    const validBounds = {
      x: Math.max(0, bounds.x),
      y: Math.max(0, bounds.y),
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    };
    
    view.setBounds(validBounds);
    view.setAutoResize({ width: false, height: false });
    
    // Bring the BrowserView to the top to ensure it's visible
    if (this.mainWindow.setTopBrowserView) {
      this.mainWindow.setTopBrowserView(view);
    }
    
    logger.info('BrowserView attached', { 
      requestedBounds: bounds, 
      appliedBounds: validBounds,
      windowBounds: this.mainWindow.getBounds(),
      contentBounds: this.mainWindow.getContentBounds(),
    });
    this.emit('attached', validBounds);
  }

  /**
   * Detach browser view from the main window
   */
  detach(): void {
    if (this.mainWindow && this.browserView && this.isAttached) {
      this.mainWindow.removeBrowserView(this.browserView);
      this.isAttached = false;
      logger.info('BrowserView detached');
      this.emit('detached');
    }
  }

  /**
   * Update the bounds of the browser view
   */
  setBounds(bounds: BrowserViewBounds): void {
    this.bounds = bounds;
    if (this.browserView && this.isAttached) {
      this.browserView.setBounds(bounds);
    }
  }

  /**
   * Get current bounds
   */
  getBounds(): BrowserViewBounds {
    return this.bounds;
  }

  /**
   * Check if browser view is attached
   */
  isViewAttached(): boolean {
    return this.isAttached;
  }

  // ===========================================================================
  // Navigation
  // ===========================================================================

  /**
   * Navigate to a URL with improved error handling and retry logic
   */
  async navigate(url: string, options?: { retries?: number; timeout?: number }): Promise<NavigationResult> {
    const view = this.ensureBrowserView();
    const startTime = Date.now();
    const maxRetries = options?.retries ?? 1;
    const timeout = options?.timeout ?? this.navigationTimeout;

    // Normalize URL
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
      url = 'https://' + url;
    }

    // Security check before navigation
    const security = getBrowserSecurity();
    const safetyCheck = security.checkUrlSafety(url);
    if (!safetyCheck.safe) {
      const errorMessage = `Blocked navigation to potentially dangerous URL: ${safetyCheck.warnings.join(', ')}`;
      logger.warn('Navigation blocked by security', { url, warnings: safetyCheck.warnings, riskScore: safetyCheck.riskScore });
      this.updateState({ error: errorMessage });
      return {
        success: false,
        url,
        title: '',
        error: errorMessage,
      };
    }

    // Log warnings for elevated risk URLs
    if (safetyCheck.warnings.length > 0) {
      logger.warn('Navigation with warnings', { url, warnings: safetyCheck.warnings, riskScore: safetyCheck.riskScore });
    }

    logger.info('Navigating to URL', { url, riskScore: safetyCheck.riskScore, timeout });
    this.updateState({ error: undefined });

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            const onDidFinishLoad = () => {
              cleanup();
              resolve();
            };
            const onDidFailLoad = (
              _event: Electron.Event, 
              errorCode: number, 
              errorDescription: string, 
              _validatedURL: string,
              isMainFrame: boolean
            ) => {
              // Only fail on main frame errors, ignore sub-frame/resource failures
              // Also ignore ERR_ABORTED (-3) which occurs when navigation is replaced or cancelled
              if (!isMainFrame || errorCode === -3) {
                return; // Don't cleanup or reject - let navigation continue
              }
              cleanup();
              // Categorize the error for better handling
              const error = this.categorizeNavigationError(errorCode, errorDescription, url);
              reject(error);
            };
            const cleanup = () => {
              view.webContents.removeListener('did-finish-load', onDidFinishLoad);
              view.webContents.removeListener('did-fail-load', onDidFailLoad);
            };
            view.webContents.on('did-finish-load', onDidFinishLoad);
            view.webContents.on('did-fail-load', onDidFailLoad);
            view.webContents.loadURL(url);
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Navigation timeout after ${timeout}ms - the page took too long to respond`)), timeout)
          ),
        ]);

        const loadTime = Date.now() - startTime;
        const title = view.webContents.getTitle();
        const finalUrl = view.webContents.getURL();

        logger.info('Navigation successful', { url: finalUrl, title, loadTime, attempt });

        return {
          success: true,
          url: finalUrl,
          title,
          loadTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable
        const isRetryable = this.isRetryableNavigationError(lastError);
        
        if (isRetryable && attempt < maxRetries) {
          logger.warn('Navigation failed, retrying', { 
            url, 
            error: lastError.message, 
            attempt, 
            maxRetries,
            nextAttemptIn: 1000 
          });
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        
        // Don't retry - break out of loop
        break;
      }
    }

    const errorMessage = lastError?.message || 'Unknown navigation error';
    logger.error('Navigation failed', { url, error: errorMessage, attempts: maxRetries });
    this.updateState({ error: errorMessage });
    
    return {
      success: false,
      url,
      title: '',
      error: errorMessage,
    };
  }

  /**
   * Categorize navigation errors for better user feedback
   */
  private categorizeNavigationError(errorCode: number, errorDescription: string, url: string): Error {
    // DNS resolution errors
    if (errorCode === -105 || errorDescription.includes('ERR_NAME_NOT_RESOLVED')) {
      return new Error(`Could not find the site "${new URL(url).hostname}" - please check the URL is correct`);
    }
    
    // Connection errors
    if (errorCode === -106 || errorDescription.includes('ERR_INTERNET_DISCONNECTED')) {
      return new Error('No internet connection - please check your network');
    }
    
    if (errorCode === -7 || errorDescription.includes('ERR_TIMED_OUT')) {
      return new Error(`Connection timed out - the site may be slow or unavailable`);
    }
    
    // SSL/TLS errors
    if (errorCode === -200 || errorDescription.includes('ERR_CERT')) {
      return new Error(`Security certificate error - the site's certificate may be invalid or expired`);
    }
    
    // Blocked responses (e.g., CORS, CSP)
    if (errorCode === -21 || errorDescription.includes('ERR_BLOCKED')) {
      return new Error(`Request was blocked - the site may have restricted access`);
    }
    
    // Connection refused
    if (errorCode === -102 || errorDescription.includes('ERR_CONNECTION_REFUSED')) {
      return new Error(`Connection refused - the site may be down or blocking connections`);
    }
    
    // Default: return original error with code
    return new Error(`${errorDescription} (code: ${errorCode})`);
  }

  /**
   * Determine if a navigation error is retryable
   */
  private isRetryableNavigationError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Retry on timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }
    
    // Retry on temporary network issues
    if (message.includes('temporary') || message.includes('connection reset')) {
      return true;
    }
    
    // Don't retry DNS errors - URL is likely wrong
    if (message.includes('could not find') || message.includes('name_not_resolved')) {
      return false;
    }
    
    // Don't retry SSL errors - certificate issue won't resolve itself
    if (message.includes('certificate') || message.includes('cert')) {
      return false;
    }
    
    // Don't retry blocked requests - policy won't change
    if (message.includes('blocked')) {
      return false;
    }
    
    // Default: don't retry unknown errors
    return false;
  }

  /**
   * Navigate back
   */
  async goBack(): Promise<boolean> {
    const view = this.ensureBrowserView();
    if (view.webContents.navigationHistory.canGoBack()) {
      view.webContents.navigationHistory.goBack();
      return true;
    }
    return false;
  }

  /**
   * Navigate forward
   */
  async goForward(): Promise<boolean> {
    const view = this.ensureBrowserView();
    if (view.webContents.navigationHistory.canGoForward()) {
      view.webContents.navigationHistory.goForward();
      return true;
    }
    return false;
  }

  /**
   * Reload the current page
   */
  async reload(): Promise<void> {
    const view = this.ensureBrowserView();
    view.webContents.reload();
  }

  /**
   * Stop loading
   */
  stop(): void {
    if (this.browserView) {
      this.browserView.webContents.stop();
    }
  }

  // ===========================================================================
  // Content Extraction
  // ===========================================================================

  /**
   * Extract content from the current page
   */
  async extractContent(options?: { includeHtml?: boolean; maxLength?: number }): Promise<PageContent> {
    const view = this.ensureBrowserView();
    // Use provided maxLength or fall back to stored setting
    const maxLength = options?.maxLength ?? this.maxContentLength;

    const result = await view.webContents.executeJavaScript(`
      (function() {
        // Extract text content
        const getText = (element) => {
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (node) => {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName.toLowerCase();
                if (['script', 'style', 'noscript', 'svg'].includes(tag)) {
                  return NodeFilter.FILTER_REJECT;
                }
                if (node.textContent.trim()) {
                  return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
              }
            }
          );
          const texts = [];
          while (walker.nextNode()) {
            const text = walker.currentNode.textContent.trim();
            if (text) texts.push(text);
          }
          return texts.join(' ').replace(/\\s+/g, ' ').trim();
        };

        // Extract metadata
        const getMeta = (name) => {
          const el = document.querySelector('meta[name="' + name + '"], meta[property="' + name + '"]');
          return el ? el.getAttribute('content') : null;
        };

        // Extract links
        const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 100).map(a => ({
          text: (a.textContent || '').trim().slice(0, 100),
          href: a.href,
          isExternal: a.hostname !== window.location.hostname
        })).filter(l => l.href && l.text);

        // Extract images
        const images = Array.from(document.querySelectorAll('img[src]')).slice(0, 50).map(img => ({
          src: img.src,
          alt: img.alt || null,
          width: img.naturalWidth || null,
          height: img.naturalHeight || null
        })).filter(i => i.src);

        // Get main content area (heuristic)
        const mainContent = document.querySelector('main, article, [role="main"], .content, #content, .main')
          || document.body;

        return {
          url: window.location.href,
          title: document.title,
          text: getText(mainContent).slice(0, ${maxLength}),
          metadata: {
            description: getMeta('description'),
            keywords: getMeta('keywords') ? getMeta('keywords').split(',').map(k => k.trim()) : null,
            author: getMeta('author'),
            publishedDate: getMeta('article:published_time') || getMeta('datePublished'),
            ogTitle: getMeta('og:title'),
            ogDescription: getMeta('og:description'),
            ogImage: getMeta('og:image')
          },
          links: links,
          images: images
        };
      })()
    `);

    // Optionally include HTML
    if (options?.includeHtml) {
      const html = await view.webContents.executeJavaScript(
        'document.documentElement.outerHTML.slice(0, ' + maxLength + ')'
      );
      result.html = html;
    }

    return result;
  }

  /**
   * Extract text content from a specific selector
   */
  async extractText(selector?: string): Promise<string> {
    const view = this.ensureBrowserView();
    
    const script = selector
      ? `(document.querySelector('${selector.replace(/'/g, "\\'")}') || {}).textContent || ''`
      : `document.body.innerText`;
    
    const text = await view.webContents.executeJavaScript(script);
    return (text || '').trim();
  }

  /**
   * Query elements matching a selector
   */
  async queryElements(selector: string, limit = 20): Promise<ElementInfo[]> {
    const view = this.ensureBrowserView();

    return await view.webContents.executeJavaScript(`
      (function() {
        const elements = document.querySelectorAll('${selector.replace(/'/g, "\\'")}');
        return Array.from(elements).slice(0, ${limit}).map(el => {
          const rect = el.getBoundingClientRect();
          const attrs = {};
          for (const attr of el.attributes) {
            attrs[attr.name] = attr.value.slice(0, 200);
          }
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            className: el.className || null,
            text: (el.textContent || '').trim().slice(0, 200),
            attributes: attrs,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          };
        });
      })()
    `);
  }

  // ===========================================================================
  // Screenshots
  // ===========================================================================

  /**
   * Take a screenshot of the current page
   * 
   * @param options Screenshot options
   * @param timeoutMs Maximum time to wait (default 30 seconds)
   * @param signal Optional abort signal for cancellation
   * @throws Error if screenshot times out, fails, or is cancelled
   */
  async screenshot(options?: ScreenshotOptions, timeoutMs = 30000, signal?: AbortSignal): Promise<string> {
    const view = this.ensureBrowserView();

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('Screenshot cancelled');
    }

    // Wrap the entire screenshot operation with a timeout
    const screenshotPromise = this.captureScreenshot(view, options);
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(
          `Screenshot timeout after ${timeoutMs / 1000}s. ` +
          (options?.fullPage 
            ? 'Full page screenshots on large pages can take too long. Try a viewport screenshot instead.'
            : 'The page may be unresponsive.')
        ));
      }, timeoutMs);
    });
    
    // Create abort promise if signal provided
    const abortPromise = signal 
      ? new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('Screenshot cancelled'));
          }, { once: true });
        })
      : new Promise<never>(() => {
          // Intentionally never resolves (used to keep Promise.race pending)
          void 0;
        });

    return Promise.race([screenshotPromise, timeoutPromise, abortPromise]);
  }

  /**
   * Internal method to capture screenshot without timeout
   */
  private async captureScreenshot(view: BrowserView, options?: ScreenshotOptions): Promise<string> {
    if (options?.selector) {
      // Screenshot specific element
      const rect = await view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector('${options.selector.replace(/'/g, "\\'")}');
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
        })()
      `);

      if (!rect) {
        throw new Error(`Element not found: ${options.selector}`);
      }

      const image = await view.webContents.capturePage(rect);
      return options?.format === 'jpeg'
        ? image.toJPEG(options?.quality ?? 80).toString('base64')
        : image.toPNG().toString('base64');
    }

    if (options?.fullPage) {
      // Get full page dimensions and scroll to capture
      const dimensions = await view.webContents.executeJavaScript(`
        ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight })
      `);
      
      // Limit max height to prevent memory issues and long operations
      // Max 8000px height for full page (was 16000 - too large for complex pages)
      const maxHeight = 8000;
      const captureHeight = Math.min(dimensions.height, maxHeight);
      
      if (dimensions.height > maxHeight) {
        logger.warn('Full page screenshot limited due to page size', {
          pageHeight: dimensions.height,
          capturedHeight: captureHeight,
        });
      }
      
      // Temporarily resize for full page capture
      const originalBounds = view.getBounds();
      view.setBounds({ ...originalBounds, height: captureHeight });
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for resize
      
      const image = await view.webContents.capturePage();
      view.setBounds(originalBounds);
      
      return options?.format === 'jpeg'
        ? image.toJPEG(options?.quality ?? 80).toString('base64')
        : image.toPNG().toString('base64');
    }

    // Regular viewport screenshot
    const image = await view.webContents.capturePage();
    return options?.format === 'jpeg'
      ? image.toJPEG(options?.quality ?? 80).toString('base64')
      : image.toPNG().toString('base64');
  }

  // ===========================================================================
  // Interaction
  // ===========================================================================

  /**
   * Click on an element
   */
  async click(selector: string): Promise<boolean> {
    const view = this.ensureBrowserView();

    return await view.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return false;
        el.click();
        return true;
      })()
    `);
  }

  /**
   * Type text into an input
   */
  async type(selector: string, text: string): Promise<boolean> {
    const view = this.ensureBrowserView();

    return await view.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return false;
        el.focus();
        el.value = '${text.replace(/'/g, "\\'")}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `);
  }

  /**
   * Scroll the page
   */
  async scroll(direction: 'up' | 'down' | 'top' | 'bottom', amount?: number): Promise<void> {
    const view = this.ensureBrowserView();
    const scrollAmount = amount ?? 500;

    const script = {
      up: `window.scrollBy(0, -${scrollAmount})`,
      down: `window.scrollBy(0, ${scrollAmount})`,
      top: `window.scrollTo(0, 0)`,
      bottom: `window.scrollTo(0, document.body.scrollHeight)`,
    }[direction];

    await view.webContents.executeJavaScript(script);
  }

  /**
   * Execute custom JavaScript
   */
  async evaluate<T>(script: string): Promise<T> {
    const view = this.ensureBrowserView();
    return await view.webContents.executeJavaScript(script);
  }

  /**
   * Hover over an element
   */
  async hover(selector: string): Promise<boolean> {
    const view = this.ensureBrowserView();

    return await view.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return false;
        
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        // Dispatch mouse events in sequence
        el.dispatchEvent(new MouseEvent('mouseenter', {
          bubbles: true,
          clientX: x,
          clientY: y,
          view: window
        }));
        el.dispatchEvent(new MouseEvent('mouseover', {
          bubbles: true,
          clientX: x,
          clientY: y,
          view: window
        }));
        el.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          clientX: x,
          clientY: y,
          view: window
        }));
        return true;
      })()
    `);
  }

  /**
   * Fill a form input by selector
   */
  async fill(selector: string, value: string): Promise<boolean> {
    const view = this.ensureBrowserView();

    return await view.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return false;
        
        // Focus the element
        el.focus();
        
        // Clear existing value
        el.value = '';
        
        // Set new value
        el.value = '${value.replace(/'/g, "\\'")}';
        
        // Dispatch input events
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        
        return true;
      })()
    `);
  }

  /**
   * Wait for an element to appear
   */
  async waitForElement(selector: string, timeout = 10000): Promise<boolean> {
    const view = this.ensureBrowserView();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const exists = await view.webContents.executeJavaScript(
        `!!document.querySelector('${selector.replace(/'/g, "\\'")}')`
      );
      if (exists) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  }

  // ===========================================================================
  // State & Utilities
  // ===========================================================================

  /**
   * Get current browser state
   */
  getState(): BrowserState {
    return { ...this.currentState };
  }

  /**
   * Get current URL
   */
  getUrl(): string {
    return this.browserView?.webContents.getURL() ?? '';
  }

  /**
   * Get page title
   */
  getTitle(): string {
    return this.browserView?.webContents.getTitle() ?? '';
  }

  /**
   * Check if loading
   */
  isLoading(): boolean {
    return this.browserView?.webContents.isLoading() ?? false;
  }

  /**
   * Set navigation timeout
   */
  setNavigationTimeout(timeout: number): void {
    this.navigationTimeout = timeout;
  }

  /**
   * Set custom user agent
   */
  setUserAgent(userAgent: string): void {
    this.userAgent = userAgent;
    if (this.browserView) {
      this.browserView.webContents.setUserAgent(userAgent);
    }
  }

  /**
   * Clear browsing data
   */
  async clearData(): Promise<void> {
    const browserSession = session.fromPartition('persist:agent-browser');
    await browserSession.clearCache();
    await browserSession.clearStorageData();
    logger.info('Browser data cleared');
  }

  /**
   * Cleanup and destroy the browser view
   */
  destroy(): void {
    this.detach();
    if (this.browserView) {
      // Destroy webContents to free memory
      (this.browserView.webContents as unknown as { destroy: () => void }).destroy?.();
      this.browserView = null;
    }
    this.removeAllListeners();
    logger.info('BrowserManager destroyed');
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let browserManagerInstance: BrowserManager | null = null;

/**
 * Get the singleton browser manager instance
 */
export function getBrowserManager(): BrowserManager {
  if (!browserManagerInstance) {
    browserManagerInstance = new BrowserManager();
  }
  return browserManagerInstance;
}

/**
 * Full browser settings interface matching shared/types BrowserSettings
 */
export interface FullBrowserSettings {
  // Security settings
  urlFilteringEnabled?: boolean;
  popupBlockingEnabled?: boolean;
  adBlockingEnabled?: boolean;
  trackerBlockingEnabled?: boolean;
  downloadProtectionEnabled?: boolean;
  blockMixedContent?: boolean;
  allowList?: string[];
  customBlockList?: string[];
  trustedLocalhostPorts?: number[];
  // Behavior settings
  navigationTimeout?: number;
  maxContentLength?: number;
  customUserAgent?: string;
  enableJavaScript?: boolean;
  enableCookies?: boolean;
  clearDataOnExit?: boolean;
}

/**
 * Initialize the browser manager with the main window
 * @param mainWindow - The main Electron window
 * @param browserSettings - Optional browser settings to apply (all settings)
 */
export function initBrowserManager(mainWindow: BrowserWindow, browserSettings?: FullBrowserSettings): BrowserManager {
  const manager = getBrowserManager();
  manager.init(mainWindow);
  
  // Always initialize security (with settings if provided, otherwise with defaults)
  if (browserSettings) {
    // Apply security settings to BrowserSecurity
    initBrowserSecurity({
      urlFilteringEnabled: browserSettings.urlFilteringEnabled,
      popupBlockingEnabled: browserSettings.popupBlockingEnabled,
      adBlockingEnabled: browserSettings.adBlockingEnabled,
      trackerBlockingEnabled: browserSettings.trackerBlockingEnabled,
      downloadProtectionEnabled: browserSettings.downloadProtectionEnabled,
      blockMixedContent: browserSettings.blockMixedContent,
      allowList: browserSettings.allowList,
      customBlockList: browserSettings.customBlockList,
      trustedLocalhostPorts: browserSettings.trustedLocalhostPorts,
    });
    logger.info('Browser security initialized with custom settings', { 
      urlFilteringEnabled: browserSettings.urlFilteringEnabled,
      popupBlockingEnabled: browserSettings.popupBlockingEnabled,
      adBlockingEnabled: browserSettings.adBlockingEnabled,
      trackerBlockingEnabled: browserSettings.trackerBlockingEnabled,
    });
    
    // Apply behavior settings to BrowserManager
    manager.applyBehaviorSettings({
      navigationTimeout: browserSettings.navigationTimeout,
      maxContentLength: browserSettings.maxContentLength,
      customUserAgent: browserSettings.customUserAgent,
      enableJavaScript: browserSettings.enableJavaScript,
      enableCookies: browserSettings.enableCookies,
      clearDataOnExit: browserSettings.clearDataOnExit,
    });
  }
  
  // Setup console listener for debugging tools
  // Deferred import to avoid circular dependencies
  import('../tools/implementations/browser/console').then(({ setupConsoleListener }) => {
    setupConsoleListener();
    logger.debug('Browser console listener initialized');
  }).catch((err) => {
    logger.warn('Failed to setup console listener', { error: err instanceof Error ? err.message : String(err) });
  });
  
  return manager;
}
