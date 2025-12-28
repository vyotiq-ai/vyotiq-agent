/**
 * Tool Execution Component
 * 
 * Displays tool calls and their execution status in a clean inline format.
 * 
 * #### Features
 * - Real-time execution status with elapsed time
 * - Tool-specific icons and context labels
 * - Expandable tool details (arguments, output preview)
 * - Visual connection to parent assistant message
 * 
 * @example
 * <ToolExecution 
 *   messages={sessionMessages}
 *   isRunning={true}
 *   sessionId={currentSessionId}
 * />
 */
import React, { memo, useMemo, useState, useCallback, useRef } from 'react';
import type { ChatMessage, ToolResultEvent } from '../../../../shared/types';
import { cn } from '../../../utils/cn';

import { ToolItem } from './toolExecution/ToolItem';
import { buildToolCalls } from '../utils/buildToolCalls';

/**
 * Props for ToolExecution component
 */
interface ToolExecutionProps {
  messages: ChatMessage[];
  isRunning?: boolean;
  toolResults?: Map<string, ToolResultEvent>;
  sessionId?: string;
  className?: string;
}

const ToolExecutionComponent: React.FC<ToolExecutionProps> = ({
  messages,
  isRunning = false,
  toolResults,
  className,
}) => {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const runningStartTimesRef = useRef<Map<string, number>>(new Map());
  
  const toggleExpanded = useCallback((callId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  }, []);

  // Extract tool calls and their results
  const toolCalls = useMemo(() => {
    return buildToolCalls({
      messages,
      toolResults,
      isRunning,
      runningStartTimes: runningStartTimesRef.current,
    });
  }, [messages, isRunning, toolResults]);

  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <div className={cn(
      'font-mono text-[11px] min-w-0 max-w-full',
      className,
    )}>
      {/* Tool list */}
      <div className="space-y-0.5 min-w-0 overflow-hidden">
        {toolCalls.map((tool, idx) => (
          <ToolItem
            key={tool.callId}
            tool={tool}
            isExpanded={expandedTools.has(tool.callId)}
            onToggle={() => toggleExpanded(tool.callId)}
            isLast={idx === toolCalls.length - 1}
          />
        ))}
      </div>
    </div>
  );
};

export const ToolExecution = memo(ToolExecutionComponent);
