import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('UIProvider');

interface UIContextType {
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  terminalPanelOpen: boolean;
  terminalPanelHeight: number;
  undoHistoryOpen: boolean;
  browserPanelOpen: boolean;
  browserPanelWidth: number;
  commandPaletteOpen: boolean;
  metricsDashboardOpen: boolean;
  memoryPanelOpen: boolean;

  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;
  openShortcuts: () => void;
  closeShortcuts: () => void;
  toggleShortcuts: () => void;
  openTerminalPanel: () => void;
  closeTerminalPanel: () => void;
  toggleTerminalPanel: () => void;
  setTerminalPanelHeight: (height: number) => void;
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
  openMemoryPanel: () => void;
  closeMemoryPanel: () => void;
  toggleMemoryPanel: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

// Persist terminal panel preferences
const TERMINAL_PANEL_KEY = 'vyotiq-terminal-panel';
const loadTerminalPanelPrefs = () => {
  try {
    const stored = localStorage.getItem(TERMINAL_PANEL_KEY);
    return stored ? JSON.parse(stored) : { open: false, height: 200 };
  } catch (err) {
    logger.debug('Failed to load terminal panel prefs', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { open: false, height: 200 };
  }
};
const saveTerminalPanelPrefs = (prefs: { open: boolean; height: number }) => {
  try {
    localStorage.setItem(TERMINAL_PANEL_KEY, JSON.stringify(prefs));
  } catch (err) {
    logger.debug('Failed to save terminal panel prefs', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

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
  
  // Terminal panel state with persistence
  const terminalPrefs = loadTerminalPanelPrefs();
  const [terminalPanelOpen, setTerminalPanelOpen] = useState(terminalPrefs.open);
  const [terminalPanelHeight, setTerminalPanelHeightState] = useState(terminalPrefs.height);

  // Browser panel state with persistence
  const browserPrefs = loadBrowserPanelPrefs();
  const [browserPanelOpen, setBrowserPanelOpen] = useState(browserPrefs.open);
  const [browserPanelWidth, setBrowserPanelWidthState] = useState(browserPrefs.width);

  // Metrics dashboard state (modal)
  const [metricsDashboardOpen, setMetricsDashboardOpen] = useState(false);

  // Memory panel state
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);



  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const toggleSettings = useCallback(() => setSettingsOpen((prev) => !prev), []);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const toggleShortcuts = useCallback(() => setShortcutsOpen((prev) => !prev), []);

  // Terminal panel callbacks
  const openTerminalPanel = useCallback(() => {
    setTerminalPanelOpen(true);
    saveTerminalPanelPrefs({ open: true, height: terminalPanelHeight });
  }, [terminalPanelHeight]);
  
  const closeTerminalPanel = useCallback(() => {
    setTerminalPanelOpen(false);
    saveTerminalPanelPrefs({ open: false, height: terminalPanelHeight });
  }, [terminalPanelHeight]);
  
  const toggleTerminalPanel = useCallback(() => {
    setTerminalPanelOpen((prev: boolean) => {
      const newValue = !prev;
      saveTerminalPanelPrefs({ open: newValue, height: terminalPanelHeight });
      return newValue;
    });
  }, [terminalPanelHeight]);
  
  const setTerminalPanelHeight = useCallback((height: number) => {
    setTerminalPanelHeightState(height);
    saveTerminalPanelPrefs({ open: terminalPanelOpen, height });
  }, [terminalPanelOpen]);

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

  // Memory panel callbacks
  const openMemoryPanel = useCallback(() => setMemoryPanelOpen(true), []);
  const closeMemoryPanel = useCallback(() => setMemoryPanelOpen(false), []);
  const toggleMemoryPanel = useCallback(() => setMemoryPanelOpen(prev => !prev), []);

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
      
      // Ctrl/Cmd + ` to toggle terminal panel
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        toggleTerminalPanel();
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

      // Ctrl/Cmd + Shift + Y to toggle memory panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Y') {
        e.preventDefault();
        toggleMemoryPanel();
      }
      
      // Note: Ctrl+E for editor toggle, Ctrl+S for save, Ctrl+W for close tab,
      // and Ctrl+D for diff are handled in EditorView.tsx
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, shortcutsOpen, toggleTerminalPanel, toggleUndoHistory, toggleBrowserPanel, toggleCommandPalette, toggleMetricsDashboard, toggleMemoryPanel]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({ 
    settingsOpen, 
    shortcutsOpen,
    terminalPanelOpen,
    terminalPanelHeight,
    undoHistoryOpen,
    browserPanelOpen,
    browserPanelWidth,
    commandPaletteOpen,
    metricsDashboardOpen,
    memoryPanelOpen,
    openSettings, 
    closeSettings, 
    toggleSettings,
    openShortcuts,
    closeShortcuts,
    toggleShortcuts,
    openTerminalPanel,
    closeTerminalPanel,
    toggleTerminalPanel,
    setTerminalPanelHeight,
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
    openMemoryPanel,
    closeMemoryPanel,
    toggleMemoryPanel,
  }), [
    settingsOpen, 
    shortcutsOpen,
    terminalPanelOpen,
    terminalPanelHeight,
    undoHistoryOpen,
    browserPanelOpen,
    browserPanelWidth,
    commandPaletteOpen,
    metricsDashboardOpen,
    memoryPanelOpen,
    openSettings, 
    closeSettings, 
    toggleSettings,
    openShortcuts,
    closeShortcuts,
    toggleShortcuts,
    openTerminalPanel,
    closeTerminalPanel,
    toggleTerminalPanel,
    setTerminalPanelHeight,
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
    openMemoryPanel,
    closeMemoryPanel,
    toggleMemoryPanel,
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