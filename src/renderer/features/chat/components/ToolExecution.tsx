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
 * - Grouped display for batch file operations
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
import type { ToolCall } from './toolExecution/types';

/**
 * Props for ToolExecution component
 */
interface ToolExecutionProps {
  messages: ChatMessage[];
  isRunning?: boolean;
  toolResults?: Map<string, ToolResultEvent>;
  sessionId?: string;
  onStop?: () => void;
  /** Real-time executing tools from state (keyed by callId) */
  executingTools?: Record<string, { callId: string; name: string; arguments?: Record<string, unknown>; startedAt: number }>;
  /** Queued tools waiting to execute */
  queuedTools?: Array<{ callId: string; name: string; arguments?: Record<string, unknown>; queuePosition: number; queuedAt: number }>;
  /** Tools awaiting approval */
  pendingTools?: Array<{ callId: string; name: string; arguments?: Record<string, unknown> }>;
}

/** Check if a tool is a file operation */
function isFileOperationTool(name: string): boolean {
  return name === 'write' || name === 'edit' || name === 'create_file';
}

/** Get group category for a tool */
function getToolGroupCategory(name: string): string | null {
  if (isFileOperationTool(name)) return 'file_ops';
  if (name === 'ls' || name === 'list_directory') return 'ls';
  if (name === 'read' || name === 'read_file') return 'read';
  if (name === 'search' || name === 'grep') return 'search';
  return null;
}

/** Group type for tool grouping */
type ToolGroup = 
  | { type: 'single'; tool: ToolCall }
  | { type: 'fileGroup'; tools: ToolCall[] }
  | { type: 'toolGroup'; category: string; tools: ToolCall[] };

/**
 * Sort tools to show running/queued first, then completed
 */
function sortToolsByStatus(tools: ToolCall[]): ToolCall[] {
  const statusOrder: Record<string, number> = {
    'running': 0,
    'queued': 1,
    'pending': 2,
    'error': 3,
    'completed': 4,
  };
  
  return [...tools].sort((a, b) => {
    const orderA = statusOrder[a.status] ?? 5;
    const orderB = statusOrder[b.status] ?? 5;
    if (orderA !== orderB) return orderA - orderB;
    // For same status, sort by start time (newest first for running, oldest first for completed)
    if (a.status === 'running' || a.status === 'queued') {
      return (b.startTime ?? 0) - (a.startTime ?? 0);
    }
    return (a.startTime ?? 0) - (b.startTime ?? 0);
  });
}

/** Group similar operations together (non-consecutive grouping) */
function groupToolCalls(tools: ToolCall[]): ToolGroup[] {
  // Sort tools to show running/queued first
  const sortedTools = sortToolsByStatus(tools);
  
  // Collect tools by category
  const categoryTools = new Map<string, ToolCall[]>();
  const ungroupedTools: ToolCall[] = [];
  
  for (const tool of sortedTools) {
    const category = getToolGroupCategory(tool.name);
    const isCompleted = tool.status === 'completed';
    
    if (category && isCompleted) {
      if (!categoryTools.has(category)) {
        categoryTools.set(category, []);
      }
      categoryTools.get(category)!.push(tool);
    } else {
      ungroupedTools.push(tool);
    }
  }

  const result: ToolGroup[] = [];
  
  // Add ungrouped tools first (includes running, queued, pending, single completed)
  for (const tool of ungroupedTools) {
    result.push({ type: 'single', tool });
  }
  
  // Add grouped tools after (completed categories with 2+ tools)
  for (const [category, categoryToolList] of categoryTools) {
    if (categoryToolList.length >= 2) {
      if (category === 'file_ops') {
        result.push({ type: 'fileGroup', tools: categoryToolList });
      } else {
        result.push({ type: 'toolGroup', category, tools: categoryToolList });
      }
    } else {
      // Single tool in category, add as ungrouped
      for (const tool of categoryToolList) {
        result.push({ type: 'single', tool });
      }
    }
  }

  return result;
}

const ToolExecutionComponent: React.FC<ToolExecutionProps> = ({
  messages,
  isRunning = false,
  toolResults,
  executingTools,
  queuedTools,
  pendingTools,
  onStop: _onStop, // Reserved for future stop functionality
}) => {
  // Track manually collapsed tools - file ops default to expanded
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Set<string>>(new Set());
  // Track manually expanded tools - non-file ops default to collapsed
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const runningStartTimesRef = useRef<Map<string, number>>(new Map());

  // Extract tool calls and their results
  const toolCalls = useMemo(() => {
    return buildToolCalls({
      messages,
      toolResults,
      isRunning,
      runningStartTimes: runningStartTimesRef.current,
      executingTools,
      queuedTools,
      pendingTools,
    });
  }, [messages, isRunning, toolResults, executingTools, queuedTools, pendingTools]);

  // Compute the effective expanded tools set (for passing to child components)
  const expandedTools = useMemo(() => {
    const expanded = new Set<string>();
    for (const tool of toolCalls) {
      const isFileOp = isFileOperationTool(tool.name);
      const isCompleted = tool.status === 'completed';
      
      if (isFileOp && isCompleted) {
        // File ops are expanded by default unless manually collapsed
        if (!manuallyCollapsed.has(tool.callId)) {
          expanded.add(tool.callId);
        }
      } else {
        // Other tools are collapsed by default unless manually expanded
        if (manuallyExpanded.has(tool.callId)) {
          expanded.add(tool.callId);
        }
      }
    }
    return expanded;
  }, [toolCalls, manuallyCollapsed, manuallyExpanded]);

  const toggleExpanded = useCallback((callId: string) => {
    // Find the tool to determine its type
    const tool = toolCalls.find(t => t.callId === callId);
    const isFileOp = tool && isFileOperationTool(tool.name);
    const isCompleted = tool && tool.status === 'completed';
    
    if (isFileOp && isCompleted) {
      // For file ops, toggle the collapsed state
      setManuallyCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(callId)) {
          next.delete(callId);
        } else {
          next.add(callId);
        }
        return next;
      });
    } else {
      // For other tools, toggle the expanded state
      setManuallyExpanded(prev => {
        const next = new Set(prev);
        if (next.has(callId)) {
          next.delete(callId);
        } else {
          next.add(callId);
        }
        return next;
      });
    }
  }, [toolCalls]);

  const toggleGroupExpanded = useCallback((groupIdx: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupIdx)) {
        next.delete(groupIdx);
      } else {
        next.add(groupIdx);
      }
      return next;
    });
  }, []);

  // Handle opening file - opens with system default application
  const handleOpenFile = useCallback((path: string) => {
    window.vyotiq.files.open(path);
  }, []);

  // Group consecutive file operations
  const groupedTools = useMemo(() => groupToolCalls(toolCalls), [toolCalls]);

  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="font-mono text-[10px] min-w-0 w-full">
      {/* Tool list with grouping */}
      <div className="space-y-0.5 min-w-0 w-full">
        {groupedTools.map((item, idx) => {
          if (item.type === 'single') {
            return (
              <ToolItem
                key={item.tool.callId}
                tool={item.tool}
                isExpanded={expandedTools.has(item.tool.callId)}
                onToggle={() => toggleExpanded(item.tool.callId)}
                isLast={idx === groupedTools.length - 1}
                onOpenFile={handleOpenFile}
              />
            );
          }

          if (item.type === 'fileGroup') {
            return (
              <FileOperationGroup
                key={`group-${idx}`}
                tools={item.tools}
                isExpanded={expandedGroups.has(idx)}
                onToggle={() => toggleGroupExpanded(idx)}
                expandedTools={expandedTools}
                onToggleTool={toggleExpanded}
                onOpenFile={handleOpenFile}
                isLast={idx === groupedTools.length - 1}
              />
            );
          }

          // Tool group (ls, read, search, etc.)
          return (
            <ToolOperationGroup
              key={`toolgroup-${idx}`}
              category={item.category}
              tools={item.tools}
              isExpanded={expandedGroups.has(idx)}
              onToggle={() => toggleGroupExpanded(idx)}
              expandedTools={expandedTools}
              onToggleTool={toggleExpanded}
              isLast={idx === groupedTools.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
};

/** Get label for tool group category */
function getToolGroupLabel(category: string): string {
  switch (category) {
    case 'ls':
      return 'Listed directories';
    case 'read':
      return 'Read files';
    case 'search':
      return 'Searched codebase';
    default:
      return 'Completed operations';
  }
}

/** Grouped tool operations display (ls, read, search, etc.) */
const ToolOperationGroup: React.FC<{
  category: string;
  tools: ToolCall[];
  isExpanded: boolean;
  onToggle: () => void;
  expandedTools: Set<string>;
  onToggleTool: (callId: string) => void;
  isLast: boolean;
}> = memo(({ category, tools, isExpanded, onToggle, expandedTools, onToggleTool, isLast }) => {
  const label = getToolGroupLabel(category);
  const successCount = tools.filter(t => t.status === 'completed').length;
  const errorCount = tools.filter(t => t.status === 'error').length;
  const hasErrors = errorCount > 0;

  return (
    <div className={cn('group/toolgroup min-w-0', !isLast && 'mb-0.5')}>
      {/* Group header */}
      <button
        type="button"
        className={cn(
          'flex items-center gap-1.5 py-0.5 cursor-pointer min-w-0 w-full',
          'hover:bg-[var(--color-surface-1)]/30 rounded-sm px-1 -mx-1',
          'transition-colors duration-100',
          'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25',
          hasErrors && 'bg-[var(--color-error)]/5',
        )}
        onClick={onToggle}
      >
        <span className="text-[9px] text-[var(--color-text-dim)] w-8">
          {isExpanded ? 'hide' : 'show'}
        </span>

        {/* Descriptive summary text */}
        <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
          {label} ({tools.length})
        </span>

        {/* Status breakdown */}
        <span className="ml-auto flex items-center gap-2 text-[9px] font-mono">
          {successCount > 0 && (
            <span className="text-[var(--color-success)]">{successCount} ok</span>
          )}
          {errorCount > 0 && (
            <span className="text-[var(--color-error)]">{errorCount} failed</span>
          )}
        </span>
      </button>

      {/* Expanded individual tools */}
      {isExpanded && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--color-border-subtle)] pl-2">
          {tools.map((tool, idx) => (
            <ToolItem
              key={tool.callId}
              tool={tool}
              isExpanded={expandedTools.has(tool.callId)}
              onToggle={() => onToggleTool(tool.callId)}
              isLast={idx === tools.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});

ToolOperationGroup.displayName = 'ToolOperationGroup';

/** Grouped file operations display */
const FileOperationGroup: React.FC<{
  tools: ToolCall[];
  isExpanded: boolean;
  onToggle: () => void;
  expandedTools: Set<string>;
  onToggleTool: (callId: string) => void;
  onOpenFile?: (path: string) => void;
  isLast: boolean;
}> = memo(({ tools, isExpanded, onToggle, expandedTools, onToggleTool, onOpenFile, isLast }) => {
  // Compute aggregate stats
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let created = 0;
    let modified = 0;
    let errors = 0;

    for (const tool of tools) {
      if (tool.status === 'error') {
        errors++;
        continue;
      }
      
      const meta = tool.resultMetadata;
      if (!meta) continue;

      const originalContent = (meta.originalContent as string) || '';
      const newContent = (meta.newContent as string) || (meta.content as string) || '';
      const isNew = !originalContent || originalContent.length === 0;

      if (isNew) {
        created++;
        added += newContent.split('\n').length;
      } else {
        modified++;
        const originalLines = originalContent.split('\n');
        const newLines = newContent.split('\n');
        const originalSet = new Set(originalLines);
        const newSet = new Set(newLines);
        
        for (const line of newLines) {
          if (!originalSet.has(line)) added++;
        }
        for (const line of originalLines) {
          if (!newSet.has(line)) removed++;
        }
      }
    }

    return { added, removed, created, modified, errors, total: tools.length };
  }, [tools]);

  const hasErrors = stats.errors > 0;

  return (
    <div className={cn('group/filegroup min-w-0', !isLast && 'mb-0.5')}>
      {/* Group header */}
      <button
        type="button"
        className={cn(
          'flex items-center gap-1.5 py-0.5 cursor-pointer min-w-0 w-full',
          'hover:bg-[var(--color-surface-1)]/30 rounded-sm px-1 -mx-1',
          'transition-colors duration-100',
          'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25',
        )}
        onClick={onToggle}
      >
        {/* Expand/collapse indicator */}
        <span className="text-[9px] text-[var(--color-text-dim)] w-8">
          {isExpanded ? 'hide' : 'show'}
        </span>

        {/* Descriptive summary text */}
        <span className="text-[10px] font-medium text-[var(--color-text-secondary)]">
          Modified {stats.total} files
        </span>
        
        {/* Breakdown */}
        <span className="text-[10px] text-[var(--color-text-dim)]">
          {stats.created > 0 && stats.modified > 0 
            ? `(${stats.created} created, ${stats.modified} edited)`
            : stats.created > 0 
              ? `(all created)`
              : `(all edited)`
          }
          {hasErrors && <span className="text-[var(--color-error)] ml-1">{stats.errors} failed</span>}
        </span>

        {/* Aggregate diff stats */}
        <span className="ml-auto flex items-center gap-2 text-[9px] font-mono">
          {stats.added > 0 && (
            <span className="text-[var(--color-success)]">+{stats.added}</span>
          )}
          {stats.removed > 0 && (
            <span className="text-[var(--color-error)]">-{stats.removed}</span>
          )}
        </span>
      </button>

      {/* Expanded individual tools */}
      {isExpanded && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--color-border-subtle)] pl-2">
          {tools.map((tool, idx) => (
            <ToolItem
              key={tool.callId}
              tool={tool}
              isExpanded={expandedTools.has(tool.callId)}
              onToggle={() => onToggleTool(tool.callId)}
              isLast={idx === tools.length - 1}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
});

FileOperationGroup.displayName = 'FileOperationGroup';

export const ToolExecution = memo(ToolExecutionComponent);
ToolExecution.displayName = 'ToolExecution';
