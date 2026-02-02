/**
 * DiffViewer Component
 * 
 * Modern, semantic diff viewer with enhanced visual design.
 * Features:
 * - Always shows diffs by default (no collapse on initial render)
 * - Semantic word-level inline diffs with character-level highlighting  
 * - Split (Monaco) and unified view modes with smooth transitions
 * - GitHub-style line highlighting with refined One Dark colors
 * - Expandable context regions with smart collapse
 * - Inline syntax highlighting for changed words
 * - Accept/Reject/Edit actions with persistence and undo
 * - Keyboard navigation (j/k or arrows) for accessibility
 * - Clean terminal-friendly styling without +/- prefix symbols
 * - Responsive design with adaptive width and height
 * - Loading states with skeleton placeholders
 * - Copy to clipboard with visual feedback
 */
import React, { memo, useRef, useEffect, useState, useCallback, useMemo, useTransition } from 'react';
import * as monaco from 'monaco-editor';
import { 
  Check, X, Pencil, Columns2, AlignLeft,
  ChevronDown, ChevronUp, ChevronRight, Copy, ExternalLink,
  RotateCcw, FileCode2, Loader2
} from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useEditor } from '../../../../state/EditorProvider';
import { getLanguageFromPath } from '../../../editor/utils/languageUtils';
import { registerCustomThemes } from '../../../editor/utils/themeUtils';
import { 
  computeDiffStats, 
  buildSemanticDiffLines, 
  type SemanticDiffLine,
  type InlineDiffPart
} from './diffUtils';

// Ensure theme is registered once
let themeRegistered = false;
function ensureThemeRegistered() {
  if (!themeRegistered) {
    registerCustomThemes(monaco);
    themeRegistered = true;
  }
}

// ============================================================================
// Persistence
// ============================================================================

const DIFF_VIEW_MODE_KEY = 'vyotiq-diff-view-mode';
const DIFF_ACTIONS_KEY = 'vyotiq-diff-actions';

export type DiffViewMode = 'split' | 'unified';
export type DiffActionState = 'pending' | 'accepted' | 'rejected';

interface DiffActionRecord {
  filePath: string;
  state: DiffActionState;
  timestamp: number;
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
    
    // Limit storage to 100 entries
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

// ============================================================================
// Helper Functions
// ============================================================================

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

// ============================================================================
// Props
// ============================================================================

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

// ============================================================================
// Inline Diff Part Renderer
// ============================================================================

interface DiffPartRendererProps {
  parts: InlineDiffPart[];
  lineType: 'added' | 'removed';
}

/**
 * Renders inline word-level diffs with character-level highlighting.
 * Changed parts are highlighted with background colors matching
 * the line type (red for removed, green for added).
 * Uses CSS variables for theme consistency.
 */
const DiffPartRenderer: React.FC<DiffPartRendererProps> = memo(({ parts, lineType }) => {
  if (!parts || parts.length === 0) return null;
  
  return (
    <>
      {parts.map((part, idx) => {
        const isHighlighted = part.type !== 'unchanged';
        return (
          <span
            key={idx}
            className={cn(
              // Word-level highlight for changed parts
              isHighlighted && lineType === 'removed' && [
                'bg-[var(--color-diff-removed-word-bg)]',
                'text-[var(--color-diff-removed-word-text)]',
                'rounded-sm px-[2px] -mx-[1px]'
              ],
              isHighlighted && lineType === 'added' && [
                'bg-[var(--color-diff-added-word-bg)]',
                'text-[var(--color-diff-added-word-text)]',
                'rounded-sm px-[2px] -mx-[1px]'
              ]
            )}
          >
            {part.text}
          </span>
        );
      })}
    </>
  );
});

DiffPartRenderer.displayName = 'DiffPartRenderer';

// ============================================================================
// Main Component
// ============================================================================

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
  maxHeight = 450,
  diffId: providedDiffId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const diffContainerRef = useRef<HTMLDivElement>(null);
  
  // State
  const [viewMode, setViewMode] = useState<DiffViewMode>(getStoredViewMode);
  // Initialize collapsed state from prop - respects caller's preference
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set());
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  
  const { openFile, showEditor, revertFile, tabs, updateContent } = useEditor();
  
  // Computed values
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
  const fileName = useMemo(() => getFileName(filePath), [filePath]);
  
  // Build semantic diff lines for unified view
  // Use deferred value pattern for large files to prevent UI blocking
  const diffLines: SemanticDiffLine[] = useMemo(() => {
    // For very large files, computation is expensive - but useMemo handles caching
    return buildSemanticDiffLines(originalContent, modifiedContent, 3);
  }, [originalContent, modifiedContent]);
  
  // Track if file is large for performance warnings
  const isLargeFile = originalContent.length > 50000 || modifiedContent.length > 50000;
  
  // Handlers - use startTransition for non-urgent updates to prevent UI blocking
  const handleViewModeToggle = useCallback(() => {
    startTransition(() => {
      const newMode = viewMode === 'split' ? 'unified' : 'split';
      setViewMode(newMode);
      setStoredViewMode(newMode);
    });
  }, [viewMode, startTransition]);
  
  const toggleRegionExpanded = useCallback((regionIdx: number) => {
    startTransition(() => {
      setExpandedRegions(prev => {
        const next = new Set(prev);
        if (next.has(regionIdx)) {
          next.delete(regionIdx);
        } else {
          next.add(regionIdx);
        }
        return next;
      });
    });
  }, [startTransition]);
  
  // Toggle collapsed state with smooth transition
  const toggleCollapsed = useCallback(() => {
    startTransition(() => {
      setIsCollapsed(prev => !prev);
    });
  }, [startTransition]);
  
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
  
  // Keyboard navigation for diff lines (accessibility)
  const handleKeyNavigation = useCallback((e: React.KeyboardEvent) => {
    if (viewMode !== 'unified' || isCollapsed) return;
    
    const changeLines = diffLines.filter(l => l.type === 'added' || l.type === 'removed');
    if (changeLines.length === 0) return;
    
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentIdx = focusedLineIdx ?? -1;
      const nextIdx = Math.min(currentIdx + 1, changeLines.length - 1);
      setFocusedLineIdx(nextIdx);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIdx = focusedLineIdx ?? changeLines.length;
      const prevIdx = Math.max(currentIdx - 1, 0);
      setFocusedLineIdx(prevIdx);
    }
  }, [viewMode, isCollapsed, diffLines, focusedLineIdx]);

  // Monaco editor for split view
  useEffect(() => {
    if (!containerRef.current || isCollapsed || viewMode === 'unified') return;
    
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
      folding: true,
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 3,
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
      },
      fontSize: 11,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: { top: 8, bottom: 8 },
      diffWordWrap: 'on',
      renderWhitespace: 'none',
      useInlineViewWhenSpaceIsLimited: false,
      diffAlgorithm: 'advanced',
      // Unicode highlighting - consistent with MonacoEditor
      unicodeHighlight: {
        ambiguousCharacters: false,
        invisibleCharacters: true,
        nonBasicASCII: false,
        includeComments: false,
        includeStrings: false,
        allowedCharacters: {
          '\u251C': true, '\u2502': true, '\u2514': true, '\u2500': true, '\u250C': true, '\u2510': true,
          '\u2518': true, '\u2524': true, '\u252C': true, '\u2534': true, '\u253C': true,
          '\u2554': true, '\u2557': true, '\u255A': true, '\u255D': true, '\u2551': true, '\u2550': true,
          '\u2192': true, '\u2190': true, '\u2191': true, '\u2193': true, '\u21D2': true, '\u21D0': true,
          '\u2713': true, '\u2717': true, '\u2714': true, '\u2718': true,
          '\u2022': true, '\u25E6': true, '\u25AA': true, '\u25AB': true,
          '\u00A9': true, '\u00AE': true, '\u2122': true,
          '\u00B0': true, '\u00B1': true, '\u00D7': true, '\u00F7': true,
          '\u2026': true, '\u2014': true, '\u2013': true,
          '\u2018': true, '\u2019': true, '\u201C': true, '\u201D': true,
          '\u00AB': true, '\u00BB': true,
          '\u20AC': true, '\u00A3': true, '\u00A5': true,
        },
        allowedLocales: { _os: true, _vscode: true },
      },
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
  }, [originalContent, modifiedContent, language, viewMode, isCollapsed]);

  // Render unified diff view
  const renderUnifiedDiff = useCallback(() => {
    const originalLines = originalContent.split('\n');
    let expandRegionCounter = 0;
    
    return (
      <div 
        className="font-mono text-[11px] leading-[1.65] overflow-auto scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent min-w-0"
        style={{ maxHeight }}
      >
        {diffLines.map((line, idx) => {
          // Expand button for collapsed regions
          if (line.type === 'expand') {
            const regionIdx = expandRegionCounter++;
            const isExpanded = expandedRegions.has(regionIdx);
            
            if (isExpanded && line.expandInfo) {
              // Show expanded lines
              const expandedLines: React.ReactNode[] = [];
              for (let i = line.expandInfo.startLine; i < line.expandInfo.endLine; i++) {
                const contextLine = originalLines[i] || '';
                expandedLines.push(
                  <div
                    key={`expanded-${i}`}
                    className="flex items-stretch hover:bg-[var(--color-surface-2)]/20"
                  >
                    {/* Line numbers for expanded context */}
                    <div className="flex-shrink-0 w-[68px] flex select-none">
                      <span className="w-[34px] text-right pr-2 py-px text-[9px] text-[var(--color-text-dim)]/35 tabular-nums font-medium border-r border-[var(--color-border-subtle)]/10">
                        {i + 1}
                      </span>
                      <span className="w-[34px] text-right pr-2 py-px text-[9px] text-[var(--color-text-dim)]/35 tabular-nums font-medium border-r border-[var(--color-border-subtle)]/10">
                        {i + 1}
                      </span>
                    </div>
                    {/* Empty change indicator */}
                    <div className="flex-shrink-0 w-[3px]" />
                    {/* Content */}
                    <div className="flex-1 px-3 py-px whitespace-pre overflow-x-auto text-[var(--color-text-secondary)]/55 leading-[1.65] min-w-0">
                      {contextLine || '\u00A0'}
                    </div>
                  </div>
                );
              }
              
              return (
                <div key={`expand-region-${idx}`}>
                  <button
                    type="button"
                    onClick={() => toggleRegionExpanded(regionIdx)}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 py-1.5',
                      'text-[9px] font-mono text-[var(--color-diff-expand-text)]/70',
                      'bg-[var(--color-diff-expand-bg)]',
                      'hover:bg-[var(--color-diff-expand-bg-hover)] hover:text-[var(--color-diff-expand-text)]',
                      'border-y border-[var(--color-diff-expand-border)] transition-colors duration-100',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-diff-expand-text)]/30'
                    )}
                    aria-expanded={true}
                    aria-label="Collapse expanded lines"
                  >
                    <ChevronUp size={10} className="opacity-70" />
                    <span className="tracking-wide">collapse</span>
                    <ChevronUp size={10} className="opacity-70" />
                  </button>
                  {expandedLines}
                </div>
              );
            }
            
            return (
              <button
                key={`expand-${idx}`}
                type="button"
                onClick={() => toggleRegionExpanded(regionIdx)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-1.5',
                  'text-[9px] font-mono text-[var(--color-diff-expand-text)]/70',
                  'bg-[var(--color-diff-expand-bg)]',
                  'hover:bg-[var(--color-diff-expand-bg-hover)] hover:text-[var(--color-diff-expand-text)]',
                  'border-y border-[var(--color-diff-expand-border)]',
                  'transition-all duration-100 cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-diff-expand-text)]/30'
                )}
                aria-label={`Expand ${line.expandInfo?.count || 0} unchanged lines`}
              >
                <ChevronDown size={10} className="opacity-70" />
                <span className="tracking-wide">{line.content}</span>
                <ChevronDown size={10} className="opacity-70" />
              </button>
            );
          }
          
          const isRemoved = line.type === 'removed';
          const isAdded = line.type === 'added';
          const isContext = line.type === 'context';
          
          // Check if this line is focused (for keyboard navigation)
          const changeLineIndex = diffLines
            .slice(0, idx)
            .filter(l => l.type === 'added' || l.type === 'removed').length;
          const isFocused = (isAdded || isRemoved) && focusedLineIdx === changeLineIndex;
          
          return (
            <div
              key={idx}
              className={cn(
                'flex items-stretch group/line border-b border-[var(--color-border-subtle)]/10',
                // Line background colors using CSS variables
                isRemoved && 'bg-[var(--color-diff-removed-bg)] hover:bg-[var(--color-diff-removed-bg-hover)]',
                isAdded && 'bg-[var(--color-diff-added-bg)] hover:bg-[var(--color-diff-added-bg-hover)]',
                isContext && 'hover:bg-[var(--color-surface-2)]/20',
                // Focus ring for keyboard navigation
                isFocused && 'ring-1 ring-inset ring-[var(--color-accent-primary)]/50 bg-[var(--color-accent-primary)]/[0.05]'
              )}
              role={isAdded || isRemoved ? 'row' : undefined}
              aria-label={isAdded ? `Added: ${line.content}` : isRemoved ? `Removed: ${line.content}` : undefined}
            >
              {/* Line numbers - dual column gutter with semantic coloring */}
              <div className="flex-shrink-0 w-[68px] flex select-none" aria-hidden="true">
                <span className={cn(
                  'w-[34px] text-right pr-2 py-px text-[9px] tabular-nums font-medium',
                  'border-r border-[var(--color-border-subtle)]/10',
                  isRemoved ? 'text-[var(--color-diff-removed-text)] bg-[var(--color-diff-removed-gutter-bg)]' : 'text-[var(--color-text-dim)]/40'
                )}>
                  {line.oldLineNum || ''}
                </span>
                <span className={cn(
                  'w-[34px] text-right pr-2 py-px text-[9px] tabular-nums font-medium',
                  'border-r border-[var(--color-border-subtle)]/10',
                  isAdded ? 'text-[var(--color-diff-added-text)] bg-[var(--color-diff-added-gutter-bg)]' : 'text-[var(--color-text-dim)]/40'
                )}>
                  {line.newLineNum || ''}
                </span>
              </div>
              
              {/* Change indicator bar - colored vertical stripe for visual scanning */}
              <div className={cn(
                'flex-shrink-0 w-[4px]',
                isRemoved && 'bg-[var(--color-diff-removed-indicator)]',
                isAdded && 'bg-[var(--color-diff-added-indicator)]'
              )} />
              
              {/* Line content with inline diff highlighting */}
              <div className={cn(
                'flex-1 px-3 py-px whitespace-pre overflow-x-auto leading-[1.65] min-w-0',
                isRemoved && 'text-[var(--color-diff-removed-text-content)]',
                isAdded && 'text-[var(--color-diff-added-text-content)]',
                isContext && 'text-[var(--color-text-secondary)]/60'
              )}>
                {line.inlineDiff && (isAdded || isRemoved) ? (
                  <DiffPartRenderer 
                    parts={isRemoved ? line.inlineDiff.oldParts : line.inlineDiff.newParts}
                    lineType={isRemoved ? 'removed' : 'added'}
                  />
                ) : (
                  line.content || '\u00A0'
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [originalContent, diffLines, expandedRegions, maxHeight, toggleRegionExpanded, focusedLineIdx]);

  // Computed flags
  const showActions = (onAccept || onReject || onEdit) && actionState === 'pending';
  const showActionFeedback = actionState !== 'pending';
  const hasChanges = stats.totalChanges > 0;

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-[var(--color-border-subtle)]/40 bg-[var(--color-surface-editor)] shadow-[0_6px_20px_rgba(0,0,0,0.18)] min-w-0 max-w-full">
      {/* Header bar - clean, modern design */}
      <div 
        className={cn(
          'flex items-center gap-2.5 px-3.5 py-2.5',
          'bg-gradient-to-r from-[var(--color-surface-1)]/70 via-[var(--color-surface-1)]/60 to-[var(--color-surface-1)]/50',
          'border-b border-[var(--color-border-subtle)]/30',
          'font-mono cursor-pointer transition-colors duration-150',
          'hover:from-[var(--color-surface-1)]/90 hover:via-[var(--color-surface-1)]/80 hover:to-[var(--color-surface-1)]/70',
          'min-w-0 overflow-hidden' // Prevent header overflow
        )}
        onClick={() => toggleCollapsed()}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        aria-label={`${isNewFile ? 'New file' : 'Modified file'}: ${fileName}. ${stats.added} additions, ${stats.removed} deletions. Press Enter to ${isCollapsed ? 'expand' : 'collapse'}.`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCollapsed();
          }
        }}
      >
        {/* Expand/collapse indicator - ChevronRight when collapsed, ChevronDown when expanded */}
        <span 
          className={cn(
            'text-[var(--color-text-dim)] flex-shrink-0 transition-transform duration-150',
            isPending && 'opacity-50'
          )} 
          aria-hidden="true"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
        
        {/* File icon with status color */}
        <FileCode2 
          size={13} 
          className={cn(
            'flex-shrink-0',
            isNewFile ? 'text-[var(--color-diff-added-text)]' : 'text-[var(--color-diff-expand-text)]'
          )} 
          aria-hidden="true" 
        />
        
        {/* File name (prominent) */}
        <span className="text-[11px] font-medium text-[var(--color-text-primary)] flex-shrink-0">
          {fileName}
        </span>
        
        {/* File path (subdued) - only show parent directories */}
        {filePath !== fileName && (
          <span 
            className="text-[10px] text-[var(--color-text-dim)]/70 truncate flex-1 min-w-0" 
            title={filePath}
          >
            {filePath.replace(new RegExp(`${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').replace(/[/\\]$/, '')}
          </span>
        )}
        
        {/* Spacer when no path */}
        {filePath === fileName && <span className="flex-1" />}
        
        {/* Status badge - minimal pill design */}
        <span className={cn(
          'text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ring-1 ring-inset',
          isNewFile 
            ? 'bg-[var(--color-diff-added-text)]/12 text-[var(--color-diff-added-text)] ring-[var(--color-diff-added-text)]/25' 
            : 'bg-[var(--color-diff-expand-text)]/12 text-[var(--color-diff-expand-text)] ring-[var(--color-diff-expand-text)]/25'
        )}>
          {isNewFile ? 'new' : 'modified'}
        </span>
        
        {/* Diff stats - clean monospace display */}
        {hasChanges && (
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
        )}
        
        {/* Action buttons - refined with separator */}
        <div 
          className="flex items-center gap-0.5 flex-shrink-0 ml-2 pl-2 border-l border-[var(--color-border-subtle)]/20" 
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleViewModeToggle}
            className={cn(
              'p-1.5 rounded transition-colors duration-100',
              'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]',
              'hover:bg-[var(--color-surface-2)]/60',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
            )}
            title={viewMode === 'split' ? 'Switch to unified view' : 'Switch to split view'}
            aria-label={viewMode === 'split' ? 'Switch to unified view' : 'Switch to split view'}
          >
            {viewMode === 'split' ? <AlignLeft size={12} /> : <Columns2 size={12} />}
          </button>
          
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'p-1.5 rounded transition-colors duration-100',
              'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]',
              'hover:bg-[var(--color-surface-2)]/60',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
            )}
            title="Copy new content"
            aria-label="Copy new content to clipboard"
          >
            {copied ? <Check size={12} className="text-[var(--color-diff-added-text)]" /> : <Copy size={12} />}
          </button>
          
          <button
            type="button"
            onClick={handleOpenFile}
            className={cn(
              'p-1.5 rounded transition-colors duration-100',
              'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]',
              'hover:bg-[var(--color-surface-2)]/60',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
            )}
            title="Open in editor"
            aria-label="Open file in editor"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </div>
      
      {/* Diff content */}
      {!isCollapsed && (
        <div
          ref={diffContainerRef}
          onKeyDown={handleKeyNavigation}
          tabIndex={viewMode === 'unified' ? 0 : -1}
          role="region"
          aria-label="File diff content"
          className="outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30 focus-visible:ring-inset"
        >
          {isPending && isLargeFile && (
            <div className="flex items-center justify-center gap-2 py-2 text-[10px] text-[var(--color-text-muted)]">
              <Loader2 size={12} className="animate-spin" />
              <span>Computing diff...</span>
            </div>
          )}
          {viewMode === 'unified' ? (
            renderUnifiedDiff()
          ) : (
            <div ref={containerRef} style={{ height: maxHeight }} className="w-full" />
          )}
        </div>
      )}
      
      {/* Action buttons footer - clean, minimal design */}
      {!isCollapsed && (showActions || showActionFeedback) && (
        <div className="flex items-center gap-3 px-3 py-2 border-t border-[var(--color-border-subtle)]/20 bg-[var(--color-surface-1)]/30">
          <div className="flex-1" />
          
          {/* Action feedback with undo */}
          {showActionFeedback && (
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-[9px] font-medium px-2 py-1 rounded flex items-center gap-1.5',
                actionState === 'accepted' 
                  ? 'text-[var(--color-diff-added-text)] bg-[var(--color-diff-added-text)]/10'
                  : 'text-[var(--color-diff-removed-text)] bg-[var(--color-diff-removed-text)]/10'
              )}>
                {actionState === 'accepted' ? <Check size={10} /> : <X size={10} />}
                {actionState === 'accepted' ? 'Accepted' : 'Rejected'}
              </span>
              <button
                type="button"
                onClick={handleUndo}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors duration-100',
                  'text-[var(--color-text-muted)] bg-[var(--color-surface-2)]/60',
                  'hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-secondary)]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/30'
                )}
                title="Undo action"
                aria-label="Undo last action"
              >
                <RotateCcw size={10} />
                Undo
              </button>
            </div>
          )}
          
          {/* Action buttons - clean pill style */}
          {showActions && (
            <div className="flex items-center gap-1.5">
              {onReject && (
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={actionsDisabled}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-colors duration-100',
                    'text-[var(--color-diff-removed-text)] bg-[var(--color-diff-removed-text)]/10 border border-[var(--color-diff-removed-text)]/20',
                    'hover:bg-[var(--color-diff-removed-text)]/15 hover:border-[var(--color-diff-removed-text)]/30',
                    'active:bg-[var(--color-diff-removed-text)]/20',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-diff-removed-text)]/30',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                  aria-label="Reject changes"
                >
                  <X size={11} />
                  Reject
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  disabled={actionsDisabled}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-colors duration-100',
                    'text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]/30',
                    'hover:bg-[var(--color-surface-3)] hover:border-[var(--color-border-subtle)]/50',
                    'active:bg-[var(--color-surface-3)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-primary)]/30',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                  aria-label="Edit changes"
                >
                  <Pencil size={11} />
                  Edit
                </button>
              )}
              {onAccept && (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={actionsDisabled}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium transition-colors duration-100',
                    'text-[var(--color-diff-added-text)] bg-[var(--color-diff-added-text)]/10 border border-[var(--color-diff-added-text)]/20',
                    'hover:bg-[var(--color-diff-added-text)]/15 hover:border-[var(--color-diff-added-text)]/30',
                    'active:bg-[var(--color-diff-added-text)]/20',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-diff-added-text)]/30',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                  aria-label="Accept changes"
                >
                  <Check size={11} />
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
