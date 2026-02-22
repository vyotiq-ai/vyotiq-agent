/**
 * HeaderActionsSection (Right)
 *
 * Right portion of the header: panel toggles and settings button.
 * Reserves space for native window controls on Windows.
 */
import React, { memo } from 'react';
import { Settings, History, Globe, Command } from 'lucide-react';
import { Tooltip } from '../../ui/Tooltip';
import { useUIState, useUIActions } from '../../../state/UIProvider';
import { HeaderIconButton } from './HeaderIconButton';
import { HeaderDivider } from './HeaderDivider';
import { WINDOW_CONTROLS_WIDTH } from './constants';

interface HeaderActionsSectionProps {
  onOpenSettings: () => void;
}

export const HeaderActionsSection: React.FC<HeaderActionsSectionProps> = memo(
  function HeaderActionsSection({ onOpenSettings }) {
    const { undoHistoryOpen, browserPanelOpen } = useUIState();
    const { toggleUndoHistory, toggleBrowserPanel, toggleCommandPalette } = useUIActions();

    return (
      <div
        className="flex items-center gap-0 no-drag shrink-0"
        style={{ paddingRight: WINDOW_CONTROLS_WIDTH }}
      >
        {/* Quick-access toggles — grouped with a subtle background */}
        <div className="flex items-center gap-0.5 px-0.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)]/30">
          {/* Command palette */}
          <Tooltip content="Command palette" shortcut="Ctrl+K">
            <HeaderIconButton
              onClick={toggleCommandPalette}
              label="Command palette"
            >
              <Command size={13} />
            </HeaderIconButton>
          </Tooltip>

          {/* Browser panel */}
          <Tooltip
            content={browserPanelOpen ? 'Hide browser' : 'Show browser'}
            shortcut="Ctrl+Shift+B"
          >
            <HeaderIconButton
              onClick={toggleBrowserPanel}
              label={browserPanelOpen ? 'Hide browser' : 'Show browser'}
              active={browserPanelOpen}
            >
              <Globe size={13} />
            </HeaderIconButton>
          </Tooltip>

          {/* Undo history */}
          <Tooltip
            content={undoHistoryOpen ? 'Hide history' : 'Show history'}
            shortcut="Ctrl+Shift+H"
          >
            <HeaderIconButton
              onClick={toggleUndoHistory}
              label={undoHistoryOpen ? 'Hide history' : 'Show history'}
              active={undoHistoryOpen}
            >
              <History size={13} />
            </HeaderIconButton>
          </Tooltip>
        </div>

        <HeaderDivider />

        {/* Settings */}
        <Tooltip content="Settings" shortcut="Ctrl+,">
          <HeaderIconButton onClick={onOpenSettings} label="Settings">
            <Settings size={13} />
          </HeaderIconButton>
        </Tooltip>
      </div>
    );
  }
);
