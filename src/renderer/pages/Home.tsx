/**
 * Home Page
 * 
 * Main workspace view with chat interface.
 * Shows workspace selection prompt when no workspace is active.
 */
import React, { useCallback, useState, useEffect, memo } from 'react';
import { ChatArea, ChatInput } from '../features/chat';
import { FeatureErrorBoundary } from '../components/layout/ErrorBoundary';
import { useWorkspaceState, useWorkspaceActions } from '../state/WorkspaceProvider';
import { cn } from '../utils/cn';
import { APP_VERSION } from '../utils/version';

// =============================================================================
// Animated typing text for terminal feel
// =============================================================================

const TypingText: React.FC<{ text: string; delay?: number }> = memo(({ text, delay = 0 }) => {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(startTimer);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length >= text.length) return;
    const timer = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, 18 + Math.random() * 12);
    return () => clearTimeout(timer);
  }, [started, displayed, text]);

  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-[5px] h-[11px] bg-[var(--color-accent-primary)] ml-px animate-blink align-middle" />
      )}
    </span>
  );
});
TypingText.displayName = 'TypingText';

// =============================================================================
// WorkspacePrompt – shown when no workspace is selected
// =============================================================================

const WorkspacePrompt: React.FC = () => {
  const { recentPaths } = useWorkspaceState();
  const { selectWorkspaceFolder, setWorkspacePath } = useWorkspaceActions();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  const handleRecent = useCallback(async (path: string) => {
    await setWorkspacePath(path);
  }, [setWorkspacePath]);

  const handleOpen = useCallback(async () => {
    await selectWorkspaceFolder();
  }, [selectWorkspaceFolder]);

  return (
    <div className="flex items-center justify-center h-full w-full bg-[var(--color-surface-base)] font-mono select-none">
      <div className={cn(
        'max-w-lg w-full mx-auto px-8 py-12 flex flex-col gap-0',
        'transition-opacity duration-500',
        ready ? 'opacity-100' : 'opacity-0'
      )}>
        {/* Terminal-style header block */}
        <div className="flex flex-col gap-3 mb-8">
          {/* Brand line */}
          <div className="flex items-center gap-2.5">
            <span className="text-[var(--color-accent-primary)] text-lg font-semibold leading-none opacity-90">λ</span>
            <span className="text-[13px] font-medium text-[var(--color-text-primary)] tracking-tight">
              Vyotiq AI
            </span>
            <span className="text-[9px] text-[var(--color-text-dim)] ml-1 tabular-nums">v{APP_VERSION}</span>
          </div>

          {/* Description as terminal output lines */}
          <div className="flex flex-col gap-0.5 pl-6">
            <span className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
              <TypingText text="Open a workspace folder to get started." delay={200} />
            </span>
            <span className="text-[10px] text-[var(--color-text-dim)] leading-relaxed">
              <TypingText text="The agent will index your codebase for intelligent code search," delay={1200} />
            </span>
            <span className="text-[10px] text-[var(--color-text-dim)] leading-relaxed">
              <TypingText text="navigation, and context-aware assistance." delay={2400} />
            </span>
          </div>

          {/* Status line */}
          <div className="flex items-center gap-3 pl-6 mt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-[5px] h-[5px] rounded-full bg-[var(--color-success)] shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
              <span className="text-[9px] text-[var(--color-success)]">ready</span>
            </div>
            <span className="text-[9px] text-[var(--color-text-dim)]">workspace: none</span>
            <span className="text-[9px] text-[var(--color-text-dim)]">session: idle</span>
          </div>
        </div>

        {/* Open folder action — styled as terminal command */}
        <button
          onClick={handleOpen}
          className={cn(
            'group flex items-center gap-2 w-full px-3 py-2.5',
            'bg-[var(--color-accent-primary)]/8 border border-[var(--color-accent-primary)]/20',
            'hover:bg-[var(--color-accent-primary)]/15 hover:border-[var(--color-accent-primary)]/40',
            'transition-all duration-150 rounded-sm',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50',
            'active:scale-[0.995]'
          )}
        >
          <span className="text-[var(--color-accent-primary)] text-xs font-medium opacity-80">λ</span>
          <span className="text-[11px] text-[var(--color-text-primary)] font-medium tracking-tight">
            Open Folder
          </span>
          <span className="ml-auto text-[9px] text-[var(--color-text-dim)] opacity-0 group-hover:opacity-100 transition-opacity">
            Ctrl+O
          </span>
        </button>

        {/* Recent workspaces — terminal list style */}
        {recentPaths.length > 0 && (
          <div className="flex flex-col mt-6">
            <div className="flex items-center gap-2 mb-2 pl-0.5">
              <span className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-widest">
                recent workspaces
              </span>
              <div className="flex-1 h-px bg-[var(--color-border-subtle)]" />
            </div>

            <div className="flex flex-col gap-px">
              {recentPaths.slice(0, 6).map((recentPath, index) => {
                const name = recentPath.split(/[/\\]/).pop() || recentPath;
                const isHovered = hoveredPath === recentPath;
                return (
                  <button
                    key={recentPath}
                    onClick={() => handleRecent(recentPath)}
                    onMouseEnter={() => setHoveredPath(recentPath)}
                    onMouseLeave={() => setHoveredPath(null)}
                    className={cn(
                      'group flex items-center gap-2.5 px-3 py-1.5 text-left rounded-sm',
                      'transition-all duration-100',
                      isHovered
                        ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent-primary)]'
                        : 'bg-transparent border-l-2 border-transparent',
                      'hover:bg-[var(--color-surface-2)]'
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <span className={cn(
                      'text-[10px] tabular-nums w-3 text-right shrink-0 transition-colors',
                      isHovered ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)]'
                    )}>
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1 flex items-baseline gap-2">
                      <span className={cn(
                        'text-[11px] font-medium truncate transition-colors',
                        isHovered ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-primary)]'
                      )}>
                        {name}
                      </span>
                      <span className="text-[9px] text-[var(--color-text-dim)] truncate hidden sm:inline">
                        {recentPath}
                      </span>
                    </div>
                    <span className={cn(
                      'text-[9px] shrink-0 transition-all duration-150',
                      isHovered ? 'text-[var(--color-accent-primary)] opacity-100' : 'text-[var(--color-text-dim)] opacity-0'
                    )}>
                      open
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom terminal cursor line */}
        <div className="flex items-center gap-2 mt-8 pl-0.5">
          <span className="text-[var(--color-accent-primary)] text-xs opacity-60">λ</span>
          <span className="inline-block w-[6px] h-[12px] bg-[var(--color-accent-primary)]/70 animate-blink" />
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Home Page
// =============================================================================

export const Home: React.FC = () => {
  const { workspacePath, isLoading } = useWorkspaceState();

  // Show loading placeholder briefly — terminal style
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[var(--color-surface-base)] font-mono">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-accent-primary)] text-sm opacity-60">λ</span>
          <span className="text-[10px] text-[var(--color-text-dim)]">loading</span>
        </div>
      </div>
    );
  }

  // Show workspace prompt when no workspace is selected
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
