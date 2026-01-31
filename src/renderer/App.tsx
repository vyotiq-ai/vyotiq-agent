import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Home } from './pages/Home';
import { useUI } from './state/UIProvider';
import { useAgentActions, useAgentSelector } from './state/AgentProvider';
import { useEditor } from './state/EditorProvider';
import { KeyboardShortcutsModal } from './components/ui/KeyboardShortcutsModal';
import { CommandPalette, CommandIcons, type CommandItem } from './components/ui/CommandPalette';
import { useFirstRun } from './hooks/useFirstRun';
import { useAppearanceSettings } from './hooks/useAppearanceSettings';
import { FeatureErrorBoundary } from './components/layout/ErrorBoundary';
import { Loader2, Code, Save, X } from 'lucide-react';

// Lazy load the Settings panel for better initial load performance
const SettingsPanel = lazy(() =>
  import('./features/settings').then(module => ({ default: module.SettingsPanel }))
);

// Lazy load the Browser panel
const BrowserPanel = lazy(() =>
  import('./features/browser/BrowserPanel').then(module => ({ default: module.default }))
);

// Lazy load the Undo History panel
const UndoHistoryPanel = lazy(() =>
  import('./features/undo/UndoHistoryPanel').then(module => ({ default: module.UndoHistoryPanel }))
);

// Lazy load the First Run Wizard
const FirstRunWizard = lazy(() =>
  import('./features/onboarding/FirstRunWizard').then(module => ({ default: module.FirstRunWizard }))
);

// Lazy load components
const MetricsDashboard = lazy(() =>
  import('./features/settings').then(module => ({ default: module.MetricsDashboard }))
);

const SettingsLoader: React.FC = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
      <Loader2 className="animate-spin" size={24} />
      <span className="text-xs font-medium">Loading settings...</span>
    </div>
  </div>
);

const BrowserLoader: React.FC = () => (
  <div className="h-full flex items-center justify-center bg-[var(--color-surface-base)]">
    <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
      <Loader2 className="animate-spin" size={16} />
      <span className="text-xs font-medium">Loading browser...</span>
    </div>
  </div>
);

const UndoHistoryLoader: React.FC = () => (
  <div className="fixed right-0 top-0 bottom-0 w-80 z-40 bg-[var(--color-surface-base)] border-l border-[var(--color-border-subtle)] flex items-center justify-center">
    <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
      <Loader2 className="animate-spin" size={16} />
      <span className="text-xs font-medium">Loading history...</span>
    </div>
  </div>
);

const MetricsLoader: React.FC = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
      <Loader2 className="animate-spin" size={24} />
      <span className="text-xs font-medium">Loading metrics...</span>
    </div>
  </div>
);

const App: React.FC = () => {
  const {
    settingsOpen,
    openSettings,
    closeSettings,
    shortcutsOpen,
    openShortcuts,
    closeShortcuts,
    browserPanelOpen,
    openBrowserPanel,
    closeBrowserPanel,
    browserPanelWidth,
    setBrowserPanelWidth,
    undoHistoryOpen,
    openUndoHistory,
    closeUndoHistory,
    commandPaletteOpen,
    closeCommandPalette,
    metricsDashboardOpen,
    openMetricsDashboard,
    closeMetricsDashboard,
  } = useUI();

  const actions = useAgentActions();
  const agentSnapshot = useAgentSelector(
    (s) => {
      const activeSession = s.activeSessionId ? s.sessions.find((x) => x.id === s.activeSessionId) : undefined;
      return {
        settings: s.settings,
        activeSessionId: s.activeSessionId,
        activeSessionStatus: activeSession?.status,
        activeRunId: activeSession?.activeRunId,
      };
    },
    (a, b) =>
      a.settings === b.settings &&
      a.activeSessionId === b.activeSessionId &&
      a.activeSessionStatus === b.activeSessionStatus &&
      a.activeRunId === b.activeRunId,
  );

  const {
    tabs,
    activeTabId,
    activeTab,
    isEditorVisible,
    saveFile,
    saveAllFiles,
    closeTab,
    closeAllTabs,
    toggleEditor,
    hasUnsavedChanges,
  } = useEditor();

  // First run detection
  const { isFirstRun, completeFirstRun } = useFirstRun();
  const [showWizard, setShowWizard] = useState(false);

  // Apply appearance settings from state
  useAppearanceSettings();

  // Show wizard on first run after settings are loaded
  useEffect(() => {
    if (isFirstRun && agentSnapshot.settings) {
      setShowWizard(true);
    }
  }, [isFirstRun, agentSnapshot.settings]);

  // Handle wizard completion
  const handleWizardComplete = useCallback(async (config: {
    apiKeys: Partial<Record<string, string>>;
    autonomousFlags: Partial<Record<string, boolean | number>>;
  }) => {
    try {
      // Save API keys via settings update
      if (Object.keys(config.apiKeys).length > 0) {
        const currentSettings = agentSnapshot.settings;
        if (currentSettings) {
          await window.vyotiq.settings.update({
            ...currentSettings,
            apiKeys: { ...currentSettings.apiKeys, ...config.apiKeys },
            autonomousFeatureFlags: {
              ...currentSettings.autonomousFeatureFlags,
              ...config.autonomousFlags,
            },
          });
        }
      }
      completeFirstRun();
      setShowWizard(false);
    } catch (error) {
      console.error('Failed to save wizard settings:', error);
      // Still close wizard on error - user can configure later
      completeFirstRun();
      setShowWizard(false);
    }
  }, [agentSnapshot.settings, completeFirstRun]);

  const handleWizardSkip = useCallback(() => {
    completeFirstRun();
    setShowWizard(false);
  }, [completeFirstRun]);

  const [isResizingBrowser, setIsResizingBrowser] = useState(false);

  // PERFORMANCE OPTIMIZATION: Split commands into stable and dynamic parts
  // Stable commands don't depend on frequently changing state
  const stableCommands = useMemo<CommandItem[]>(() => [
    // Navigation commands
    {
      id: 'focus-chat',
      label: 'Focus Chat Input',
      description: 'Jump to the message input',
      icon: CommandIcons.chat,
      shortcut: '/',
      category: 'Navigation',
      action: () => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
        input?.focus();
      },
    },
    // Workspace commands
    {
      id: 'add-workspace',
      label: 'Add Workspace',
      description: 'Open a folder as a workspace',
      icon: CommandIcons.folder,
      category: 'Workspace',
      action: () => void actions.openWorkspaceDialog(),
    },
    // Settings commands
    {
      id: 'open-settings',
      label: 'Open Settings',
      description: 'Configure application settings',
      icon: CommandIcons.settings,
      shortcut: 'Ctrl+,',
      category: 'Settings',
      action: openSettings,
    },
    {
      id: 'keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      icon: CommandIcons.shortcuts,
      shortcut: '?',
      category: 'Settings',
      action: openShortcuts,
    },
  ], [actions, openSettings, openShortcuts]);

  // Dynamic commands that depend on UI state
  const commands = useMemo<CommandItem[]>(() => [
    // Session commands
    {
      id: 'new-session',
      label: 'New Session',
      description: 'Start a new chat session',
      icon: CommandIcons.newSession,
      shortcut: 'Ctrl+N',
      category: 'Session',
      action: () => void actions.createSession(),
    },
    {
      id: 'clear-chat',
      label: 'Clear Current Chat',
      description: 'Delete the current session',
      icon: CommandIcons.clear,
      category: 'Session',
      action: () => {
        if (agentSnapshot.activeSessionId && confirm('Delete this session?')) {
          void actions.deleteSession(agentSnapshot.activeSessionId);
        }
      },
      disabled: !agentSnapshot.activeSessionId,
    },
    ...stableCommands,
    // Panel commands
    {
      id: 'toggle-browser',
      label: browserPanelOpen ? 'Close Browser' : 'Open Browser',
      description: 'Toggle the browser panel',
      icon: CommandIcons.browser,
      shortcut: 'Ctrl+Shift+B',
      category: 'Panels',
      action: browserPanelOpen ? closeBrowserPanel : openBrowserPanel,
    },
    {
      id: 'toggle-history',
      label: undoHistoryOpen ? 'Close Undo History' : 'Open Undo History',
      description: 'Toggle the undo history panel',
      icon: CommandIcons.history,
      shortcut: 'Ctrl+Shift+H',
      category: 'Panels',
      action: undoHistoryOpen ? closeUndoHistory : openUndoHistory,
    },

    {
      id: 'open-metrics',
      label: 'Open Metrics Dashboard',
      description: 'View agent metrics and performance data',
      icon: CommandIcons.settings,
      shortcut: 'Ctrl+Shift+I',
      category: 'Panels',
      action: openMetricsDashboard,
    },
    // Action commands
    {
      id: 'cancel-run',
      label: 'Stop Agent',
      description: 'Cancel the current agent run',
      icon: CommandIcons.yolo,
      shortcut: 'Esc',
      category: 'Actions',
      action: () => {
        if (agentSnapshot.activeSessionId) {
          void actions.cancelRun(agentSnapshot.activeSessionId);
        }
      },
      disabled: !agentSnapshot.activeSessionId || agentSnapshot.activeSessionStatus !== 'running',
    },
    {
      id: 'pause-run',
      label: 'Pause Agent',
      description: 'Pause the current agent run',
      icon: CommandIcons.history,
      category: 'Actions',
      action: () => {
        if (agentSnapshot.activeSessionId) {
          void actions.pauseRun(agentSnapshot.activeSessionId);
        }
      },
      disabled: !agentSnapshot.activeSessionId || agentSnapshot.activeSessionStatus !== 'running',
    },
    {
      id: 'resume-run',
      label: 'Resume Agent',
      description: 'Resume a paused agent run',
      icon: CommandIcons.yolo,
      category: 'Actions',
      action: () => {
        if (agentSnapshot.activeSessionId) {
          void actions.resumeRun(agentSnapshot.activeSessionId);
        }
      },
      disabled: !agentSnapshot.activeSessionId,
    },
    {
      id: 'regenerate',
      label: 'Regenerate Response',
      description: 'Regenerate the last assistant response',
      icon: CommandIcons.undo,
      category: 'Actions',
      action: () => {
        if (agentSnapshot.activeSessionId) {
          void actions.regenerate(agentSnapshot.activeSessionId);
        }
      },
      disabled: !agentSnapshot.activeSessionId,
    },
    // Editor commands
    {
      id: 'toggle-editor',
      label: isEditorVisible ? 'Hide Editor' : 'Show Editor',
      description: 'Toggle the code editor panel',
      icon: <Code size={14} />,
      shortcut: 'Ctrl+E',
      category: 'Editor',
      action: toggleEditor,
    },
    {
      id: 'save-file',
      label: 'Save File',
      description: 'Save the current file',
      icon: <Save size={14} />,
      shortcut: 'Ctrl+S',
      category: 'Editor',
      action: () => {
        if (activeTabId) {
          void saveFile(activeTabId);
        }
      },
      disabled: !activeTabId || !activeTab?.isDirty,
    },
    {
      id: 'save-all-files',
      label: 'Save All Files',
      description: 'Save all modified files',
      icon: <Save size={14} />,
      shortcut: 'Ctrl+Shift+S',
      category: 'Editor',
      action: () => void saveAllFiles(),
      disabled: !hasUnsavedChanges(),
    },
    {
      id: 'close-tab',
      label: 'Close Tab',
      description: 'Close the current editor tab',
      icon: <X size={14} />,
      shortcut: 'Ctrl+W',
      category: 'Editor',
      action: () => {
        if (activeTabId) {
          closeTab(activeTabId);
        }
      },
      disabled: !activeTabId,
    },
    {
      id: 'close-all-tabs',
      label: 'Close All Tabs',
      description: 'Close all editor tabs',
      icon: <X size={14} />,
      category: 'Editor',
      action: closeAllTabs,
      disabled: tabs.length === 0,
    },
  ], [
    stableCommands,
    agentSnapshot.activeSessionId,
    agentSnapshot.activeSessionStatus,
    browserPanelOpen,
    undoHistoryOpen,
    actions,
    openBrowserPanel,
    closeBrowserPanel,
    openUndoHistory,
    closeUndoHistory,
    openMetricsDashboard,
    // Editor dependencies
    isEditorVisible,
    activeTabId,
    activeTab?.isDirty,
    tabs.length,
    toggleEditor,
    saveFile,
    saveAllFiles,
    closeTab,
    closeAllTabs,
    hasUnsavedChanges,
  ]);

  const startBrowserResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingBrowser(true);
  }, []);

  useEffect(() => {
    if (!isResizingBrowser) return;

    const handleMouseMove = (e: MouseEvent) => {
      const minWidth = 320;
      const maxWidth = Math.min(900, Math.max(320, window.innerWidth - 240));
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, window.innerWidth - e.clientX));
      setBrowserPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingBrowser(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingBrowser, setBrowserPanelWidth]);

  return (
    <>
      <MainLayout onOpenSettings={openSettings}>
        <div className="flex flex-col h-full w-full">
          <div className="flex flex-1 min-h-0">
            {/* Main chat area */}
            <div className="flex-1 min-w-0 h-full">
              <Home />
            </div>
            {/* Browser panel on the right */}
            {browserPanelOpen && (
              <div
                className="relative flex-shrink-0 border-l border-[var(--color-border-subtle)] animate-slide-in-right"
                style={{ width: browserPanelWidth }}
              >
                {/* Resize handle */}
                <div
                  className={
                    'absolute left-0 top-0 bottom-0 w-1.5 -ml-1.5 cursor-col-resize z-30 group ' +
                    (isResizingBrowser ? 'bg-[var(--color-accent-primary)]/30' : 'hover:bg-[var(--color-accent-primary)]/20')
                  }
                  onMouseDown={startBrowserResize}
                  aria-label="Resize browser panel"
                  role="separator"
                  aria-orientation="vertical"
                />
                <Suspense fallback={<BrowserLoader />}>
                  <FeatureErrorBoundary featureName="Browser">
                    <BrowserPanel
                      isOpen={browserPanelOpen}
                      onClose={closeBrowserPanel}
                    />
                  </FeatureErrorBoundary>
                </Suspense>
              </div>
            )}
          </div>
        </div>
        {settingsOpen && (
          <Suspense fallback={<SettingsLoader />}>
            <FeatureErrorBoundary featureName="Settings">
              <SettingsPanel open={settingsOpen} onClose={closeSettings} />
            </FeatureErrorBoundary>
          </Suspense>
        )}
        {undoHistoryOpen && (
          <Suspense fallback={<UndoHistoryLoader />}>
            <FeatureErrorBoundary featureName="UndoHistory">
              <UndoHistoryPanel
                isOpen={undoHistoryOpen}
                onClose={closeUndoHistory}
                sessionId={agentSnapshot.activeSessionId}
              />
            </FeatureErrorBoundary>
          </Suspense>
        )}
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={closeShortcuts} />
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={closeCommandPalette}
          commands={commands}
        />
        {/* First Run Wizard */}
        {showWizard && (
          <Suspense fallback={<SettingsLoader />}>
            <FirstRunWizard
              onComplete={handleWizardComplete}
              onSkip={handleWizardSkip}
            />
          </Suspense>
        )}
      </MainLayout>
      {/* Metrics Dashboard Modal - rendered outside MainLayout to avoid overflow issues */}
      {metricsDashboardOpen && (
        <Suspense fallback={<MetricsLoader />}>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-scale-in"
            onClick={(e) => {
              // Close on backdrop click
              if (e.target === e.currentTarget) {
                closeMetricsDashboard();
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="metrics-dashboard-title"
          >
            <div className="relative w-full max-w-5xl max-h-[90vh] m-4 bg-[var(--color-surface-base)] rounded-lg border border-[var(--color-border-subtle)] shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-header)]">
                <span id="metrics-dashboard-title" className="text-xs font-medium text-[var(--color-text-primary)]">Metrics Dashboard</span>
                <button
                  onClick={closeMetricsDashboard}
                  className="p-1.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  aria-label="Close metrics dashboard"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-60px)]">
                <MetricsDashboard period="day" />
              </div>
            </div>
          </div>
        </Suspense>
      )}
    </>
  );
};

export default App;
