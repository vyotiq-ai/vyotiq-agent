/**
 * Browser Tools Shared Types
 * 
 * Type definitions shared across all browser tools
 */

export interface NavigationResult {
  success: boolean;
  url: string;
  title: string;
  error?: string;
  loadTime?: number;
}

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

export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  selected?: boolean;
  ref: string; // Reference ID for interactions
  children?: AccessibilityNode[];
}

export interface FormField {
  ref: string;
  name: string;
  type: 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider' | 'textarea';
  value: string;
}
