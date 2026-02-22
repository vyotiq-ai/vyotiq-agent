import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode, useMemo } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('UIProvider');

interface UIStateType {
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  undoHistoryOpen: boolean;
  browserPanelOpen: boolean;
  browserPanelWidth: number;
  commandPaletteOpen: boolean;
  quickOpenOpen: boolean;
  metricsDashboardOpen: boolean;
  debugPanelOpen: boolean;
}

interface UIActionsType {
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
  openQuickOpen: () => void;
  closeQuickOpen: () => void;
  openMetricsDashboard: () => void;
  closeMetricsDashboard: () => void;
  toggleMetricsDashboard: () => void;
  openDebugPanel: () => void;
  closeDebugPanel: () => void;
  toggleDebugPanel: () => void;
}

// Combined type for backwards compatibility with useUI()
interface UIContextType extends UIStateType, UIActionsType {}

const UIStateContext = createContext<UIStateType | undefined>(undefined);
const UIActionsContext = createContext<UIActionsType | undefined>(undefined);
// Legacy context for backwards compatibility
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

  // Browser panel state with persistence - parse once and destructure
  const [initialBrowserPrefs] = useState(() => loadBrowserPanelPrefs());
  const [browserPanelOpen, setBrowserPanelOpen] = useState(initialBrowserPrefs.open);
  const [browserPanelWidth, setBrowserPanelWidthState] = useState(initialBrowserPrefs.width);

  // Metrics dashboard state (modal)
  const [metricsDashboardOpen, setMetricsDashboardOpen] = useState(false);

  // Use refs for browser panel state in callbacks to stabilize callback identities
  // This prevents context invalidation when only browser panel state changes
  const browserPanelWidthRef = useRef(browserPanelWidth);
  browserPanelWidthRef.current = browserPanelWidth;
  const browserPanelOpenRef = useRef(browserPanelOpen);
  browserPanelOpenRef.current = browserPanelOpen;

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const toggleSettings = useCallback(() => setSettingsOpen((prev) => !prev), []);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const toggleShortcuts = useCallback(() => setShortcutsOpen((prev) => !prev), []);

  // Browser panel callbacks - use refs for stable identity (no state deps)
  const openBrowserPanel = useCallback(() => {
    setBrowserPanelOpen(true);
    saveBrowserPanelPrefs({ open: true, width: browserPanelWidthRef.current });
  }, []);

  const closeBrowserPanel = useCallback(() => {
    setBrowserPanelOpen(false);
    saveBrowserPanelPrefs({ open: false, width: browserPanelWidthRef.current });
  }, []);

  const toggleBrowserPanel = useCallback(() => {
    setBrowserPanelOpen((prev: boolean) => {
      const newValue = !prev;
      saveBrowserPanelPrefs({ open: newValue, width: browserPanelWidthRef.current });
      return newValue;
    });
  }, []);

  // Debounce localStorage persistence during resize to avoid 60x/sec JSON writes
  const debouncedSaveBrowserPrefs = useMemo(
    () => {
      let timeoutId: ReturnType<typeof setTimeout>;
      return (prefs: { open: boolean; width: number }) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => saveBrowserPanelPrefs(prefs), 300);
      };
    },
    [],
  );

  const setBrowserPanelWidth = useCallback((width: number) => {
    setBrowserPanelWidthState(width);
    debouncedSaveBrowserPrefs({ open: browserPanelOpenRef.current, width });
  }, [debouncedSaveBrowserPrefs]);

  // Metrics dashboard callbacks
  const openMetricsDashboard = useCallback(() => setMetricsDashboardOpen(true), []);
  const closeMetricsDashboard = useCallback(() => setMetricsDashboardOpen(false), []);
  const toggleMetricsDashboard = useCallback(() => setMetricsDashboardOpen(prev => !prev), []);

  // Debug panel state
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);

  const openDebugPanel = useCallback(() => setDebugPanelOpen(true), []);
  const closeDebugPanel = useCallback(() => setDebugPanelOpen(false), []);
  const toggleDebugPanel = useCallback(() => setDebugPanelOpen(prev => !prev), []);

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

  // Quick Open file picker state
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const openQuickOpen = useCallback(() => setQuickOpenOpen(true), []);
  const closeQuickOpen = useCallback(() => setQuickOpenOpen(false), []);

  // Global keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close metrics dashboard
      if (e.key === 'Escape' && metricsDashboardOpen) {
        e.preventDefault();
        setMetricsDashboardOpen(false);
        return;
      }

      // ? to show shortcuts (when no modals/panels are open and not in an input)
      if (e.key === '?' && !settingsOpen && !shortcutsOpen && !commandPaletteOpen && !quickOpenOpen && !debugPanelOpen && !metricsDashboardOpen) {
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

      // Ctrl/Cmd + P to open quick file picker
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setQuickOpenOpen(prev => !prev);
      }

      // Ctrl/Cmd + Shift + I to toggle metrics dashboard
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toggleMetricsDashboard();
      }

      // Ctrl/Cmd + Shift + D to toggle debug panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleDebugPanel();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [settingsOpen, shortcutsOpen, commandPaletteOpen, quickOpenOpen, debugPanelOpen, metricsDashboardOpen, toggleUndoHistory, toggleBrowserPanel, toggleCommandPalette, toggleMetricsDashboard, toggleDebugPanel]);

  // Listen for custom events from activity bar
  useEffect(() => {
    const handleOpenSettings = () => setSettingsOpen(true);
    document.addEventListener('vyotiq:open-settings', handleOpenSettings);
    return () => document.removeEventListener('vyotiq:open-settings', handleOpenSettings);
  }, []);

  // Split context values for performance — actions are stable and never change,
  // state changes only when actual UI booleans change. Components using only actions
  // (like button click handlers) won't re-render when state changes.
  const stateValue = useMemo<UIStateType>(() => ({
    settingsOpen,
    shortcutsOpen,
    undoHistoryOpen,
    browserPanelOpen,
    browserPanelWidth,
    commandPaletteOpen,
    quickOpenOpen,
    metricsDashboardOpen,
    debugPanelOpen,
  }), [
    settingsOpen,
    shortcutsOpen,
    undoHistoryOpen,
    browserPanelOpen,
    browserPanelWidth,
    commandPaletteOpen,
    quickOpenOpen,
    metricsDashboardOpen,
    debugPanelOpen,
  ]);

  // Actions are all stable useCallback refs — this value never changes
  const actionsValue = useMemo<UIActionsType>(() => ({
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
    openQuickOpen,
    closeQuickOpen,
    openMetricsDashboard,
    closeMetricsDashboard,
    toggleMetricsDashboard,
    openDebugPanel,
    closeDebugPanel,
    toggleDebugPanel,
  }), [
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
    openQuickOpen,
    closeQuickOpen,
    openMetricsDashboard,
    closeMetricsDashboard,
    toggleMetricsDashboard,
    openDebugPanel,
    closeDebugPanel,
    toggleDebugPanel,
  ]);

  // Combined value for backwards compatibility with useUI()
  const contextValue = useMemo(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  return (
    <UIActionsContext.Provider value={actionsValue}>
      <UIStateContext.Provider value={stateValue}>
        <UIContext.Provider value={contextValue}>
          {children}
        </UIContext.Provider>
      </UIStateContext.Provider>
    </UIActionsContext.Provider>
  );
};

/**
 * Hook to access only UI state (settingsOpen, shortcutsOpen, etc.)
 * Components using only state will re-render when state changes.
 */
export const useUIState = () => {
  const context = useContext(UIStateContext);
  if (context === undefined) {
    throw new Error('useUIState must be used within a UIProvider');
  }
  return context;
};

/**
 * Hook to access only UI actions (openSettings, closeSettings, etc.)
 * Components using only actions will NOT re-render when UI state changes.
 */
export const useUIActions = () => {
  const context = useContext(UIActionsContext);
  if (context === undefined) {
    throw new Error('useUIActions must be used within a UIProvider');
  }
  return context;
};

/**
 * Hook to access full UI context (state + actions) — backwards compatible.
 * Prefer useUIState/useUIActions for better performance.
 */
export const useUI = () => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};