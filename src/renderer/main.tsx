import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { AgentProvider } from './state/AgentProvider';
import { UIProvider } from './state/UIProvider';
import { WorkspaceContextProvider } from './state/WorkspaceContextProvider';
import { EditorProvider } from './state/EditorProvider';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { ThemeProvider } from './utils/themeMode.tsx';
import '../index.css';
// KaTeX CSS for math rendering
import 'katex/dist/katex.min.css';

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
            <EditorProvider>
              <UIProvider>
                <App />
              </UIProvider>
            </EditorProvider>
          </WorkspaceContextProvider>
        </AgentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
