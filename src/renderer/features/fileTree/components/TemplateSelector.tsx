/**
 * Template Selector Dialog
 *
 * Modal for selecting a file template and naming the new file.
 * Shows templates grouped by category with search filtering.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, Search, ChevronRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import {
  FILE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  resolveTemplate,
  type FileTemplate,
  type TemplateCategory,
} from '../utils/fileTemplates';

// =============================================================================
// Types
// =============================================================================

interface TemplateSelectorProps {
  /** Parent directory where the new file will be created */
  parentPath: string;
  /** Called when a template is selected and confirmed */
  onConfirm: (filePath: string, content: string) => void;
  /** Called when the dialog is cancelled */
  onCancel: () => void;
}

// =============================================================================
// TemplateSelector
// =============================================================================

export const TemplateSelector: React.FC<TemplateSelectorProps> = memo(({
  parentPath,
  onConfirm,
  onCancel,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<FileTemplate | null>(null);
  const [fileName, setFileName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<TemplateCategory>>(
    new Set(['react', 'web', 'node', 'config'])
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Filter templates by search
  const filteredTemplates = useMemo(() => {
    if (!searchQuery.trim()) return FILE_TEMPLATES;
    const q = searchQuery.toLowerCase();
    return FILE_TEMPLATES.filter(
      t => t.name.toLowerCase().includes(q) ||
           t.description?.toLowerCase().includes(q) ||
           t.defaultFileName.toLowerCase().includes(q) ||
           t.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<TemplateCategory, FileTemplate[]>();
    for (const tmpl of filteredTemplates) {
      const list = map.get(tmpl.category) ?? [];
      list.push(tmpl);
      map.set(tmpl.category, list);
    }
    return map;
  }, [filteredTemplates]);

  // Focus search on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Focus name input when template selected
  useEffect(() => {
    if (selectedTemplate) {
      setFileName(selectedTemplate.defaultFileName);
      setTimeout(() => {
        nameInputRef.current?.focus();
        // Select the name part before extension
        const dotIdx = selectedTemplate.defaultFileName.lastIndexOf('.');
        if (dotIdx > 0) {
          nameInputRef.current?.setSelectionRange(0, dotIdx);
        } else {
          nameInputRef.current?.select();
        }
      }, 50);
    }
  }, [selectedTemplate]);

  // Escape closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedTemplate) {
          setSelectedTemplate(null);
        } else {
          onCancel();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, selectedTemplate]);

  // Click outside closes
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handleClick), 100);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handleClick); };
  }, [onCancel]);

  const toggleCategory = useCallback((cat: TemplateCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!selectedTemplate || !fileName.trim()) return;
    
    // Derive name for template substitution
    const dotIdx = fileName.lastIndexOf('.');
    const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
    // PascalCase the name for code templates
    const pascalName = baseName
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');

    const content = resolveTemplate(selectedTemplate, pascalName || 'Untitled');
    const sep = parentPath.includes('\\') ? '\\' : '/';
    const filePath = `${parentPath}${sep}${fileName.trim()}`;
    onConfirm(filePath, content);
  }, [selectedTemplate, fileName, parentPath, onConfirm]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  }, [handleConfirm]);

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 w-[420px] max-h-[70vh] overflow-hidden',
        'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
        'rounded-lg shadow-[var(--shadow-dropdown)] font-mono text-[11px]',
        'animate-in fade-in-0 slide-in-from-top-1 duration-150',
        'flex flex-col',
      )}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      role="dialog"
      aria-label="New from template"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]/40 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-[var(--color-accent-primary)]" />
          <span className="text-[var(--color-text-primary)] font-medium">
            {selectedTemplate ? 'name your file' : 'select a template'}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
          title="Close (Esc)"
        >
          <X size={12} />
        </button>
      </div>

      {/* Template Selected — Name Input */}
      {selectedTemplate ? (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-dim)]">
            <span>template:</span>
            <span className="text-[var(--color-accent-primary)]">{selectedTemplate.name}</span>
            <button
              type="button"
              onClick={() => setSelectedTemplate(null)}
              className="ml-auto text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)]"
            >
              change
            </button>
          </div>
          <div>
            <label htmlFor="template-filename" className="block text-[9px] uppercase tracking-wide text-[var(--color-text-dim)] mb-1">
              file name
            </label>
            <input
              ref={nameInputRef}
              id="template-filename"
              type="text"
              value={fileName}
              onChange={e => setFileName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              className={cn(
                'w-full px-2.5 py-1.5 rounded-md font-mono text-[11px]',
                'bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)]/60',
                'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)]',
                'focus:outline-none focus:border-[var(--color-accent-primary)]/60',
              )}
              placeholder="Enter file name..."
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                'px-3 py-1.5 rounded text-[10px]',
                'bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]',
                'text-[var(--color-text-secondary)] transition-colors',
                'border border-[var(--color-border-subtle)]/40',
              )}
            >
              cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!fileName.trim()}
              className={cn(
                'px-3 py-1.5 rounded text-[10px]',
                'bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-primary)]/80',
                'text-[var(--color-surface-0)] transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              create
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="px-3 py-2 border-b border-[var(--color-border-subtle)]/30">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={cn(
                  'w-full pl-7 pr-2 py-1.5 rounded font-mono text-[10px]',
                  'bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)]/40',
                  'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)]',
                  'focus:outline-none focus:border-[var(--color-accent-primary)]/40',
                )}
                placeholder="search templates..."
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Template List */}
          <div className="flex-1 overflow-auto py-1 scrollbar-thin scrollbar-thumb-[var(--color-border-subtle)] scrollbar-track-transparent">
            {grouped.size === 0 ? (
              <div className="px-3 py-4 text-center text-[var(--color-text-dim)] text-[10px]">
                no matching templates
              </div>
            ) : (
              Array.from(grouped.entries()).map(([category, templates]) => (
                <div key={category}>
                  {/* Category header */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={cn(
                      'w-full flex items-center gap-1.5 px-3 py-1 text-[9px] uppercase tracking-wide',
                      'text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]/50',
                      'transition-colors',
                    )}
                  >
                    <ChevronRight
                      size={10}
                      className={cn('transition-transform', expandedCategories.has(category) && 'rotate-90')}
                    />
                    <span>{TEMPLATE_CATEGORIES[category]}</span>
                    <span className="ml-auto text-[8px] opacity-60">{templates.length}</span>
                  </button>

                  {/* Templates */}
                  {expandedCategories.has(category) && templates.map(tmpl => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => setSelectedTemplate(tmpl)}
                      className={cn(
                        'w-full flex items-start gap-2 px-3 py-1.5 text-left',
                        'hover:bg-[var(--color-surface-2)] transition-colors',
                      )}
                    >
                      <FileText size={11} className="shrink-0 mt-0.5 text-[var(--color-text-muted)]" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-[var(--color-text-secondary)] truncate">{tmpl.name}</div>
                        {tmpl.description && (
                          <div className="text-[9px] text-[var(--color-text-dim)] truncate">{tmpl.description}</div>
                        )}
                      </div>
                      <span className="text-[9px] text-[var(--color-text-dim)] shrink-0 mt-0.5">
                        {tmpl.defaultFileName}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
});

TemplateSelector.displayName = 'TemplateSelector';
