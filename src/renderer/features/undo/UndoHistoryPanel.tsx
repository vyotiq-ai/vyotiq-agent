/**
 * Undo History Panel Component
 * 
 * Displays file changes made by the agent with undo/redo capabilities.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  File,
  FilePlus,
  FileX,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatRelativeTimeWithSuffix, formatFullDateTime } from '../../utils/timeFormatting';
import { useUndoHistory } from './useUndoHistory';
import { ContentPreview } from './components/ContentPreview';
import type { FileChange, RunChangeGroup } from './types';

interface UndoHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
}

function getChangeTypeIcon(changeType: FileChange['changeType']) {
  switch (changeType) {
    case 'create':
      return <FilePlus size={12} className="text-[var(--color-success)]" />;
    case 'modify':
      return <File size={12} className="text-[var(--color-warning)]" />;
    case 'delete':
      return <FileX size={12} className="text-[var(--color-error)]" />;
  }
}

function getChangeTypeLabel(changeType: FileChange['changeType']): string {
  switch (changeType) {
    case 'create': return 'Created';
    case 'modify': return 'Modified';
    case 'delete': return 'Deleted';
  }
}

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

interface ChangeItemProps {
  change: FileChange;
  onUndo: (changeId: string) => Promise<void>;
  onRedo: (changeId: string) => Promise<void>;
  isProcessing: boolean;
}

const ChangeItem: React.FC<ChangeItemProps> = memo(({
  change, onUndo, onRedo, isProcessing,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const canUndo = change.status === 'undoable';
  const canRedo = change.status === 'undone';

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPreviewPosition({ x: rect.right, y: rect.top });
    hoverTimeoutRef.current = setTimeout(() => setShowPreview(true), 500);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setShowPreview(false);
  }, []);

  useEffect(() => () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  return (
    <>
      <div 
        className={cn(
          'flex items-center gap-2 px-2 py-1.5 rounded-md',
          'hover:bg-[var(--color-surface-1)] transition-colors group',
          change.status === 'undone' && 'opacity-60'
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {getChangeTypeIcon(change.changeType)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span 
              className="text-[11px] text-[var(--color-text-primary)] truncate"
              title={change.filePath}
            >
              {getFileName(change.filePath)}
            </span>
            <span className={cn(
              'text-[9px] px-1 py-0.5 rounded',
              change.status === 'undoable' && 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
              change.status === 'undone' && 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
              change.status === 'redoable' && 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
            )}>
              {change.status === 'undone' ? 'undone' : getChangeTypeLabel(change.changeType).toLowerCase()}
            </span>
          </div>
          <div className="text-[9px] text-[var(--color-text-muted)] truncate">{change.description}</div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canUndo && <button onClick={() => void onUndo(change.id)} disabled={isProcessing} className={cn('p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-warning)]', isProcessing && 'opacity-50')} title="Undo"><RotateCcw size={12} /></button>}
          {canRedo && <button onClick={() => void onRedo(change.id)} disabled={isProcessing} className={cn('p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]', isProcessing && 'opacity-50')} title="Redo"><RotateCw size={12} /></button>}
        </div>
      </div>
      {showPreview && (change.previousContent || change.newContent) && <ContentPreview change={change} position={previewPosition} />}
    </>
  );
});
ChangeItem.displayName = 'ChangeItem';

interface RunGroupProps {
  group: RunChangeGroup;
  onUndoChange: (changeId: string) => Promise<void>;
  onRedoChange: (changeId: string) => Promise<void>;
  onUndoRun: (runId: string) => Promise<void>;
  isProcessing: boolean;
  searchQuery: string;
}

const RunGroup: React.FC<RunGroupProps> = memo(({ group, onUndoChange, onRedoChange, onUndoRun, isProcessing, searchQuery }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const filteredChanges = useMemo(() => {
    if (!searchQuery.trim()) return group.changes;
    const q = searchQuery.toLowerCase();
    return group.changes.filter(c => c.filePath.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [group.changes, searchQuery]);

  const undoableCount = useMemo(() => filteredChanges.filter(c => c.status === 'undoable').length, [filteredChanges]);
  if (filteredChanges.length === 0) return null;

  return (
    <div className="border border-[var(--color-border-subtle)] rounded-md overflow-hidden">
      <div className={cn('flex items-center gap-2 px-2 py-1.5 bg-[var(--color-surface-1)] cursor-pointer hover:bg-[var(--color-surface-2)]')} onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? <ChevronDown size={12} className="text-[var(--color-text-muted)]" /> : <ChevronRight size={12} className="text-[var(--color-text-muted)]" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-[var(--color-text-primary)]">Run {group.runId.slice(0, 8)}</span>
            <span className="text-[9px] text-[var(--color-text-muted)]">{filteredChanges.length} file{filteredChanges.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-[var(--color-text-dim)]"><Clock size={9} /><span title={formatFullDateTime(group.endTime)}>{formatRelativeTimeWithSuffix(group.endTime)}</span></div>
        </div>
        {undoableCount > 0 && <button onClick={(e) => { e.stopPropagation(); void onUndoRun(group.runId); }} disabled={isProcessing} className={cn('flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-[var(--color-warning)]/10 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/20', isProcessing && 'opacity-50')}><RotateCcw size={10} />Undo All ({undoableCount})</button>}
      </div>
      {isExpanded && <div className="p-1 space-y-0.5 bg-[var(--color-surface-base)]">{filteredChanges.map(c => <ChangeItem key={c.id} change={c} onUndo={onUndoChange} onRedo={onRedoChange} isProcessing={isProcessing} />)}</div>}
    </div>
  );
});
RunGroup.displayName = 'RunGroup';

export const UndoHistoryPanel: React.FC<UndoHistoryPanelProps> = memo(({ isOpen, onClose, sessionId }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { groupedHistory, undoableCount, isLoading, error, refresh, undoChange, redoChange, undoRun, clearHistory, undoLastChange, undoAllSession } = useUndoHistory({ sessionId, refreshInterval: 5000 });

  const showStatus = useCallback((type: 'success' | 'error', text: string) => { setStatusMessage({ type, text }); setTimeout(() => setStatusMessage(null), 3000); }, []);

  const handleUndoChange = useCallback(async (changeId: string) => { setIsProcessing(true); try { const r = await undoChange(changeId); showStatus(r.success ? 'success' : 'error', r.message); } finally { setIsProcessing(false); } }, [undoChange, showStatus]);
  const handleRedoChange = useCallback(async (changeId: string) => { setIsProcessing(true); try { const r = await redoChange(changeId); showStatus(r.success ? 'success' : 'error', r.message); } finally { setIsProcessing(false); } }, [redoChange, showStatus]);
  const handleUndoRun = useCallback(async (runId: string) => { setIsProcessing(true); try { const r = await undoRun(runId); showStatus(r.success ? 'success' : 'error', r.message); } finally { setIsProcessing(false); } }, [undoRun, showStatus]);
  const handleUndoAllSession = useCallback(async () => { if (!confirm(`Undo all ${undoableCount} changes?`)) return; setIsProcessing(true); try { const r = await undoAllSession(); showStatus(r.success ? 'success' : 'error', r.message); } finally { setIsProcessing(false); } }, [undoAllSession, undoableCount, showStatus]);
  const handleClearHistory = useCallback(async () => { if (!confirm('Clear all history?')) return; setIsProcessing(true); try { await clearHistory(); showStatus('success', 'Cleared'); } catch { showStatus('error', 'Failed'); } finally { setIsProcessing(false); } }, [clearHistory, showStatus]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const t = e.target as HTMLElement;
        if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && undoableCount > 0) {
          e.preventDefault();
          void undoLastChange().then(r => r && showStatus(r.success ? 'success' : 'error', r.message));
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchInputRef.current?.focus(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, undoableCount, undoLastChange, showStatus]);

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return groupedHistory;
    const q = searchQuery.toLowerCase();
    return groupedHistory.filter(g => g.changes.some(c => c.filePath.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)));
  }, [groupedHistory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className={cn('fixed right-0 top-0 bottom-0 w-80 z-40 bg-[var(--color-surface-base)] border-l border-[var(--color-border-subtle)] flex flex-col shadow-xl animate-slide-in-right')}>
        <div className="h-10 flex items-center justify-between px-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
          <div className="flex items-center gap-2"><History size={14} className="text-[var(--color-accent-primary)]" /><span className="text-xs font-medium">Undo History</span>{undoableCount > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">{undoableCount}</span>}</div>
          <div className="flex items-center gap-1">
            <button onClick={() => void refresh()} disabled={isLoading} className={cn('p-1.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]', isLoading && 'opacity-50')} title="Refresh"><RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /></button>
            <button onClick={() => void handleClearHistory()} disabled={isLoading || groupedHistory.length === 0} className={cn('p-1.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-error)]', (isLoading || groupedHistory.length === 0) && 'opacity-50')} title="Clear"><Trash2 size={12} /></button>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]" title="Close"><X size={12} /></button>
          </div>
        </div>
        {groupedHistory.length > 0 && <div className="px-2 py-2 border-b border-[var(--color-border-subtle)]"><div className="relative"><Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" /><input ref={searchInputRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search... (Ctrl+F)" className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-sm focus-visible:border-[var(--color-accent-primary)] focus-visible:outline-none" />{searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"><X size={10} /></button>}</div></div>}
        {undoableCount > 1 && <div className="px-2 py-2 border-b border-[var(--color-border-subtle)]"><button onClick={() => void handleUndoAllSession()} disabled={isProcessing} className={cn('w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] hover:bg-[var(--color-warning)]/20 text-[11px] font-medium', isProcessing && 'opacity-50')}><RotateCcw size={14} />Undo All ({undoableCount})</button></div>}
        {statusMessage && <div className={cn('px-3 py-2 text-[10px] border-b', statusMessage.type === 'success' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-error)]/10 text-[var(--color-error)]')}>{statusMessage.text}</div>}
        <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
          {!sessionId ? <div className="flex flex-col items-center justify-center h-full text-center p-4"><History size={32} className="text-[var(--color-text-dim)] mb-2" /><p className="text-xs text-[var(--color-text-muted)]">No session</p></div>
          : isLoading && groupedHistory.length === 0 ? <div className="flex items-center justify-center h-full"><Loader2 size={20} className="animate-spin text-[var(--color-text-muted)]" /></div>
          : error ? <div className="flex flex-col items-center justify-center h-full p-4"><p className="text-xs text-[var(--color-error)]">{error}</p><button onClick={() => void refresh()} className="mt-2 text-[10px] text-[var(--color-accent-primary)] hover:underline">Retry</button></div>
          : filteredHistory.length === 0 ? <div className="flex flex-col items-center justify-center h-full p-4"><History size={32} className="text-[var(--color-text-dim)] mb-2" /><p className="text-xs text-[var(--color-text-muted)]">{searchQuery ? 'No matches' : 'No changes'}</p></div>
          : filteredHistory.map(g => <RunGroup key={g.runId} group={g} onUndoChange={handleUndoChange} onRedoChange={handleRedoChange} onUndoRun={handleUndoRun} isProcessing={isProcessing} searchQuery={searchQuery} />)}
        </div>
        {groupedHistory.length > 0 && <div className="px-3 py-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]"><p className="text-[9px] text-[var(--color-text-dim)]">{groupedHistory.length} runs • {undoableCount} undoable • Ctrl+Z quick undo</p></div>}
    </div>
  );
});
UndoHistoryPanel.displayName = 'UndoHistoryPanel';
export default UndoHistoryPanel;
