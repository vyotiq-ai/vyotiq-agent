/**
 * SettingsSidebar Component
 * 
 * Sidebar navigation for settings tabs.
 * Responsive: slides in as overlay on mobile, fixed on desktop.
 * Supports keyboard navigation with arrow keys.
 */

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { TAB_GROUPS, type SettingsTabId } from '../../config/tabConfig';
import { Button } from '../../../../components/ui/Button';

interface SettingsSidebarProps {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ 
  activeTab, 
  onTabChange,
  isOpen = false,
  onClose,
}) => {
  const navRef = useRef<HTMLElement>(null);
  
  // Flatten all tabs for keyboard navigation
  const allTabs = useMemo(() => 
    TAB_GROUPS.flatMap(group => group.tabs.map(tab => tab.id)),
    []
  );
  
  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle keyboard navigation within the sidebar
  const handleKeyDown = useCallback((e: React.KeyboardEvent, tabId: SettingsTabId) => {
    const currentIndex = allTabs.indexOf(tabId);
    let nextIndex = currentIndex;
    
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        nextIndex = (currentIndex + 1) % allTabs.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        nextIndex = currentIndex === 0 ? allTabs.length - 1 : currentIndex - 1;
        break;
      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIndex = allTabs.length - 1;
        break;
      default:
        return;
    }
    
    const nextTabId = allTabs[nextIndex];
    onTabChange(nextTabId);
    
    // Focus the next tab button
    const nextButton = navRef.current?.querySelector(`[data-tab-id="${nextTabId}"]`) as HTMLButtonElement;
    nextButton?.focus();
  }, [allTabs, onTabChange]);

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div 
          className="fixed top-[32px] left-0 right-0 bottom-0 bg-black/50 z-40 md:hidden animate-in fade-in duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      
      {/* Sidebar navigation */}
      <nav 
        ref={navRef}
        className={cn(
          // Base styles
          "flex-shrink-0 overflow-y-auto overscroll-contain bg-[var(--color-surface-sidebar)] transition-all duration-200 border-r border-[var(--color-border-subtle)]",
          // Scrollbar styling
          "scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent",
          // Mobile: slide-in drawer
          "fixed md:relative top-[32px] md:top-0 bottom-0 left-0 z-50 md:z-auto",
          "w-[70vw] max-w-[200px] sm:w-48 md:w-44 lg:w-48",
          // Mobile visibility with slide animation
          isOpen 
            ? "translate-x-0 shadow-lg md:shadow-none" 
            : "-translate-x-full md:translate-x-0",
        )}
        aria-label="Settings navigation"
        role="navigation"
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)] md:hidden">
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">navigation</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-6 w-6 text-[var(--color-text-muted)]"
            aria-label="Close navigation"
          >
            <X size={14} />
          </Button>
        </div>
        
        <div className="py-2 md:py-3">
          {TAB_GROUPS.map((group, groupIndex) => (
            <div key={group.title} className={cn(groupIndex > 0 && "mt-3 md:mt-4")}>
              <div className="px-3 md:px-4 py-1 md:py-1.5 text-[8px] md:text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">
                {group.title}
              </div>
              <div className="flex flex-col" role="tablist" aria-orientation="vertical">
                {group.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    data-tab-id={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls="settings-content-panel"
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    className={cn(
                      "flex items-center px-3 md:px-4 py-1.5 md:py-1.5 text-left transition-all duration-100 text-[10px] md:text-[11px]",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40 focus-visible:ring-inset",
                      activeTab === tab.id
                        ? "bg-[var(--color-surface-2)] text-[var(--color-accent-primary)] border-l-2 border-[var(--color-accent-primary)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] border-l-2 border-transparent"
                    )}
                    onClick={() => onTabChange(tab.id)}
                    onKeyDown={(e) => handleKeyDown(e, tab.id)}
                  >
                    <span className="mr-1.5 md:mr-2 text-[var(--color-text-muted)]" aria-hidden="true">&gt;</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
};

export default SettingsSidebar;
