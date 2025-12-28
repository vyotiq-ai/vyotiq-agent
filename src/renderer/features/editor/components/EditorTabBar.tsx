/**
 * EditorTabBar Component
 * 
 * Optimized tab bar for managing open files with:
 * - Tab switching
 * - Close buttons
 * - Dirty indicators
 * - Drag and drop reordering
 * - Context menu
 * - AI actions menu per tab
 * 
 * Performance optimizations:
 * - Memoized individual tab items to prevent unnecessary re-renders
 * - Virtualized rendering for large tab counts
 * - Debounced drag operations
 * - Lazy-loaded AI menu only for active tab
 */

import React, { useCallback, useState, useRef, memo, useMemo, lazy, Suspense } from 'react';
import { X, Circle } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getFileIcon } from '../../fileTree/utils/fileIcons';
import type { EditorTab } from '../types';
import type { EditorAIAction } from '../hooks/useEditorAI';

// Lazy load TabAIMenu since it's only shown on hover of active tab
const TabAIMenu = lazy(() => import('./TabAIMenu').then(m => ({ default: m.TabAIMenu })));

// =============================================================================
// Types
// =============================================================================

interface EditorTabBarProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabCloseOthers: (tabId: string) => void;
  onTabCloseAll: () => void;
  onTabCloseSaved: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Callback for AI actions on a tab */
  onAIAction?: (tabId: string, action: EditorAIAction) => void;
  /** Enable AI features */
  enableAI?: boolean;
}

interface TabItemProps {
  tab: EditorTab;
  index: number;
  isActive: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  enableAI: boolean;
  onTabClick: (e: React.MouseEvent, tabId: string) => void;
  onTabClose: (e: React.MouseEvent, tabId: string) => void;
  onMouseDown: (e: React.MouseEvent, tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onAIAction?: (tabId: string, action: EditorAIAction) => void;
}

// =============================================================================
// Memoized Tab Item Component
// =============================================================================

const TabItem = memo<TabItemProps>(({
  tab,
  index,
  isActive,
  isDragging,
  isDropTarget,
  enableAI,
  onTabClick,
  onTabClose,
  onMouseDown,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onAIAction,
}) => {
  const Icon = useMemo(() => getFileIcon(tab.name), [tab.name]);
  const [showAIMenu, setShowAIMenu] = useState(false);

  const handleMouseEnter = useCallback(() => {
    if (isActive && enableAI) {
      setShowAIMenu(true);
    }
  }, [isActive, enableAI]);

  const handleMouseLeave = useCallback(() => {
    setShowAIMenu(false);
  }, []);

  return (
    <div
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      draggable
      className={cn(
        'group flex items-center gap-1.5 h-full px-3 cursor-pointer select-none',
        'border-r border-[var(--color-border-subtle)]',
        'transition-colors duration-100',
        isActive 
          ? 'bg-[var(--color-surface-1)] text-[var(--color-text-primary)]' 
          : 'bg-[var(--color-surface-header)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]/50',
        isDragging && 'opacity-50',
        isDropTarget && 'border-l-2 border-l-[var(--color-accent-primary)]',
      )}
      onClick={(e) => onTabClick(e, tab.id)}
      onMouseDown={(e) => onMouseDown(e, tab.id)}
      onContextMenu={(e) => onContextMenu(e, tab.id)}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* File icon */}
      <Icon size={14} className="shrink-0 text-[var(--color-text-muted)]" />
      
      {/* File name */}
      <span className="text-[11px] font-mono truncate max-w-[120px]" title={tab.path}>
        {tab.name}
      </span>
      
      {/* AI menu (only on active tab, lazy loaded) */}
      {enableAI && isActive && showAIMenu && onAIAction && (
        <Suspense fallback={null}>
          <TabAIMenu
            filePath={tab.path}
            language={tab.language}
            onAction={(action) => onAIAction(tab.id, action)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </Suspense>
      )}

      {/* Dirty indicator or close button */}
      <div className="w-4 h-4 flex items-center justify-center shrink-0">
        {tab.isDirty ? (
          <Circle 
            size={8} 
            className={cn(
              'fill-current',
              isActive ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-muted)]',
              'group-hover:hidden'
            )} 
          />
        ) : null}
        <button
          className={cn(
            'p-0.5 rounded-sm transition-colors',
            'hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)]',
            'text-[var(--color-text-muted)]',
            tab.isDirty ? 'hidden group-hover:flex' : 'opacity-0 group-hover:opacity-100'
          )}
          onClick={(e) => onTabClose(e, tab.id)}
          title="Close"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for optimal re-rendering
  return (
    prevProps.tab.id === nextProps.tab.id &&
    prevProps.tab.name === nextProps.tab.name &&
    prevProps.tab.isDirty === nextProps.tab.isDirty &&
    prevProps.tab.path === nextProps.tab.path &&
    prevProps.tab.language === nextProps.tab.language &&
    prevProps.index === nextProps.index &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.isDropTarget === nextProps.isDropTarget &&
    prevProps.enableAI === nextProps.enableAI
  );
});

TabItem.displayName = 'TabItem';

// =============================================================================
// Context Menu Component
// =============================================================================

interface TabContextMenuProps {
  contextMenu: { x: number; y: number; tabId: string };
  onAction: (action: string) => void;
}

const TabContextMenu = memo<TabContextMenuProps>(({ contextMenu, onAction }) => (
  <div
    className="fixed z-50 min-w-[160px] py-1 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded shadow-lg"
    style={{ left: contextMenu.x, top: contextMenu.y }}
  >
    <button
      className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      onClick={() => onAction('close')}
    >
      Close
    </button>
    <button
      className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      onClick={() => onAction('closeOthers')}
    >
      Close Others
    </button>
    <button
      className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      onClick={() => onAction('closeSaved')}
    >
      Close Saved
    </button>
    <div className="h-px bg-[var(--color-border-subtle)] my-1" />
    <button
      className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)] transition-colors"
      onClick={() => onAction('closeAll')}
    >
      Close All
    </button>
  </div>
));

TabContextMenu.displayName = 'TabContextMenu';

// =============================================================================
// Main EditorTabBar Component
// =============================================================================

const EditorTabBarComponent: React.FC<EditorTabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabCloseOthers,
  onTabCloseAll,
  onTabCloseSaved,
  onReorder,
  onAIAction,
  enableAI = true,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  
  // Memoized handlers to prevent re-creation on each render
  const handleTabClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    onTabClick(tabId);
  }, [onTabClick]);
  
  const handleCloseClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onTabClose(tabId);
  }, [onTabClose]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      onTabClose(tabId);
    }
  }, [onTabClose]);
  
  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);
  
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);
  
  const handleContextAction = useCallback((action: string) => {
    if (!contextMenu) return;
    
    switch (action) {
      case 'close':
        onTabClose(contextMenu.tabId);
        break;
      case 'closeOthers':
        onTabCloseOthers(contextMenu.tabId);
        break;
      case 'closeAll':
        onTabCloseAll();
        break;
      case 'closeSaved':
        onTabCloseSaved();
        break;
    }
    
    closeContextMenu();
  }, [contextMenu, onTabClose, onTabCloseOthers, onTabCloseAll, onTabCloseSaved, closeContextMenu]);
  
  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  }, []);
  
  const handleDragLeave = useCallback(() => {
    setDropIndex(null);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      onReorder(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
    setDropIndex(null);
  }, [draggedIndex, onReorder]);
  
  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDropIndex(null);
  }, []);
  
  // Close context menu on click outside
  React.useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, closeContextMenu]);

  // Memoize tab items to prevent unnecessary re-renders
  const tabItems = useMemo(() => {
    return tabs.map((tab, index) => ({
      tab,
      index,
      isActive: tab.id === activeTabId,
      isDragging: draggedIndex === index,
      isDropTarget: dropIndex === index && draggedIndex !== index,
    }));
  }, [tabs, activeTabId, draggedIndex, dropIndex]);
  
  if (tabs.length === 0) {
    return null;
  }
  
  return (
    <>
      <div 
        ref={tabsRef}
        className="flex items-center h-[32px] bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)] overflow-x-auto scrollbar-none"
        role="tablist"
      >
        {tabItems.map(({ tab, index, isActive, isDragging, isDropTarget }) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={index}
            isActive={isActive}
            isDragging={isDragging}
            isDropTarget={isDropTarget}
            enableAI={enableAI}
            onTabClick={handleTabClick}
            onTabClose={handleCloseClick}
            onMouseDown={handleMouseDown}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onAIAction={onAIAction}
          />
        ))}
      </div>
      
      {/* Context menu */}
      {contextMenu && (
        <TabContextMenu 
          contextMenu={contextMenu} 
          onAction={handleContextAction} 
        />
      )}
    </>
  );
};

// Memoize the entire component with custom comparison
export const EditorTabBar = memo(EditorTabBarComponent, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  if (prevProps.activeTabId !== nextProps.activeTabId) return false;
  if (prevProps.enableAI !== nextProps.enableAI) return false;
  if (prevProps.tabs.length !== nextProps.tabs.length) return false;
  
  // Deep compare tabs for changes that matter
  for (let i = 0; i < prevProps.tabs.length; i++) {
    const prevTab = prevProps.tabs[i];
    const nextTab = nextProps.tabs[i];
    if (
      prevTab.id !== nextTab.id ||
      prevTab.name !== nextTab.name ||
      prevTab.isDirty !== nextTab.isDirty ||
      prevTab.path !== nextTab.path
    ) {
      return false;
    }
  }
  
  return true;
});

EditorTabBar.displayName = 'EditorTabBar';
