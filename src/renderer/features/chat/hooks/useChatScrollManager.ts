/**
 * useChatScrollManager Hook
 * 
 * Unified scroll management for ChatArea, supporting both
 * virtualized and non-virtualized rendering modes.
 * 
 * Features:
 * - Smooth scroll to bottom during streaming
 * - User scroll intent detection (won't auto-scroll if user scrolled up)
 * - Session change handling (instant scroll on new session)
 * - Streaming start handling (force scroll when streaming begins)
 * - New message detection (scroll on new messages)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useChatScroll } from '../../../hooks/useChatScroll';
import { useVirtualizedList } from '../../../hooks/useVirtualizedList';
import type { groupMessagesByRun } from './useChatAreaState';

export interface UseChatScrollManagerOptions {
  /** Whether virtualization should be enabled */
  shouldVirtualize: boolean;
  /** Current session ID */
  sessionId: string | undefined;
  /** All messages for the session */
  messages: unknown[] | undefined;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Last assistant content length (for scroll dependency) */
  lastAssistantContentLength: number;
  /** Grouped messages for virtualization */
  renderGroups: ReturnType<typeof groupMessagesByRun>;
  /** Estimated item height for virtualization */
  estimatedItemHeight?: number;
  /** Overscan items for virtualization */
  overscan?: number;
}

export interface ChatScrollManagerResult {
  /** Ref for non-virtualized scroll container */
  scrollRef: React.RefObject<HTMLDivElement>;
  /** Ref for virtualized scroll container */
  virtualContainerRef: React.RefObject<HTMLDivElement>;
  /** Handle scroll to bottom button click */
  handleScrollToBottom: () => void;
  /** Whether to show the scroll to bottom button */
  showScrollToBottom: boolean;
  /** Virtual items for rendering (when virtualized) */
  virtualItems: ReturnType<typeof useVirtualizedList>['virtualItems'];
  /** Total height for virtual container */
  totalHeight: number;
  /** Measure item height callback for virtualization */
  measureItem: ReturnType<typeof useVirtualizedList>['measureItem'];
}

/**
 * Custom hook for unified scroll management in ChatArea
 */
export function useChatScrollManager({
  shouldVirtualize,
  sessionId,
  messages,
  isStreaming,
  lastAssistantContentLength,
  renderGroups,
  estimatedItemHeight = 150,
  overscan = 3,
}: UseChatScrollManagerOptions): ChatScrollManagerResult {
  // Virtualized list for performance with large histories
  const {
    virtualItems,
    totalHeight,
    containerRef: virtualContainerRef,
    scrollToBottom: virtualScrollToBottom,
    isNearBottom: isNearBottomVirtualized,
    measureItem,
  } = useVirtualizedList({
    items: renderGroups,
    estimatedItemHeight,
    overscan,
    gap: 12, // Match gap-3 from non-virtualized mode
    autoScrollToBottom: true,
    getItemKey: (item, index) => item.runId ?? `group-${index}`,
    streamingMode: isStreaming,
    streamingDep: lastAssistantContentLength,
  });

  // Scroll hook for non-virtualized mode only
  const { scrollRef, forceScrollToBottom, isNearBottom: isNearBottomNonVirt } = useChatScroll(
    `${messages?.length ?? 0}-${lastAssistantContentLength}`,
    {
      enabled: !shouldVirtualize,
      threshold: 200,
      streamingMode: isStreaming && !shouldVirtualize,
    }
  );

  // Unified isNearBottom for both modes
  const showScrollToBottom = shouldVirtualize ? !isNearBottomVirtualized : !isNearBottomNonVirt();

  // Handle scroll to bottom button click
  const handleScrollToBottom = useCallback(() => {
    if (shouldVirtualize) {
      virtualScrollToBottom('smooth');
    } else {
      forceScrollToBottom();
    }
  }, [shouldVirtualize, virtualScrollToBottom, forceScrollToBottom]);

  // Track session changes for scroll reset
  const prevSessionIdRef = useRef<string | null>(null);
  const wasStreamingRef = useRef(false);
  const lastMsgRef = useRef<string | null>(null);
  const lastMsgCountRef = useRef(0);

  // Scroll to bottom when session loads or changes
  useEffect(() => {
    if (!sessionId) return;
    
    // Only scroll on session change (not on every render)
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      
      // Wait for the container to be mounted and measured
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (shouldVirtualize) {
            virtualScrollToBottom('instant');
          } else {
            forceScrollToBottom();
          }
        });
      });
    }
  }, [sessionId, shouldVirtualize, virtualScrollToBottom, forceScrollToBottom]);

  // Force scroll to bottom when streaming starts
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      // Streaming just started - force scroll to bottom
      requestAnimationFrame(() => {
        if (shouldVirtualize) {
          virtualScrollToBottom('instant');
        } else {
          forceScrollToBottom();
        }
      });
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, shouldVirtualize, virtualScrollToBottom, forceScrollToBottom]);

  // Force scroll when new message is added
  useEffect(() => {
    if (!messages) return;
    const msgCount = messages.length;
    const lastMsg = messages[msgCount - 1] as { id?: string } | undefined;

    // Force scroll when new message is added (not just content update)
    if (lastMsg && (lastMsg.id !== lastMsgRef.current || msgCount > lastMsgCountRef.current)) {
      lastMsgRef.current = lastMsg.id ?? null;
      lastMsgCountRef.current = msgCount;
      
      if (shouldVirtualize) {
        virtualScrollToBottom();
      } else {
        forceScrollToBottom();
      }
    }
  }, [messages, forceScrollToBottom, virtualScrollToBottom, shouldVirtualize]);

  return {
    scrollRef,
    virtualContainerRef,
    handleScrollToBottom,
    showScrollToBottom,
    virtualItems,
    totalHeight,
    measureItem,
  };
}
