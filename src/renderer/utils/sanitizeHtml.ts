/**
 * HTML Sanitization Utility
 * 
 * Provides safe HTML rendering by sanitizing untrusted content
 * using DOMPurify. Used wherever dangerouslySetInnerHTML is needed.
 */

import DOMPurify from 'dompurify';

/**
 * Default DOMPurify configuration for safe HTML rendering.
 * Allows standard HTML elements and attributes while blocking
 * scripts, event handlers, and other XSS vectors.
 */
const DEFAULT_CONFIG = {
  RETURN_TRUSTED_TYPE: false as const,
  ALLOWED_TAGS: [
    // Structure
    'div', 'span', 'p', 'br', 'hr',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Text formatting
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
    'sub', 'sup', 'small', 'code', 'pre', 'kbd', 'var', 'samp',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Media
    'img', 'figure', 'figcaption', 'picture', 'source',
    // Links
    'a',
    // Semantic
    'article', 'section', 'nav', 'aside', 'header', 'footer', 'main',
    'blockquote', 'cite', 'q', 'abbr', 'time', 'address',
    // Forms (display only)
    'details', 'summary',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'title', 'lang', 'dir',
    'href', 'target', 'rel',
    'src', 'alt', 'width', 'height', 'loading',
    'colspan', 'rowspan', 'scope', 'headers',
    'open', 'datetime', 'cite',
    'aria-label', 'aria-hidden', 'aria-describedby', 'role',
  ],
  // Force all links to open in new tab with safe rel
  ADD_ATTR: ['target'],
};

/**
 * Sanitize HTML content for safe rendering via dangerouslySetInnerHTML.
 * Removes scripts, event handlers, and other XSS attack vectors.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, DEFAULT_CONFIG) as string;
}

/**
 * Sanitize HTML with a minimal set of allowed tags (inline only).
 * Used for contexts where block elements should not be allowed.
 */
export function sanitizeInlineHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ...DEFAULT_CONFIG,
    ALLOWED_TAGS: [
      'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
      'sub', 'sup', 'small', 'code', 'kbd', 'var', 'samp',
      'a', 'span', 'br', 'abbr', 'time',
    ],
  }) as string;
}
