import { useRef, useCallback, useEffect, useMemo } from 'react';
import { useThrottleControl } from './useThrottleControl';

/** Streaming mode determines how content is batched and delivered */
export type StreamingMode = 
  | 'balanced'      // Default: 32ms intervals (~30fps), smooth word-by-word streaming
  | 'smooth'        // 24ms intervals (~40fps), smoother character flow
  | 'fast'          // 80ms intervals (~12fps), performance focused
  | 'typewriter';   // 16ms intervals (60fps), character-by-character visual effect

interface StreamingBufferOptions {
  /** Streaming mode preset (default: 'balanced') */
  mode?: StreamingMode;
  /** Custom flush interval in milliseconds (overrides mode) */
  flushInterval?: number;
  /** Maximum buffer size before forced flush (default: 100 chars) */
  maxBufferSize?: number;
  /** Callback when buffer is flushed */
  onFlush: (sessionId: string, messageId: string, accumulatedDelta: string) => void;
  /** Enable adaptive batching based on content rate (default: true) */
  adaptiveBatching?: boolean;
  /** Enable agent-aware throttling (uses faster interval when agent running) */
  agentAwareThrottling?: boolean;
}

interface BufferState {
  sessionId: string;
  messageId: string;
  content: string;
  lastFlush: number;
  /** Track characters received in the last second for adaptive batching */
  recentCharsCount: number;
  recentCharsTimestamp: number;
}

/** Mode presets for flush intervals */
const MODE_INTERVALS: Record<StreamingMode, number> = {
  balanced: 32,    // ~30 fps - smooth word-by-word streaming
  smooth: 24,      // ~40 fps - smoother character flow
  fast: 80,        // ~12 fps - performance focused
  typewriter: 16,  // 60 fps - for character-by-character effect
};

/** Interval when agent is running — use 32ms (~30fps) for smooth word-by-word streaming.
 *  30fps provides visually smooth text flow while keeping React overhead reasonable.
 *  Lower values (16ms/60fps) offer no perceptible improvement for text but double GC cost. */
const AGENT_RUNNING_INTERVAL = 32;

/**
 * A hook that batches streaming deltas to reduce React re-renders.
 * Instead of dispatching every single character, it accumulates deltas
 * and flushes them at a controlled rate for smooth rendering.
 * 
 * Performance optimizations:
 * - Uses setTimeout instead of RAF for more predictable batching
 * - Adaptive batching based on incoming character rate
 * - Multiple streaming modes for different use cases
 * - Efficient buffer management with automatic cleanup
 * - Idle detection to stop flush loop when not needed
 * - Agent-aware throttling: uses faster intervals when agent is running
 */
export const useStreamingBuffer = (options: StreamingBufferOptions) => {
  const {
    mode = 'balanced',
    flushInterval: customInterval,
    maxBufferSize = 100,
    onFlush,
    adaptiveBatching = true,
    agentAwareThrottling = true,
  } = options;
  
  // Get agent running state for adaptive throttling
  const { isAgentRunning, shouldBypassThrottle } = useThrottleControl();
  
  // Compute base flush interval from mode or custom value
  const baseFlushInterval = useMemo(() => 
    customInterval ?? MODE_INTERVALS[mode],
    [customInterval, mode]
  );
  
  // Compute effective flush interval - use fastest interval when agent is running
  const flushInterval = useMemo(() => {
    if (agentAwareThrottling && (isAgentRunning || shouldBypassThrottle)) {
      return AGENT_RUNNING_INTERVAL;
    }
    return baseFlushInterval;
  }, [agentAwareThrottling, isAgentRunning, shouldBypassThrottle, baseFlushInterval]);

  // Keyed by `${sessionId}:${messageId}`
  const buffersRef = useRef<Map<string, BufferState>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFlushRef = useRef(onFlush);
  const isActiveRef = useRef(false);
  
  // Track high-throughput sessions for adaptive batching
  const highThroughputRef = useRef<Set<string>>(new Set());

  // Keep onFlush ref updated
  useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);

  const flush = useCallback((sessionId: string, messageId: string, force = false) => {
    const key = `${sessionId}:${messageId}`;
    const buffer = buffersRef.current.get(key);
    if (!buffer || buffer.content.length === 0) return;

    const now = performance.now();
    const timeSinceLastFlush = now - buffer.lastFlush;
    
    // Adaptive batching: increase flush interval if receiving many characters
    let effectiveInterval = flushInterval;
    if (adaptiveBatching) {
      const timeSinceCount = now - buffer.recentCharsTimestamp;
      if (timeSinceCount < 1000 && timeSinceCount > 0) {
        // Calculate characters per second
        const charsPerSecond = buffer.recentCharsCount / (timeSinceCount / 1000);
        
        // If receiving more than 500 chars/second, slightly increase interval
        // Capped at 1.5x base to avoid visible chunking during fast streaming
        if (charsPerSecond > 500) {
          effectiveInterval = Math.min(flushInterval * 1.5, 64);
          highThroughputRef.current.add(sessionId);
        } else {
          highThroughputRef.current.delete(sessionId);
        }
      }
    }

    // Only flush if enough time has passed or buffer is large
    if (force || timeSinceLastFlush >= effectiveInterval || buffer.content.length >= maxBufferSize) {
      const content = buffer.content;
      buffer.content = '';
      buffer.lastFlush = now;
      onFlushRef.current(sessionId, messageId, content);
    }
  }, [flushInterval, maxBufferSize, adaptiveBatching]);

  const flushSession = useCallback((sessionId: string, force = false) => {
    for (const buffer of buffersRef.current.values()) {
      if (buffer.sessionId !== sessionId) continue;
      flush(buffer.sessionId, buffer.messageId, force);
    }
  }, [flush]);

  const flushAll = useCallback((force = false) => {
    let hasContent = false;
    for (const buffer of buffersRef.current.values()) {
      if (buffer.content.length > 0) {
        hasContent = true;
        flush(buffer.sessionId, buffer.messageId, force);
      }
    }
    return hasContent;
  }, [flush]);

  // PERFORMANCE OPTIMIZATION: Use setTimeout instead of RAF for more predictable batching
  // RAF runs at 60fps which is too frequent for text streaming
  const startFlushLoop = useCallback(() => {
    if (flushTimerRef.current !== null) return; // Already running
    
    const tick = () => {
      flushAll(false);
      
      // Check if any buffer still has content
      let stillActive = false;
      for (const buffer of buffersRef.current.values()) {
        if (buffer.content.length > 0) {
          stillActive = true;
          break;
        }
      }
      
      // Only continue the loop if there's still content to flush
      if (stillActive) {
        flushTimerRef.current = setTimeout(tick, flushInterval);
      } else {
        flushTimerRef.current = null;
        isActiveRef.current = false;
      }
    };
    
    isActiveRef.current = true;
    flushTimerRef.current = setTimeout(tick, flushInterval);
  }, [flushAll, flushInterval]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // Flush any remaining content on unmount
      flushAll(true);
    };
  }, [flushAll]);


  const appendDelta = useCallback((sessionId: string, messageId: string, delta: string) => {
    // Guard against undefined/null delta - skip if delta is not a valid string
    if (typeof delta !== 'string') {
      return;
    }

    const key = `${sessionId}:${messageId}`;
    let buffer = buffersRef.current.get(key);
    const now = performance.now();
    
    if (!buffer) {
      buffer = { 
        sessionId,
        messageId,
        content: '', 
        lastFlush: now,
        recentCharsCount: 0,
        recentCharsTimestamp: now,
      };
      buffersRef.current.set(key, buffer);
    }
    
    buffer.content += delta;
    
    // Update character rate tracking for adaptive batching
    if (adaptiveBatching) {
      const timeSinceReset = now - buffer.recentCharsTimestamp;
      if (timeSinceReset > 1000) {
        // Reset counter every second
        buffer.recentCharsCount = delta.length;
        buffer.recentCharsTimestamp = now;
      } else {
        buffer.recentCharsCount += delta.length;
      }
    }

    // Start the flush loop if not already running (on-demand RAF)
    if (!isActiveRef.current) {
      startFlushLoop();
    }

    // If buffer gets too large, flush immediately to prevent memory issues
    if (buffer.content.length >= maxBufferSize * 2) {
      flush(sessionId, messageId, true);
    }
  }, [flush, maxBufferSize, adaptiveBatching, startFlushLoop]);

  const clearBuffer = useCallback((sessionId: string) => {
    // Flush and clear all message buffers for this session
    flushSession(sessionId, true);
    for (const key of buffersRef.current.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        buffersRef.current.delete(key);
      }
    }
  }, [flushSession]);

  const clearAllBuffers = useCallback(() => {
    flushAll(true);
    buffersRef.current.clear();
    highThroughputRef.current.clear();
  }, [flushAll]);
  
  /** Check if a session is currently in high-throughput streaming mode */
  const isHighThroughput = useCallback((sessionId: string) => {
    return highThroughputRef.current.has(sessionId);
  }, []);
  
  /** Get current buffer size for a session (useful for debugging) */
  const getBufferSize = useCallback((sessionId: string): number => {
    // Buffers are keyed as `${sessionId}:${messageId}` — sum all buffers for this session
    let total = 0;
    for (const [key, buf] of buffersRef.current.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        total += buf.content.length;
      }
    }
    return total;
  }, []);
  
  /** Check if the flush loop is currently active */
  const isActive = useCallback(() => isActiveRef.current, []);

  return {
    appendDelta,
    flush,
    flushSession,
    flushAll,
    clearBuffer,
    clearAllBuffers,
    isHighThroughput,
    getBufferSize,
    isActive,
    /** Current streaming mode */
    mode,
    /** Effective flush interval being used (may be faster when agent is running) */
    flushInterval,
    /** Base flush interval before agent-aware adjustments */
    baseFlushInterval,
    /** Whether agent is currently running (affects flush interval) */
    isAgentRunning,
    /** Whether throttling is being bypassed */
    isThrottleBypassed: shouldBypassThrottle,
  };
}
