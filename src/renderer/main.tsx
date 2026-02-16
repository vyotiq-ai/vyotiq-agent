import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { AgentProvider } from './state/AgentProvider';
import { UIProvider } from './state/UIProvider';
import { WorkspaceProvider } from './state/WorkspaceProvider';
import { RustBackendProvider } from './state/RustBackendProvider';
import { LoadingProvider } from './state/LoadingProvider';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { ThemeProvider } from './utils/themeMode.tsx';
import { ToastProvider } from './components/ui/Toast';
import { applyAppearanceSettings } from './hooks/useAppearanceSettings';
import { DEFAULT_APPEARANCE_SETTINGS } from '../shared/types';
import '../index.css';
// KaTeX CSS for math rendering
import 'katex/dist/katex.min.css';
import { createLogger } from './utils/logger';
import { captureComponentError } from './utils/telemetry';

const logger = createLogger('Renderer');

// ---- Global error handlers for renderer ------------------------------------
// Forward critical errors to the main process logger for persistent storage.
// These catch errors that escape React error boundaries (async errors, event
// handler errors, third-party library errors, etc.)
// NOTE: This is the single authoritative set of global handlers — the
// telemetry module delegates here instead of installing its own listeners.
window.addEventListener('error', (event) => {
  const message = event.error?.stack ?? event.message ?? 'Unknown error';
  try {
    window.vyotiq?.log?.report('error', `[Renderer] Uncaught error: ${event.message}`, {
      stack: event.error?.stack,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  } catch {
    // IPC bridge not ready yet — fall through to console
  }
  // Route to telemetry service (best-effort)
  try {
    captureComponentError(event.error || new Error(event.message), { action: 'uncaught-error' }, 'window');
  } catch { /* telemetry not ready */ }
  logger.error('Uncaught renderer error', { message, stack: event.error?.stack, filename: event.filename });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error
    ? event.reason.stack ?? event.reason.message
    : String(event.reason);
  try {
    window.vyotiq?.log?.report('error', `[Renderer] Unhandled promise rejection: ${reason}`, {
      reason,
    });
  } catch {
    // IPC bridge not ready yet
  }
  // Route to telemetry service (best-effort)
  try {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    captureComponentError(error, { action: 'unhandled-rejection' }, 'window');
  } catch { /* telemetry not ready */ }
  logger.error('Unhandled rejection', { reason });
});

// Apply default appearance settings immediately (before React renders)
// This ensures animations are enabled from the start, avoiding flicker
applyAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS);

/**
 * Application Root
 * 
 * Provider hierarchy:
 * 1. ErrorBoundary - Catches rendering errors
 * 2. ThemeProvider - Light/dark mode with system preference detection
 * 3. AgentProvider - Agent state & AI session management
 * 4. UIProvider - UI preferences (settings modal, shortcuts)
 * 5. LoadingProvider - Centralized loading state management
 * 6. ToastProvider - Global toast notifications
 * 7. WorkspaceProvider - Workspace path, recent paths, folder selection
 * 8. RustBackendProvider - Rust sidecar connection and real-time events
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultMode="dark">
        <AgentProvider>
            <UIProvider>
              <LoadingProvider>
                <ToastProvider>
                <WorkspaceProvider>
                  <RustBackendProvider>
                    <App />
                  </RustBackendProvider>
                </WorkspaceProvider>
                </ToastProvider>
              </LoadingProvider>
            </UIProvider>
        </AgentProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
