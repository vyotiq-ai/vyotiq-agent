import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  X as XIcon,
  FileText,
  Copy,
} from 'lucide-react';

import { cn } from '../../../../utils/cn';
import { cleanTerminalOutput } from '../../../../utils/ansi';
import { useTerminalStream } from '../../../../hooks';
import {
  formatDurationMs,
  formatElapsed,
  getDurationMsFromMetadata,
  getReadMetadataInfo,
  getToolIconComponent,
  getToolTarget,
} from '../../utils/toolDisplay';

import { ResearchResultPreview } from './ResearchResultPreview';
import { LiveFetchPreview } from './LiveFetchPreview';
import { AutoFetchPreview } from './AutoFetchPreview';
import { TerminalOutputPreview } from './TerminalOutputPreview';
import { DynamicToolIndicator } from '../DynamicToolIndicator';
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
  const Icon = getToolIconComponent(tool.name);
  const target = getToolTarget(tool.arguments, tool.name, tool._argsJson);
  const isActive = tool.status === 'running';
  const hasError = tool.status === 'error';
  const isSuccess = tool.status === 'completed';

  // Check if this is a file operation tool
  const isFileOperation = tool.name === 'write' || tool.name === 'edit' || tool.name === 'create_file';

  // Get file read metadata info (lines read, total lines, etc.)
  const readMetaInfo = getReadMetadataInfo(tool.resultMetadata, tool.name);
  const durationMs = getDurationMsFromMetadata(tool.resultMetadata);

  // Elapsed time for running tools
  const [elapsed, setElapsed] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isActive || !tool.startTime) return;

    const updateElapsed = () => setElapsed(formatElapsed(tool.startTime!));
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [isActive, tool.startTime]);

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
    <div className={cn('group/tool min-w-0 overflow-hidden', !isLast && 'mb-px')}>
      {/* Tool header row - using div with role="button" to avoid nested button issue */}
      <div
        role={hasExpandableDetails ? 'button' : undefined}
        tabIndex={hasExpandableDetails ? 0 : undefined}
        className={cn(
          'flex items-center gap-2 py-1 min-w-0 w-full',
          'hover:bg-[var(--color-surface-2)]/40 rounded px-2 -mx-2',
          'transition-all duration-150',
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
        {/* Status indicator with subtle background */}
        <span className={cn(
          'flex items-center justify-center w-4 h-4 rounded flex-shrink-0',
          isActive && 'bg-[var(--color-warning)]/10',
          hasError && 'bg-[var(--color-error)]/10',
          isSuccess && 'bg-[var(--color-success)]/10',
        )}>
          {isActive ? (
            <Loader2 size={10} className="text-[var(--color-warning)] animate-spin" />
          ) : hasError ? (
            <XIcon size={10} className="text-[var(--color-error)]" />
          ) : (
            <Check size={10} className="text-[var(--color-success)]" />
          )}
        </span>

        {/* Tool icon */}
        <Icon
          size={12}
          className={cn(
            'flex-shrink-0',
            isActive && 'text-[var(--color-warning)]',
            hasError && 'text-[var(--color-error)]',
            isSuccess && 'text-[var(--color-text-muted)]',
          )}
        />

        {/* Tool name */}
        <span
          className={cn(
            'text-[11px] font-medium flex-shrink-0',
            isActive && 'text-[var(--color-warning)]',
            hasError && 'text-[var(--color-error)]',
            isSuccess && 'text-[var(--color-text-secondary)]',
          )}
        >
          {tool.name}
        </span>

        {/* Dynamic tool indicator */}
        {tool.isDynamic && (
          <DynamicToolIndicator
            toolName={tool.name}
            createdBy={tool.dynamicToolInfo?.createdBy}
            usageCount={tool.dynamicToolInfo?.usageCount}
            successRate={tool.dynamicToolInfo?.successRate}
            status={tool.dynamicToolInfo?.status}
          />
        )}

        {/* Target/context - styled as a subtle tag */}
        {target && (
          <span
            className={cn(
              'text-[10px] text-[var(--color-text-muted)] truncate min-w-0',
              'px-1.5 py-0.5 rounded bg-[var(--color-surface-2)]/50',
              'max-w-[30vw] sm:max-w-[35vw] md:max-w-[280px]',
            )}
            title={target}
          >
            {target}
          </span>
        )}

        {/* Read operation metadata */}
        {isSuccess && readMetaInfo && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-dim)] font-mono flex-shrink-0">
            {readMetaInfo}
          </span>
        )}

        {/* Expand indicator for expandable items */}
        {hasExpandableDetails && (
          <span className="text-[var(--color-text-dim)]/50 flex-shrink-0 ml-auto mr-1">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
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
                  'p-1 rounded text-[var(--color-text-muted)]',
                  'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
                  'transition-colors opacity-0 group-hover/tool:opacity-100'
                )}
                title={copied ? 'Copied!' : 'Copy path'}
              >
                <Copy size={10} className={copied ? 'text-[var(--color-success)]' : ''} />
              </button>
              
              {/* Open file */}
              {onOpenFile && (
                <button
                  type="button"
                  onClick={handleOpenFile}
                  className={cn(
                    'p-1 rounded text-[var(--color-text-muted)]',
                    'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]',
                    'transition-colors opacity-0 group-hover/tool:opacity-100'
                  )}
                  title="Open file"
                >
                  <FileText size={10} />
                </button>
              )}
            </>
          )}

          {/* Non-file operations: timing and error info */}
          {!fileOpMeta && (
            <>
              {isActive && elapsed && (
                <span className="text-[9px] text-[var(--color-warning)]/80 font-mono">{elapsed}</span>
              )}
              {!isActive && typeof durationMs === 'number' && !hasError && (
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

      {/* File change diff display - auto-rendered for file operations */}
      {hasDiffData && (
        <FileChangeDiff
          tool={tool}
          showActions={true}
          defaultCollapsed={!isExpanded}
        />
      )}
    </div>
  );
});

ToolItem.displayName = 'ToolItem';
