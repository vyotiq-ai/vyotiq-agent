/**
 * useClipboardPaste Hook
 * 
 * Handles clipboard paste events for files and images in the chat input.
 * Supports:
 * - Pasting images from clipboard (screenshots, copied images)
 * - Pasting files from file explorer
 * - Pasting text (handled separately by textarea)
 * 
 * @example
 * ```tsx
 * const { handlePaste } = useClipboardPaste({
 *   onAttachmentsAdded: (attachments) => setAttachments(prev => [...prev, ...attachments])
 * });
 * 
 * <textarea onPaste={handlePaste} />
 * ```
 */

import { useCallback } from 'react';
import type { AttachmentPayload } from '../../../../shared/types';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('ClipboardPaste');

let clipboardReadFailureLogged = false;
let clipboardReadTextFailureLogged = false;

/**
 * Generate a unique ID using crypto.randomUUID (browser-compatible)
 */
const generateId = (): string => {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Supported image MIME types that can be pasted
 */
const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
];

/**
 * Options for the useClipboardPaste hook
 */
export interface UseClipboardPasteOptions {
  /** Callback when attachments are added from paste */
  onAttachmentsAdded: (attachments: AttachmentPayload[]) => void;
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Whether paste is enabled (default: true) */
  enabled?: boolean;
  /** Callback for handling errors */
  onError?: (error: string) => void;
}

/**
 * Return type for the useClipboardPaste hook
 */
export interface UseClipboardPasteReturn {
  /** Handler for paste events */
  handlePaste: (e: React.ClipboardEvent) => Promise<void>;
  /** Check if clipboard has pasteable content */
  checkClipboardContent: () => Promise<{ hasImages: boolean; hasFiles: boolean; hasText: boolean }>;
}

/**
 * Convert a Blob to base64 string
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
};

/**
 * Convert a File to base64 string
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Read a File as text (for text-based files)
 */
const fileToText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file as text'));
    reader.readAsText(file);
  });
};

/**
 * Check if a MIME type represents a text-based file
 */
const isTextMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith('text/') ||
         mimeType.includes('json') ||
         mimeType.includes('javascript') ||
         mimeType.includes('xml') ||
         mimeType.includes('yaml');
};

/**
 * Generate a filename for a pasted image
 */
const generateImageFilename = (mimeType: string): string => {
  const extension = mimeType.split('/')[1] || 'png';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `pasted-image-${timestamp}.${extension}`;
};

/**
 * Hook for handling clipboard paste operations in chat input
 */
export function useClipboardPaste(options: UseClipboardPasteOptions): UseClipboardPasteReturn {
  const {
    onAttachmentsAdded,
    maxFileSize = 10 * 1024 * 1024, // 10MB default
    enabled = true,
    onError,
  } = options;

  /**
   * Handle paste event from textarea or container
   */
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!enabled) return;

    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    if (!items || items.length === 0) return;

    const newAttachments: AttachmentPayload[] = [];
    let hasHandledContent = false;

    // Process all clipboard items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Handle pasted images (from screenshots or copied images)
      if (item.type.startsWith('image/') && SUPPORTED_IMAGE_TYPES.includes(item.type)) {
        const blob = item.getAsFile();
        if (blob) {
          try {
            // Check file size
            if (blob.size > maxFileSize) {
              const sizeMB = (maxFileSize / (1024 * 1024)).toFixed(1);
              onError?.(`Image too large. Maximum size is ${sizeMB}MB`);
              continue;
            }

            const base64Content = await blobToBase64(blob);
            const filename = generateImageFilename(item.type);

            const attachment: AttachmentPayload = {
              id: generateId(),
              name: filename,
              mimeType: item.type,
              size: blob.size,
              encoding: 'base64',
              content: base64Content,
              description: 'Pasted image',
            };

            newAttachments.push(attachment);
            hasHandledContent = true;
            logger.info('Pasted image processed', { filename, size: blob.size, type: item.type });
          } catch (error) {
            logger.error('Failed to process pasted image', { error });
            onError?.('Failed to process pasted image');
          }
        }
      }

      // Handle pasted files (when files are copied from file explorer)
      if (item.kind === 'file' && !item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          try {
            // Check file size
            if (file.size > maxFileSize) {
              const sizeMB = (maxFileSize / (1024 * 1024)).toFixed(1);
              onError?.(`File "${file.name}" too large. Maximum size is ${sizeMB}MB`);
              continue;
            }

            const isText = isTextMimeType(file.type);
            let content: string;
            
            if (isText) {
              content = await fileToText(file);
            } else {
              content = await fileToBase64(file);
            }

            const attachment: AttachmentPayload = {
              id: generateId(),
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              encoding: isText ? 'utf-8' : 'base64',
              content,
              description: 'Pasted file',
            };

            newAttachments.push(attachment);
            hasHandledContent = true;
            logger.info('Pasted file processed', { filename: file.name, size: file.size });
          } catch (error) {
            logger.error('Failed to process pasted file', { error, filename: file.name });
            onError?.(`Failed to process file "${file.name}"`);
          }
        }
      }
    }

    // If we processed any files/images, add them and prevent default text paste
    if (newAttachments.length > 0) {
      // Only prevent default if we're handling non-text content
      // Let text paste through to the textarea
      if (hasHandledContent && !clipboardData.getData('text/plain')) {
        e.preventDefault();
      }
      onAttachmentsAdded(newAttachments);
      logger.info('Added pasted attachments', { count: newAttachments.length });
    }
  }, [enabled, maxFileSize, onAttachmentsAdded, onError]);

  /**
   * Check what content types are available in the clipboard
   * Note: This is limited by browser security - can only check during paste event
   */
  const checkClipboardContent = useCallback(async (): Promise<{ hasImages: boolean; hasFiles: boolean; hasText: boolean }> => {
    const result = { hasImages: false, hasFiles: false, hasText: false };
    
    try {
      // Use Clipboard API if available
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                result.hasImages = true;
              } else if (type === 'text/plain' || type === 'text/html') {
                result.hasText = true;
              }
            }
          }
        } catch (error) {
          // Permission denied or API not available
          if (!clipboardReadFailureLogged) {
            clipboardReadFailureLogged = true;
            logger.debug('Clipboard.read() unavailable or denied', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          // Try text-only check as fallback
          try {
            const text = await navigator.clipboard.readText();
            result.hasText = text.length > 0;
          } catch (error) {
            // Can't access clipboard
            if (!clipboardReadTextFailureLogged) {
              clipboardReadTextFailureLogged = true;
              logger.debug('Clipboard.readText() unavailable or denied', {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to check clipboard content', { error });
    }

    return result;
  }, []);

  return {
    handlePaste,
    checkClipboardContent,
  };
}

export default useClipboardPaste;
