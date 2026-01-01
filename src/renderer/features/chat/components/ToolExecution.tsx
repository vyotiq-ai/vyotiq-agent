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
import { ChevronDown, ChevronRight, FileCode, Check, Plus, Minus, Folder, Search, FileText } from 'lucide-react';
import type { ChatMessage, ToolResultEvent } from '../../../../shared/types';
import { cn } from '../../../utils/cn';
import { useEditor } from '../../../state/EditorProvider';

import { ToolItem } from './toolExecution/ToolItem';
import { ToolExecutionHeader } from './toolExecution/ToolExecutionHeader';
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

/** Group similar operations together (non-consecutive grouping) */
function groupToolCalls(tools: ToolCall[]): ToolGroup[] {
  // Collect tools by category
  const categoryTools = new Map<string, ToolCall[]>();
  const ungroupedTools: ToolCall[] = [];
  
  for (const tool of tools) {
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
  
  // Add grouped tools first (categories with 2+ tools)
  for (const [category, categoryToolList] of categoryTools) {
    if (categoryToolList.length >= 2) {
      if (category === 'file_ops') {
        result.push({ type: 'fileGroup', tools: categoryToolList });
      } else {
        result.push({ type: 'toolGroup', category, tools: categoryToolList });
      }
    } else {
      // Single tool in category, add as ungrouped
      ungroupedTools.push(...categoryToolList);
    }
  }
  
  // Add ungrouped tools
  for (const tool of ungroupedTools) {
    result.push({ type: 'single', tool });
  }

  return result;
}

const ToolExecutionComponent: React.FC<ToolExecutionProps> = ({
  messages,
  isRunning = false,
  toolResults,
  onStop,
}) => {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const runningStartTimesRef = useRef<Map<string, number>>(new Map());
  const { showDiff, showEditor, openFile } = useEditor();
  
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

  // Handle opening diff in the full editor with toolCallId for history tracking
  const handleOpenDiffEditor = useCallback((path: string, original: string, modified: string, toolCallId?: string) => {
    showDiff(path, original, modified, toolCallId);
    showEditor();
  }, [showDiff, showEditor]);

  // Handle opening file in editor
  const handleOpenFile = useCallback((path: string) => {
    openFile(path);
    showEditor();
  }, [openFile, showEditor]);

  // Extract tool calls and their results
  const toolCalls = useMemo(() => {
    return buildToolCalls({
      messages,
      toolResults,
      isRunning,
      runningStartTimes: runningStartTimesRef.current,
    });
  }, [messages, isRunning, toolResults]);

  // Group consecutive file operations
  const groupedTools = useMemo(() => groupToolCalls(toolCalls), [toolCalls]);

  // Compute tool stats for header
  const toolStats = useMemo(() => {
    let running = 0;
    let completed = 0;
    let errors = 0;
    for (const tool of toolCalls) {
      if (tool.status === 'running') running++;
      else if (tool.status === 'completed') completed++;
      else if (tool.status === 'error') errors++;
    }
    return { running, completed, errors };
  }, [toolCalls]);

  if (toolCalls.length === 0) {
    return null;
  }

  // Only show header when there are multiple tools or when running
  const showHeader = toolCalls.length > 3 || isRunning;

  return (
    <div className="font-mono text-[11px] min-w-0 max-w-full">
      {/* Header with stats - shown for multiple tools or when running */}
      {showHeader && (
        <ToolExecutionHeader
          toolCount={toolCalls.length}
          runningCount={toolStats.running}
          completedCount={toolStats.completed}
          errorCount={toolStats.errors}
          isRunning={isRunning}
          onStop={onStop}
        />
      )}
      
      {/* Tool list with grouping */}
      <div className="space-y-0.5 min-w-0 overflow-hidden">
        {groupedTools.map((item, idx) => {
          if (item.type === 'single') {
            return (
              <ToolItem
                key={item.tool.callId}
                tool={item.tool}
                isExpanded={expandedTools.has(item.tool.callId)}
                onToggle={() => toggleExpanded(item.tool.callId)}
                isLast={idx === groupedTools.length - 1}
                onOpenDiffEditor={handleOpenDiffEditor}
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
                onOpenDiffEditor={handleOpenDiffEditor}
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

/** Get icon and label for tool group category */
function getToolGroupInfo(category: string): { icon: React.ElementType; label: string } {
  switch (category) {
    case 'ls':
      return { icon: Folder, label: 'directories' };
    case 'read':
      return { icon: FileText, label: 'files' };
    case 'search':
      return { icon: Search, label: 'searches' };
    default:
      return { icon: FileCode, label: 'operations' };
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
  const { icon: GroupIcon, label } = getToolGroupInfo(category);
  const successCount = tools.filter(t => t.status === 'completed').length;
  const errorCount = tools.filter(t => t.status === 'error').length;
  const hasErrors = errorCount > 0;

  return (
    <div className={cn('group/toolgroup min-w-0 overflow-hidden', !isLast && 'mb-0.5')}>
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
        <span className="text-[var(--color-text-dim)] opacity-40 w-2.5">
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>

        {/* Status indicator - show error if any failed */}
        <Check size={10} className={cn(
          'flex-shrink-0',
          hasErrors ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'
        )} />

        {/* Category icon */}
        <GroupIcon size={10} className="text-[var(--color-text-muted)] flex-shrink-0" />

        {/* Summary text */}
        <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
          {tools.length} {label}
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
  onOpenDiffEditor?: (path: string, original: string, modified: string, toolCallId?: string) => void;
  onOpenFile?: (path: string) => void;
  isLast: boolean;
}> = memo(({ tools, isExpanded, onToggle, expandedTools, onToggleTool, onOpenDiffEditor, onOpenFile, isLast }) => {
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
    <div className={cn('group/filegroup min-w-0 overflow-hidden', !isLast && 'mb-0.5')}>
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
        <span className="text-[var(--color-text-dim)] opacity-40 w-2.5">
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>

        {/* Status indicator - show warning if any failed */}
        <Check size={10} className={cn(
          'flex-shrink-0',
          hasErrors ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'
        )} />

        {/* File icon */}
        <FileCode size={10} className="text-[var(--color-text-muted)] flex-shrink-0" />

        {/* Summary text */}
        <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
          {stats.total} files
        </span>
        
        {/* Breakdown */}
        <span className="text-[10px] text-[var(--color-text-dim)]">
          {stats.created > 0 && stats.modified > 0 
            ? `(${stats.created} created, ${stats.modified} modified)`
            : stats.created > 0 
              ? `(${stats.created} created)`
              : `(${stats.modified} modified)`
          }
          {hasErrors && <span className="text-[var(--color-error)] ml-1">{stats.errors} failed</span>}
        </span>

        {/* Aggregate diff stats */}
        <span className="ml-auto flex items-center gap-1 text-[9px] font-mono">
          {stats.added > 0 && (
            <span className="flex items-center gap-0.5 text-[var(--color-success)]">
              <Plus size={8} />
              {stats.added}
            </span>
          )}
          {stats.removed > 0 && (
            <span className="flex items-center gap-0.5 text-[var(--color-error)]">
              <Minus size={8} />
              {stats.removed}
            </span>
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
              onOpenDiffEditor={onOpenDiffEditor}
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
