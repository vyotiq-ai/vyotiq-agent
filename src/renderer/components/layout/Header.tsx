/**
 * Header Component - Clean Terminal-Styled Topbar
 * 
 * Minimalist header with clear visual grouping:
 * - Left: Sidebar toggle + workspace/session path (session is clickable dropdown)
 * - Right: Panel toggles grouped together, settings separate
 */
import React, { memo, useMemo } from 'react';
import {
  Plus,
  PanelLeft,
  Settings,
  History,
  Globe,
} from 'lucide-react';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { useAgentSelector } from '../../state/AgentProvider';
import { useUI } from '../../state/UIProvider';
import { useLifecycleProfiler } from '../../utils/profiler';
import { cn } from '../../utils/cn';
import { SessionSelector } from '../../features/chat/components/sessionSelector';

// =============================================================================
// Types
// =============================================================================

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  hasWorkspace?: boolean;
  isMobile?: boolean;
  isTablet?: boolean;
}

// =============================================================================
// Sub-Components
// =============================================================================

/** Icon button with consistent styling */
const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}> = memo(({ onClick, title, active, children }) => (
  <button
    className={cn(
      'p-1.5 transition-colors rounded-sm',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
      active
        ? 'text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]'
    )}
    onClick={onClick}
    title={title}
  >
    {children}
  </button>
));
IconButton.displayName = 'IconButton';

// =============================================================================
// Main Header Component
// =============================================================================

export const Header: React.FC<HeaderProps> = memo(function Header({
  collapsed,
  onToggle,
  onOpenSettings,
  hasWorkspace = false,
  isMobile = false,
}) {
  useLifecycleProfiler('Header');

  const { handleNewSession } = useAgentStatus();

  const agentHeader = useAgentSelector(
    (state) => {
      const activeWorkspace = state.workspaces.find((w) => w.isActive);
      const activeSession = state.activeSessionId
        ? state.sessions.find((s) => s.id === state.activeSessionId)
        : undefined;
      return {
        activeWorkspace,
        activeSessionId: state.activeSessionId,
        activeSessionTitle: activeSession?.title,
      };
    },
    (a, b) =>
      a.activeWorkspace === b.activeWorkspace &&
      a.activeSessionId === b.activeSessionId &&
      a.activeSessionTitle === b.activeSessionTitle,
  );

  const {
    undoHistoryOpen, toggleUndoHistory,
    browserPanelOpen, toggleBrowserPanel,
  } = useUI();

  const workspaceLabel = useMemo(() => {
    return agentHeader.activeWorkspace?.label ||
      agentHeader.activeWorkspace?.path?.split(/[/\\]/).pop() ||
      '';
  }, [agentHeader.activeWorkspace]);

  return (
    <header
      className={cn(
        'h-[32px] flex items-center justify-between shrink-0 drag-region z-30 select-none',
        'px-2 font-mono text-[10px]',
        'bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]',
        'transition-colors'
      )}
      role="banner"
    >
      {/* Left: Navigation */}
      <div className="flex items-center gap-1.5 no-drag h-full min-w-0 flex-1">
        <IconButton
          onClick={onToggle}
          title={collapsed ? 'Show sidebar [Ctrl+B]' : 'Hide sidebar [Ctrl+B]'}
        >
          <PanelLeft size={14} />
        </IconButton>

        {/* CLI-style Path */}
        <div className="flex items-center gap-1.5 text-[11px] min-w-0 overflow-hidden ml-1">
          <span className="text-[var(--color-accent-primary)] flex-shrink-0 text-sm font-medium opacity-90">λ</span>

          {hasWorkspace && workspaceLabel ? (
            <span
              className="text-[var(--color-text-secondary)] truncate max-w-[120px] sm:max-w-[160px]"
              title={agentHeader.activeWorkspace?.path}
            >
              {workspaceLabel}
            </span>
          ) : (
            <span className="text-[var(--color-text-placeholder)]">~</span>
          )}
        </div>

        {/* Session selector - CLI style */}
        {hasWorkspace && (
          <div className="ml-2 pl-2 border-l border-[var(--color-border-subtle)]">
            <SessionSelector />
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-0.5 no-drag pr-[70px] sm:pr-[100px] md:pr-[138px] shrink-0">
        {/* New Session */}
        <button
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-[10px] rounded-sm',
            'text-[var(--color-accent-primary)]',
            'hover:bg-[var(--color-accent-primary)]/10',
            'transition-colors active:scale-95',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
          )}
          onClick={handleNewSession}
          title="New session [Ctrl+N]"
        >
          <Plus size={12} />
          {!isMobile && <span>new</span>}
        </button>

        {/* Panel Toggles - grouped */}
        <div className="flex items-center gap-0.5 ml-1 pl-1.5 border-l border-[var(--color-border-subtle)]">
          <IconButton
            onClick={toggleBrowserPanel}
            title={browserPanelOpen ? 'Hide browser [Ctrl+Shift+B]' : 'Show browser [Ctrl+Shift+B]'}
            active={browserPanelOpen}
          >
            <Globe size={13} />
          </IconButton>

          <IconButton
            onClick={toggleUndoHistory}
            title={undoHistoryOpen ? 'Hide history [Ctrl+Shift+H]' : 'Show history [Ctrl+Shift+H]'}
            active={undoHistoryOpen}
          >
            <History size={13} />
          </IconButton>
        </div>

        {/* Settings - separate */}
        <div className="ml-1 pl-1.5 border-l border-[var(--color-border-subtle)]">
          <IconButton
            onClick={onOpenSettings}
            title="Settings [Ctrl+,]"
          >
            <Settings size={13} />
          </IconButton>
        </div>
      </div>
    </header>
  );
});
