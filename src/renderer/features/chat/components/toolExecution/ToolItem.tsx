import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '../../../../utils/cn';
import { cleanTerminalOutput } from '../../../../utils/ansi';
import { useTerminalStream } from '../../../../hooks';
import {
  formatDurationMs,
  formatElapsed,
  getDurationMsFromMetadata,
  getReadMetadataInfo,
} from '../../utils/toolDisplay';
import { getToolActionDescription, type ToolStatus } from '../../utils/toolActionDescriptions';

import { ResearchResultPreview } from './ResearchResultPreview';
import { LiveFetchPreview } from './LiveFetchPreview';
import { AutoFetchPreview } from './AutoFetchPreview';
import { TerminalOutputPreview } from './TerminalOutputPreview';
import { FileChangeDiff } from './FileChangeDiff';

import type { ToolCall } from './types';

const TERMINAL_PREVIEW_MAX_CHARS = 10_000;

/** Extract first line of error for inline display */
function getErrorPreview(output: string): string | null {
  if (!output) return null;
  const firstLine = output.split('\n')[0]?.trim();
  if (!firstLine) return null;
  return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
}



/**
 * Single tool item component
 */
export const ToolItem: React.FC<{
  tool: ToolCall;
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
  onOpenFile?: (path: string) => void;
}> = memo(({ tool, isExpanded, onToggle, isLast, onOpenFile }) => {
  const isQueued = tool.status === 'queued';
  const isActive = tool.status === 'running';
  const hasError = tool.status === 'error';
  const isSuccess = tool.status === 'completed';
  const isPending = tool.status === 'pending';
  
  // Determine tool status for descriptions styling
  const toolStatus: ToolStatus = 
    isQueued ? 'queued' : isActive ? 'running' : hasError ? 'error' : isPending ? 'pending' : 'completed';

  // Generate descriptive action text based on tool, status and arguments
  const actionDescription = useMemo(() => {
    return getToolActionDescription(tool.name, toolStatus, tool.arguments || {}, tool._argsJson);
  }, [tool.name, toolStatus, tool.arguments, tool._argsJson]);

  // Check if this is a file operation tool
  const isFileOperation = tool.name === 'write' || tool.name === 'edit' || tool.name === 'create_file';

  // Get file read metadata info (lines read, total lines, etc.)
  const readMetaInfo = getReadMetadataInfo(tool.resultMetadata, tool.name);
  const durationMs = getDurationMsFromMetadata(tool.resultMetadata);

  // Elapsed time for running tools - updates every 100ms for smooth display
  const [elapsed, setElapsed] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if ((!isActive && !isQueued) || !tool.startTime) return;

    const updateElapsed = () => setElapsed(formatElapsed(tool.startTime!));
    updateElapsed();
    // Update every 100ms for smoother elapsed time display
    const interval = setInterval(updateElapsed, 100);
    return () => clearInterval(interval);
  }, [isActive, isQueued, tool.startTime]);

  // Check if this is a terminal/run command tool
  const isTerminalTool = tool.name === 'run' || tool.name.includes('terminal') || tool.name.includes('command');

  // Get PID from tool metadata for real-time streaming
  const terminalPid = tool.resultMetadata?.pid as number | undefined;
  const terminalStream = useTerminalStream(terminalPid);

  // Combine stored output with real-time streaming output
  const rawOutput = useMemo(() => {
    const storedOutput = tool.fullOutput ?? tool.result?.content ?? '';
    if (isActive && isTerminalTool && terminalStream?.output) {
      return terminalStream.output;
    }
    return storedOutput;
  }, [tool.fullOutput, tool.result?.content, isActive, isTerminalTool, terminalStream?.output]);

  // Clean ANSI escape codes from terminal output for display
  const fullOutput = useMemo(() => {
    if (!rawOutput) return '';
    if (!isTerminalTool) return rawOutput;
    if (isExpanded) return cleanTerminalOutput(rawOutput);
    return cleanTerminalOutput(rawOutput.slice(0, TERMINAL_PREVIEW_MAX_CHARS));
  }, [rawOutput, isTerminalTool, isExpanded]);

  // Get error preview for inline display
  const errorPreview = useMemo(() => {
    if (!hasError || !fullOutput) return null;
    return getErrorPreview(fullOutput);
  }, [hasError, fullOutput]);

  // File operation metadata
  const fileOpMeta = useMemo(() => {
    if (!isFileOperation || !isSuccess || !tool.resultMetadata) return null;
    
    const path = (tool.resultMetadata.filePath as string) || 
                 (tool.resultMetadata.path as string) || 
                 (tool.arguments?.file_path as string) || '';
    const newContent = (tool.resultMetadata.newContent as string) || 
                       (tool.resultMetadata.content as string) || '';
    const action = tool.resultMetadata.action as string;
    
    const isNew = !tool.resultMetadata.originalContent || (tool.resultMetadata.originalContent as string).length === 0;
    const actionLabel = isNew ? 'Created' : (action === 'edit' ? 'Edited' : 'Modified');
    
    return { path, newContent, actionLabel, isNew };
  }, [isFileOperation, isSuccess, tool.resultMetadata, tool.arguments]);

  // Check if file operation has diff data available
  const hasDiffData = useMemo(() => {
    if (!isFileOperation || !isSuccess || !tool.resultMetadata) return false;
    const hasContent = Boolean(
      tool.resultMetadata.newContent || 
      tool.resultMetadata.content
    );
    return hasContent;
  }, [isFileOperation, isSuccess, tool.resultMetadata]);

  // Determine if tool has expandable content
  const hasExpandableDetails = Boolean(
    tool.resultMetadata?.type === 'research_result' ||
    tool.resultMetadata?.type === 'web_content' ||
    tool.resultMetadata?.type === 'auto_fetch_result' ||
    (isTerminalTool && fullOutput) ||
    (isActive && isTerminalTool) ||
    hasDiffData,
  );

  const handleOpenFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (fileOpMeta && onOpenFile) {
      onOpenFile(fileOpMeta.path);
    }
  }, [fileOpMeta, onOpenFile]);

  const handleCopyPath = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (fileOpMeta) {
      void navigator.clipboard.writeText(fileOpMeta.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [fileOpMeta]);

  return (
    <div className={cn('group/tool min-w-0', !isLast && 'mb-px')}>
      {/* Tool header row - hidden for file operations with diff data (DiffViewer has its own header) */}
      {!(hasDiffData && isFileOperation) && (
        <div
          role={hasExpandableDetails ? 'button' : undefined}
          tabIndex={hasExpandableDetails ? 0 : undefined}
          className={cn(
              'flex items-center gap-2 py-0.5 min-w-0 w-full',
              'px-1 -mx-1',
              'transition-colors duration-150',
            'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30',
            hasExpandableDetails ? 'cursor-pointer' : 'cursor-default',
          )}
          onClick={hasExpandableDetails ? onToggle : undefined}
          onKeyDown={(e) => {
            if (!hasExpandableDetails) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
          aria-expanded={hasExpandableDetails ? isExpanded : undefined}
        >
          {/* Descriptive action text showing what the tool is doing */}
          <span
            className={cn(
              'text-[10px] font-medium truncate min-w-0',
              'max-w-[40vw] sm:max-w-[50vw] md:max-w-[400px]',
              isQueued && 'text-[var(--color-info)]',
              isActive && 'text-[var(--color-warning)]',
              isPending && 'text-[var(--color-info)]',
              hasError && 'text-[var(--color-error)]',
              isSuccess && 'text-[var(--color-text-secondary)]',
            )}
            title={actionDescription}
          >
            {actionDescription}
          </span>

          {/* Read operation metadata */}
          {isSuccess && readMetaInfo && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-dim)] font-mono flex-shrink-0">
              {readMetaInfo}
            </span>
          )}

          {/* Expand indicator for expandable items */}
          {hasExpandableDetails && (
            <span className="text-[var(--color-text-dim)]/70 flex-shrink-0 ml-auto mr-1 text-[9px]">
              {isExpanded ? 'hide' : 'show'}
            </span>
          )}

          {/* Right side: file op info OR timing/error */}
          <span className={cn('flex items-center gap-1.5 flex-shrink-0', !hasExpandableDetails && 'ml-auto')}>
            {/* File operation: Modified badge + stats + actions */}
            {fileOpMeta && (
              <>
                {/* Action badge */}
                <span className={cn(
                  'text-[9px] px-1.5 py-0.5 rounded font-medium',
                  fileOpMeta.isNew 
                    ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' 
                    : 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
                )}>
                  {fileOpMeta.actionLabel}
                </span>

                {/* Copy path */}
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className={cn(
                    'px-1 py-0.5 rounded text-[var(--color-text-muted)] text-[9px]',
                    'hover:text-[var(--color-text-primary)]',
                    'transition-colors opacity-0 group-hover/tool:opacity-100'
                  )}
                  title={copied ? 'Copied!' : 'Copy path'}
                >
                  {copied ? 'copied' : 'copy'}
                </button>
                
                {/* Open file */}
                {onOpenFile && (
                  <button
                    type="button"
                    onClick={handleOpenFile}
                    className={cn(
                      'px-1 py-0.5 rounded text-[var(--color-text-muted)] text-[9px]',
                      'hover:text-[var(--color-text-primary)]',
                      'transition-colors opacity-0 group-hover/tool:opacity-100'
                    )}
                    title="Open file"
                  >
                    open
                  </button>
                )}
              </>
            )}

            {/* Non-file operations: timing and error info */}
            {!fileOpMeta && (
              <>
                {/* Queued status indicator */}
                {isQueued && tool.queuePosition && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-info)]/10 text-[var(--color-info)] font-mono">
                    waiting #{tool.queuePosition}
                  </span>
                )}
                {isQueued && !tool.queuePosition && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-info)]/10 text-[var(--color-info)] font-mono">
                    waiting
                  </span>
                )}
                {/* Running status with elapsed time */}
                {isActive && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] font-mono">
                    running{elapsed ? ` ${elapsed}` : ''}
                  </span>
                )}
                {/* Pending status */}
                {isPending && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-info)]/10 text-[var(--color-info)] font-mono">
                    pending
                  </span>
                )}
                {!isActive && !isQueued && !isPending && typeof durationMs === 'number' && !hasError && (
                  <span className="text-[9px] text-[var(--color-text-dim)] font-mono">
                    {formatDurationMs(durationMs)}
                  </span>
                )}
                {hasError && errorPreview && (
                  <span 
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-error)]/10 text-[var(--color-error)] font-mono truncate max-w-[200px]" 
                    title={fullOutput || errorPreview}
                  >
                    {errorPreview}
                  </span>
                )}
                {hasError && !errorPreview && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-error)]/10 text-[var(--color-error)] font-mono">
                    failed
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      )}

      {/* Research result display */}
      {isExpanded && tool.resultMetadata?.type === 'research_result' && (
        <ResearchResultPreview
          query={(tool.resultMetadata.query as string) || ''}
          sources={(tool.resultMetadata.sources as Array<{ url: string; title: string; accessed?: number }>) || []}
          findings={(tool.resultMetadata.findings as Array<{ title: string; content: string; source: string; relevance: number }>) || []}
          depth={tool.resultMetadata.depth as string}
          output=""
        />
      )}

      {/* Live Fetch result display */}
      {isExpanded && tool.resultMetadata?.type === 'web_content' && (
        <LiveFetchPreview
          url={tool.resultMetadata.url as string}
          title={tool.resultMetadata.title as string}
          contentLength={tool.resultMetadata.contentLength as number}
          headingCount={tool.resultMetadata.headingCount as number}
          linkCount={tool.resultMetadata.linkCount as number}
          output=""
        />
      )}

      {/* Auto Fetch result display */}
      {isExpanded && tool.resultMetadata?.type === 'auto_fetch_result' && (
        <AutoFetchPreview
          query={(tool.resultMetadata.query as string) || ''}
          focus={(tool.resultMetadata.focus as string) || 'general'}
          sourceCount={(tool.resultMetadata.sourceCount as number) || 0}
          sources={(tool.resultMetadata.sources as Array<{ url: string; title: string }>) || []}
          output=""
        />
      )}

      {/* Terminal output display */}
      {isExpanded && isTerminalTool && fullOutput && (
        <TerminalOutputPreview
          command={tool.arguments?.command as string}
          output={fullOutput}
          exitCode={tool.resultMetadata?.exitCode as number}
          hasError={hasError}
        />
      )}

      {/* File change diff display - always shown by default for file operations */}
      {hasDiffData && (
        <FileChangeDiff
          tool={tool}
          showActions={true}
          defaultCollapsed={false}
        />
      )}
    </div>
  );
});

ToolItem.displayName = 'ToolItem';
