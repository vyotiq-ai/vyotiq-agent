/**
 * Browser Security Manager
 * 
 * Provides comprehensive security features for the embedded browser:
 * - URL filtering (phishing, malware, dangerous sites)
 * - Popup/ad blocking (using external filter lists from EasyList, etc.)
 * - Download protection
 * - Content security policies
 * - Safe browsing checks
 * 
 * Ad blocking uses external filter lists that are downloaded and cached
 * in the user data directory - NOT hardcoded in the codebase.
 */
import { session, WebContents, OnBeforeRequestListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';
import { EventEmitter } from 'node:events';
import { createLogger } from '../logger';
import { getFilterManager } from './adblock/FilterManager';

const logger = createLogger('BrowserSecurity');

// =============================================================================
// Types
// =============================================================================

export interface SecurityConfig {
  /** Enable URL filtering */
  urlFilteringEnabled: boolean;
  /** Enable popup blocking */
  popupBlockingEnabled: boolean;
  /** Enable ad blocking */
  adBlockingEnabled: boolean;
  /** Enable download protection */
  downloadProtectionEnabled: boolean;
  /** Block known trackers */
  trackerBlockingEnabled: boolean;
  /** Block mixed content (HTTP on HTTPS pages) */
  blockMixedContent: boolean;
  /** Trusted localhost ports that bypass security checks */
  trustedLocalhostPorts: number[];
  /** Allow list - URLs that bypass security checks */
  allowList: string[];
  /** Custom block list - additional URLs to block */
  customBlockList: string[];
}

export interface SecurityEvent {
  type: 'blocked' | 'warning' | 'allowed';
  category: 'phishing' | 'malware' | 'popup' | 'ad' | 'tracker' | 'dangerous' | 'suspicious' | 'download';
  url: string;
  reason: string;
  timestamp: number;
}

export interface SecurityStats {
  blockedUrls: number;
  blockedPopups: number;
  blockedAds: number;
  blockedTrackers: number;
  blockedDownloads: number;
  warnings: number;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  urlFilteringEnabled: true,
  popupBlockingEnabled: true,
  adBlockingEnabled: true,
  downloadProtectionEnabled: true,
  trackerBlockingEnabled: true,
  blockMixedContent: true,
  trustedLocalhostPorts: [3000, 3001, 4000, 5000, 5173, 8000, 8080, 8888],
  allowList: [],
  customBlockList: [],
};

// =============================================================================
// Known Threat Patterns
// =============================================================================

/**
 * Trusted domains that are known to be safe (Google CDN, fonts, APIs, etc.)
 * These bypass malicious URL checks to prevent false positives
 * NOTE: Ad/tracking domains should NOT be in this list - they are handled separately
 * Imported from shared trustedDomains.ts for single source of truth
 */
import { TRUSTED_DOMAINS } from './trustedDomains';

/**
 * Known phishing URL patterns and domains
 * These are common patterns used in phishing attacks
 * 
 * IMPORTANT: Patterns should only match in hostname context to avoid
 * false positives on legitimate URLs with similar substrings in paths.
 * Uses word boundaries and hostname-specific matching where possible.
 */
const PHISHING_PATTERNS: RegExp[] = [
  // Fake login pages - must be in path context
  /\/login[-_.]?secure(?:\/|$|\?)/i,
  /\/secure[-_.]?login(?:\/|$|\?)/i,
  /\/account[-_.]?verify(?:\/|$|\?)/i,
  /\/verify[-_.]?account(?:\/|$|\?)/i,
  /\/password[-_.]?reset[-_.]?confirm(?:\/|$|\?)/i,
  /\/update[-_.]?payment(?:\/|$|\?)/i,
  /\/confirm[-_.]?identity(?:\/|$|\?)/i,
  
  // Suspicious TLD abuse patterns - must be at end of hostname
  /:\/\/[^/]+\.(tk|ml|ga|cf|gq)\//i,  // Free TLDs commonly abused
  
  // Lookalike domain patterns - must be in hostname context (between :// and /)
  // These only match typosquatting in the actual domain name, not in paths
  /:\/\/[^/]*paypa[l1](?!com)[^/]*\//i,
  /:\/\/[^/]*g00gle[^/]*\//i,
  /:\/\/[^/]*googl[e3](?!\.com)[^/]*\//i,
  /:\/\/[^/]*amaz[o0]n(?!\.com)[^/]*\//i,
  /:\/\/[^/]*micr[o0]s[o0]ft(?!\.com)[^/]*\//i,
  // Apple lookalike - only match in hostname, not paths like '/application/'
  /:\/\/[^/]*app[l1]e(?!\.com)[^/]*\.(com|net|org|io|xyz)\//i,
  /:\/\/[^/]*faceb[o0]{2}k[^/]*\//i,
  
  // Credential harvesting indicators
  /\/(wp-admin|wp-login|admin-login)\.php\?/i,
  /[?&](email|user|login)=[^&]*@/i,
];

/**
 * Known malware distribution patterns
 * These patterns are designed to catch actual malicious URLs while avoiding false positives
 * for legitimate services like Google's favicon service or CDN redirects
 * 
 * IMPORTANT: Patterns must be specific to avoid blocking legitimate JS files
 * The pattern should match the FULL suspicious context, not just file extensions
 */
const MALWARE_PATTERNS: RegExp[] = [
  // Suspicious file downloads (executable with suspicious parameters)
  /\.exe\?.*=(download|get|file)/i,
  // Only match download paths that look like cracks/keygens, not legitimate CDN paths
  /\/(crack|keygen|patch|serial|activator)\/[^/]*\.(exe|msi|bat|cmd|vbs|scr)$/i,
  
  // Drive-by download patterns (actual malicious code patterns)
  /eval\s*\(\s*unescape\s*\(/i,
  /document\.write\s*\(\s*unescape\s*\(/i,
  
  // Suspicious redirects - exclude legitimate Google services
  // Only match generic redirect parameters with suspicious destinations
  /[?&]redirect=https?:\/\/(?!www\.google\.|accounts\.google\.|drive\.google\.)[^&]*\.(tk|ml|ga|cf|gq)\//i,
  /[?&]goto=https?:\/\/(?!www\.google\.|accounts\.google\.)[^&]*\.(tk|ml|ga|cf|gq)\//i,
];

/**
 * Known dangerous domains (sample list - in production would use threat intel feeds)
 */
const DANGEROUS_DOMAINS: Set<string> = new Set([
  // These are examples - real implementation would use updated threat feeds
  'malware-test.com',
  'phishing-test.net',
  'virus-download.xyz',
]);

/**
 * Ad/tracking domain blocking is now handled by FilterManager
 * which downloads and caches external filter lists (EasyList, etc.)
 * in the user data directory - NOT hardcoded in the codebase.
 * 
 * @see ./adblock/FilterManager.ts
 */
// AD_TRACKER_DOMAINS and AD_URL_PATTERNS removed - now using FilterManager
// See FilterManager.ts for external filter list management



/**
 * Popup/new window patterns to block
 */
const POPUP_PATTERNS: RegExp[] = [
  /popup/i,
  /window\.open/i,
  /target\s*=\s*["']?_blank/i,
  /onclick\s*=\s*["']?window\.open/i,
  /popunder/i,
  /clickunder/i,
  /tabunder/i,
  /exitpop/i,
  /exit.?intent/i,
  /interstitial/i,
  /overlay/i,
  /lightbox/i,
  /modal.?ad/i,
  /splash/i,
  /prestitial/i,
  /welcome.?mat/i,
  /takeover/i,
  /expandable/i,
  /floating/i,
  /sticky.?ad/i,
  /layer.?ad/i,
  /slide.?in/i,
  /push.?down/i,
  /peel.?away/i,
  /corner.?ad/i,
  /notification.?ad/i,
  /toast.?ad/i,
  /banner.?pop/i,
  /full.?page.?ad/i,
  /screen.?ad/i,
];

/**
 * Suspicious download file extensions
 */
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.ps1', '.vbs', '.vbe',
  '.js', '.jse', '.wsf', '.wsh', '.scr', '.pif', '.com',
  '.jar', '.reg', '.dll', '.sys', '.drv', '.ocx', '.cpl',
  '.hta', '.msc', '.inf', '.lnk', '.url', '.iso', '.img',
]);

// =============================================================================
// Browser Security Manager
// =============================================================================

export class BrowserSecurity extends EventEmitter {
  private config: SecurityConfig;
  private stats: SecurityStats;
  private events: SecurityEvent[] = [];
  private sessionPartition: string;
  private isInitialized = false;
  /** Tracks whether external filter lists have been loaded */
  private filtersReady = false;
  /** Promise resolving when filters finish loading (for callers that need to await) */
  private filterReadyPromise: Promise<void> | null = null;

  constructor(sessionPartition = 'persist:agent-browser', config: Partial<SecurityConfig> = {}) {
    super();
    this.sessionPartition = sessionPartition;
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
    this.stats = {
      blockedUrls: 0,
      blockedPopups: 0,
      blockedAds: 0,
      blockedTrackers: 0,
      blockedDownloads: 0,
      warnings: 0,
    };
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize security features for the browser session.
   * This method is idempotent - calling it multiple times is safe and will only
   * initialize once.
   * 
   * Returns a promise that resolves once external filter lists have been loaded,
   * allowing callers to await full initialization if needed.
   */
  initialize(): Promise<void> {
    if (this.isInitialized) {
      // Already initialized - this is expected when called from multiple places
      // (e.g., initBrowserManager + ensureBrowserView)
      logger.debug('BrowserSecurity already initialized, skipping');
      return this.filterReadyPromise ?? Promise.resolve();
    }

    logger.info('Initializing BrowserSecurity', {
      sessionPartition: this.sessionPartition,
      adBlockingEnabled: this.config.adBlockingEnabled,
      trackerBlockingEnabled: this.config.trackerBlockingEnabled,
    });

    // Initialize FilterManager for ad blocking (downloads external filter lists)
    const filterManager = getFilterManager();
    this.filterReadyPromise = filterManager
      .initialize()
      .then(() => {
        this.filtersReady = true;
        const filterStats = getFilterManager().getStats();
        logger.info('BrowserSecurity filter lists ready', {
          filterDomainCount: filterStats.domainCount,
          filterPatternCount: filterStats.patternCount,
        });
      })
      .catch(err => {
        logger.error('Failed to initialize FilterManager', {
          error: err instanceof Error ? err.message : String(err),
        });
        // Mark ready even on failure so callers aren't blocked forever
        this.filtersReady = true;
      });

    const browserSession = session.fromPartition(this.sessionPartition);

    // Setup request interceptor for URL filtering and ad blocking
    this.setupRequestInterceptor(browserSession);

    // Setup header interceptor for additional security
    this.setupHeaderInterceptor(browserSession);

    // Setup download handler
    this.setupDownloadHandler(browserSession);

    // Setup Content Security Policy
    this.setupCSP(browserSession);

    this.isInitialized = true;
    
    // Log basic init; filter readiness is logged asynchronously above.
    logger.info('BrowserSecurity initialized successfully', {
      adBlockingEnabled: this.config.adBlockingEnabled,
      trackerBlockingEnabled: this.config.trackerBlockingEnabled,
      filterDomainCount: 0,
      filterPatternCount: 0,
    });

    return this.filterReadyPromise;
  }

  /**
   * Setup request interceptor to block dangerous URLs
   * 
   * IMPORTANT: This is the ONLY place where onBeforeRequest should be set up.
   * Setting it up elsewhere will overwrite this handler and break ad blocking.
   */
  private setupRequestInterceptor(browserSession: Electron.Session): void {
    logger.info('Setting up request interceptor for ad blocking', {
      adBlockingEnabled: this.config.adBlockingEnabled,
      trackerBlockingEnabled: this.config.trackerBlockingEnabled,
      sessionPartition: this.sessionPartition,
    });
    
    // Track request count for debugging
    let requestCount = 0;
    
    // Resource type mapping for network tracking
    const resourceTypeMap: Record<string, string> = {
      mainFrame: 'document',
      subFrame: 'document',
      stylesheet: 'stylesheet',
      script: 'script',
      image: 'image',
      font: 'font',
      xhr: 'xhr',
      fetch: 'fetch',
      ping: 'other',
      cspReport: 'other',
      media: 'media',
      webSocket: 'websocket',
      other: 'other',
    };
    
    browserSession.webRequest.onBeforeRequest(
      { urls: ['*://*/*'] },
      (details: OnBeforeRequestListenerDetails, callback) => {
        requestCount++;
        
        // Log every 100th request to avoid spam
        if (requestCount % 100 === 1) {
          logger.debug('Processing request', { 
            count: requestCount, 
            url: details.url.slice(0, 100),
            adBlockingEnabled: this.config.adBlockingEnabled,
          });
        }
        
        const result = this.checkRequest(details);
        
        if (result.blocked) {
          logger.info('Blocked request', {
            url: details.url.slice(0, 200),
            category: result.category,
            reason: result.reason,
            totalBlocked: this.stats.blockedAds + this.stats.blockedTrackers + this.stats.blockedUrls,
          });
          this.recordEvent({
            type: 'blocked',
            category: result.category!,
            url: details.url,
            reason: result.reason!,
            timestamp: Date.now(),
          });
          callback({ cancel: true });
        } else {
          // Emit event for network tracking (used by BrowserManager.setupNetworkTracking)
          this.emit('request-allowed', {
            id: details.id.toString(),
            url: details.url,
            method: details.method,
            resourceType: resourceTypeMap[details.resourceType] || 'other',
          });
          callback({});
        }
      }
    );
    
    logger.info('Request interceptor setup complete');
  }

  /**
   * Setup header interceptor for security headers
   */
  private setupHeaderInterceptor(browserSession: Electron.Session): void {
    browserSession.webRequest.onHeadersReceived(
      { urls: ['*://*/*'] },
      (details: OnHeadersReceivedListenerDetails, callback) => {
        const responseHeaders = { ...details.responseHeaders };
        
        // Add security headers
        responseHeaders['X-Content-Type-Options'] = ['nosniff'];
        responseHeaders['X-Frame-Options'] = ['SAMEORIGIN'];
        responseHeaders['Referrer-Policy'] = ['strict-origin-when-cross-origin'];
        
        callback({ responseHeaders });
      }
    );
  }

  /**
   * Setup download handler to block dangerous downloads
   */
  private setupDownloadHandler(browserSession: Electron.Session): void {
    browserSession.on('will-download', (event, item) => {
      if (!this.config.downloadProtectionEnabled) {
        return;
      }

      const filename = item.getFilename().toLowerCase();
      const url = item.getURL();

      // Check for dangerous file extensions
      const extension = filename.substring(filename.lastIndexOf('.'));
      if (DANGEROUS_EXTENSIONS.has(extension)) {
        this.stats.blockedDownloads++;
        this.recordEvent({
          type: 'blocked',
          category: 'download',
          url,
          reason: `Blocked potentially dangerous file type: ${extension}`,
          timestamp: Date.now(),
        });
        event.preventDefault();
        logger.warn('Blocked dangerous download', { filename, url, extension });
        return;
      }

      // Check for suspicious download URLs
      if (this.isUrlMalicious(url).dangerous) {
        this.stats.blockedDownloads++;
        this.recordEvent({
          type: 'blocked',
          category: 'download',
          url,
          reason: 'Download URL matches malware pattern',
          timestamp: Date.now(),
        });
        event.preventDefault();
        logger.warn('Blocked malware download', { filename, url });
      }
    });
  }

  /**
   * Setup Content Security Policy
   * 
   * Note: We intentionally do NOT inject a restrictive CSP on subresources.
   * Websites set their own CSP headers, and injecting our own would break
   * legitimate external resources like fonts, scripts, and stylesheets.
   * 
   * Security is handled through:
   * - URL filtering (blocking malicious URLs)
   * - Request interception (blocking dangerous requests)
   * - Ad/tracker blocking (blocking known bad actors)
   * 
   * The browser should behave like a normal browser for web compatibility.
   */
  private setupCSP(_browserSession: Electron.Session): void {
    // CSP injection disabled to prevent breaking external resources.
    // Websites manage their own Content Security Policies.
    // Security is enforced through URL filtering and request interception instead.
    logger.debug('CSP setup skipped - relying on URL filtering for security');
  }

  // ===========================================================================
  // URL Checking
  // ===========================================================================

  /**
   * Check if a request should be blocked
   */
  private checkRequest(details: OnBeforeRequestListenerDetails): {
    blocked: boolean;
    category?: SecurityEvent['category'];
    reason?: string;
  } {
    const url = details.url;
    const hostname = this.extractHostname(url);
    const domain = this.extractDomain(url);
    
    // FIRST: Check if the main domain is in the allow list (user-defined or trusted)
    // This prevents false positives on legitimate developer sites
    if (this.isAllowListed(url)) {
      return { blocked: false };
    }
    
    // Check ad/tracker blocking (only for non-allowed domains)
    if (this.config.adBlockingEnabled || this.config.trackerBlockingEnabled) {
      // Use FilterManager for ad/tracker blocking (external filter lists)
      const filterManager = getFilterManager();

      // If filter lists haven't loaded yet, skip domain/URL blocking for this request
      // (safety: don't silently let ads through without notifying)
      if (!this.filtersReady) {
        logger.debug('Filter lists not yet loaded, skipping ad/tracker blocking for request', {
          url: url.slice(0, 80),
        });
      } else {
      
        // Check domain against filter lists
        if (filterManager.shouldBlockDomain(hostname) || filterManager.shouldBlockDomain(domain)) {
          if (this.config.adBlockingEnabled) {
            this.stats.blockedAds++;
            logger.debug('Blocking ad domain', { hostname, domain, url: url.slice(0, 100) });
            return {
              blocked: true,
              category: 'ad',
              reason: `Blocked ad/tracker domain: ${hostname}`,
            };
          }
          if (this.config.trackerBlockingEnabled) {
            this.stats.blockedTrackers++;
            return {
              blocked: true,
              category: 'tracker',
              reason: `Blocked tracker domain: ${hostname}`,
            };
          }
        }
      
        // Check full URL against filter patterns
        if (this.config.adBlockingEnabled && filterManager.shouldBlockUrl(url)) {
          this.stats.blockedAds++;
          logger.debug('Blocking ad URL pattern', { url: url.slice(0, 100) });
          return {
            blocked: true,
            category: 'ad',
            reason: `Blocked by ad filter: ${hostname}`,
          };
        }
      } // end filtersReady else
    }
    
    // Check custom block list
    for (const blocked of this.config.customBlockList) {
      if (url.includes(blocked)) {
        this.stats.blockedUrls++;
        return {
          blocked: true,
          category: 'dangerous',
          reason: `URL matches custom block list: ${blocked}`,
        };
      }
    }

    // Check URL filtering for malicious URLs
    if (this.config.urlFilteringEnabled) {
      const urlCheck = this.isUrlMalicious(url);
      if (urlCheck.dangerous) {
        this.stats.blockedUrls++;
        return {
          blocked: true,
          category: urlCheck.category,
          reason: urlCheck.reason,
        };
      }
    }

    return { blocked: false };
  }

  /**
   * Check if a URL is potentially malicious
   */
  isUrlMalicious(url: string): {
    dangerous: boolean;
    category?: 'phishing' | 'malware' | 'dangerous' | 'suspicious';
    reason?: string;
    riskScore: number;
  } {
    let riskScore = 0;
    
    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname.toLowerCase();
      const fullUrl = url.toLowerCase();

      // Check against known dangerous domains
      if (DANGEROUS_DOMAINS.has(domain)) {
        return {
          dangerous: true,
          category: 'dangerous',
          reason: `Known dangerous domain: ${domain}`,
          riskScore: 100,
        };
      }

      // Check phishing patterns
      for (const pattern of PHISHING_PATTERNS) {
        if (pattern.test(fullUrl)) {
          riskScore += 40;
          if (riskScore >= 60) {
            return {
              dangerous: true,
              category: 'phishing',
              reason: `URL matches phishing pattern: ${pattern.source}`,
              riskScore,
            };
          }
        }
      }

      // Check malware patterns
      for (const pattern of MALWARE_PATTERNS) {
        if (pattern.test(fullUrl)) {
          riskScore += 50;
          return {
            dangerous: true,
            category: 'malware',
            reason: `URL matches malware distribution pattern: ${pattern.source}`,
            riskScore,
          };
        }
      }

      // Check for suspicious characteristics
      const suspiciousChecks = [
        { check: this.hasExcessiveSubdomains(domain), score: 15, reason: 'Excessive subdomains' },
        { check: this.hasSuspiciousCharacters(domain), score: 20, reason: 'Suspicious characters in domain' },
        { check: this.isIPAddress(domain), score: 25, reason: 'IP address instead of domain' },
        { check: this.hasLongPath(parsedUrl.pathname), score: 10, reason: 'Suspiciously long URL path' },
        { check: this.hasEncodedCharacters(fullUrl), score: 15, reason: 'Excessive URL encoding' },
        { check: this.hasDataUri(fullUrl), score: 30, reason: 'Data URI detected' },
      ];

      for (const { check, score, reason } of suspiciousChecks) {
        if (check) {
          riskScore += score;
          if (riskScore >= 60) {
            return {
              dangerous: true,
              category: 'suspicious',
              reason,
              riskScore,
            };
          }
        }
      }

      // Return safe with accumulated risk score
      return {
        dangerous: false,
        riskScore,
      };
    } catch (error) {
      // Invalid URL - treat as suspicious, but log for diagnostics.
      logger.debug('Invalid URL passed to isUrlMalicious', {
        url: url.slice(0, 200),
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        dangerous: true,
        category: 'suspicious',
        reason: 'Invalid URL format',
        riskScore: 50,
      };
    }
  }

  /**
   * Check URL before navigation (for manual checks)
   */
  checkUrlSafety(url: string): {
    safe: boolean;
    warnings: string[];
    riskScore: number;
  } {
    const warnings: string[] = [];
    const maliciousCheck = this.isUrlMalicious(url);
    
    if (maliciousCheck.dangerous) {
      warnings.push(maliciousCheck.reason!);
    }

    // Additional warnings for semi-suspicious URLs
    if (maliciousCheck.riskScore > 30 && !maliciousCheck.dangerous) {
      warnings.push(`URL has elevated risk score: ${maliciousCheck.riskScore}/100`);
      this.stats.warnings++;
    }

    return {
      safe: !maliciousCheck.dangerous,
      warnings,
      riskScore: maliciousCheck.riskScore,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private extractDomain(url: string): string {
    try {
      const parsed = new URL(url);
      // Get root domain (e.g., 'sub.example.com' -> 'example.com')
      const parts = parsed.hostname.split('.');
      if (parts.length > 2) {
        return parts.slice(-2).join('.');
      }
      return parsed.hostname;
    } catch (error) {
      logger.debug('Failed to extract domain from URL', {
        url: url.slice(0, 200),
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  private extractHostname(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private isAllowListed(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const domain = this.extractDomain(url);
      
      // Check user-defined allow list with proper domain matching
      for (const allowed of this.config.allowList) {
        const allowedLower = allowed.toLowerCase();
        // Check if it's a domain match (not just substring)
        if (hostname === allowedLower || 
            hostname.endsWith('.' + allowedLower) ||
            domain === allowedLower) {
          return true;
        }
        // Also allow localhost with port
        if (allowedLower === 'localhost' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
          return true;
        }
      }
      
      // Check against trusted domains (Google CDN, major services, etc.)
      // But NOT ad/tracker domains - those are handled separately
      if (TRUSTED_DOMAINS.has(domain)) {
        return true;
      }
      
      // Also check for subdomains of trusted domains
      // e.g., encrypted-tbn0.gstatic.com should match gstatic.com
      for (const trustedDomain of TRUSTED_DOMAINS) {
        if (hostname === trustedDomain || hostname.endsWith('.' + trustedDomain)) {
          return true;
        }
      }
    } catch (error) {
      // Invalid URL - not allow listed
      logger.debug('Invalid URL passed to allow-list check', {
        url: url.slice(0, 200),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    return false;
  }

  private hasExcessiveSubdomains(domain: string): boolean {
    return domain.split('.').length > 4;
  }

  private hasSuspiciousCharacters(domain: string): boolean {
    // Check for homograph attack characters or unusual patterns
    // Note: We allow consecutive dashes (---) as they're used by legitimate CDNs (e.g., googlevideo.com)
    // Only flag truly suspicious patterns like non-ASCII characters or punycode
    return /[^\w.-]/.test(domain) || domain.includes('xn--');
  }

  private isIPAddress(domain: string): boolean {
    return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain);
  }

  private hasLongPath(path: string): boolean {
    return path.length > 200;
  }

  private hasEncodedCharacters(url: string): boolean {
    const encoded = (url.match(/%[0-9A-Fa-f]{2}/g) || []).length;
    return encoded > 10;
  }

  private hasDataUri(url: string): boolean {
    return url.startsWith('data:') || url.includes('data:text/html');
  }

  // ===========================================================================
  // Popup Blocking
  // ===========================================================================

  /**
   * Setup popup blocking for a WebContents
   */
  setupPopupBlocking(webContents: WebContents): void {
    if (!this.config.popupBlockingEnabled) {
      return;
    }

    webContents.setWindowOpenHandler(({ url, features }) => {
      // Check if this looks like a popup/ad
      const isPopup = this.isLikelyPopup(url, features);
      
      if (isPopup) {
        this.stats.blockedPopups++;
        this.recordEvent({
          type: 'blocked',
          category: 'popup',
          url,
          reason: 'Blocked popup window',
          timestamp: Date.now(),
        });
        logger.info('Blocked popup', { url });
        return { action: 'deny' };
      }

      // Allow but open in same window
      return { action: 'deny' };
    });

    // Also block JavaScript-based popups
    webContents.on('will-navigate', (event, url) => {
      // Check if navigation is to a dangerous URL
      const check = this.isUrlMalicious(url);
      if (check.dangerous) {
        event.preventDefault();
        this.stats.blockedUrls++;
        this.recordEvent({
          type: 'blocked',
          category: check.category!,
          url,
          reason: check.reason!,
          timestamp: Date.now(),
        });
        logger.warn('Blocked navigation to dangerous URL', { url, reason: check.reason });
      }
    });
  }

  /**
   * Determine if a window open request is likely a popup/ad
   */
  private isLikelyPopup(url: string, features: string): boolean {
    // Check features string for popup indicators
    if (features) {
      const popupIndicators = ['width=', 'height=', 'left=', 'top=', 'popup', 'toolbar=no', 'menubar=no'];
      const hasPopupFeatures = popupIndicators.some(indicator => 
        features.toLowerCase().includes(indicator)
      );
      if (hasPopupFeatures) return true;
    }

    // Check URL patterns
    for (const pattern of POPUP_PATTERNS) {
      if (pattern.test(url)) return true;
    }

    // Check if URL is from ad/tracker domain using FilterManager
    const filterManager = getFilterManager();
    const domain = this.extractDomain(url);
    if (filterManager.shouldBlockDomain(domain)) return true;

    return false;
  }

  // ===========================================================================
  // Configuration & Stats
  // ===========================================================================

  /**
   * Update security configuration
   */
  updateConfig(config: Partial<SecurityConfig>): void {
    // Filter out undefined values to preserve defaults
    const filteredConfig = Object.fromEntries(
      Object.entries(config).filter(([_, value]) => value !== undefined)
    ) as Partial<SecurityConfig>;
    
    this.config = { ...this.config, ...filteredConfig };
    logger.info('Security config updated', { 
      adBlockingEnabled: this.config.adBlockingEnabled,
      trackerBlockingEnabled: this.config.trackerBlockingEnabled,
      urlFilteringEnabled: this.config.urlFilteringEnabled,
    });
    this.emit('config-changed', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  /**
   * Get security statistics
   */
  getStats(): SecurityStats {
    return { ...this.stats };
  }

  /**
   * Get recent security events
   */
  getEvents(limit = 50): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  /**
   * Record a security event
   */
  private recordEvent(event: SecurityEvent): void {
    this.events.push(event);
    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
    this.emit('security-event', event);
    logger.info('Security event', { type: event.type, category: event.category, url: event.url, reason: event.reason });
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      blockedUrls: 0,
      blockedPopups: 0,
      blockedAds: 0,
      blockedTrackers: 0,
      blockedDownloads: 0,
      warnings: 0,
    };
    this.events = [];
  }

  /**
   * Add URL to allow list
   */
  addToAllowList(url: string): void {
    if (!this.config.allowList.includes(url)) {
      this.config.allowList.push(url);
      logger.info('Added to allow list', { url });
    }
  }

  /**
   * Remove URL from allow list
   */
  removeFromAllowList(url: string): void {
    this.config.allowList = this.config.allowList.filter(u => u !== url);
    logger.info('Removed from allow list', { url });
  }

  /**
   * Add URL to custom block list
   */
  addToBlockList(url: string): void {
    if (!this.config.customBlockList.includes(url)) {
      this.config.customBlockList.push(url);
      logger.info('Added to block list', { url });
    }
  }

  /**
   * Remove URL from custom block list
   */
  removeFromBlockList(url: string): void {
    this.config.customBlockList = this.config.customBlockList.filter(u => u !== url);
    logger.info('Removed from block list', { url });
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let browserSecurityInstance: BrowserSecurity | null = null;

/**
 * Get the singleton browser security instance
 */
export function getBrowserSecurity(): BrowserSecurity {
  if (!browserSecurityInstance) {
    browserSecurityInstance = new BrowserSecurity();
  }
  return browserSecurityInstance;
}

/**
 * Initialize browser security with custom config
 */
export function initBrowserSecurity(config?: Partial<SecurityConfig>): BrowserSecurity {
  const security = getBrowserSecurity();
  if (config) {
    security.updateConfig(config);
  }
  security.initialize();
  return security;
}
