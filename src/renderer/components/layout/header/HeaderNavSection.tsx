/**
 * HeaderNavSection (Left)
 *
 * Left portion of the header: sidebar toggle → workspace → session.
 * Uses a breadcrumb-trail metaphor with subtle separator pipes.
 */
import React, { memo } from 'react';
import { PanelLeft } from 'lucide-react';
import { Tooltip } from '../../ui/Tooltip';
import { SessionSelector } from '../../../features/chat/components/sessionSelector';
import { WorkspaceSwitcher } from '../../../features/workspace';
import { HeaderIconButton } from './HeaderIconButton';

interface HeaderNavSectionProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const HeaderNavSection: React.FC<HeaderNavSectionProps> = memo(
  function HeaderNavSection({ collapsed, onToggle }) {
    return (
      <div className="flex items-center gap-0 no-drag min-w-0 flex-1">
        {/* Sidebar toggle */}
        <Tooltip content={collapsed ? 'Show sidebar' : 'Hide sidebar'} shortcut="Ctrl+B">
          <HeaderIconButton
            onClick={onToggle}
            label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            <PanelLeft size={14} />
          </HeaderIconButton>
        </Tooltip>

        {/* Breadcrumb separator */}
        <span className="text-[var(--color-text-dim)]/20 mx-0.5 text-[11px] select-none shrink-0 font-light" aria-hidden="true">/</span>

        {/* Workspace — no overflow-hidden so the dropdown isn't clipped */}
        <div className="flex items-center shrink-0">
          <WorkspaceSwitcher />
        </div>

        {/* Breadcrumb separator */}
        <span className="text-[var(--color-text-dim)]/20 mx-0.5 text-[11px] select-none shrink-0 font-light" aria-hidden="true">/</span>

        {/* Session — overflow-hidden is safe here because SessionDropdown uses a portal */}
        <div className="flex items-center min-w-0 overflow-hidden">
          <SessionSelector />
        </div>
      </div>
    );
  }
);
