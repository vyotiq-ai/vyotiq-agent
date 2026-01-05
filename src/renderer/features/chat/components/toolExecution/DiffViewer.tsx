/**
 * DiffViewer Component
 * 
 * Monaco-based inline diff viewer for file changes in chat.
 * Uses Monaco's built-in diff editor - zero new dependencies.
 * 
 * Features:
 * - Split view: Side-by-side with synchronized scroll
 * - Unified view: Single column, additions/deletions inline (GitHub PR style)
 * - Inline annotations: Hover to see old value without switching views
 * - Collapsible unchanged regions: Show only changed hunks with expandable context
 * - Accept/Reject/Edit actions per change with persistence
 */
import React, { memo, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as monaco from 'monaco-editor';
import { 
  Check, X, Pencil, SplitSquareHorizontal, AlignJustify, 
  ChevronDown, ChevronUp, Copy, FileText, ExternalLink,
  RotateCcw
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useEditor } from '../../../../state/EditorProvider';
import { getLanguageFromPath } from '../../../editor/utils/languageUtils';
import { registerCustomThemes } from '../../../editor/utils/themeUtils';
import { computeDiffStats, computeDiffHunks, computeInlineDiff, type DiffHunk } from './diffUtils';

// Ensure theme is registered once
let themeRegistered = false;
function ensureThemeRegistered() {
  if (!themeRegistered) {
    registerCustomThemes(monaco);
    themeRegistered = true;
  }
}

// Persistence keys
const DIFF_VIEW_MODE_KEY = 'vyotiq-diff-view-mode';
const DIFF_ACTIONS_KEY = 'vyotiq-diff-actions';

export type DiffViewMode = 'split' | 'unified';
export type DiffActionState = 'pending' | 'accepted' | 'rejected';

interface DiffActionRecord {
  filePath: string;
  state: DiffActionState;
  timestamp: number;
}

export interface DiffViewerProps {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  isNewFile?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  actionsDisabled?: boolean;
  defaultCollapsed?: boolean;
  maxHeight?: number;
  diffId?: string;
}

function getStoredViewMode(): DiffViewMode {
  try {
    const stored = localStorage.getItem(DIFF_VIEW_MODE_KEY);
    if (stored === 'split' || stored === 'unified') return stored;
  } catch { /* ignore */ }
  return 'unified';
}

function setStoredViewMode(mode: DiffViewMode): void {
  try {
    localStorage.setItem(DIFF_VIEW_MODE_KEY, mode);
  } catch { /* ignore */ }
}

function getStoredDiffAction(diffId: string): DiffActionRecord | null {
  try {
    const stored = localStorage.getItem(DIFF_ACTIONS_KEY);
    if (!stored) return null;
    const actions: Record<string, DiffActionRecord> = JSON.parse(stored);
    return actions[diffId] || null;
  } catch { /* ignore */ }
  return null;
}

function setStoredDiffAction(diffId: string, record: DiffActionRecord): void {
  try {
    const stored = localStorage.getItem(DIFF_ACTIONS_KEY);
    const actions: Record<string, DiffActionRecord> = stored ? JSON.parse(stored) : {};
    actions[diffId] = record;
    
    const entries = Object.entries(actions);
    if (entries.length > 100) {
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      localStorage.setItem(DIFF_ACTIONS_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, 100))));
    } else {
      localStorage.setItem(DIFF_ACTIONS_KEY, JSON.stringify(actions));
    }
  } catch { /* ignore */ }
}

function generateDiffId(filePath: string, original: string, modified: string): string {
  const hash = `${filePath}-${original.length}-${modified.length}`;
  return btoa(hash).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
}


export const DiffViewer: React.FC<DiffViewerProps> = memo(({
  filePath,
  originalContent,
  modifiedContent,
  isNewFile = false,
  onAccept,
  onReject,
  onEdit,
  actionsDisabled = false,
  defaultCollapsed = false,
  maxHeight = 300,
  diffId: providedDiffId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const [viewMode, setViewMode] = useState<DiffViewMode>(getStoredViewMode);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(true);
  const { openFile, showEditor, revertFile, tabs, updateContent } = useEditor();
  
  const diffId = useMemo(
    () => providedDiffId || generateDiffId(filePath, originalContent, modifiedContent),
    [providedDiffId, filePath, originalContent, modifiedContent]
  );
  
  const [actionState, setActionState] = useState<DiffActionState>(() => {
    const stored = getStoredDiffAction(diffId);
    return stored?.state || 'pending';
  });
  
  const language = useMemo(() => getLanguageFromPath(filePath), [filePath]);
  const stats = useMemo(() => computeDiffStats(originalContent, modifiedContent), [originalContent, modifiedContent]);
  const fileName = useMemo(() => filePath.split('/').pop() || filePath, [filePath]);
  
  const contextInfo = useMemo(() => {
    const totalLines = Math.max(originalContent.split('\n').length, modifiedContent.split('\n').length);
    const changedLines = stats.added + stats.removed + stats.changed;
    return { totalLines, unchangedLines: totalLines - changedLines };
  }, [originalContent, modifiedContent, stats]);
  
  // Compute diff hunks for unified view
  const diffHunks: DiffHunk[] = useMemo(() => 
    computeDiffHunks(originalContent, modifiedContent, 3),
    [originalContent, modifiedContent]
  );
  
  // Track expanded context regions
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set());
  
  // Inline annotation hover state
  const [hoveredLine, setHoveredLine] = useState<{ lineNum: number; oldValue: string } | null>(null);
  
  const handleViewModeToggle = useCallback(() => {
    const newMode = viewMode === 'split' ? 'unified' : 'split';
    setViewMode(newMode);
    setStoredViewMode(newMode);
  }, [viewMode]);
  
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
  
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(modifiedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [modifiedContent]);
  
  const handleOpenFile = useCallback(() => {
    openFile(filePath);
    showEditor();
  }, [filePath, openFile, showEditor]);
  
  const handleAccept = useCallback(async () => {
    setActionState('accepted');
    setStoredDiffAction(diffId, { filePath, state: 'accepted', timestamp: Date.now() });
    
    try {
      const result = await window.vyotiq.files.write(filePath, modifiedContent);
      if (!result.success) {
        console.error('Failed to write file:', result.error);
      }
    } catch (err) {
      console.error('Failed to accept changes:', err);
    }
    
    onAccept?.();
  }, [diffId, filePath, modifiedContent, onAccept]);
  
  const handleReject = useCallback(async () => {
    setActionState('rejected');
    setStoredDiffAction(diffId, { filePath, state: 'rejected', timestamp: Date.now() });
    
    try {
      const openTab = tabs.find(t => t.path === filePath);
      if (openTab) {
        updateContent(openTab.id, originalContent);
        revertFile(openTab.id);
      }
      
      if (!isNewFile && originalContent) {
        await window.vyotiq.files.write(filePath, originalContent);
      } else if (isNewFile) {
        await window.vyotiq.files.delete(filePath);
      }
    } catch (err) {
      console.error('Failed to reject changes:', err);
    }
    
    onReject?.();
  }, [diffId, filePath, originalContent, isNewFile, tabs, updateContent, revertFile, onReject]);
  
  const handleUndo = useCallback(() => {
    setActionState('pending');
    setStoredDiffAction(diffId, { filePath, state: 'pending', timestamp: Date.now() });
  }, [diffId, filePath]);

  
  useEffect(() => {
    // Only use Monaco for split view
    if (!containerRef.current || isCollapsed || viewMode === 'unified') return;
    
    // Ensure theme is registered before creating editor
    ensureThemeRegistered();
    
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const originalUri = monaco.Uri.parse(`inmemory://diff/original-${timestamp}-${random}.${language}`);
    const modifiedUri = monaco.Uri.parse(`inmemory://diff/modified-${timestamp}-${random}.${language}`);
    
    const originalModel = monaco.editor.createModel(originalContent, language, originalUri);
    const modifiedModel = monaco.editor.createModel(modifiedContent, language, modifiedUri);
    
    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      theme: 'vyotiq-dark',
      readOnly: true,
      renderSideBySide: true,
      enableSplitViewResizing: true,
      ignoreTrimWhitespace: false,
      renderIndicators: true,
      renderMarginRevertIcon: false,
      originalEditable: false,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      lineNumbers: 'on',
      glyphMargin: false,
      folding: contextCollapsed,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      fontSize: 11,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: { top: 4, bottom: 4 },
      diffWordWrap: 'on',
      renderWhitespace: 'none',
      useInlineViewWhenSpaceIsLimited: false,
      diffAlgorithm: 'advanced',
    });
    
    try {
      editor.setModel({ original: originalModel, modified: modifiedModel });
    } catch { /* Diff computation failed */ }
    
    editorRef.current = editor;
    
    return () => {
      editor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      editorRef.current = null;
    };
  }, [originalContent, modifiedContent, language, viewMode, isCollapsed, contextCollapsed]);
  
  useEffect(() => {
    if (editorRef.current && viewMode === 'split') {
      editorRef.current.updateOptions({ renderSideBySide: true });
    }
  }, [viewMode]);

  const showActions = (onAccept || onReject || onEdit) && actionState === 'pending';
  const showActionFeedback = actionState !== 'pending';
  
  // Render unified diff view (GitHub PR style)
  const renderUnifiedDiff = useCallback(() => {
    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');
    
    // Build unified diff display
    const diffLines: Array<{
      type: 'context' | 'added' | 'removed' | 'hunk-header' | 'expand';
      content: string;
      oldLineNum?: number;
      newLineNum?: number;
      inlineDiff?: { oldParts: Array<{ text: string; changed: boolean }>; newParts: Array<{ text: string; changed: boolean }> };
      expandInfo?: { before: number; after: number; regionIdx: number };
    }> = [];
    
    let lastOrigEnd = 0;
    let lastModEnd = 0;
    
    diffHunks.forEach((hunk, hunkIdx) => {
      // Add collapsed region indicator if there's a gap
      const gapOrig = hunk.originalStart - lastOrigEnd;
      const gapMod = hunk.modifiedStart - lastModEnd;
      
      if (gapOrig > 0 || gapMod > 0) {
        const gapLines = Math.max(gapOrig, gapMod);
        if (gapLines > 0 && !expandedRegions.has(hunkIdx)) {
          diffLines.push({
            type: 'expand',
            content: `${gapLines} unchanged line${gapLines !== 1 ? 's' : ''}`,
            expandInfo: { before: lastOrigEnd, after: hunk.originalStart, regionIdx: hunkIdx }
          });
        } else if (expandedRegions.has(hunkIdx)) {
          // Show expanded context
          for (let i = lastOrigEnd; i < hunk.originalStart; i++) {
            diffLines.push({
              type: 'context',
              content: originalLines[i] || '',
              oldLineNum: i + 1,
              newLineNum: lastModEnd + (i - lastOrigEnd) + 1
            });
          }
        }
      }
      
      // Add hunk header
      diffLines.push({
        type: 'hunk-header',
        content: `@@ -${hunk.originalStart + 1},${hunk.originalEnd - hunk.originalStart} +${hunk.modifiedStart + 1},${hunk.modifiedEnd - hunk.modifiedStart} @@`
      });
      
      // Process hunk lines - interleave removed and added for better readability
      const origHunkLines = hunk.originalLines;
      const modHunkLines = hunk.modifiedLines;
      
      // Find matching pairs for inline diff
      let origIdx = 0;
      let modIdx = 0;
      
      while (origIdx < origHunkLines.length || modIdx < modHunkLines.length) {
        const origLine = origIdx < origHunkLines.length ? origHunkLines[origIdx] : null;
        const modLine = modIdx < modHunkLines.length ? modHunkLines[modIdx] : null;
        
        // Check if lines are equal (context)
        if (origLine !== null && modLine !== null && origLine === modLine) {
          diffLines.push({
            type: 'context',
            content: origLine,
            oldLineNum: hunk.originalStart + origIdx + 1,
            newLineNum: hunk.modifiedStart + modIdx + 1
          });
          origIdx++;
          modIdx++;
        } else {
          // Show removed lines first, then added
          if (origLine !== null && (modLine === null || origLine !== modLine)) {
            const inlineDiff = modLine !== null ? computeInlineDiff(origLine, modLine) : undefined;
            diffLines.push({
              type: 'removed',
              content: origLine,
              oldLineNum: hunk.originalStart + origIdx + 1,
              inlineDiff
            });
            origIdx++;
          }
          if (modLine !== null && (origLine === null || origLine !== modLine)) {
            const inlineDiff = origLine !== null ? computeInlineDiff(origHunkLines[origIdx - 1] || '', modLine) : undefined;
            diffLines.push({
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
    
    // Add trailing collapsed region
    const trailingOrig = originalLines.length - lastOrigEnd;
    const trailingMod = modifiedLines.length - lastModEnd;
    const trailingGap = Math.max(trailingOrig, trailingMod);
    
    if (trailingGap > 0 && !expandedRegions.has(diffHunks.length)) {
      diffLines.push({
        type: 'expand',
        content: `${trailingGap} unchanged line${trailingGap !== 1 ? 's' : ''}`,
        expandInfo: { before: lastOrigEnd, after: originalLines.length, regionIdx: diffHunks.length }
      });
    } else if (expandedRegions.has(diffHunks.length) && trailingGap > 0) {
      for (let i = lastOrigEnd; i < originalLines.length; i++) {
        diffLines.push({
          type: 'context',
          content: originalLines[i] || '',
          oldLineNum: i + 1,
          newLineNum: lastModEnd + (i - lastOrigEnd) + 1
        });
      }
    }
    
    return (
      <div 
        className="font-mono text-[11px] leading-relaxed overflow-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent"
        style={{ maxHeight }}
      >
        {diffLines.map((line, idx) => {
          if (line.type === 'expand') {
            return (
              <button
                key={idx}
                type="button"
                onClick={() => line.expandInfo && toggleRegionExpanded(line.expandInfo.regionIdx)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-1 px-3',
                  'text-[9px] font-mono text-[var(--color-text-muted)]',
                  'bg-[var(--color-surface-1)]/30 hover:bg-[var(--color-surface-2)]/50',
                  'border-y border-[var(--color-border-subtle)]/30 transition-colors'
                )}
              >
                <ChevronDown size={10} />
                <span>{line.content}</span>
                <ChevronDown size={10} />
              </button>
            );
          }
          
          if (line.type === 'hunk-header') {
            return (
              <div
                key={idx}
                className="px-3 py-0.5 text-[9px] text-[var(--color-info)] bg-[var(--color-info)]/5 border-y border-[var(--color-border-subtle)]/20"
              >
                {line.content}
              </div>
            );
          }
          
          const isRemoved = line.type === 'removed';
          const isAdded = line.type === 'added';
          const isContext = line.type === 'context';
          
          return (
            <div
              key={idx}
              className={cn(
                'flex items-stretch group relative',
                isRemoved && 'bg-[#e06c75]/8',
                isAdded && 'bg-[#98c379]/8',
                isContext && 'hover:bg-[var(--color-surface-2)]/30'
              )}
              onMouseEnter={() => {
                if (isAdded && line.inlineDiff) {
                  const oldValue = line.inlineDiff.oldParts.map(p => p.text).join('');
                  if (oldValue.trim()) {
                    setHoveredLine({ lineNum: line.newLineNum || 0, oldValue });
                  }
                }
              }}
              onMouseLeave={() => setHoveredLine(null)}
            >
              {/* Line numbers */}
              <div className="flex-shrink-0 w-[60px] flex text-[9px] text-[var(--color-text-dim)] select-none border-r border-[var(--color-border-subtle)]/20">
                <span className={cn(
                  'w-[30px] text-right pr-1',
                  isRemoved && 'bg-[#e06c75]/15'
                )}>
                  {line.oldLineNum || ''}
                </span>
                <span className={cn(
                  'w-[30px] text-right pr-1',
                  isAdded && 'bg-[#98c379]/15'
                )}>
                  {line.newLineNum || ''}
                </span>
              </div>
              
              {/* Change indicator */}
              <div className={cn(
                'flex-shrink-0 w-[20px] text-center select-none',
                isRemoved && 'text-[var(--color-error)] bg-[#e06c75]/10',
                isAdded && 'text-[var(--color-success)] bg-[#98c379]/10',
                isContext && 'text-[var(--color-text-dim)]'
              )}>
                {isRemoved ? '-' : isAdded ? '+' : ' '}
              </div>
              
              {/* Line content */}
              <div className={cn(
                'flex-1 px-2 whitespace-pre overflow-x-auto',
                isRemoved && 'text-[var(--color-text-secondary)]',
                isAdded && 'text-[var(--color-text-primary)]',
                isContext && 'text-[var(--color-text-secondary)]'
              )}>
                {line.inlineDiff && (isAdded || isRemoved) ? (
                  <span>
                    {(isRemoved ? line.inlineDiff.oldParts : line.inlineDiff.newParts).map((part, pIdx) => (
                      <span
                        key={pIdx}
                        className={cn(
                          part.changed && isRemoved && 'bg-[#e06c75]/25 rounded-sm',
                          part.changed && isAdded && 'bg-[#98c379]/25 rounded-sm'
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
              
              {/* Inline annotation tooltip */}
              {hoveredLine && hoveredLine.lineNum === line.newLineNum && isAdded && (
                <div className="absolute right-2 z-10 px-2 py-1 rounded bg-[var(--color-surface-3)] border border-[var(--color-border-default)] shadow-lg text-[9px] text-[var(--color-text-muted)] max-w-[200px] truncate">
                  <span className="text-[var(--color-text-dim)]">was: </span>
                  <span className="text-[var(--color-error)]">{hoveredLine.oldValue}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [originalContent, modifiedContent, diffHunks, expandedRegions, maxHeight, hoveredLine, toggleRegionExpanded]);


  return (
    <div className="ml-4 mt-1.5 mb-2 rounded-lg overflow-hidden border border-[var(--color-border-subtle)]/60 bg-[var(--color-surface-editor)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-1)]/50 border-b border-[var(--color-border-subtle)]/40">
        <FileText size={12} className="text-[var(--color-text-muted)] flex-shrink-0" />
        <span className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate flex-1" title={filePath}>
          {fileName}
        </span>
        
        {/* Diff stats */}
        <div className="flex items-center gap-1.5 text-[9px] font-mono">
          {stats.added > 0 && <span className="text-[var(--color-success)]">+{stats.added}</span>}
          {stats.removed > 0 && <span className="text-[var(--color-error)]">-{stats.removed}</span>}
          {stats.changed > 0 && <span className="text-[var(--color-warning)]">~{stats.changed}</span>}
          {isNewFile && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--color-success)]/15 text-[var(--color-success)]">new</span>
          )}
        </div>
        
        {/* Context toggle */}
        {contextInfo.unchangedLines > 5 && (
          <button
            type="button"
            onClick={() => setContextCollapsed(!contextCollapsed)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors',
              'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
              'hover:bg-[var(--color-surface-2)]',
              !contextCollapsed && 'bg-[var(--color-surface-2)]'
            )}
            title={contextCollapsed ? 'Show all context' : 'Hide unchanged context'}
          >
            {contextCollapsed ? `+${contextInfo.unchangedLines} lines` : 'hide context'}
          </button>
        )}
        
        {/* View mode toggle */}
        <button
          type="button"
          onClick={handleViewModeToggle}
          className={cn(
            'p-1 rounded transition-colors',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface-2)]'
          )}
          title={viewMode === 'split' ? 'Switch to unified view' : 'Switch to split view'}
        >
          {viewMode === 'split' ? <AlignJustify size={12} /> : <SplitSquareHorizontal size={12} />}
        </button>
        
        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'p-1 rounded transition-colors',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface-2)]'
          )}
          title="Copy modified content"
        >
          {copied ? <Check size={12} className="text-[var(--color-success)]" /> : <Copy size={12} />}
        </button>
        
        {/* Open in editor */}
        <button
          type="button"
          onClick={handleOpenFile}
          className={cn(
            'p-1 rounded transition-colors',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface-2)]'
          )}
          title="Open in editor"
        >
          <ExternalLink size={12} />
        </button>
        
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            'p-1 rounded transition-colors',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            'hover:bg-[var(--color-surface-2)]'
          )}
          title={isCollapsed ? 'Expand diff' : 'Collapse diff'}
        >
          {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>
      
      {/* Diff editor container */}
      {!isCollapsed && (
        viewMode === 'unified' ? (
          renderUnifiedDiff()
        ) : (
          <div ref={containerRef} style={{ height: maxHeight }} className="w-full" />
        )
      )}

      
      {/* Action buttons footer */}
      {!isCollapsed && (showActions || showActionFeedback) && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--color-border-subtle)]/40 bg-[var(--color-surface-1)]/30">
          <div className="flex-1" />
          
          {/* Action feedback with undo */}
          {showActionFeedback && (
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-[9px] font-medium px-2 py-0.5 rounded',
                actionState === 'accepted' 
                  ? 'text-[var(--color-success)] bg-[var(--color-success)]/10'
                  : 'text-[var(--color-error)] bg-[var(--color-error)]/10'
              )}>
                {actionState === 'accepted' ? 'Changes accepted' : 'Changes rejected'}
              </span>
              <button
                type="button"
                onClick={handleUndo}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                  'text-[var(--color-text-muted)] bg-[var(--color-surface-2)]',
                  'hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-secondary)]'
                )}
                title="Undo action"
              >
                <RotateCcw size={10} />
                Undo
              </button>
            </div>
          )}
          
          {/* Action buttons */}
          {showActions && (
            <div className="flex items-center gap-2">
              {onReject && (
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={actionsDisabled}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                    'text-[var(--color-error)] bg-[var(--color-error)]/10',
                    'hover:bg-[var(--color-error)]/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <X size={10} />
                  Reject
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  disabled={actionsDisabled}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                    'text-[var(--color-text-secondary)] bg-[var(--color-surface-2)]',
                    'hover:bg-[var(--color-surface-3)]',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <Pencil size={10} />
                  Edit
                </button>
              )}
              {onAccept && (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={actionsDisabled}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
                    'text-[var(--color-success)] bg-[var(--color-success)]/10',
                    'hover:bg-[var(--color-success)]/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <Check size={10} />
                  Accept
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

DiffViewer.displayName = 'DiffViewer';
