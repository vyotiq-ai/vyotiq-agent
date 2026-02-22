/**
 * Home Page
 * 
 * Main workspace view with chat interface.
 * Shows a clean workspace selection prompt when no workspace is active.
 */
import React, { useCallback, useState, useEffect } from 'react';
import { ChatArea, ChatInput } from '../features/chat';
import { FeatureErrorBoundary } from '../components/layout/ErrorBoundary';
import { useWorkspaceState, useWorkspaceActions } from '../state/WorkspaceProvider';
import { cn } from '../utils/cn';

// =============================================================================
// WorkspacePrompt – shown when no workspace is selected
// =============================================================================

const WorkspacePrompt: React.FC = () => {
  const { recentPaths } = useWorkspaceState();
  const { selectWorkspaceFolder, setWorkspacePath } = useWorkspaceActions();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Keyboard shortcut: Ctrl+O to open folder
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        selectWorkspaceFolder();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectWorkspaceFolder]);

  const handleRecent = useCallback(async (path: string) => {
    await setWorkspacePath(path);
  }, [setWorkspacePath]);

  const handleOpen = useCallback(async () => {
    await selectWorkspaceFolder();
  }, [selectWorkspaceFolder]);

  return (
    <div className="flex items-center justify-center h-full w-full bg-[var(--color-surface-base)] font-mono select-none">
      <div className={cn(
        'max-w-md w-full mx-auto px-8 flex flex-col gap-0',
        'transition-all duration-500 ease-out',
        ready ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}>
        {/* Centered brand mark */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <span className="text-3xl font-bold leading-none text-[var(--color-accent-primary)] opacity-25" aria-hidden="true">
            λ
          </span>
          <span className="text-[11px] text-[var(--color-text-tertiary)] tracking-wide">
            open a workspace to get started
          </span>
        </div>

        {/* Open folder action */}
        <button
          onClick={handleOpen}
          className={cn(
            'group flex items-center justify-center gap-2 w-full px-4 py-3',
            'bg-[var(--color-accent-primary)]/8 border border-[var(--color-accent-primary)]/20',
            'hover:bg-[var(--color-accent-primary)]/14 hover:border-[var(--color-accent-primary)]/35',
            'transition-all duration-200 rounded-sm',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
            'active:scale-[0.995]'
          )}
        >
          <span className="text-[11px] text-[var(--color-text-primary)] font-medium tracking-tight">
            open folder
          </span>
          <span className="text-[9px] text-[var(--color-text-dim)] opacity-0 group-hover:opacity-60 transition-opacity duration-200 ml-2">
            ctrl+o
          </span>
        </button>

        {/* Recent workspaces */}
        {recentPaths.length > 0 && (
          <div className="flex flex-col mt-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-widest font-medium opacity-50">
                recent
              </span>
              <div className="flex-1 h-px bg-[var(--color-border-subtle)]/40" />
            </div>

            <div className="flex flex-col gap-px">
              {recentPaths.slice(0, 5).map((recentPath) => {
                const name = recentPath.split(/[/\\]/).pop() || recentPath;
                const isHovered = hoveredPath === recentPath;
                return (
                  <button
                    key={recentPath}
                    onClick={() => handleRecent(recentPath)}
                    onMouseEnter={() => setHoveredPath(recentPath)}
                    onMouseLeave={() => setHoveredPath(null)}
                    className={cn(
                      'group flex items-center gap-3 px-3 py-2 text-left rounded-sm',
                      'transition-all duration-150',
                      isHovered
                        ? 'bg-[var(--color-surface-2)]'
                        : 'bg-transparent',
                    )}
                  >
                    <div className="min-w-0 flex-1 flex items-baseline gap-2">
                      <span className={cn(
                        'text-[11px] font-medium truncate transition-colors duration-150',
                        isHovered ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-secondary)]'
                      )}>
                        {name}
                      </span>
                      <span className="text-[9px] text-[var(--color-text-dim)] truncate opacity-40 hidden sm:inline">
                        {recentPath}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Home Page
// =============================================================================

export const Home: React.FC = () => {
  const { workspacePath, isLoading } = useWorkspaceState();

  // Brief loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[var(--color-surface-base)] font-mono">
        <span className="text-2xl font-bold leading-none text-[var(--color-accent-primary)] opacity-15 animate-pulse">
          λ
        </span>
      </div>
    );
  }

  // Workspace selection prompt
  if (!workspacePath) {
    return <WorkspacePrompt />;
  }

  return (
    <div 
      id="home-split-container"
      className="flex flex-col h-full w-full min-h-0 min-w-0 overflow-hidden"
    >
      {/* Chat panel - full width */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden w-full">
        <FeatureErrorBoundary featureName="Chat">
          <ChatArea />
        </FeatureErrorBoundary>
        <div className="shrink-0 bg-[var(--color-surface-base)]">
          <FeatureErrorBoundary featureName="ChatInput">
            <ChatInput />
          </FeatureErrorBoundary>
        </div>
      </div>
    </div>
  );
};
