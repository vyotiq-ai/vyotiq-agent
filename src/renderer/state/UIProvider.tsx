import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('UIProvider');

interface UIContextType {
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  undoHistoryOpen: boolean;
  browserPanelOpen: boolean;
  browserPanelWidth: number;
  commandPaletteOpen: boolean;
  metricsDashboardOpen: boolean;

  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  toggleShortcuts: () => void;
  openUndoHistory: () => void;
  closeUndoHistory: () => void;
  toggleUndoHistory: () => void;
  openBrowserPanel: () => void;
  closeBrowserPanel: () => void;
  toggleBrowserPanel: () => void;
  setBrowserPanelWidth: (width: number) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  openMetricsDashboard: () => void;
  closeMetricsDashboard: () => void;
  toggleMetricsDashboard: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

// Persist browser panel preferences
const BROWSER_PANEL_KEY = 'vyotiq-browser-panel';
const loadBrowserPanelPrefs = () => {
  try {
    const stored = localStorage.getItem(BROWSER_PANEL_KEY);
    return stored ? JSON.parse(stored) : { open: false, width: 500 };
  } catch (err) {
    logger.debug('Failed to load browser panel prefs', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { open: false, width: 500 };
  }
};
const saveBrowserPanelPrefs = (prefs: { open: boolean; width: number }) => {
  try {
    localStorage.setItem(BROWSER_PANEL_KEY, JSON.stringify(prefs));
  } catch (err) {
    logger.debug('Failed to save browser panel prefs', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
};



export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Browser panel state with persistence
  const browserPrefs = loadBrowserPanelPrefs();
  const [browserPanelOpen, setBrowserPanelOpen] = useState(browserPrefs.open);
  const [browserPanelWidth, setBrowserPanelWidthState] = useState(browserPrefs.width);

  // Metrics dashboard state (modal)
  const [metricsDashboardOpen, setMetricsDashboardOpen] = useState(false);



  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const toggleSettings = useCallback(() => setSettingsOpen((prev) => !prev), []);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const toggleShortcuts = useCallback(() => setShortcutsOpen((prev) => !prev), []);

  // Browser panel callbacks
  const openBrowserPanel = useCallback(() => {
    setBrowserPanelOpen(true);
    saveBrowserPanelPrefs({ open: true, width: browserPanelWidth });
  }, [browserPanelWidth]);

  const closeBrowserPanel = useCallback(() => {
    setBrowserPanelOpen(false);
    saveBrowserPanelPrefs({ open: false, width: browserPanelWidth });
  }, [browserPanelWidth]);

  const toggleBrowserPanel = useCallback(() => {
    setBrowserPanelOpen((prev: boolean) => {
      const newValue = !prev;
      saveBrowserPanelPrefs({ open: newValue, width: browserPanelWidth });
      return newValue;
    });
  }, [browserPanelWidth]);

  const setBrowserPanelWidth = useCallback((width: number) => {
    setBrowserPanelWidthState(width);
    saveBrowserPanelPrefs({ open: browserPanelOpen, width });
  }, [browserPanelOpen]);

  // Metrics dashboard callbacks
  const openMetricsDashboard = useCallback(() => setMetricsDashboardOpen(true), []);
  const closeMetricsDashboard = useCallback(() => setMetricsDashboardOpen(false), []);
  const toggleMetricsDashboard = useCallback(() => setMetricsDashboardOpen(prev => !prev), []);

  // Undo history panel state
  const [undoHistoryOpen, setUndoHistoryOpen] = useState(false);
  
  const openUndoHistory = useCallback(() => setUndoHistoryOpen(true), []);
  const closeUndoHistory = useCallback(() => setUndoHistoryOpen(false), []);
  const toggleUndoHistory = useCallback(() => setUndoHistoryOpen(prev => !prev), []);

  // Command palette state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const toggleCommandPalette = useCallback(() => setCommandPaletteOpen(prev => !prev), []);

  // Global keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ? to show shortcuts (when no modals are open and not in an input)
      if (e.key === '?' && !settingsOpen && !shortcutsOpen) {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (!isInput) {
          e.preventDefault();
          setShortcutsOpen(true);
        }
      }
      
      // Ctrl/Cmd + , to open settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
      
      // Ctrl/Cmd + Shift + H to toggle undo history
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        toggleUndoHistory();
      }

      // Ctrl/Cmd + Shift + B to toggle browser panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        toggleBrowserPanel();
      }

      // Ctrl/Cmd + K to open command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }

      // Ctrl/Cmd + Shift + M to toggle metrics dashboard
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        toggleMetricsDashboard();
      }
      
      // Note: Ctrl+E for editor toggle, Ctrl+S for save, Ctrl+W for close tab
      // are handled in EditorView.tsx
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, shortcutsOpen, toggleUndoHistory, toggleBrowserPanel, toggleCommandPalette, toggleMetricsDashboard]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({ 
    settingsOpen, 
    shortcutsOpen,
    undoHistoryOpen,
    browserPanelOpen,
    browserPanelWidth,
    commandPaletteOpen,
    metricsDashboardOpen,
    openSettings, 
    closeSettings, 
    toggleSettings,
    openShortcuts,
    closeShortcuts,
    toggleShortcuts,
    openUndoHistory,
    closeUndoHistory,
    toggleUndoHistory,
    openBrowserPanel,
    closeBrowserPanel,
    toggleBrowserPanel,
    setBrowserPanelWidth,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    openMetricsDashboard,
    closeMetricsDashboard,
    toggleMetricsDashboard,
  }), [
    settingsOpen, 
    shortcutsOpen,
    undoHistoryOpen,
    browserPanelOpen,
    browserPanelWidth,
    commandPaletteOpen,
    metricsDashboardOpen,
    openSettings, 
    closeSettings, 
    toggleSettings,
    openShortcuts,
    closeShortcuts,
    toggleShortcuts,
    openUndoHistory,
    closeUndoHistory,
    toggleUndoHistory,
    openBrowserPanel,
    closeBrowserPanel,
    toggleBrowserPanel,
    setBrowserPanelWidth,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    openMetricsDashboard,
    closeMetricsDashboard,
    toggleMetricsDashboard,
  ]);

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};