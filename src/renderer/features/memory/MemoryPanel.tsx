/**
 * Memory Panel Component
 * 
 * Displays and manages agent memories with CRUD capabilities.
 * Terminal/CLI styled to match app aesthetic.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Check, ChevronDown, ChevronRight, Edit3, Loader2, Pin, PinOff, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface MemoryEntry {
  id: string;
  content: string;
  category: 'decision' | 'context' | 'preference' | 'fact' | 'task' | 'error' | 'general';
  importance: 'low' | 'medium' | 'high' | 'critical';
  keywords: string[];
  workspaceId: string;
  sessionId?: string;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  isPinned: boolean;
  source: 'agent' | 'user';
}

interface MemoryStats {
  totalMemories: number;
  byCategory: Record<string, number>;
  byImportance: Record<string, number>;
  pinnedCount: number;
}

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return new Date(timestamp).toLocaleDateString();
}

interface MemoryItemProps {
  memory: MemoryEntry;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string, isPinned: boolean) => Promise<void>;
  onEdit: (id: string, content: string, category: MemoryEntry['category'], importance: MemoryEntry['importance']) => Promise<void>;
  isProcessing: boolean;
}

const MemoryItem: React.FC<MemoryItemProps> = memo(({ memory, onDelete, onTogglePin, onEdit, isProcessing }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(memory.content);
  const [editCategory, setEditCategory] = useState(memory.category);
  const [editImportance, setEditImportance] = useState(memory.importance);

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    await onEdit(memory.id, editContent.trim(), editCategory, editImportance);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(memory.content);
    setEditCategory(memory.category);
    setEditImportance(memory.importance);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="border border-[var(--color-accent-primary)]/30 rounded bg-[var(--color-surface-1)] font-mono">
        <div className="px-2 py-1.5 border-b border-[var(--color-border-subtle)] flex items-center gap-2">
          <span className="text-[var(--color-accent-primary)] text-[9px]">$</span>
          <span className="text-[9px] text-[var(--color-text-muted)]">edit --id={memory.id.slice(0, 8)}</span>
        </div>
        <div className="p-2 space-y-2">
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="w-full px-2 py-1.5 text-[11px] font-mono bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] rounded resize-none focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)]"
            rows={3}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1">
              <span className="text-[9px] text-[var(--color-text-muted)]">--type=</span>
              <select value={editCategory} onChange={e => setEditCategory(e.target.value as MemoryEntry['category'])} className="px-1.5 py-0.5 text-[9px] font-mono bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-primary)]">
                <option value="general">general</option>
                <option value="preference">preference</option>
                <option value="decision">decision</option>
                <option value="fact">fact</option>
                <option value="context">context</option>
                <option value="task">task</option>
                <option value="error">error</option>
              </select>
            </div>
            <div className="flex-1 flex items-center gap-1">
              <span className="text-[9px] text-[var(--color-text-muted)]">--priority=</span>
              <select value={editImportance} onChange={e => setEditImportance(e.target.value as MemoryEntry['importance'])} className="px-1.5 py-0.5 text-[9px] font-mono bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-primary)]">
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => void handleSaveEdit()} disabled={isProcessing || !editContent.trim()} className={cn('flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/20', (isProcessing || !editContent.trim()) && 'opacity-50')}>
              <Check size={10} />save
            </button>
            <button onClick={handleCancelEdit} className="px-2 py-1 rounded text-[9px] font-mono text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]">cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border rounded bg-[var(--color-surface-base)] font-mono group', memory.isPinned ? 'border-[var(--color-accent-primary)]/30' : 'border-[var(--color-border-subtle)]')}>
      <div className={cn('flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--color-surface-1)] transition-colors')} onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? <ChevronDown size={10} className="text-[var(--color-text-muted)] mt-0.5 shrink-0" /> : <ChevronRight size={10} className="text-[var(--color-text-muted)] mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[var(--color-accent-primary)] text-[9px]">{memory.category}</span>
            <span className="text-[var(--color-text-dim)] text-[9px]">•</span>
            <span className={cn('text-[9px]', memory.importance === 'critical' ? 'text-[var(--color-error)]' : memory.importance === 'high' ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]')}>{memory.importance}</span>
            {memory.isPinned && <Pin size={9} className="text-[var(--color-accent-primary)]" />}
            <span className="text-[9px] text-[var(--color-text-dim)] ml-auto">{formatRelativeTime(memory.createdAt)}</span>
          </div>
          <p className={cn('text-[10px] text-[var(--color-text-primary)] mt-0.5 leading-relaxed', !isExpanded && 'line-clamp-2')}>{memory.content}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button onClick={() => setIsEditing(true)} disabled={isProcessing} className={cn('p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]', isProcessing && 'opacity-50')} title="edit"><Edit3 size={10} /></button>
          <button onClick={() => void onTogglePin(memory.id, !memory.isPinned)} disabled={isProcessing} className={cn('p-1 rounded hover:bg-[var(--color-surface-2)]', memory.isPinned ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-muted)]', isProcessing && 'opacity-50')} title={memory.isPinned ? 'unpin' : 'pin'}>{memory.isPinned ? <PinOff size={10} /> : <Pin size={10} />}</button>
          <button onClick={() => void onDelete(memory.id)} disabled={isProcessing} className={cn('p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-error)]', isProcessing && 'opacity-50')} title="delete"><Trash2 size={10} /></button>
        </div>
      </div>
      {isExpanded && (
        <div className="px-2 py-1.5 bg-[var(--color-surface-1)] border-t border-[var(--color-border-subtle)] text-[9px] font-mono">
          <div className="flex items-center gap-3 text-[var(--color-text-muted)]">
            <span>src={memory.source}</span>
            <span>hits={memory.accessCount}</span>
          </div>
          {memory.keywords.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {memory.keywords.slice(0, 5).map((kw, i) => <span key={i} className="px-1 py-0.5 bg-[var(--color-surface-2)] rounded text-[var(--color-text-dim)]">#{kw}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
MemoryItem.displayName = 'MemoryItem';

interface AddMemoryFormProps {
  onAdd: (content: string, category: MemoryEntry['category'], importance: MemoryEntry['importance'], isPinned: boolean) => Promise<void>;
  isProcessing: boolean;
  onCancel: () => void;
}

const AddMemoryForm: React.FC<AddMemoryFormProps> = memo(({ onAdd, isProcessing, onCancel }) => {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<MemoryEntry['category']>('general');
  const [importance, setImportance] = useState<MemoryEntry['importance']>('medium');
  const [isPinned, setIsPinned] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    await onAdd(content.trim(), category, importance, isPinned);
    setContent('');
    setCategory('general');
    setImportance('medium');
    setIsPinned(false);
  };

  return (
    <form onSubmit={e => void handleSubmit(e)} className="p-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] font-mono">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[var(--color-accent-primary)] text-[9px]">$</span>
        <span className="text-[9px] text-[var(--color-text-muted)]">memory add</span>
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="content..." className="w-full px-2 py-1.5 text-[10px] font-mono bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] rounded resize-none focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-placeholder)]" rows={3} autoFocus />
      <div className="flex items-center gap-3 mt-2 text-[9px]">
        <div className="flex items-center gap-1">
          <span className="text-[var(--color-text-muted)]">--type=</span>
          <select value={category} onChange={e => setCategory(e.target.value as MemoryEntry['category'])} className="px-1 py-0.5 font-mono bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-primary)]">
            <option value="general">general</option>
            <option value="preference">preference</option>
            <option value="decision">decision</option>
            <option value="fact">fact</option>
            <option value="context">context</option>
            <option value="task">task</option>
            <option value="error">error</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[var(--color-text-muted)]">--priority=</span>
          <select value={importance} onChange={e => setImportance(e.target.value as MemoryEntry['importance'])} className="px-1 py-0.5 font-mono bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-primary)]">
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>
        <button type="button" onClick={() => setIsPinned(!isPinned)} className={cn('flex items-center gap-1 px-1 py-0.5 rounded border', isPinned ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]' : 'border-[var(--color-border-subtle)] text-[var(--color-text-muted)]')}>
          <Pin size={9} />{isPinned ? '--pin' : '--no-pin'}
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button type="submit" disabled={isProcessing || !content.trim()} className={cn('flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/20', (isProcessing || !content.trim()) && 'opacity-50')}>{isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}add</button>
        <button type="button" onClick={onCancel} className="px-2 py-1 rounded text-[9px] font-mono text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]">cancel</button>
      </div>
    </form>
  );
});
AddMemoryForm.displayName = 'AddMemoryForm';

export const MemoryPanel: React.FC<MemoryPanelProps> = memo(({ isOpen, onClose }) => {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAddForm, setShowAddForm] = useState(false);

  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.vyotiq.memory.list(50);
      if (result.success) {
        setMemories(result.memories as MemoryEntry[]);
        setStats(result.stats);
      } else {
        setError(result.error || 'Failed to load');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (isOpen) void loadMemories(); }, [isOpen, loadMemories]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this memory?')) return;
    setIsProcessing(true);
    try {
      const result = await window.vyotiq.memory.delete(id);
      if (result.success) setMemories(prev => prev.filter(m => m.id !== id));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleTogglePin = useCallback(async (id: string, isPinned: boolean) => {
    setIsProcessing(true);
    try {
      const result = await window.vyotiq.memory.update(id, { isPinned });
      if (result.success && result.memory) setMemories(prev => prev.map(m => m.id === id ? { ...m, isPinned } : m));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleEdit = useCallback(async (id: string, content: string, category: MemoryEntry['category'], importance: MemoryEntry['importance']) => {
    setIsProcessing(true);
    try {
      const result = await window.vyotiq.memory.update(id, { content, category, importance });
      if (result.success && result.memory) setMemories(prev => prev.map(m => m.id === id ? { ...m, content, category, importance } : m));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleAdd = useCallback(async (content: string, category: MemoryEntry['category'], importance: MemoryEntry['importance'], isPinned: boolean) => {
    setIsProcessing(true);
    try {
      const result = await window.vyotiq.memory.create({ content, category, importance, isPinned });
      if (result.success && result.memory) {
        setMemories(prev => [result.memory as MemoryEntry, ...prev]);
        setShowAddForm(false);
      }
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    if (!confirm('Clear ALL memories? This cannot be undone.')) return;
    setIsProcessing(true);
    try {
      const result = await window.vyotiq.memory.clear();
      if (result.success) { setMemories([]); setStats(null); }
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const filteredMemories = useMemo(() => {
    let filtered = memories;
    if (categoryFilter !== 'all') filtered = filtered.filter(m => m.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m => m.content.toLowerCase().includes(q) || m.keywords.some(k => k.toLowerCase().includes(q)));
    }
    return filtered.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      const impOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const impDiff = (impOrder[b.importance] || 0) - (impOrder[a.importance] || 0);
      if (impDiff !== 0) return impDiff;
      return b.createdAt - a.createdAt;
    });
  }, [memories, categoryFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className={cn('fixed right-0 top-0 bottom-0 w-80 z-40 bg-[var(--color-surface-base)] border-l border-[var(--color-border-subtle)] flex flex-col shadow-xl animate-slide-in-right font-mono')}>
      {/* Header */}
      <div className="h-8 flex items-center justify-between px-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
        <div className="flex items-center gap-2">
          <Brain size={12} className="text-[var(--color-accent-primary)]" />
          <span className="text-[10px] text-[var(--color-text-primary)]">memory</span>
          {stats && <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">{stats.totalMemories}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowAddForm(!showAddForm)} className={cn('p-1 rounded hover:bg-[var(--color-surface-2)]', showAddForm ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-muted)]')} title="add"><Plus size={12} /></button>
          <button onClick={() => void loadMemories()} disabled={isLoading} className={cn('p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]', isLoading && 'opacity-50')} title="refresh"><RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /></button>
          <button onClick={() => void handleClearAll()} disabled={isLoading || memories.length === 0} className={cn('p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-error)]', (isLoading || memories.length === 0) && 'opacity-50')} title="clear"><Trash2 size={12} /></button>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]" title="close"><X size={12} /></button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && <AddMemoryForm onAdd={handleAdd} isProcessing={isProcessing} onCancel={() => setShowAddForm(false)} />}

      {/* Filters */}
      {memories.length > 0 && (
        <div className="px-2 py-1.5 border-b border-[var(--color-border-subtle)] space-y-1.5">
          <div className="relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="grep..." className="w-full pl-6 pr-2 py-1 text-[10px] font-mono bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded focus:border-[var(--color-accent-primary)] focus:outline-none text-[var(--color-text-primary)] placeholder-[var(--color-text-placeholder)]" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"><X size={10} /></button>}
          </div>
          <div className="flex items-center gap-1 text-[9px]">
            <span className="text-[var(--color-text-muted)]">--filter=</span>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-1 py-0.5 font-mono bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-primary)]">
              <option value="all">all</option>
              <option value="preference">preference</option>
              <option value="decision">decision</option>
              <option value="fact">fact</option>
              <option value="context">context</option>
              <option value="task">task</option>
              <option value="error">error</option>
              <option value="general">general</option>
            </select>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
        {isLoading && memories.length === 0 ? (
          <div className="flex items-center justify-center h-full"><Loader2 size={16} className="animate-spin text-[var(--color-text-muted)]" /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <p className="text-[10px] text-[var(--color-error)] font-mono">error: {error}</p>
            <button onClick={() => void loadMemories()} className="mt-2 text-[9px] text-[var(--color-accent-primary)] hover:underline font-mono">retry</button>
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <Brain size={24} className="text-[var(--color-text-dim)] mb-2" />
            <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{searchQuery || categoryFilter !== 'all' ? 'no matches' : 'no memories'}</p>
            <p className="text-[9px] text-[var(--color-text-dim)] mt-1 font-mono">agent stores context automatically</p>
          </div>
        ) : (
          filteredMemories.map(memory => <MemoryItem key={memory.id} memory={memory} onDelete={handleDelete} onTogglePin={handleTogglePin} onEdit={handleEdit} isProcessing={isProcessing} />)
        )}
      </div>

      {/* Footer */}
      {stats && stats.totalMemories > 0 && (
        <div className="px-2 py-1.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
          <p className="text-[9px] text-[var(--color-text-dim)] font-mono">{stats.totalMemories} total • {stats.pinnedCount} pinned</p>
        </div>
      )}
    </div>
  );
});
MemoryPanel.displayName = 'MemoryPanel';

export default MemoryPanel;
