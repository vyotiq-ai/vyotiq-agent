/**
 * DiffViewer Component
 * 
 * Monaco-based inline diff viewer for file changes in chat.
 * Uses Monaco's built-in diff editor - zero new dependencies.
 * 
 * Features:
 * - Split/Unified view mode toggle with persistence
 * - Word-level highlighting for exact character changes
 * - Collapsible context with "Show N more lines" expanders
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

function computeDiffStats(original: string, modified: string): { added: number; removed: number; changed: number } {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  
  let added = 0;
  let removed = 0;
  
  const originalSet = new Map<string, number>();
  for (const line of originalLines) {
    originalSet.set(line, (originalSet.get(line) || 0) + 1);
  }
  
  for (const line of modifiedLines) {
    const count = originalSet.get(line) || 0;
    if (count > 0) {
      originalSet.set(line, count - 1);
    } else {
      added++;
    }
  }
  
  for (const [, count] of originalSet) {
    removed += count;
  }
  
  const changed = Math.min(added, removed);
  return { 
    added: Math.max(0, added - changed), 
    removed: Math.max(0, removed - changed), 
    changed 
  };
}

function getStoredViewMode(): DiffViewMode {
  try {
    const stored = localStorage.getItem(DIFF_VIEW_MODE_KEY);
    if (stored === 'split' || stored === 'unified') return stored;
  } catch { /* ignore */ }
  return 'split';
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
  
  const handleViewModeToggle = useCallback(() => {
    const newMode = viewMode === 'split' ? 'unified' : 'split';
    setViewMode(newMode);
    setStoredViewMode(newMode);
  }, [viewMode]);
  
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
    if (!containerRef.current || isCollapsed) return;
    
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
      renderSideBySide: viewMode === 'split',
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
      useInlineViewWhenSpaceIsLimited: true,
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
    if (editorRef.current) {
      editorRef.current.updateOptions({ renderSideBySide: viewMode === 'split' });
    }
  }, [viewMode]);

  const showActions = (onAccept || onReject || onEdit) && actionState === 'pending';
  const showActionFeedback = actionState !== 'pending';


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
        <div ref={containerRef} style={{ height: maxHeight }} className="w-full" />
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
