/**
 * useDraftMessage Hook
 * 
 * Provides automatic draft saving and restoration for chat messages.
 * Persists drafts to localStorage with session-aware storage.
 * 
 * Features:
 * - Auto-save drafts with debouncing
 * - Session-specific draft storage
 * - Draft restoration on mount/session switch
 * - Draft status indicator support
 * - Cleanup of old drafts
 * 
 * @example
 * ```tsx
 * const { 
 *   draftStatus,
 *   saveDraft,
 *   loadDraft,
 *   clearDraft,
 *   hasDraft 
 * } = useDraftMessage({
 *   sessionId: activeSession?.id,
 * });
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '../../../utils/logger';
import type { AttachmentPayload } from '../../../../shared/types';

const logger = createLogger('DraftMessage');

// =============================================================================
// Types
// =============================================================================

/** Draft save status */
export type DraftStatus = 'idle' | 'saving' | 'saved' | 'restored' | 'error';

/** Stored draft data */
export interface DraftData {
  /** Message content */
  message: string;
  /** Attached files (metadata only, not content) */
  attachmentMeta?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
  }>;
  /** Timestamp when draft was saved */
  savedAt: number;
  /** Session ID this draft belongs to */
  sessionId?: string;
}

/** Options for useDraftMessage hook */
export interface UseDraftMessageOptions {
  /** Current session ID (null for new session drafts) */
  sessionId?: string | null;
  /** Auto-save delay in ms (default: 1000) */
  autoSaveDelay?: number;
  /** Maximum age of drafts before cleanup in ms (default: 7 days) */
  maxDraftAge?: number;
  /** Whether draft saving is enabled */
  enabled?: boolean;
}

/** Return type for useDraftMessage hook */
export interface UseDraftMessageReturn {
  /** Current draft status */
  draftStatus: DraftStatus;
  /** Whether a draft exists for current context */
  hasDraft: boolean;
  /** Timestamp of last save */
  lastSavedAt: number | null;
  /** Save draft manually */
  saveDraft: (message: string, attachments?: AttachmentPayload[]) => void;
  /** Load draft for current context */
  loadDraft: () => DraftData | null;
  /** Clear draft for current context */
  clearDraft: () => void;
  /** Auto-save handler (call on message change) */
  handleAutoSave: (message: string, attachments?: AttachmentPayload[]) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** localStorage key prefix */
const STORAGE_KEY_PREFIX = 'vyotiq-draft';

/** Default auto-save delay */
const DEFAULT_AUTO_SAVE_DELAY = 1000;

/** Default max draft age (7 days) */
const DEFAULT_MAX_DRAFT_AGE = 7 * 24 * 60 * 60 * 1000;

/** Status display duration */
const STATUS_DISPLAY_DURATION = 2000;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate storage key for a draft
 */
function getDraftKey(sessionId?: string | null): string {
  const parts = [STORAGE_KEY_PREFIX];
  if (sessionId) parts.push(sessionId);
  else parts.push('new-session');
  return parts.join(':');
}

/**
 * Get all draft keys from localStorage
 */
function getAllDraftKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Clean up old drafts
 */
function cleanupOldDrafts(maxAge: number): void {
  const now = Date.now();
  const keys = getAllDraftKeys();
  
  for (const key of keys) {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const draft: DraftData = JSON.parse(data);
        if (now - draft.savedAt > maxAge) {
          localStorage.removeItem(key);
          logger.debug('Cleaned up old draft', { key });
        }
      }
    } catch (err) {
      logger.debug('Removing invalid draft data', { key, error: err instanceof Error ? err.message : String(err) });
      localStorage.removeItem(key);
    }
  }
}

/**
 * Safely parse JSON from localStorage
 */
function parseDraft(data: string | null): DraftData | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as DraftData;
  } catch {
    return null;
  }
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for draft message auto-saving and restoration
 */
export function useDraftMessage(options: UseDraftMessageOptions): UseDraftMessageReturn {
  const {
    sessionId,
    autoSaveDelay = DEFAULT_AUTO_SAVE_DELAY,
    maxDraftAge = DEFAULT_MAX_DRAFT_AGE,
    enabled = true,
  } = options;

  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Refs for debouncing and cleanup
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedMessageRef = useRef<string>('');

  // Generate storage key for current context
  const storageKey = getDraftKey(sessionId);

  // Clear status timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, []);

  // Cleanup old drafts on mount
  useEffect(() => {
    cleanupOldDrafts(maxDraftAge);
  }, [maxDraftAge]);

  // Check for existing draft on mount or context change
  useEffect(() => {
    if (!enabled) return;
    
    const draft = parseDraft(localStorage.getItem(storageKey));
    setHasDraft(!!draft && draft.message.length > 0);
    
    if (draft) {
      setLastSavedAt(draft.savedAt);
    }
  }, [storageKey, enabled]);

  // Save draft to localStorage
  const saveDraft = useCallback((message: string, attachments?: AttachmentPayload[]) => {
    if (!enabled) return;
    
    // Don't save empty messages
    if (!message.trim() && (!attachments || attachments.length === 0)) {
      // Clear draft if message is empty
      localStorage.removeItem(storageKey);
      setHasDraft(false);
      setDraftStatus('idle');
      return;
    }

    // Don't save if message hasn't changed
    if (message === lastSavedMessageRef.current) {
      return;
    }

    try {
      setDraftStatus('saving');

      const draftData: DraftData = {
        message,
        attachmentMeta: attachments?.map(a => ({
          id: a.id,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
        })),
        savedAt: Date.now(),
        sessionId: sessionId ?? undefined,
      };

      localStorage.setItem(storageKey, JSON.stringify(draftData));
      lastSavedMessageRef.current = message;
      setLastSavedAt(draftData.savedAt);
      setHasDraft(true);
      setDraftStatus('saved');

      logger.debug('Draft saved', { key: storageKey, length: message.length });

      // Reset status after a delay
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => {
        setDraftStatus('idle');
      }, STATUS_DISPLAY_DURATION);

    } catch (error) {
      logger.error('Failed to save draft', { error });
      setDraftStatus('error');
    }
  }, [enabled, storageKey, sessionId]);

  // Load draft from localStorage
  const loadDraft = useCallback((): DraftData | null => {
    if (!enabled) return null;

    const draft = parseDraft(localStorage.getItem(storageKey));
    
    if (draft) {
      setDraftStatus('restored');
      lastSavedMessageRef.current = draft.message;
      
      logger.info('Draft loaded', { key: storageKey, length: draft.message.length });

      // Reset status after a delay
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => {
        setDraftStatus('idle');
      }, STATUS_DISPLAY_DURATION);
    }

    return draft;
  }, [enabled, storageKey]);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey);
    setHasDraft(false);
    setLastSavedAt(null);
    setDraftStatus('idle');
    lastSavedMessageRef.current = '';
    
    logger.debug('Draft cleared', { key: storageKey });
  }, [storageKey]);

  // Auto-save handler with debouncing
  const handleAutoSave = useCallback((message: string, attachments?: AttachmentPayload[]) => {
    if (!enabled) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft(message, attachments);
    }, autoSaveDelay);
  }, [enabled, autoSaveDelay, saveDraft]);

  return {
    draftStatus,
    hasDraft,
    lastSavedAt,
    saveDraft,
    loadDraft,
    clearDraft,
    handleAutoSave,
  };
}
