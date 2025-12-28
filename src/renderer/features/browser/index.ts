/**
 * Browser Feature Index
 * 
 * Exports all browser-related components and hooks for the embedded browser
 */
export { BrowserPanel } from './BrowserPanel';
export { useBrowser } from './useBrowser';
export type { 
  BrowserState, 
  PageContent, 
  PageMetadata,
  PageLink,
  PageImage,
  ElementInfo,
  BrowserBounds,
  NavigationResult,
  SecurityStats,
  SecurityEvent,
  UrlSafetyResult,
  ConsoleLogOptions,
  ConsoleLog,
  NetworkRequestOptions,
  NetworkRequestInfo,
} from './types';
