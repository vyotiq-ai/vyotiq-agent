import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { AgentProvider } from './state/AgentProvider';
import { UIProvider } from './state/UIProvider';
import { WorkspaceContextProvider } from './state/WorkspaceContextProvider';
import { WorkspaceTabsProvider } from './state/WorkspaceTabsProvider';
import { EditorProvider } from './state/EditorProvider';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { ThemeProvider } from './utils/themeMode.tsx';
import { ensureMonacoEnvironment } from './features/editor/utils/monacoEnvironment';
import { applyAppearanceSettings } from './hooks/useAppearanceSettings';
import { DEFAULT_APPEARANCE_SETTINGS } from '../shared/types';
import '../index.css';
// KaTeX CSS for math rendering
import 'katex/dist/katex.min.css';

// Initialize Monaco environment before any editors are created
ensureMonacoEnvironment();

// Apply default appearance settings immediately (before React renders)
// This ensures animations are enabled from the start, avoiding flicker
applyAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS);

// Handle unhandled promise rejections from Monaco editor
// Monaco throws "Canceled" errors when disposed while async operations are pending
// (e.g., word highlighter, inline completions). These are expected and safe to ignore.
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (error instanceof Error && error.message === 'Canceled') {
    // Suppress Monaco's "Canceled" errors - they're expected during disposal
    event.preventDefault();
    return;
  }
  // Monaco diff worker errors - suppress "no diff result available" errors
  if (error instanceof Error && error.message === 'no diff result available') {
    event.preventDefault();
    return;
  }
  // Let other errors propagate normally for debugging
});

/**
 * Application Root
 * 
 * Provider hierarchy:
 * 1. ErrorBoundary - Catches rendering errors
 * 2. ThemeProvider - Light/dark mode with system preference detection
 * 3. AgentProvider - Agent state & AI session management
 * 4. WorkspaceContextProvider - File context awareness for agent
 * 5. EditorProvider - Code editor state management
 * 6. UIProvider - UI preferences (settings modal, shortcuts)
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultMode="dark">
        <AgentProvider>
          <WorkspaceContextProvider>
            <WorkspaceTabsProvider>
              <EditorProvider>
                <UIProvider>
                  <App />
                </UIProvider>
              </EditorProvider>
            </WorkspaceTabsProvider>
          </WorkspaceContextProvider>
        </AgentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
