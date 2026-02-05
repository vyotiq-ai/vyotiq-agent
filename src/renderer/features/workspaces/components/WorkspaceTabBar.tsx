/**
 * Workspace Tab Bar Component
 * 
 * Displays open workspace tabs with terminal-style aesthetics.
 * Supports tab switching, closing, dragging for reorder, and context menus.
 * Shows activity indicators for running sessions in each workspace.
 * 
 * Refactored to use modular sub-components from ./tabBar/
 */
import React, { useCallback, useState, useRef, useMemo, memo } from 'react';
import { Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Spinner } from '../../../components/ui/LoadingState';
import { cn } from '../../../utils/cn';
import { useWorkspaceTabs, useWorkspaceTabsActions } from '../../../state/WorkspaceTabsProvider';
import { useAgentActions, useAgentSelector } from '../../../state/AgentProvider';
import { GlobalRunningSessionsPanel } from '../../sessions';

// Import modular components
import { TabItem, TabContextMenu, TabSessionDropdown } from './tabBar';

// =============================================================================
// Types
// =============================================================================

interface WorkspaceTabBarProps {
  className?: string;
}

// =============================================================================
// Running Sessions Indicator Component (Enhanced)
// =============================================================================

interface RunningIndicatorProps {
  totalRunning: number;
  isExpanded: boolean;
  onToggle: () => void;
}

const RunningIndicator = memo<RunningIndicatorProps>(({ totalRunning, isExpanded, onToggle }) => {
  // Always show the button, but with different styling when no sessions are running
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1 px-2 h-full text-[9px] font-mono",
        totalRunning > 0 
          ? "text-[var(--color-success)]" 
          : "text-[var(--color-text-dim)]",
        "border-l border-[var(--color-border-subtle)]",
        "hover:bg-[var(--color-surface-active)]",
        "transition-colors focus:outline-none"
      )}
      title={totalRunning > 0 
        ? `${totalRunning} session${totalRunning > 1 ? 's' : ''} running - click to ${isExpanded ? 'collapse' : 'expand'}`
        : 'No sessions running'
      }
    >
      {totalRunning > 0 ? (
        <>
          <Spinner size="sm" className="w-2.5 h-2.5" />
          <span>{totalRunning} running</span>
          {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </>
      ) : (
        <span>sessions</span>
      )}
    </button>
  );
});
RunningIndicator.displayName = 'RunningIndicator';

// =============================================================================
// Main Component
// =============================================================================

export const WorkspaceTabBar: React.FC<WorkspaceTabBarProps> = memo(({ className }) => {
  const { state } = useWorkspaceTabs();
  const actions = useWorkspaceTabsActions();
  const agentActions = useAgentActions();
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; workspaceId: string } | null>(null);
  const [sessionDropdown, setSessionDropdown] = useState<{ workspaceId: string; anchorEl: HTMLElement } | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isSessionsPanelExpanded, setIsSessionsPanelExpanded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get total running sessions across all workspaces
  const totalRunning = useAgentSelector(
    (s) => (s.sessions ?? []).filter(
      session => session.status === 'running' || session.status === 'awaiting-confirmation'
    ).length,
    (a, b) => a === b
  );

  // Toggle sessions panel expansion
  const handleToggleSessionsPanel = useCallback(() => {
    setIsSessionsPanelExpanded(prev => !prev);
  }, []);

  // Check scroll state
  const updateScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    setCanScrollLeft(container.scrollLeft > 0);
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1);
  }, []);

  React.useEffect(() => {
    updateScrollButtons();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', updateScrollButtons);
      const resizeObserver = new ResizeObserver(updateScrollButtons);
      resizeObserver.observe(container);
      return () => {
        container.removeEventListener('scroll', updateScrollButtons);
        resizeObserver.disconnect();
      };
    }
  }, [updateScrollButtons, state.tabs.length]);

  const handleScroll = useCallback((direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const scrollAmount = 200;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  const handleFocusTab = useCallback((workspaceId: string) => {
    actions.focusTab(workspaceId);
  }, [actions]);

  const handleCloseTab = useCallback((workspaceId: string) => {
    actions.closeTab(workspaceId);
  }, [actions]);

  const handleContextMenu = useCallback((e: React.MouseEvent, workspaceId: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, workspaceId });
  }, []);

  const handleAddWorkspace = useCallback(() => {
    agentActions.openWorkspaceDialog();
  }, [agentActions]);

  const handleSelectSession = useCallback((sessionId: string) => {
    agentActions.setActiveSession(sessionId);
  }, [agentActions]);

  const handleNewSession = useCallback(async () => {
    await agentActions.createSession();
  }, [agentActions]);

  const sortedTabs = useMemo(() => 
    [...state.tabs].sort((a, b) => a.order - b.order),
    [state.tabs]
  );

  // Don't render if no tabs
  if (state.tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'flex items-center h-8 min-h-[32px]',
          'bg-[var(--color-surface-sidebar)] border-b border-[var(--color-border-subtle)]',
          'font-mono text-xs',
          className,
        )}
        role="tablist"
        aria-label="Open workspaces"
      >
        {/* Scroll left button */}
        {canScrollLeft && (
          <button
            type="button"
            className={cn(
              'shrink-0 px-1 py-1 h-full',
              'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]',
              'hover:bg-[var(--color-surface-active)]',
              'transition-colors focus:outline-none',
            )}
            onClick={() => handleScroll('left')}
            aria-label="Scroll tabs left"
          >
            <ChevronLeft size={14} />
          </button>
        )}

        {/* Tabs container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 flex items-center overflow-x-auto scrollbar-none"
        >
          {sortedTabs.map((tab) => (
            <TabItem
              key={tab.workspaceId}
              tab={tab}
              isActive={tab.workspaceId === state.focusedTabId}
              onFocus={handleFocusTab}
              onClose={handleCloseTab}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>

        {/* Scroll right button */}
        {canScrollRight && (
          <button
            type="button"
            className={cn(
              'shrink-0 px-1 py-1 h-full',
              'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]',
              'hover:bg-[var(--color-surface-active)]',
              'transition-colors focus:outline-none',
            )}
            onClick={() => handleScroll('right')}
            aria-label="Scroll tabs right"
          >
            <ChevronRight size={14} />
          </button>
        )}

        {/* Global running indicator */}
        <RunningIndicator 
          totalRunning={totalRunning} 
          isExpanded={isSessionsPanelExpanded}
          onToggle={handleToggleSessionsPanel}
        />

        {/* Add workspace button */}
        <button
          type="button"
          className={cn(
            'shrink-0 px-2 py-1 h-full',
            'text-[var(--color-text-dim)] hover:text-[var(--color-accent-primary)]',
            'hover:bg-[var(--color-surface-active)]',
            'transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset',
            'border-l border-[var(--color-border-subtle)]',
          )}
          onClick={handleAddWorkspace}
          aria-label="Open new workspace"
          title="Open workspace (Ctrl+O)"
        >
          <Plus size={14} />
        </button>

        {/* Tab count indicator */}
        {state.tabs.length > 1 && (
          <div className="shrink-0 px-2 text-[var(--color-text-dim)] text-[10px] border-l border-[var(--color-border-subtle)]">
            {state.tabs.length}/{state.maxTabs}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          workspaceId={contextMenu.workspaceId}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Session Dropdown */}
      {sessionDropdown && (
        <TabSessionDropdown
          workspaceId={sessionDropdown.workspaceId}
          workspaceLabel={
            state.tabs.find(t => t.workspaceId === sessionDropdown.workspaceId)?.workspace?.label || 'Workspace'
          }
          isOpen={true}
          anchorEl={sessionDropdown.anchorEl}
          onClose={() => setSessionDropdown(null)}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
        />
      )}

      {/* Global Running Sessions Panel (expandable) */}
      {isSessionsPanelExpanded && (
        <GlobalRunningSessionsPanel 
          defaultCollapsed={false}
          onNavigateToSession={(sessionId, workspaceId) => {
            // Navigate to the workspace first, then set the session
            actions.focusTab(workspaceId);
            agentActions.setActiveSession(sessionId);
            setIsSessionsPanelExpanded(false);
          }}
        />
      )}
    </div>
  );
});

WorkspaceTabBar.displayName = 'WorkspaceTabBar';

export default WorkspaceTabBar;
