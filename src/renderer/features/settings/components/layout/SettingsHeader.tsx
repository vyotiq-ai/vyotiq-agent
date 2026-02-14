/**
 * SettingsHeader Component
 * 
 * Header bar for the settings panel with title, breadcrumb, and close button.
 * Includes hamburger menu button for mobile sidebar toggle.
 */

import React from 'react';
import { X, Menu, ChevronRight } from 'lucide-react';
import type { SettingsTabId } from '../../config/tabConfig';

interface SettingsHeaderProps {
  onClose: () => void;
  onMenuToggle?: () => void;
  showMenuButton?: boolean;
  activeTab?: SettingsTabId;
}

export const SettingsHeader: React.FC<SettingsHeaderProps> = ({ 
  onClose,
  onMenuToggle,
  showMenuButton = false,
  activeTab,
}) => {
  return (
    <header 
      className="w-full flex items-center justify-between px-3 sm:px-4 py-1.5 sm:py-2 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)]"
      style={{ flexShrink: 0, minHeight: '36px' }}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Mobile menu button */}
        {showMenuButton && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="h-7 w-7 md:hidden flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded flex-shrink-0"
            aria-label="Toggle navigation menu"
          >
            <Menu size={16} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <h2 className="text-xs sm:text-sm font-medium text-[var(--color-text-primary)]">settings</h2>
            {activeTab && (
              <>
                <ChevronRight size={12} className="text-[var(--color-text-dim)] flex-shrink-0" />
                <span className="text-xs sm:text-sm text-[var(--color-accent-primary)] truncate">{activeTab}</span>
              </>
            )}
          </div>
          <p className="text-[9px] sm:text-[10px] text-[var(--color-text-muted)] hidden sm:block">configure providers, models, and agent behavior</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="h-7 w-7 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded flex-shrink-0"
        aria-label="Close settings"
      >
        <X size={16} />
      </button>
    </header>
  );
};

export default SettingsHeader;
