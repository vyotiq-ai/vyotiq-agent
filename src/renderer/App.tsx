import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { Home } from './pages/Home';
import { useUIState, useUIActions } from './state/UIProvider';
import { useAgentActions, useAgentSelector } from './state/AgentProvider';
import { KeyboardShortcutsModal } from './components/ui/KeyboardShortcutsModal';
import { CommandPalette, CommandIcons, type CommandItem } from './components/ui/CommandPalette';
import { QuickOpen } from './components/ui/QuickOpen';
import { openFileInEditor } from './features/editor/components/EditorPanel';
import { useConfirm } from './components/ui/ConfirmModal';
import { useFirstRun } from './hooks/useFirstRun';
import { useAppearanceSettings } from './hooks/useAppearanceSettings';
import { FeatureErrorBoundary } from './components/layout/ErrorBoundary';
import { SettingsPanel, MetricsDashboard } from './features/settings';
import { useProfilerKeyboard } from './utils/profiler';
import BrowserPanel from './features/browser/BrowserPanel';
import { UndoHistoryPanel } from './features/undo/UndoHistoryPanel';
import { DebugPanel } from './features/debugging/DebugPanel';
import { FirstRunWizard } from './features/onboarding/FirstRunWizard';
import { ConnectedLoadingIndicator } from './components/ui/LoadingState';
import { createLogger } from './utils/logger';
import { useToast } from './components/ui/Toast';

// Browser panel resize constraints
const BROWSER_PANEL_MIN_WIDTH = 320;
const BROWSER_PANEL_MAX_WIDTH = 900;
const BROWSER_PANEL_CHAT_MIN_WIDTH = 240;

const logger = createLogger('App');

const App: React.FC = () => {
  const {
    settingsOpen,
    shortcutsOpen,
    browserPanelOpen,
    browserPanelWidth,
    undoHistoryOpen,
    commandPaletteOpen,
    quickOpenOpen,
    metricsDashboardOpen,
    debugPanelOpen,
  } = useUIState();

  const {
    openSettings,
    closeSettings,
    openShortcuts,
    closeShortcuts,
    openBrowserPanel,
    closeBrowserPanel,
    setBrowserPanelWidth,
    openUndoHistory,
    closeUndoHistory,
    closeCommandPalette,
    openMetricsDashboard,
    closeMetricsDashboard,
    openQuickOpen,
    closeQuickOpen,
    closeDebugPanel: _closeDebugPanel,
    toggleDebugPanel,
  } = useUIActions();

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

  // First run detection
  const { isFirstRun, completeFirstRun } = useFirstRun();
  const [showWizard, setShowWizard] = useState(false);

  // Confirmation dialog hook
  const { confirm, ConfirmDialog } = useConfirm();

  // Apply appearance settings from state
  useAppearanceSettings();

  // Register dev-only profiler keyboard shortcut (Ctrl+Shift+P)
  useProfilerKeyboard();

  // ---- Agent notification handler ----
  // Listen for important agent events and surface them as toasts so the user
  // is aware of recovery escalations, compliance violations, and other
  // notifications without having to monitor the chat area.
  const { toast } = useToast();

  useEffect(() => {
    if (!window.vyotiq?.agent) return;

    const unsubscribe = window.vyotiq.agent.onEvent((event) => {
      const evt = event as Record<string, unknown>;
      switch (evt.type) {
        case 'recovery-escalation': {
          const msg = (evt as { message?: string }).message ?? 'Recovery escalation triggered';
          toast({ type: 'warning', message: msg });
          break;
        }
        case 'user-notification': {
          const notif = evt as { level?: string; message?: string };
          const toastType = notif.level === 'error' ? 'error' : notif.level === 'warning' ? 'warning' : 'info';
          toast({ type: toastType as 'error' | 'warning' | 'info', message: notif.message ?? 'Notification from agent' });
          break;
        }
        case 'compliance-violation': {
          toast({ type: 'error', message: `Compliance violation: ${(evt as { reason?: string }).reason ?? 'unknown'}` });
          break;
        }
        default:
          break;
      }
    });

    return () => { unsubscribe?.(); };
  }, [toast]);

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
      logger.error('Failed to save wizard settings:', { error: error instanceof Error ? error.message : String(error) });
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
    {
      id: 'quick-open',
      label: 'Quick Open File',
      description: 'Search and open a file by name',
      icon: CommandIcons.file,
      shortcut: 'Ctrl+P',
      category: 'Navigation',
      action: openQuickOpen,
    },
  ], [openSettings, openShortcuts, openQuickOpen]);

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
      action: async () => {
        if (agentSnapshot.activeSessionId) {
          const confirmed = await confirm({
            title: 'Delete Session',
            message: 'Are you sure you want to delete this session? This action cannot be undone.',
            confirmLabel: 'Delete',
            variant: 'destructive',
          });
          if (confirmed) {
            void actions.deleteSession(agentSnapshot.activeSessionId);
          }
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
    {
      id: 'toggle-debug-panel',
      label: 'Toggle Debug Panel',
      description: 'Open trace viewer, breakpoints, and state inspector',
      icon: CommandIcons.settings,
      shortcut: 'Ctrl+Shift+D',
      category: 'Panels',
      action: toggleDebugPanel,
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
    toggleDebugPanel,
    confirm,
  ]);

  const startBrowserResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingBrowser(true);
  }, []);

  useEffect(() => {
    if (!isResizingBrowser) return;

    const handleMouseMove = (e: MouseEvent) => {
      const maxWidth = Math.min(BROWSER_PANEL_MAX_WIDTH, Math.max(BROWSER_PANEL_MIN_WIDTH, window.innerWidth - BROWSER_PANEL_CHAT_MIN_WIDTH));
      const nextWidth = Math.max(BROWSER_PANEL_MIN_WIDTH, Math.min(maxWidth, window.innerWidth - e.clientX));
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
                <FeatureErrorBoundary featureName="Browser">
                    <BrowserPanel
                      isOpen={browserPanelOpen}
                      onClose={closeBrowserPanel}
                    />
                </FeatureErrorBoundary>
              </div>
            )}
          </div>
        </div>
        {settingsOpen && (
          <FeatureErrorBoundary featureName="Settings">
              <SettingsPanel open={settingsOpen} onClose={closeSettings} />
          </FeatureErrorBoundary>
        )}
        {undoHistoryOpen && (
          <FeatureErrorBoundary featureName="UndoHistory">
              <UndoHistoryPanel
                isOpen={undoHistoryOpen}
                onClose={closeUndoHistory}
                sessionId={agentSnapshot.activeSessionId}
              />
          </FeatureErrorBoundary>
        )}
        {debugPanelOpen && (
          <FeatureErrorBoundary featureName="DebugPanel">
            <DebugPanel
              sessionId={agentSnapshot.activeSessionId ?? undefined}
              runId={agentSnapshot.activeRunId ?? undefined}
              isRunning={agentSnapshot.activeSessionStatus === 'running'}
              className="fixed right-0 top-[32px] bottom-0 w-[400px] z-50 bg-[var(--color-surface-base)] border-l border-[var(--color-border-subtle)] shadow-xl"
            />
          </FeatureErrorBoundary>
        )}
        <FeatureErrorBoundary featureName="Shortcuts">
          <KeyboardShortcutsModal open={shortcutsOpen} onClose={closeShortcuts} />
        </FeatureErrorBoundary>
        <FeatureErrorBoundary featureName="CommandPalette">
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={closeCommandPalette}
            commands={commands}
          />
        </FeatureErrorBoundary>
        <FeatureErrorBoundary featureName="QuickOpen">
          <QuickOpen
            isOpen={quickOpenOpen}
            onClose={closeQuickOpen}
            onFileSelect={(filePath) => {
              openFileInEditor(filePath);
            }}
          />
        </FeatureErrorBoundary>
        {/* First Run Wizard */}
        {showWizard && (
          <FeatureErrorBoundary featureName="FirstRunWizard">
            <FirstRunWizard
              onComplete={handleWizardComplete}
              onSkip={handleWizardSkip}
            />
          </FeatureErrorBoundary>
        )}
      </MainLayout>
      {/* Metrics Dashboard Modal - rendered outside MainLayout to avoid overflow issues */}
      {metricsDashboardOpen && (
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
              <FeatureErrorBoundary featureName="MetricsDashboard">
                  <MetricsDashboard period="day" />
              </FeatureErrorBoundary>
            </div>
          </div>
        </div>
      )}
      {/* Global loading indicator — reads from LoadingProvider for app-wide loading states */}
      <ConnectedLoadingIndicator position="top" variant="bar" />
      {/* Confirmation dialog rendered at root level */}
      <ConfirmDialog />
    </>
  );
};

export default App;
