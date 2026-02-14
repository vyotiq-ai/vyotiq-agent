/**
 * Header Component - Clean Terminal-Styled Topbar
 * 
 * Minimalist header with clear visual grouping:
 * - Left: Sidebar toggle + workspace/session path (session is clickable dropdown)
 * - Right: Panel toggles grouped together, settings separate
 */
import React, { memo } from 'react';
import {
  Plus,
  PanelLeft,
  Settings,
  History,
  Globe,
} from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { useUIState, useUIActions } from '../../state/UIProvider';
import { useLifecycleProfiler } from '../../utils/profiler';
import { cn } from '../../utils/cn';
import { SessionSelector } from '../../features/chat/components/sessionSelector';
import { WorkspaceSwitcher } from '../../features/workspace';

// =============================================================================
// Types
// =============================================================================

interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  isMobile?: boolean;
  isTablet?: boolean;
}

// =============================================================================
// Sub-Components
// =============================================================================

/** Icon button with consistent styling */
const IconButton: React.FC<{
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}> = memo(({ onClick, label, active, children }) => (
  <button
    className={cn(
      'p-1.5 transition-colors rounded-sm no-drag',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40',
      active
        ? 'text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]'
    )}
    onClick={onClick}
    aria-label={label}
    type="button"
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
  isMobile = false,
  isTablet = false,
}) {
  useLifecycleProfiler('Header');

  const { handleNewSession } = useAgentStatus();

  const {
    undoHistoryOpen, browserPanelOpen,
  } = useUIState();

  const {
    toggleUndoHistory, toggleBrowserPanel,
  } = useUIActions();

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
        <Tooltip content={collapsed ? 'Show sidebar' : 'Hide sidebar'} shortcut="Ctrl+B">
          <IconButton
            onClick={onToggle}
            label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            <PanelLeft size={14} />
          </IconButton>
        </Tooltip>

        {/* Workspace selector */}
        <div className="ml-1 pl-1 border-l border-[var(--color-border-subtle)]">
          <WorkspaceSwitcher />
        </div>

        {/* Session selector - CLI style */}
        <div className="ml-1 pl-1 border-l border-[var(--color-border-subtle)]">
          <SessionSelector />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-0.5 no-drag pr-[70px] sm:pr-[100px] md:pr-[138px] shrink-0">
        {/* New Session */}
        <Tooltip content="New session" shortcut="Ctrl+N">
        <button
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-[10px] rounded-sm no-drag',
            'text-[var(--color-accent-primary)]',
            'hover:bg-[var(--color-accent-primary)]/10',
            'transition-colors active:scale-95',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
          )}
          onClick={handleNewSession}
          aria-label="New session"
          type="button"
        >
          <Plus size={12} />
          {!isMobile && !isTablet && <span>new</span>}
        </button>
        </Tooltip>

        {/* Panel Toggles - grouped */}
        <div className="flex items-center gap-0.5 ml-1 pl-1.5 border-l border-[var(--color-border-subtle)]">
          <Tooltip content={browserPanelOpen ? 'Hide browser' : 'Show browser'} shortcut="Ctrl+Shift+B">
            <IconButton
              onClick={toggleBrowserPanel}
              label={browserPanelOpen ? 'Hide browser' : 'Show browser'}
              active={browserPanelOpen}
            >
              <Globe size={13} />
            </IconButton>
          </Tooltip>

          <Tooltip content={undoHistoryOpen ? 'Hide history' : 'Show history'} shortcut="Ctrl+Shift+H">
            <IconButton
              onClick={toggleUndoHistory}
              label={undoHistoryOpen ? 'Hide history' : 'Show history'}
              active={undoHistoryOpen}
            >
              <History size={13} />
            </IconButton>
          </Tooltip>
        </div>

        {/* Settings - separate */}
        <div className="ml-1 pl-1.5 border-l border-[var(--color-border-subtle)]">
          <Tooltip content="Settings" shortcut="Ctrl+,">
            <IconButton
              onClick={onOpenSettings}
              label="Settings"
            >
              <Settings size={13} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </header>
  );
});
