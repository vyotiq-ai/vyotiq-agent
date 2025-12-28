/**
 * useMessageState Hook
 * 
 * Manages message content and attachments state.
 * Supports:
 * - Text message input with auto-resize
 * - File attachments via file picker, drag-drop, and paste
 * - Image paste from clipboard (screenshots, copied images)
 * - File paste from file explorer
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { AttachmentPayload } from '../../../../shared/types';
import { createLogger } from '../../../utils/logger';
import { useClipboardPaste } from './useClipboardPaste';

const logger = createLogger('MessageState');

/** Debounce delay for textarea resize (ms) */
const RESIZE_DEBOUNCE_MS = 16; // ~60fps for smooth resizing

/** Maximum attachment file size (10MB) */
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export interface MessageState {
  message: string;
  setMessage: (message: string) => void;
  attachments: AttachmentPayload[];
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  clearMessage: () => void;
  handleAddAttachments: () => Promise<void>;
  handleRemoveAttachment: (attachmentId: string) => void;
  handleFileDrop: (e: React.DragEvent) => Promise<void>;
  handlePaste: (e: React.ClipboardEvent) => Promise<void>;
  pasteError: string | null;
  clearPasteError: () => void;
}

/**
 * Hook for managing message content and attachments
 */
export function useMessageState(): MessageState {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<AttachmentPayload[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Track resize RAF for cleanup
  const resizeRafRef = useRef<number | null>(null);

  // Callback to add attachments from paste
  const addAttachmentsFromPaste = useCallback((newAttachments: AttachmentPayload[]) => {
    setAttachments((prev) => {
      // Prevent duplicates by checking content hash or name
      const existingNames = new Set(prev.map(a => a.name));
      const uniqueAttachments = newAttachments.filter(a => !existingNames.has(a.name));
      if (uniqueAttachments.length < newAttachments.length) {
        logger.info('Filtered duplicate attachments', {
          total: newAttachments.length,
          unique: uniqueAttachments.length,
        });
      }
      return [...prev, ...uniqueAttachments];
    });
    // Clear any previous paste error on success
    setPasteError(null);
  }, []);

  // Handle paste error
  const handlePasteError = useCallback((error: string) => {
    setPasteError(error);
    logger.warn('Paste error', { error });
    // Auto-clear error after 5 seconds
    setTimeout(() => setPasteError(null), 5000);
  }, []);

  // Clear paste error manually
  const clearPasteError = useCallback(() => {
    setPasteError(null);
  }, []);

  // Use clipboard paste hook
  const { handlePaste } = useClipboardPaste({
    onAttachmentsAdded: addAttachmentsFromPaste,
    maxFileSize: MAX_ATTACHMENT_SIZE,
    enabled: true,
    onError: handlePasteError,
  });

  // Optimized resize using RAF for smooth performance
  const resizeTextarea = useCallback(() => {
    if (resizeRafRef.current) {
      cancelAnimationFrame(resizeRafRef.current);
    }
    resizeRafRef.current = requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.style.height = 'auto';
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 200);
      textareaRef.current.style.height = `${nextHeight}px`;
    });
  }, []);
  
  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    };
  }, []);

  // Auto-resize on message change
  useEffect(() => {
    // Throttle to ~60fps
    const timeoutId = setTimeout(resizeTextarea, RESIZE_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [message, resizeTextarea]);

  const clearMessage = useCallback(() => {
    setMessage('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      // Refocus the textarea after clearing
      textareaRef.current.focus();
    }
  }, []);

  const handleAddAttachments = useCallback(async () => {
    try {
      const files = await window.vyotiq.files.select();
      if (files?.length) {
        setAttachments((prev) => [...prev, ...files]);
      }
    } catch (error) {
      logger.error('Failed to attach files', { error });
    }
  }, []);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  }, []);

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map(f => (f as File & { path: string }).path).filter(Boolean);
    
    if (paths.length > 0) {
      try {
        const newAttachments = await window.vyotiq.files.read(paths);
        setAttachments((prev) => [...prev, ...newAttachments]);
      } catch (error) {
        logger.error('Failed to read dropped files', { error });
      }
    }
  }, []);

  // Listen for file attachment events from sidebar file tree
  useEffect(() => {
    const handleFileAttachment = (e: CustomEvent<AttachmentPayload>) => {
      if (e.detail) {
        setAttachments((prev) => {
          // Prevent duplicate attachments
          if (prev.some(a => a.path === e.detail.path)) {
            return prev;
          }
          return [...prev, e.detail];
        });
      }
    };

    window.addEventListener('vyotiq:file-attachment', handleFileAttachment as EventListener);
    return () => {
      window.removeEventListener('vyotiq:file-attachment', handleFileAttachment as EventListener);
    };
  }, []);

  return {
    message,
    setMessage,
    attachments,
    textareaRef,
    clearMessage,
    handleAddAttachments,
    handleRemoveAttachment,
    handleFileDrop,
    handlePaste,
    pasteError,
    clearPasteError,
  };
}
