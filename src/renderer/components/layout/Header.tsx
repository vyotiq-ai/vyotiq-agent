/**
 * Header Component — Terminal-Styled Topbar
 *
 * Two-zone layout:
 *   Left  — sidebar toggle, workspace selector, session selector (breadcrumb trail)
 *   Right — command palette, panel toggles, settings (with window-control spacing)
 *
 * Notes:
 * - On Windows with titleBarOverlay the native controls are ~138 px wide.
 * - Header height is 32 px to align with the overlay seamlessly.
 * - All sub-components are split into the `header/` directory for modularity.
 */
import React, { memo } from 'react';
import { useLifecycleProfiler } from '../../utils/profiler';
import { cn } from '../../utils/cn';
import { HeaderNavSection } from './header/HeaderNavSection';
import { HeaderActionsSection } from './header/HeaderActionsSection';
import { HEADER_HEIGHT } from './header/constants';

// =============================================================================
// Types
// =============================================================================

export interface HeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
}

// =============================================================================
// Main Header Component
// =============================================================================

export const Header: React.FC<HeaderProps> = memo(function Header({
  collapsed,
  onToggle,
  onOpenSettings,
}) {
  useLifecycleProfiler('Header');

  return (
    <header
      className={cn(
        'flex items-center justify-between shrink-0 z-30 select-none',
        'px-2 font-mono text-[10px] drag-region',
        'bg-[var(--color-surface-header)] backdrop-blur-md',
        'border-b border-[var(--color-border-subtle)]/50',
        'shadow-[0_1px_3px_rgba(0,0,0,0.15)]',
      )}
      style={{ height: HEADER_HEIGHT }}
      role="banner"
    >
      {/* ── Left: navigation breadcrumb ───────────────────────────── */}
      <HeaderNavSection collapsed={collapsed} onToggle={onToggle} />

      {/* ── Right: panel actions ───────────────────────────────────── */}
      <HeaderActionsSection onOpenSettings={onOpenSettings} />
    </header>
  );
});
