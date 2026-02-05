/**
 * Browser Module Index
 * 
 * Central export point for the embedded browser system.
 */
export { 
  BrowserManager, 
  getBrowserManager, 
  initBrowserManager,
  type BrowserState,
  type PageContent,
  type PageMetadata,
  type PageLink,
  type PageImage,
  type ScreenshotOptions,
  type NavigationResult,
  type ElementInfo,
  type BrowserViewBounds,
  type BrowserBehaviorSettings,
  type FullBrowserSettings,
} from './BrowserManager';

export {
  BrowserSecurity,
  getBrowserSecurity,
  initBrowserSecurity,
  type SecurityConfig,
  type SecurityEvent,
  type SecurityStats,
  DEFAULT_SECURITY_CONFIG,
} from './BrowserSecurity';

// Browser instance pool for multi-session concurrent support
export {
  BrowserInstancePool,
  getBrowserInstancePool,
  initBrowserInstancePool,
  disposeBrowserInstancePool,
  type PooledBrowserInstance,
  type BrowserPoolConfig,
  type BrowserPoolStats,
} from './BrowserInstancePool';
