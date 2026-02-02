/**
 * Tool Confirmation Panel
 * 
 * Shows pending tool confirmations when yolo mode is disabled.
 * Allows users to approve, deny, or provide alternative instructions.
 * 
 * Features:
 * - Inline diff preview for file operations (write, edit)
 * - Expandable tool arguments with copy functionality
 * - Quick suggestion templates for common actions
 * - Keyboard shortcuts (Enter to send, Esc to cancel)
 * - Visual feedback for all interactions
 */
import React, { memo, useCallback, useState, useMemo, useEffect } from 'react';
import { 
  Check, 
  X, 
  AlertTriangle, 
  MessageSquare, 
  Send, 
  ChevronDown, 
  ChevronRight,
  Copy,
  Zap,
  SkipForward,
  RefreshCw,
  FileEdit,
  FileCode2,
  Plus,
  Expand,
} from 'lucide-react';
import { useAgentActions, useAgentSelector } from '../../../state/AgentProvider';
import { cn } from '../../../utils/cn';
import type { ToolCallEvent } from '../../../../shared/types';
import { getToolIconComponent, getToolTarget } from '../utils/toolDisplay';
import { Button } from '../../../components/ui/Button';
import { computeDiffStats, computeDiffHunks, computeInlineDiff } from './toolExecution/diffUtils';

function shortRunId(runId: string | undefined): string | undefined {
  if (!runId) return undefined;
  return runId.length > 8 ? runId.slice(0, 8) : runId;
}

function safeJsonStringify(obj: unknown, indent = 2): string {
  try {
    return JSON.stringify(obj, null, indent);
  } catch {
    return String(obj);
  }
}

// Quick suggestion templates based on tool type
const QUICK_SUGGESTIONS: Record<string, Array<{ label: string; text: string; icon: React.ElementType }>> = {
  default: [
    { label: 'skip', text: 'Skip this step and continue with the next action', icon: SkipForward },
    { label: 'retry', text: 'Try a different approach to accomplish this', icon: RefreshCw },
  ],
  write_file: [
    { label: 'different path', text: 'Use a different file path instead', icon: FileEdit },
    { label: 'skip', text: 'Skip this file and continue', icon: SkipForward },
  ],
  run_command: [
    { label: 'modify', text: 'Modify the command before running', icon: FileEdit },
    { label: 'skip', text: 'Skip this command and continue', icon: SkipForward },
  ],
  delete_file: [
    { label: 'keep file', text: 'Do not delete this file, keep it', icon: X },
    { label: 'backup first', text: 'Create a backup before deleting', icon: Copy },
  ],
};

function getQuickSuggestions(toolName: string) {
  // Match tool name patterns
  if (toolName.includes('write') || toolName.includes('create')) {
    return QUICK_SUGGESTIONS.write_file;
  }
  if (toolName.includes('command') || toolName.includes('run') || toolName.includes('exec')) {
    return QUICK_SUGGESTIONS.run_command;
  }
  if (toolName.includes('delete') || toolName.includes('remove')) {
    return QUICK_SUGGESTIONS.delete_file;
  }
  return QUICK_SUGGESTIONS.default;
}

// =============================================================================
// File Operation Detection & Diff Preview
// =============================================================================

/** Check if tool is a file write operation */
function isFileWriteOperation(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === 'write' || name === 'create_file' || name.includes('write_file');
}

/** Check if tool is a file edit operation */
function isFileEditOperation(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === 'edit' || name.includes('edit_file');
}

/** Extract file path from tool arguments */
function extractFilePath(args: Record<string, unknown>): string | undefined {
  return (args.file_path || args.path || args.filePath) as string | undefined;
}

/** Extract content for write operations */
function extractWriteContent(args: Record<string, unknown>): string | undefined {
  return args.content as string | undefined;
}

/** Extract edit strings for edit operations */
function extractEditStrings(args: Record<string, unknown>): { oldString: string; newString: string } | undefined {
  const oldString = (args.old_string || args.oldString || args.search) as string | undefined;
  const newString = (args.new_string || args.newString || args.replace) as string | undefined;
  
  if (typeof oldString === 'string' && typeof newString === 'string') {
    return { oldString, newString };
  }
  return undefined;
}

/** Hook to fetch original file content for diff preview */
function useOriginalFileContent(filePath: string | undefined, isFileOp: boolean) {
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath || !isFileOp) {
      setOriginalContent(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    // Fetch original content via IPC - files.read takes an array and returns AttachmentPayload[]
    window.vyotiq?.files?.read([filePath])
      .then((results: Array<{ content?: string; error?: string }>) => {
        if (cancelled) return;
        const result = results?.[0];
        if (result?.content !== undefined) {
          setOriginalContent(result.content);
        } else {
          // File doesn't exist (new file) or error
          setOriginalContent('');
        }
      })
      .catch(() => {
        if (cancelled) return;
        // File doesn't exist - treat as new file
        setOriginalContent('');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [filePath, isFileOp]);

  return { originalContent, isLoading, error };
}

// =============================================================================
// Inline Diff Preview Component
// =============================================================================

interface InlineDiffPreviewProps {
  originalContent: string;
  newContent: string;
  filePath: string;
  isNewFile: boolean;
  maxHeight?: number;
}

const InlineDiffPreview: React.FC<InlineDiffPreviewProps> = memo(({
  originalContent,
  newContent,
  filePath,
  isNewFile,
  maxHeight = 200,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set());

  const stats = useMemo(() => computeDiffStats(originalContent, newContent), [originalContent, newContent]);
  const diffHunks = useMemo(() => computeDiffHunks(originalContent, newContent, 2), [originalContent, newContent]);

  const toggleRegionExpanded = useCallback((regionIdx: number) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      if (next.has(regionIdx)) {
        next.delete(regionIdx);
      } else {
        next.add(regionIdx);
      }
      return next;
    });
  }, []);

  // Build unified diff display
  const diffLines = useMemo(() => {
    const originalLines = originalContent.split('\n');
    const modifiedLines = newContent.split('\n');
    const lines: Array<{
      type: 'context' | 'added' | 'removed' | 'expand';
      content: string;
      oldLineNum?: number;
      newLineNum?: number;
      inlineDiff?: { oldParts: Array<{ text: string; type: 'unchanged' | 'added' | 'removed' }>; newParts: Array<{ text: string; type: 'unchanged' | 'added' | 'removed' }> };
      expandInfo?: { before: number; after: number; regionIdx: number };
    }> = [];

    let lastOrigEnd = 0;
    let lastModEnd = 0;

    diffHunks.forEach((hunk, hunkIdx) => {
      const gapOrig = hunk.originalStart - lastOrigEnd;
      const gapMod = hunk.modifiedStart - lastModEnd;

      if (gapOrig > 0 || gapMod > 0) {
        const gapLines = Math.max(gapOrig, gapMod);
        if (gapLines > 0 && !expandedRegions.has(hunkIdx)) {
          lines.push({
            type: 'expand',
            content: `${gapLines} unchanged line${gapLines !== 1 ? 's' : ''}`,
            expandInfo: { before: lastOrigEnd, after: hunk.originalStart, regionIdx: hunkIdx }
          });
        } else if (expandedRegions.has(hunkIdx)) {
          for (let i = lastOrigEnd; i < hunk.originalStart; i++) {
            lines.push({
              type: 'context',
              content: originalLines[i] || '',
              oldLineNum: i + 1,
              newLineNum: lastModEnd + (i - lastOrigEnd) + 1
            });
          }
        }
      }

      // Process hunk lines
      const origHunkLines = hunk.originalLines;
      const modHunkLines = hunk.modifiedLines;
      let origIdx = 0;
      let modIdx = 0;

      while (origIdx < origHunkLines.length || modIdx < modHunkLines.length) {
        const origLine = origIdx < origHunkLines.length ? origHunkLines[origIdx] : null;
        const modLine = modIdx < modHunkLines.length ? modHunkLines[modIdx] : null;

        if (origLine !== null && modLine !== null && origLine === modLine) {
          lines.push({
            type: 'context',
            content: origLine,
            oldLineNum: hunk.originalStart + origIdx + 1,
            newLineNum: hunk.modifiedStart + modIdx + 1
          });
          origIdx++;
          modIdx++;
        } else {
          if (origLine !== null && (modLine === null || origLine !== modLine)) {
            const inlineDiff = modLine !== null ? computeInlineDiff(origLine, modLine) : undefined;
            lines.push({
              type: 'removed',
              content: origLine,
              oldLineNum: hunk.originalStart + origIdx + 1,
              inlineDiff
            });
            origIdx++;
          }
          if (modLine !== null && (origLine === null || origLine !== modLine)) {
            const inlineDiff = origLine !== null ? computeInlineDiff(origHunkLines[origIdx - 1] || '', modLine) : undefined;
            lines.push({
              type: 'added',
              content: modLine,
              newLineNum: hunk.modifiedStart + modIdx + 1,
              inlineDiff
            });
            modIdx++;
          }
        }
      }

      lastOrigEnd = hunk.originalEnd;
      lastModEnd = hunk.modifiedEnd;
    });

    // Trailing collapsed region
    const trailingGap = Math.max(originalLines.length - lastOrigEnd, modifiedLines.length - lastModEnd);
    if (trailingGap > 0 && !expandedRegions.has(diffHunks.length)) {
      lines.push({
        type: 'expand',
        content: `${trailingGap} unchanged line${trailingGap !== 1 ? 's' : ''}`,
        expandInfo: { before: lastOrigEnd, after: originalLines.length, regionIdx: diffHunks.length }
      });
    } else if (expandedRegions.has(diffHunks.length) && trailingGap > 0) {
      for (let i = lastOrigEnd; i < originalLines.length; i++) {
        lines.push({
          type: 'context',
          content: originalLines[i] || '',
          oldLineNum: i + 1,
          newLineNum: lastModEnd + (i - lastOrigEnd) + 1
        });
      }
    }

    return lines;
  }, [originalContent, newContent, diffHunks, expandedRegions]);

  // Get filename from path
  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-[var(--color-border-subtle)]/40 bg-[var(--color-surface-editor)] shadow-[0_6px_18px_rgba(0,0,0,0.16)]">
      {/* Header - clean, modern design matching DiffViewer */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3.5 py-2.5',
          'bg-gradient-to-r from-[var(--color-surface-1)]/70 via-[var(--color-surface-1)]/60 to-[var(--color-surface-1)]/50',
          'border-b border-[var(--color-border-subtle)]/30',
          'font-mono cursor-pointer transition-all duration-150',
          'hover:from-[var(--color-surface-1)]/90 hover:via-[var(--color-surface-1)]/80 hover:to-[var(--color-surface-1)]/70',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-primary)]/30'
        )}
        aria-expanded={isExpanded}
        aria-label={`${isNewFile ? 'New file' : 'Modified file'}: ${fileName}`}
      >
        <span className={cn(
          'text-[var(--color-text-dim)] flex-shrink-0 transition-transform duration-200',
          isExpanded && 'rotate-0',
          !isExpanded && '-rotate-90'
        )}>
          <ChevronDown size={12} />
        </span>
        <FileCode2 size={13} className={isNewFile ? 'text-[var(--color-diff-added-text)]' : 'text-[var(--color-diff-expand-text)]'} />
        <span className="text-[11px] font-medium text-[var(--color-text-primary)] truncate flex-1 min-w-0 text-left" title={filePath}>
          {fileName}
        </span>
        <span className={cn(
          'text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ring-1 ring-inset',
          isNewFile 
            ? 'bg-[var(--color-diff-added-text)]/12 text-[var(--color-diff-added-text)] ring-[var(--color-diff-added-text)]/25' 
            : 'bg-[var(--color-diff-expand-text)]/12 text-[var(--color-diff-expand-text)] ring-[var(--color-diff-expand-text)]/25'
        )}>
          {isNewFile ? 'new' : 'modified'}
        </span>
        <span className="text-[10px] flex-shrink-0 flex items-center gap-2 font-mono tabular-nums">
          {stats.added > 0 && (
            <span className="text-[var(--color-diff-added-text)] font-semibold">
              add {stats.added}
            </span>
          )}
          {stats.removed > 0 && (
            <span className="text-[var(--color-diff-removed-text)] font-semibold">
              remove {stats.removed}
            </span>
          )}
        </span>
      </button>

      {/* Diff content */}
      {isExpanded && (
        <div 
          className="font-mono text-[10px] leading-[1.65] overflow-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent"
          style={{ maxHeight }}
        >
          {diffLines.length === 0 ? (
            <div className="px-3 py-2.5 text-[var(--color-text-dim)]/70 italic text-[9px]">No changes detected</div>
          ) : (
            diffLines.map((line, idx) => {
              if (line.type === 'expand') {
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => line.expandInfo && toggleRegionExpanded(line.expandInfo.regionIdx)}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-1.5 px-3',
                      'text-[8px] font-mono text-[var(--color-text-muted)] font-medium',
                      'bg-gradient-to-r from-[var(--color-surface-1)]/40 via-[var(--color-surface-1)]/50 to-[var(--color-surface-1)]/40',
                      'hover:from-[var(--color-surface-2)]/60 hover:via-[var(--color-surface-2)]/70 hover:to-[var(--color-surface-2)]/60',
                      'border-y border-[var(--color-border-subtle)]/20 transition-all duration-150',
                      'hover:text-[var(--color-text-secondary)]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-primary)]/30'
                    )}
                    aria-label={`Expand ${line.content}`}
                  >
                    <Expand size={9} className="opacity-60" />
                    <span className="uppercase tracking-wider">{line.content}</span>
                    <Expand size={9} className="opacity-60" />
                  </button>
                );
              }

              const isRemoved = line.type === 'removed';
              const isAdded = line.type === 'added';
              const isContext = line.type === 'context';

              return (
                <div
                  key={idx}
                  className={cn(
                    'flex items-stretch transition-colors duration-75 border-b border-[var(--color-border-subtle)]/10',
                    isRemoved && 'bg-[var(--color-diff-removed-bg)] hover:bg-[var(--color-diff-removed-bg)]/80',
                    isAdded && 'bg-[var(--color-diff-added-bg)] hover:bg-[var(--color-diff-added-bg)]/80',
                    isContext && 'hover:bg-[var(--color-surface-2)]/30'
                  )}
                >
                  {/* Line numbers - enhanced styling */}
                  <div className="flex-shrink-0 w-[56px] flex text-[8px] text-[var(--color-text-dim)]/50 select-none border-r border-[var(--color-border-subtle)]/15 tabular-nums font-medium">
                    <span className={cn(
                      'w-[28px] text-right pr-1 py-px',
                      isRemoved && 'text-[var(--color-diff-removed-gutter)] bg-[var(--color-diff-removed-gutter)]/20'
                    )}>
                      {line.oldLineNum || ''}
                    </span>
                    <span className={cn(
                      'w-[28px] text-right pr-1 py-px',
                      isAdded && 'text-[var(--color-diff-added-gutter)] bg-[var(--color-diff-added-gutter)]/20'
                    )}>
                      {line.newLineNum || ''}
                    </span>
                  </div>

                  {/* Change indicator bar - wider, more visible */}
                  <div className={cn(
                    'flex-shrink-0 w-[4px]',
                    isRemoved && 'bg-[var(--color-diff-removed-indicator)]',
                    isAdded && 'bg-[var(--color-diff-added-indicator)]'
                  )} />

                  {/* Line content with enhanced colors */}
                  <div className={cn(
                    'flex-1 px-2.5 py-px whitespace-pre overflow-x-auto leading-[1.65]',
                    isRemoved && 'text-[var(--color-diff-removed-text)]',
                    isAdded && 'text-[var(--color-diff-added-text)]',
                    isContext && 'text-[var(--color-text-secondary)]/65'
                  )}>
                    {line.inlineDiff && (isAdded || isRemoved) ? (
                      <span>
                        {(isRemoved ? line.inlineDiff.oldParts : line.inlineDiff.newParts).map((part, pIdx) => (
                          <span
                            key={pIdx}
                            className={cn(
                              'transition-colors duration-75',
                              part.type !== 'unchanged' && isRemoved && 'bg-[var(--color-diff-removed-word-bg)] text-[var(--color-diff-removed-text)] rounded-[3px] px-[3px] -mx-[1px] ring-1 ring-inset ring-[var(--color-diff-removed-word-ring)]',
                              part.type !== 'unchanged' && isAdded && 'bg-[var(--color-diff-added-word-bg)] text-[var(--color-diff-added-text)] rounded-[3px] px-[3px] -mx-[1px] ring-1 ring-inset ring-[var(--color-diff-added-word-ring)]'
                            )}
                          >
                            {part.text}
                          </span>
                        ))}
                      </span>
                    ) : (
                      line.content || '\u00A0'
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});

InlineDiffPreview.displayName = 'InlineDiffPreview';

// =============================================================================
// Edit Operation Diff Preview (for old_string -> new_string)
// =============================================================================

interface EditDiffPreviewProps {
  oldString: string;
  newString: string;
  filePath: string;
  maxHeight?: number;
}

const EditDiffPreview: React.FC<EditDiffPreviewProps> = memo(({
  oldString,
  newString,
  filePath,
  maxHeight = 200,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const stats = useMemo(() => computeDiffStats(oldString, newString), [oldString, newString]);

  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  return (
      <div className="mt-2 rounded-xl overflow-hidden border border-[var(--color-border-subtle)]/40 bg-[var(--color-surface-editor)] shadow-[0_6px_18px_rgba(0,0,0,0.16)]">
      {/* Header - refined design matching other diff previews */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3.5 py-2.5',
          'bg-gradient-to-r from-[var(--color-surface-1)]/70 via-[var(--color-surface-1)]/60 to-[var(--color-surface-1)]/50',
          'border-b border-[var(--color-border-subtle)]/30',
          'font-mono cursor-pointer transition-all duration-150',
          'hover:from-[var(--color-surface-1)]/90 hover:via-[var(--color-surface-1)]/80 hover:to-[var(--color-surface-1)]/70',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent-primary)]/30'
        )}
        aria-expanded={isExpanded}
        aria-label={`Edit file: ${fileName}`}
      >
        <span className={cn(
          'text-[var(--color-text-dim)] flex-shrink-0 transition-transform duration-200',
          isExpanded && 'rotate-0',
          !isExpanded && '-rotate-90'
        )}>
          <ChevronDown size={12} />
        </span>
        <FileEdit size={13} className="text-[var(--color-diff-modified-text)]" />
        <span className="text-[11px] font-medium text-[var(--color-text-primary)] truncate flex-1 min-w-0 text-left" title={filePath}>
          {fileName}
        </span>
        <span className="text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold flex-shrink-0 bg-[var(--color-diff-modified-bg)] text-[var(--color-diff-modified-text)] ring-1 ring-inset ring-[var(--color-diff-modified-ring)]">
          edit
        </span>
        <span className="text-[10px] flex-shrink-0 flex items-center gap-2 font-mono tabular-nums">
          {stats.added > 0 && (
            <span className="text-[var(--color-diff-added-text)] font-semibold">
              add {stats.added}
            </span>
          )}
          {stats.removed > 0 && (
            <span className="text-[var(--color-diff-removed-text)] font-semibold">
              remove {stats.removed}
            </span>
          )}
        </span>
      </button>

      {/* Diff content - side by side old/new sections with enhanced styling */}
      {isExpanded && (
        <div 
          className="font-mono text-[10px] leading-[1.65] overflow-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent"
          style={{ maxHeight }}
        >
          {/* Removed section */}
          <div className="border-b border-[var(--color-border-subtle)]/20">
            <div className="px-3 py-1.5 text-[8px] text-[var(--color-text-dim)]/80 bg-[var(--color-diff-removed-bg)] uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-diff-removed-indicator)]/60" />
              before
            </div>
            {oldString.split('\n').map((line, idx) => (
              <div
                key={`old-${idx}`}
                className="flex items-stretch bg-[var(--color-diff-removed-bg)] hover:bg-[var(--color-diff-removed-bg-hover)] transition-colors duration-75 border-b border-[var(--color-border-subtle)]/10"
              >
                <div className="flex-shrink-0 w-[32px] text-right pr-2 py-px text-[9px] text-[var(--color-diff-removed-gutter)] select-none border-r border-[var(--color-border-subtle)]/15 bg-[var(--color-diff-removed-gutter-bg)] tabular-nums font-medium">
                  {idx + 1}
                </div>
                <div className="flex-shrink-0 w-[4px] bg-[var(--color-diff-removed-indicator)]" />
                <div className="flex-1 px-3 py-px whitespace-pre overflow-x-auto text-[var(--color-diff-removed-text)]">
                  {line || '\u00A0'}
                </div>
              </div>
            ))}
          </div>

          {/* Added section */}
          <div>
            <div className="px-3 py-1.5 text-[8px] text-[var(--color-text-dim)]/80 bg-[var(--color-diff-added-bg)] uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-diff-added-indicator)]/60" />
              after
            </div>
            {newString.split('\n').map((line, idx) => (
              <div
                key={`new-${idx}`}
                className="flex items-stretch bg-[var(--color-diff-added-bg)] hover:bg-[var(--color-diff-added-bg-hover)] transition-colors duration-75 border-b border-[var(--color-border-subtle)]/10"
              >
                <div className="flex-shrink-0 w-[32px] text-right pr-2 py-px text-[9px] text-[var(--color-diff-added-gutter)] select-none border-r border-[var(--color-border-subtle)]/15 bg-[var(--color-diff-added-gutter-bg)] tabular-nums font-medium">
                  {idx + 1}
                </div>
                <div className="flex-shrink-0 w-[4px] bg-[var(--color-diff-added-indicator)]" />
                <div className="flex-1 px-3 py-px whitespace-pre overflow-x-auto text-[var(--color-diff-added-text)]">
                  {line || '\u00A0'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

EditDiffPreview.displayName = 'EditDiffPreview';

interface ToolConfirmationItemProps {
  confirmation: ToolCallEvent;
  onApprove: () => void;
  onDeny: () => void;
  onFeedback: (feedback: string) => void;
}

const ToolConfirmationItem: React.FC<ToolConfirmationItemProps> = memo(({
  confirmation,
  onApprove,
  onDeny,
  onFeedback,
}) => {
  const { toolCall } = confirmation;
  const Icon = getToolIconComponent(toolCall.name);
  const target = getToolTarget(toolCall.arguments, toolCall.name) ?? '';
  const run = shortRunId(confirmation.runId);
  
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArgsExpanded, setIsArgsExpanded] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);

  const quickSuggestions = useMemo(() => getQuickSuggestions(toolCall.name), [toolCall.name]);
  const hasArgs = toolCall.arguments && Object.keys(toolCall.arguments).length > 0;
  const argsString = useMemo(() => safeJsonStringify(toolCall.arguments, 2), [toolCall.arguments]);

  // Detect file operations for diff preview
  const isWriteOp = isFileWriteOperation(toolCall.name);
  const isEditOp = isFileEditOperation(toolCall.name);
  const isFileOp = isWriteOp || isEditOp;
  
  // Extract file operation data
  const filePath = useMemo(() => extractFilePath(toolCall.arguments), [toolCall.arguments]);
  const writeContent = useMemo(() => isWriteOp ? extractWriteContent(toolCall.arguments) : undefined, [isWriteOp, toolCall.arguments]);
  const editStrings = useMemo(() => isEditOp ? extractEditStrings(toolCall.arguments) : undefined, [isEditOp, toolCall.arguments]);
  
  // Fetch original content for write operations
  const { originalContent, isLoading: isLoadingOriginal } = useOriginalFileContent(
    isWriteOp ? filePath : undefined,
    isWriteOp
  );

  // Determine if we can show diff preview
  const canShowWriteDiff = isWriteOp && filePath && writeContent !== undefined && originalContent !== null && !isLoadingOriginal;
  const canShowEditDiff = isEditOp && filePath && editStrings !== undefined;
  const isNewFile = isWriteOp && originalContent === '';

  const handleFeedbackSubmit = useCallback(() => {
    if (!feedbackText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    onFeedback(feedbackText.trim());
  }, [feedbackText, isSubmitting, onFeedback]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFeedbackSubmit();
    }
    if (e.key === 'Escape') {
      setShowFeedback(false);
      setFeedbackText('');
    }
  }, [handleFeedbackSubmit]);

  const handleQuickSuggestion = useCallback((text: string) => {
    setFeedbackText(text);
    setShowFeedback(true);
  }, []);

  const handleCopyArgs = useCallback(async () => {
    await navigator.clipboard.writeText(argsString);
    setCopiedArgs(true);
    setTimeout(() => setCopiedArgs(false), 1500);
  }, [argsString]);

  return (
    <div className={cn(
      'group/confirm rounded-sm overflow-hidden font-mono',
      'border border-[var(--color-warning)]/25',
      'bg-[var(--color-surface-1)]',
      'transition-all duration-150'
    )}>
      {/* Header row */}
      <div className={cn(
        'px-3 py-2 flex items-center justify-between gap-3',
        'bg-[var(--color-surface-header)]',
        'border-b border-[var(--color-border-subtle)]'
      )}>
        <div className="min-w-0 flex items-center gap-2">
          <span className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            'bg-[var(--color-warning)]',
            'shadow-[0_0_6px_var(--color-warning)]'
          )} />
          <span className="text-[10px] text-[var(--color-warning)] font-medium">
            confirm
          </span>
          {run && (
            <span className="text-[9px] text-[var(--color-text-dim)]">
              #{run}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowFeedback(!showFeedback)}
            className={cn(
              'gap-1',
              showFeedback && 'bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)]'
            )}
            aria-label="Provide alternative instructions"
            title="Tell the agent to do something different"
          >
            <MessageSquare size={10} />
            suggest
          </Button>
          <Button
            variant="success"
            size="xs"
            onClick={onApprove}
            aria-label="Approve tool execution"
            leftIcon={<Check size={10} />}
          >
            approve
          </Button>
          <Button
            variant="danger"
            size="xs"
            onClick={onDeny}
            aria-label="Deny and stop execution"
            leftIcon={<X size={10} />}
          >
            deny
          </Button>
        </div>
      </div>

      {/* Tool info */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
          <span className="text-[11px] text-[var(--color-text-secondary)] font-medium">{toolCall.name}</span>
          {target && (
            <>
              <span className="text-[var(--color-text-dim)] opacity-40">→</span>
              <span className="text-[10px] text-[var(--color-text-muted)] truncate max-w-[300px]" title={target}>
                {target}
              </span>
            </>
          )}
        </div>

        {/* Diff preview for file operations */}
        {canShowWriteDiff && filePath && writeContent !== undefined && (
          <InlineDiffPreview
            originalContent={originalContent || ''}
            newContent={writeContent}
            filePath={filePath}
            isNewFile={isNewFile}
            maxHeight={200}
          />
        )}

        {canShowEditDiff && filePath && editStrings && (
          <EditDiffPreview
            oldString={editStrings.oldString}
            newString={editStrings.newString}
            filePath={filePath}
            maxHeight={200}
          />
        )}

        {/* Loading indicator for file content */}
        {isWriteOp && isLoadingOriginal && (
          <div className="mt-2 px-2 py-1.5 rounded-sm bg-[var(--color-surface-1)]/30 border border-[var(--color-border-subtle)]/30">
            <span className="text-[9px] text-[var(--color-text-muted)] animate-pulse">Loading file content...</span>
          </div>
        )}

        {/* Expandable arguments - only show if no diff preview or for non-file operations */}
        {hasArgs && !isFileOp && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setIsArgsExpanded(!isArgsExpanded)}
              className={cn(
                'flex items-center gap-1.5 py-0.5 cursor-pointer',
                'hover:bg-[var(--color-surface-1)]/50 rounded-sm px-1 -mx-1',
                'transition-colors duration-100',
                'outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/25'
              )}
            >
              <span className="text-[var(--color-text-dim)] opacity-50 w-2.5">
                {isArgsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </span>
              <span className="text-[9px] text-[var(--color-text-muted)]">arguments</span>
              <span className="text-[9px] text-[var(--color-text-dim)]">
                • {Object.keys(toolCall.arguments).length} {Object.keys(toolCall.arguments).length === 1 ? 'param' : 'params'}
              </span>
            </button>

            {isArgsExpanded && (
              <div className={cn(
                'mt-1.5 ml-4',
                'bg-[var(--color-surface-base)] rounded-sm',
                'border border-[var(--color-border-subtle)]',
                'overflow-hidden'
              )}>
                <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]/30">
                  <span className="text-[8px] text-[var(--color-text-dim)] uppercase tracking-wider">json</span>
                  <button
                    onClick={handleCopyArgs}
                    className={cn(
                      'p-0.5 rounded transition-colors',
                      'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                      'hover:bg-[var(--color-surface-2)]',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
                    )}
                    title="Copy arguments"
                  >
                    {copiedArgs ? (
                      <Check size={10} className="text-[var(--color-success)]" />
                    ) : (
                      <Copy size={10} />
                    )}
                  </button>
                </div>
                <div className="max-h-[120px] overflow-y-auto scrollbar-thin p-2">
                  <pre className="whitespace-pre-wrap break-all text-[9px] text-[var(--color-text-muted)]">
                    {argsString}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feedback section */}
      {showFeedback && (
        <div className={cn(
          'px-3 py-2.5 border-t border-[var(--color-border-subtle)]',
          'bg-[var(--color-surface-base)]'
        )}>
          {/* Quick suggestions */}
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <Zap size={10} className="text-[var(--color-accent-primary)]" />
            <span className="text-[9px] text-[var(--color-text-muted)]">quick:</span>
            {quickSuggestions.map((suggestion, idx) => {
              const SugIcon = suggestion.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleQuickSuggestion(suggestion.text)}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm',
                    'text-[9px] text-[var(--color-text-secondary)]',
                    'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
                    'hover:bg-[var(--color-surface-2)] hover:border-[var(--color-border-default)]',
                    'hover:text-[var(--color-text-primary)]',
                    'transition-all duration-100',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
                  )}
                  title={suggestion.text}
                >
                  <SugIcon size={9} />
                  {suggestion.label}
                </button>
              );
            })}
            {/* Add custom instruction button */}
            <button
              onClick={() => setFeedbackText(feedbackText ? feedbackText + ' ' : '')}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm',
                'text-[9px] text-[var(--color-accent-primary)]',
                'bg-[var(--color-surface-1)] border border-dashed border-[var(--color-accent-primary)]/30',
                'hover:bg-[var(--color-accent-primary)]/10 hover:border-[var(--color-accent-primary)]/50',
                'transition-all duration-100',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
              )}
              title="Add custom instruction"
            >
              <Plus size={9} />
              custom
            </button>
          </div>

          {/* Custom feedback input */}
          <div className="flex gap-2">
            <div className="flex-1 relative group">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="tell the agent what to do instead..."
                className={cn(
                  'w-full min-h-[48px] max-h-[100px] px-2 py-1.5 text-[10px] resize-none',
                  'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]',
                  'rounded-sm text-[var(--color-text-primary)] font-mono',
                  'placeholder:text-[var(--color-text-placeholder)]',
                  'focus-visible:outline-none focus-visible:border-[var(--color-accent-primary)]/50',
                  'focus-visible:bg-[var(--color-surface-header)]',
                  'hover:border-[var(--color-border-default)]',
                  'scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)]',
                  'transition-all duration-150'
                )}
                disabled={isSubmitting}
                autoFocus
              />
              {/* Focus indicator line */}
              <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--color-accent-primary)] scale-x-0 group-focus-within:scale-x-100 transition-transform duration-200 origin-left" />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleFeedbackSubmit}
              disabled={!feedbackText.trim() || isSubmitting}
              isLoading={isSubmitting}
              className="self-end"
              aria-label="Send feedback to agent"
              leftIcon={<Send size={10} />}
            >
              send
            </Button>
          </div>
          
          {/* Keyboard hints */}
          <div className="flex items-center gap-3 mt-1.5 text-[8px] text-[var(--color-text-dim)]">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">⏎</kbd>
              send
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">⇧⏎</kbd>
              newline
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">esc</kbd>
              cancel
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

ToolConfirmationItem.displayName = 'ToolConfirmationItem';

// =============================================================================
// Main Panel Component
// =============================================================================

export const ToolConfirmationPanel: React.FC = memo(() => {
  const actions = useAgentActions();
  const pendingConfirmationsMap = useAgentSelector(
    (s) => s.pendingConfirmations,
    (a, b) => a === b,
  );
  const pendingConfirmations = useMemo(() => Object.values(pendingConfirmationsMap), [pendingConfirmationsMap]);
  
  const handleApprove = useCallback((confirmation: ToolCallEvent) => {
    actions.confirmTool(confirmation.runId, true, confirmation.sessionId);
  }, [actions]);
  
  const handleDeny = useCallback((confirmation: ToolCallEvent) => {
    actions.confirmTool(confirmation.runId, false, confirmation.sessionId);
  }, [actions]);

  const handleFeedback = useCallback((confirmation: ToolCallEvent, feedback: string) => {
    actions.confirmTool(confirmation.runId, false, confirmation.sessionId, feedback);
  }, [actions]);

  // Batch actions
  const handleApproveAll = useCallback(() => {
    pendingConfirmations.forEach(c => {
      actions.confirmTool(c.runId, true, c.sessionId);
    });
  }, [actions, pendingConfirmations]);

  const handleDenyAll = useCallback(() => {
    pendingConfirmations.forEach(c => {
      actions.confirmTool(c.runId, false, c.sessionId);
    });
  }, [actions, pendingConfirmations]);
  
  if (pendingConfirmations.length === 0) {
    return null;
  }

  const showBatchActions = pendingConfirmations.length > 1;
  
  return (
    <div className="pt-3 space-y-2 animate-slide-in-bottom">
      <div className={cn(
        'rounded-sm overflow-hidden',
        'border border-[var(--color-border-subtle)]',
        'bg-[var(--color-surface-editor)]',
        'shadow-[0_2px_8px_-4px_rgba(0,0,0,0.3)]'
      )}>
        {/* Panel header */}
        <div className={cn(
          'px-3 py-1.5',
          'border-b border-[var(--color-border-subtle)]',
          'bg-[var(--color-surface-header)]'
        )}>
          <div className="flex items-center justify-between gap-2 font-mono">
            <div className="flex items-center gap-2">
              <AlertTriangle size={11} className="text-[var(--color-warning)]" />
              <span className="text-[10px] text-[var(--color-text-secondary)] font-medium">
                pending confirmation{pendingConfirmations.length > 1 ? 's' : ''}
              </span>
              <span className={cn(
                'text-[9px] px-1.5 py-0.5 rounded-sm',
                'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
                'border border-[var(--color-warning)]/20'
              )}>
                {pendingConfirmations.length}
              </span>
            </div>

            {/* Batch actions */}
            {showBatchActions && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleApproveAll}
                  className={cn(
                    'text-[9px] px-2 py-0.5 rounded-sm',
                    'text-[var(--color-success)]',
                    'bg-[var(--color-success)]/5 hover:bg-[var(--color-success)]/15',
                    'border border-[var(--color-success)]/20 hover:border-[var(--color-success)]/40',
                    'transition-colors duration-100'
                  )}
                >
                  approve all
                </button>
                <button
                  onClick={handleDenyAll}
                  className={cn(
                    'text-[9px] px-2 py-0.5 rounded-sm',
                    'text-[var(--color-error)]',
                    'bg-[var(--color-error)]/5 hover:bg-[var(--color-error)]/15',
                    'border border-[var(--color-error)]/20 hover:border-[var(--color-error)]/40',
                    'transition-colors duration-100'
                  )}
                >
                  deny all
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation items */}
        <div className="p-2 space-y-2">
          {pendingConfirmations.map((confirmation) => (
            <ToolConfirmationItem
              key={confirmation.runId}
              confirmation={confirmation}
              onApprove={() => handleApprove(confirmation)}
              onDeny={() => handleDeny(confirmation)}
              onFeedback={(feedback) => handleFeedback(confirmation, feedback)}
            />
          ))}
        </div>

        {/* Footer hint */}
        <div className={cn(
          'px-3 py-1.5',
          'border-t border-[var(--color-border-subtle)]',
          'bg-[var(--color-surface-header)]'
        )}>
          <div className="flex items-center justify-between text-[8px] text-[var(--color-text-dim)]">
            <span>review tool actions before execution</span>
            <span className="flex items-center gap-1">
              <span className="text-[var(--color-accent-primary)]">tip:</span>
              use suggest to guide the agent
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

ToolConfirmationPanel.displayName = 'ToolConfirmationPanel';
