import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  X as XIcon,
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
  safeJsonStringify,
} from '../../utils/toolDisplay';

import { ResearchResultPreview } from './ResearchResultPreview';
import { LiveFetchPreview } from './LiveFetchPreview';
import { AutoFetchPreview } from './AutoFetchPreview';
import { TerminalOutputPreview } from './TerminalOutputPreview';
import { FileDiffPreview } from './FileDiffPreview';
import { CopyIconButton } from './CopyIconButton';
import { DynamicToolIndicator } from '../DynamicToolIndicator';

import type { ToolCall } from './types';

const TERMINAL_PREVIEW_MAX_CHARS = 10_000;

function getOutputPreview(content: string, maxLines: number, maxChars: number): string | null {
  if (!content) return null;

  const limit = Math.min(content.length, maxChars);
  let i = 0;
  let lineStart = 0;
  const lines: string[] = [];

  while (i <= limit && lines.length < maxLines) {
    const isEnd = i === limit;
    const ch = content.charCodeAt(i);
    if (isEnd || ch === 10 /* \n */) {
      const line = content.slice(lineStart, i).trim();
      if (line) lines.push(line);
      lineStart = i + 1;
    }
    i++;
  }

  if (lines.length === 0) return null;
  const preview = lines.join('\n');
  return preview.length > 150 ? preview.slice(0, 147) + '...' : preview;
}

/**
 * Single tool item component
 */
export const ToolItem: React.FC<{
  tool: ToolCall;
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}> = memo(({ tool, isExpanded, onToggle, isLast }) => {
  const Icon = getToolIconComponent(tool.name);
  const target = getToolTarget(tool.arguments, tool.name, tool._argsJson);
  const isActive = tool.status === 'running';
  const hasError = tool.status === 'error';
  const isSuccess = tool.status === 'completed';

  // Get file read metadata info (lines read, total lines, etc.)
  const readMetaInfo = getReadMetadataInfo(tool.resultMetadata, tool.name);
  const durationMs = getDurationMsFromMetadata(tool.resultMetadata);

  // Elapsed time for running tools
  const [elapsed, setElapsed] = useState<string>('');

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

    // For running terminal commands, prefer streaming output if available
    if (isActive && isTerminalTool && terminalStream?.output) {
      return terminalStream.output;
    }

    return storedOutput;
  }, [tool.fullOutput, tool.result?.content, isActive, isTerminalTool, terminalStream?.output]);

  // Clean ANSI escape codes from terminal output for display.
  // For collapsed tools, only clean a small prefix to keep re-renders cheap.
  const fullOutput = useMemo(() => {
    if (!rawOutput) return '';
    if (!isTerminalTool) return rawOutput;
    if (isExpanded) return cleanTerminalOutput(rawOutput);
    return cleanTerminalOutput(rawOutput.slice(0, TERMINAL_PREVIEW_MAX_CHARS));
  }, [rawOutput, isTerminalTool, isExpanded]);

  // Get output preview (header)
  const outputPreview = useMemo(() => {
    if (!fullOutput) return null;
    if (hasError) return fullOutput.slice(0, 200);
    return getOutputPreview(fullOutput, 3, 2000);
  }, [fullOutput, hasError]);

  const hasExpandableDetails = Boolean(
    (tool.arguments && Object.keys(tool.arguments).length > 0) ||
    (fullOutput && fullOutput.trim().length > 0) ||
    tool.resultMetadata ||
    (isActive && isTerminalTool), // Always expandable for running terminal commands
  );

  const [copiedWhat, setCopiedWhat] = useState<'args' | 'output' | null>(null);

  const copyToClipboard = useCallback(
    async (what: 'args' | 'output') => {
      const text = what === 'args' ? (tool._argsJson || safeJsonStringify(tool.arguments, 2)) : fullOutput;
      await navigator.clipboard.writeText(text);
      setCopiedWhat(what);
      window.setTimeout(() => setCopiedWhat(null), 1500);
    },
    [tool.arguments, tool._argsJson, fullOutput],
  );

  return (
    <div className={cn('group/tool min-w-0 overflow-hidden', !isLast && 'mb-0.5')}>
      {/* Tool header row */}
      <button
        type="button"
        className={cn(
          'flex items-center gap-1.5 py-0.5 cursor-pointer min-w-0 w-full',
          'hover:bg-[var(--color-surface-1)]/30 rounded-sm px-1 -mx-1',
          'transition-colors duration-100',
          'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25',
        )}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (!hasExpandableDetails) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={hasExpandableDetails ? isExpanded : undefined}
      >
        {/* Expand/collapse indicator */}
        <span className="text-[var(--color-text-dim)] opacity-40 w-2.5">
          {hasExpandableDetails ? (
            isExpanded ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )
          ) : (
            <span className="inline-block w-2.5" />
          )}
        </span>

        {/* Status indicator */}
        {isActive ? (
          <Loader2 size={10} className="text-[var(--color-warning)] animate-spin flex-shrink-0" />
        ) : hasError ? (
          <XIcon size={10} className="text-[var(--color-error)] flex-shrink-0" />
        ) : (
          <Check size={10} className="text-[var(--color-success)] flex-shrink-0" />
        )}

        {/* Tool icon */}
        <Icon
          size={10}
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
            'text-[11px] font-medium',
            isActive && 'text-[var(--color-warning)]',
            hasError && 'text-[var(--color-error)]',
            isSuccess && 'text-[var(--color-text-secondary)]',
          )}
        >
          {tool.name}
        </span>

        {/* Dynamic tool indicator - Phase 7 */}
        {tool.isDynamic && (
          <DynamicToolIndicator
            toolName={tool.name}
            createdBy={tool.dynamicToolInfo?.createdBy}
            usageCount={tool.dynamicToolInfo?.usageCount}
            successRate={tool.dynamicToolInfo?.successRate}
            status={tool.dynamicToolInfo?.status}
          />
        )}

        {/* Target/context */}
        {target && (
          <>
            <span className="text-[var(--color-text-dim)] opacity-30">→</span>
            <span
              className={cn(
                'text-[10px] text-[var(--color-text-muted)] truncate min-w-0',
                'max-w-[48vw] sm:max-w-[52vw] md:max-w-[520px]',
              )}
              title={target}
            >
              {target}
            </span>
          </>
        )}

        {/* Read operation metadata (lines read info) */}
        {isSuccess && readMetaInfo && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-dim)] font-mono">
            {readMetaInfo}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          {/* Elapsed time for running */}
          {isActive && elapsed && (
            <span className="text-[10px] text-[var(--color-warning)]/70">{elapsed}</span>
          )}

          {/* Duration for completed/error tools (when available) */}
          {!isActive && typeof durationMs === 'number' && (
            <span className="text-[10px] text-[var(--color-text-dim)]">
              {formatDurationMs(durationMs)}
            </span>
          )}

          {/* Error indicator */}
          {hasError && <span className="text-[10px] text-[var(--color-error)]/70">failed</span>}
        </span>
      </button>

      {/* Expanded details (args + output) */}
      {isExpanded && hasExpandableDetails && (
        <div
          className={cn(
            'ml-6 mt-1 mb-2 min-w-0 overflow-hidden',
            'bg-[var(--color-surface-1)]/50 rounded px-2 py-1.5',
            'border-l-2',
            hasError ? 'border-[var(--color-error)]/30' : 'border-[var(--color-border-subtle)]',
          )}
        >
          {/* Args */}
          {tool.arguments && Object.keys(tool.arguments).length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-text-dim)]">args</span>
                <CopyIconButton
                  onCopy={() => {
                    void copyToClipboard('args');
                  }}
                  copied={copiedWhat === 'args'}
                  idleTitle="copy args"
                  ariaLabel="Copy tool arguments"
                />
              </div>
              <pre
                className={cn(
                  'mt-1 text-[10px] font-mono text-[var(--color-text-muted)]',
                  'max-h-[140px] overflow-y-auto scrollbar-thin',
                  'whitespace-pre-wrap break-all',
                )}
              >
                {tool._argsJson || safeJsonStringify(tool.arguments, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {fullOutput && fullOutput.trim().length > 0 && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-text-dim)]">output</span>
                <CopyIconButton
                  onCopy={() => {
                    void copyToClipboard('output');
                  }}
                  copied={copiedWhat === 'output'}
                  idleTitle="copy output"
                  ariaLabel="Copy tool output"
                />
              </div>
              <pre
                className={cn(
                  'mt-1 text-[10px] font-mono',
                  'max-h-[220px] overflow-y-auto scrollbar-thin',
                  'whitespace-pre-wrap break-words',
                  hasError ? 'text-[var(--color-error)]/80' : 'text-[var(--color-text-muted)]',
                )}
              >
                {fullOutput.length > 8000 ? `${fullOutput.slice(0, 8000)}\n\n…(truncated)` : fullOutput}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Research result display */}
      {isExpanded && tool.resultMetadata?.type === 'research_result' && (
        <ResearchResultPreview
          query={(tool.resultMetadata.query as string) || ''}
          sources={
            (tool.resultMetadata.sources as Array<{ url: string; title: string; accessed?: number }>) || []
          }
          findings={
            (tool.resultMetadata.findings as Array<{
              title: string;
              content: string;
              source: string;
              relevance: number;
            }>) || []
          }
          depth={tool.resultMetadata.depth as string}
          output={outputPreview || ''}
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
          output={outputPreview || ''}
        />
      )}

      {/* Auto Fetch result display */}
      {isExpanded && tool.resultMetadata?.type === 'auto_fetch_result' && (
        <AutoFetchPreview
          query={(tool.resultMetadata.query as string) || ''}
          focus={(tool.resultMetadata.focus as string) || 'general'}
          sourceCount={(tool.resultMetadata.sourceCount as number) || 0}
          sources={(tool.resultMetadata.sources as Array<{ url: string; title: string }>) || []}
          output={outputPreview || ''}
        />
      )}

      {/* Terminal output display */}
      {isExpanded && tool.name.includes('command') && fullOutput && (
        <TerminalOutputPreview
          command={tool.arguments?.command as string}
          output={fullOutput}
          exitCode={tool.resultMetadata?.exitCode as number}
          hasError={hasError}
        />
      )}

      {/* File diff preview for write/edit operations */}
      {isExpanded && isSuccess && (tool.name === 'write' || tool.name === 'edit' || tool.name === 'create_file') && 
        tool.resultMetadata && (tool.resultMetadata.newContent || tool.resultMetadata.content) && (
        <FileDiffPreview
          path={(tool.resultMetadata.filePath as string) || (tool.resultMetadata.path as string) || (tool.arguments?.file_path as string) || ''}
          originalContent={(tool.resultMetadata.originalContent as string) || null}
          newContent={(tool.resultMetadata.newContent as string) || (tool.resultMetadata.content as string) || ''}
          action={tool.resultMetadata.action as 'write' | 'edit' | 'create' | 'modified' | 'created'}
          className="ml-6"
        />
      )}
    </div>
  );
});

ToolItem.displayName = 'ToolItem';
