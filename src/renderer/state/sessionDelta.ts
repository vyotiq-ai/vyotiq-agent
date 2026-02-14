/**
 * Session Delta Updates
 * 
 * Optimized session state updates using delta-based changes instead of full serialization.
 * Reduces memory pressure and improves performance for large conversations.
 * 
 * Features:
 * - Delta computation for minimal data transfer
 * - Incremental message appending
 * - Batched property updates
 * - Efficient change detection
 */

import type { AgentSessionState, ChatMessage } from '../../shared/types';

// =============================================================================
// Types
// =============================================================================

export interface SessionDelta {
  sessionId: string;
  timestamp: number;
  version: number;
  
  // Incremental changes
  appendMessages?: ChatMessage[];
  updateMessages?: Array<{ id: string; patch: Partial<ChatMessage> }>;
  removeMessageIds?: string[];
  
  // Property updates
  propertyUpdates?: Partial<Pick<AgentSessionState, 
    'status' | 'title' | 'activeRunId' | 'config'
  >>;
  
  // Usage/metrics updates (separate from messages)
  usageUpdate?: {
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  };
}

export interface DeltaApplicationResult {
  session: AgentSessionState;
  messagesChanged: number;
  propertiesChanged: string[];
}

// =============================================================================
// Delta Computation
// =============================================================================

/**
 * Compute delta between two session states
 * Returns the minimal set of changes needed to transform oldSession to newSession
 */
export function computeSessionDelta(
  oldSession: AgentSessionState,
  newSession: AgentSessionState
): SessionDelta | null {
  const delta: SessionDelta = {
    sessionId: newSession.id,
    timestamp: Date.now(),
    version: ((oldSession as unknown as { _version?: number })._version ?? 0) + 1,
  };

  let hasChanges = false;

  // Check property changes
  const propertyUpdates: SessionDelta['propertyUpdates'] = {};
  const propertyKeys: Array<keyof NonNullable<SessionDelta['propertyUpdates']>> = [
    'status', 'title', 'activeRunId', 'config'
  ];

  for (const key of propertyKeys) {
    const oldValue = oldSession[key];
    const newValue = newSession[key];
    
    if (!isEqual(oldValue, newValue)) {
      (propertyUpdates as Record<string, unknown>)[key] = newValue;
      hasChanges = true;
    }
  }

  if (Object.keys(propertyUpdates).length > 0) {
    delta.propertyUpdates = propertyUpdates;
  }

  // Check message changes
  const oldMsgMap = new Map(oldSession.messages.map(m => [m.id, m]));
  const newMsgMap = new Map(newSession.messages.map(m => [m.id, m]));

  // Find new messages (appended)
  const appendMessages: ChatMessage[] = [];
  const updateMessages: SessionDelta['updateMessages'] = [];
  
  for (const newMsg of newSession.messages) {
    const oldMsg = oldMsgMap.get(newMsg.id);
    
    if (!oldMsg) {
      // New message
      appendMessages.push(newMsg);
      hasChanges = true;
    } else if (!isMessageEqual(oldMsg, newMsg)) {
      // Updated message - compute patch
      const patch = computeMessagePatch(oldMsg, newMsg);
      if (patch && Object.keys(patch).length > 0) {
        updateMessages.push({ id: newMsg.id, patch });
        hasChanges = true;
      }
    }
  }

  // Find removed messages
  const removeMessageIds: string[] = [];
  for (const oldMsg of oldSession.messages) {
    if (!newMsgMap.has(oldMsg.id)) {
      removeMessageIds.push(oldMsg.id);
      hasChanges = true;
    }
  }

  if (appendMessages.length > 0) delta.appendMessages = appendMessages;
  if (updateMessages.length > 0) delta.updateMessages = updateMessages;
  if (removeMessageIds.length > 0) delta.removeMessageIds = removeMessageIds;

  return hasChanges ? delta : null;
}

/**
 * Compute patch for a single message
 */
function computeMessagePatch(
  oldMsg: ChatMessage,
  newMsg: ChatMessage
): Partial<ChatMessage> | null {
  const patch: Partial<ChatMessage> = {};
  
  // Check content changes
  if (oldMsg.content !== newMsg.content) {
    patch.content = newMsg.content;
  }
  
  // Check thinking changes
  if (oldMsg.thinking !== newMsg.thinking) {
    patch.thinking = newMsg.thinking;
  }
  
  // Check tool calls (if any changed)
  if (!isEqual(oldMsg.toolCalls, newMsg.toolCalls)) {
    patch.toolCalls = newMsg.toolCalls;
  }
  
  // Check usage
  if (!isEqual(oldMsg.usage, newMsg.usage)) {
    patch.usage = newMsg.usage;
  }
  
  // Check toolSuccess (for tool messages)
  if (oldMsg.toolSuccess !== newMsg.toolSuccess) {
    patch.toolSuccess = newMsg.toolSuccess;
  }
  
  // Check media
  if (!isEqual(oldMsg.generatedImages, newMsg.generatedImages)) {
    patch.generatedImages = newMsg.generatedImages;
  }
  if (!isEqual(oldMsg.generatedAudio, newMsg.generatedAudio)) {
    patch.generatedAudio = newMsg.generatedAudio;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

// =============================================================================
// Delta Application
// =============================================================================

/**
 * Apply a delta to an existing session state
 * Returns the updated session with minimal object creation
 */
export function applySessionDelta(
  session: AgentSessionState,
  delta: SessionDelta
): DeltaApplicationResult {
  if (session.id !== delta.sessionId) {
    throw new Error(`Session ID mismatch: ${session.id} vs ${delta.sessionId}`);
  }

  let messagesChanged = 0;
  const propertiesChanged: string[] = [];
  
  // Start with a shallow copy
  let updatedSession: AgentSessionState = session;
  let messagesModified = false;
  let messages = session.messages;

  // Apply property updates
  if (delta.propertyUpdates) {
    updatedSession = { ...updatedSession, ...delta.propertyUpdates };
    propertiesChanged.push(...Object.keys(delta.propertyUpdates));
  }

  // Apply message removals
  if (delta.removeMessageIds && delta.removeMessageIds.length > 0) {
    const removeSet = new Set(delta.removeMessageIds);
    messages = messages.filter(m => !removeSet.has(m.id));
    messagesChanged += delta.removeMessageIds.length;
    messagesModified = true;
  }

  // Apply message updates
  if (delta.updateMessages && delta.updateMessages.length > 0) {
    const updateMap = new Map(delta.updateMessages.map(u => [u.id, u.patch]));
    messages = messages.map(m => {
      const patch = updateMap.get(m.id);
      if (patch) {
        messagesChanged++;
        return { ...m, ...patch };
      }
      return m;
    });
    messagesModified = true;
  }

  // Apply message appends
  if (delta.appendMessages && delta.appendMessages.length > 0) {
    messages = [...messages, ...delta.appendMessages];
    messagesChanged += delta.appendMessages.length;
    messagesModified = true;
  }

  // Only create new messages array if modified
  if (messagesModified) {
    updatedSession = { ...updatedSession, messages };
  }

  // Apply version
  (updatedSession as unknown as { _version?: number })._version = delta.version;

  return {
    session: updatedSession,
    messagesChanged,
    propertiesChanged,
  };
}

// =============================================================================
// Streaming Delta Builder
// =============================================================================

/**
 * Builder for accumulating streaming deltas efficiently
 */
export class StreamingDeltaBuilder {
  private messageContentDeltas = new Map<string, string>();
  private messageThinkingDeltas = new Map<string, string>();
  private flushCallback: ((sessionId: string, delta: SessionDelta) => void) | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionId: string;
  private version: number = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Set flush callback for automatic delta emission
   */
  setFlushCallback(callback: (sessionId: string, delta: SessionDelta) => void): void {
    this.flushCallback = callback;
  }

  /**
   * Append content delta for a message
   */
  appendContent(messageId: string, delta: string): void {
    const existing = this.messageContentDeltas.get(messageId) ?? '';
    this.messageContentDeltas.set(messageId, existing + delta);
    this.scheduleFlush();
  }

  /**
   * Append thinking delta for a message
   */
  appendThinking(messageId: string, delta: string): void {
    const existing = this.messageThinkingDeltas.get(messageId) ?? '';
    this.messageThinkingDeltas.set(messageId, existing + delta);
    this.scheduleFlush();
  }

  /**
   * Schedule a flush if not already scheduled
   */
  private scheduleFlush(): void {
    if (this.flushTimer) return;
    
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 16); // ~60fps
  }

  /**
   * Flush accumulated deltas
   */
  flush(): boolean {
    if (this.messageContentDeltas.size === 0 && this.messageThinkingDeltas.size === 0) {
      return false;
    }

    const updateMessages: SessionDelta['updateMessages'] = [];

    // Build content updates
    for (const [messageId, contentDelta] of this.messageContentDeltas) {
      updateMessages.push({
        id: messageId,
        patch: { content: contentDelta } as Partial<ChatMessage>,
      });
    }

    // Build thinking updates
    for (const [messageId, thinkingDelta] of this.messageThinkingDeltas) {
      const existing = updateMessages.find(u => u.id === messageId);
      if (existing) {
        existing.patch.thinking = thinkingDelta;
      } else {
        updateMessages.push({
          id: messageId,
          patch: { thinking: thinkingDelta } as Partial<ChatMessage>,
        });
      }
    }

    // Clear accumulators
    this.messageContentDeltas.clear();
    this.messageThinkingDeltas.clear();

    // Create and emit delta
    const delta: SessionDelta = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      version: ++this.version,
      updateMessages,
    };

    if (this.flushCallback) {
      this.flushCallback(this.sessionId, delta);
    }

    return true;
  }

  /**
   * Clear all accumulated deltas
   */
  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.messageContentDeltas.clear();
    this.messageThinkingDeltas.clear();
  }

  /**
   * Get accumulated content for a message
   */
  getAccumulatedContent(messageId: string): string | undefined {
    return this.messageContentDeltas.get(messageId);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Fast shallow equality check
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false;
    }
    return true;
  }
  
  return false;
}

/**
 * Fast message equality check
 */
function isMessageEqual(a: ChatMessage, b: ChatMessage): boolean {
  // Fast path: reference equality
  if (a === b) return true;
  
  // Check most commonly changed fields first
  if (a.content !== b.content) return false;
  if (a.toolSuccess !== b.toolSuccess) return false;
  if (a.thinking !== b.thinking) return false;
  
  // Check array fields
  if (!isEqual(a.toolCalls, b.toolCalls)) return false;
  if (!isEqual(a.usage, b.usage)) return false;
  
  return true;
}

/**
 * Estimate delta size in bytes for bandwidth tracking
 */
export function estimateDeltaSize(delta: SessionDelta): number {
  let size = 0;
  
  if (delta.appendMessages) {
    for (const msg of delta.appendMessages) {
      size += (msg.content?.length ?? 0) + (msg.thinking?.length ?? 0);
    }
  }
  
  if (delta.updateMessages) {
    for (const update of delta.updateMessages) {
      size += (update.patch.content?.length ?? 0) + (update.patch.thinking?.length ?? 0);
    }
  }
  
  return size;
}

export default {
  computeSessionDelta,
  applySessionDelta,
  StreamingDeltaBuilder,
  estimateDeltaSize,
};
