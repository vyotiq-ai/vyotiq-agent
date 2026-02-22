/**
 * ToolItem Component
 * 
 * Renders a single tool call with its header and result content.
 * Handles expand/collapse state and delegates to specialized preview
 * components based on the tool type (diff, terminal, fetch, research, etc.).
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import { cn } from '../../../../utils/cn';
import type { ToolCall } from './types';
import { ToolExecutionHeader } from './ToolExecutionHeader';
import { TerminalOutputPreview } from './TerminalOutputPreview';
import { AutoFetchPreview } from './AutoFetchPreview';
import { LiveFetchPreview } from './LiveFetchPreview';
import { ResearchResultPreview } from './ResearchResultPreview';
import { FileChangeDiff } from './FileChangeDiff';
import { CopyIconButton } from './CopyIconButton';
import { useToast } from '../../../../components/ui/Toast';

interface ToolItemProps {
  /** The tool call to render */
  tool: ToolCall;
  /** Number of total tools in the batch */
  batchSize?: number;
  /** Position in the batch (1-based) */
  batchPosition?: number;
  /** Callback when a file diff action is taken */
  onDiffAction?: (callId: string, action: 'accept' | 'reject') => void;
  /** Run ID for streaming diff lookup */
  runId?: string;
  /** Additional CSS class */
  className?: string;
}

/** Tools that have specialized preview renderers */
const FILE_WRITE_TOOLS = new Set(['write_file', 'create_file', 'edit_file', 'replace_in_file', 'edit', 'write']);
const TERMINAL_TOOLS = new Set(['run_command', 'execute_command', 'run_terminal_command']);
const FETCH_TOOLS = new Set(['auto_fetch', 'web_search']);
const LIVE_FETCH_TOOLS = new Set(['fetch_url', 'fetch_webpage', 'live_fetch']);
const RESEARCH_TOOLS = new Set(['deep_research', 'research']);

const ToolItemInternal: React.FC<ToolItemProps> = ({
  tool,
  batchSize,
  batchPosition,
  onDiffAction,
  runId,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(() => {
    // Auto-expand running, errored, or file-modifying tools (to show diffs)
    if (tool.status === 'running' || tool.status === 'error') return true;
    if (FILE_WRITE_TOOLS.has(tool.name) && tool.status === 'completed') return true;
    return false;
  });
  const { toast } = useToast();

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleCopy = useCallback(() => {
    const output = tool.fullOutput ?? tool.result?.content ?? '';
    if (output) {
      navigator.clipboard.writeText(output);
      toast({ type: 'success', message: 'Output copied to clipboard' });
    }
  }, [tool.fullOutput, tool.result?.content, toast]);

  // Determine which specialized renderer to use
  const resultContent = useMemo(() => {
    if (!isExpanded) return null;
    if (tool.status === 'queued') return null;

    const meta = tool.resultMetadata ?? tool.result?.resultMetadata ?? {};
    const output = tool.fullOutput ?? tool.result?.content ?? '';
    const name = tool.name;

    // File change diff (supports real-time streaming)
    // Shows diff when metadata is available (completed) or when tool is running (streaming)
    if (FILE_WRITE_TOOLS.has(name) && (meta || tool.status === 'running')) {
      return <FileChangeDiff tool={tool} runId={runId} />;
    }

    // Terminal output
    if (TERMINAL_TOOLS.has(name)) {
      const exitCode = typeof meta.exitCode === 'number' ? meta.exitCode : undefined;
      const hasError = exitCode != null && exitCode !== 0;
      return (
        <TerminalOutputPreview
          output={output}
          exitCode={exitCode}
          command={typeof meta.command === 'string' ? meta.command : undefined}
          hasError={hasError}
        />
      );
    }

    // Auto fetch / web search
    if (FETCH_TOOLS.has(name) && meta) {
      return (
        <AutoFetchPreview
          query={typeof meta.query === 'string' ? meta.query : name}
          focus={typeof meta.focus === 'string' ? meta.focus : undefined}
          sourceCount={typeof meta.sourceCount === 'number' ? meta.sourceCount : 0}
          sources={Array.isArray(meta.sources) ? meta.sources as Array<{ title: string; url: string }> : []}
          output={output}
        />
      );
    }

    // Live fetch / fetch URL
    if (LIVE_FETCH_TOOLS.has(name) && meta) {
      return (
        <LiveFetchPreview
          url={typeof meta.url === 'string' ? meta.url : ''}
          title={typeof meta.title === 'string' ? meta.title : undefined}
          contentLength={typeof meta.contentLength === 'number' ? meta.contentLength : undefined}
          headingCount={typeof meta.headingCount === 'number' ? meta.headingCount : undefined}
          linkCount={typeof meta.linkCount === 'number' ? meta.linkCount : undefined}
          output={output}
        />
      );
    }

    // Research
    if (RESEARCH_TOOLS.has(name) && meta) {
      return (
        <ResearchResultPreview
          query={typeof meta.query === 'string' ? meta.query : name}
          sources={Array.isArray(meta.sources) ? meta.sources as Array<{ title: string; url: string }> : []}
          findings={Array.isArray(meta.findings) ? meta.findings as Array<{ title: string; content: string; source: string; relevance: number }> : undefined}
          depth={typeof meta.depth === 'string' ? meta.depth : typeof meta.depth === 'number' ? String(meta.depth) : undefined}
          output={output}
        />
      );
    }

    // Generic output
    if (output) {
      const maxLen = 2000;
      const truncated = output.length > maxLen ? output.slice(0, maxLen) + '\n...(truncated)' : output;
      return (
        <div className="relative">
          <pre
            className={cn(
              'px-1.5 py-1 text-[9px] leading-relaxed overflow-x-auto',
              'text-[var(--color-text-secondary)]',
              'max-h-[300px] overflow-y-auto',
            )}
          >
            {truncated}
          </pre>
          {output.length > 20 && (
            <div className="absolute top-1 right-1">
              <CopyIconButton onCopy={handleCopy} copied={false} iconSize={10} idleTitle="Copy output" ariaLabel="Copy tool output" />
            </div>
          )}
        </div>
      );
    }

    // Loading / no output yet
    if (tool.status === 'running') {
      return (
        <div className="px-1.5 py-1 text-[9px] text-[var(--color-text-dim)]">
          executing...
        </div>
      );
    }

    return null;
  }, [isExpanded, tool, handleCopy]);

  // Streaming arguments preview for in-progress tools
  const argsPreview = useMemo(() => {
    if (!isExpanded) return null;
    if (tool.status !== 'running' && tool.status !== 'pending') return null;
    if (!tool._argsJson && Object.keys(tool.arguments).length === 0) return null;

    const argsStr = tool._argsJson ?? JSON.stringify(tool.arguments, null, 2);
    if (!argsStr || argsStr === '{}') return null;

    return (
      <pre
        className={cn(
          'px-1.5 py-1 text-[8px] leading-relaxed overflow-x-auto',
          'text-[var(--color-text-dim)]',
          'max-h-[120px] overflow-y-auto',
          'border-b border-[var(--color-border-subtle)]',
        )}
      >
        {argsStr}
      </pre>
    );
  }, [isExpanded, tool.status, tool._argsJson, tool.arguments]);

  return (
    <div
      className={cn(
        'rounded-sm border font-mono',
        'border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-base)]',
        tool.status === 'error' && 'border-[var(--color-error)]/30',
        className,
      )}
    >
      <ToolExecutionHeader
        tool={tool}
        isExpanded={isExpanded}
        onToggle={toggleExpanded}
        batchSize={batchSize}
        batchPosition={batchPosition}
      />
      {argsPreview}
      {resultContent}
    </div>
  );
};

export const ToolItem = memo(ToolItemInternal);
ToolItem.displayName = 'ToolItem';
