/**
 * Browser Feature Types
 * 
 * Type definitions for the embedded browser feature.
 * BrowserState is imported from shared types to avoid triple-definition divergence.
 */

export type { BrowserState } from '../../../shared/types';

export interface PageContent {
  url: string;
  title: string;
  text: string;
  html?: string;
  metadata: PageMetadata;
  links: PageLink[];
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

export interface ElementInfo {
  tag: string;
  id?: string;
  className?: string;
  text?: string;
  attributes: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NavigationResult {
  success: boolean;
  url: string;
  title: string;
  error?: string;
  loadTime?: number;
}

// Security types
export interface SecurityStats {
  blockedUrls: number;
  blockedPopups: number;
  blockedAds: number;
  blockedTrackers: number;
  blockedDownloads: number;
  warnings: number;
}

export interface SecurityEvent {
  type: 'blocked' | 'warning' | 'allowed';
  category: string;
  url: string;
  reason: string;
  timestamp: number;
}

export interface UrlSafetyResult {
  safe: boolean;
  warnings: string[];
  riskScore: number;
}

// Debugging types
export interface ConsoleLogOptions {
  level?: 'all' | 'errors' | 'warnings' | 'info' | 'debug';
  limit?: number;
  filter?: string;
}

export interface ConsoleLog {
  level: 'error' | 'warning' | 'info' | 'debug' | 'log';
  message: string;
  timestamp: number;
  source?: string;
  line?: number;
}

export interface NetworkRequestOptions {
  type?: string;
  status?: string;
  limit?: number;
  urlPattern?: string;
}

export interface NetworkRequestInfo {
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
