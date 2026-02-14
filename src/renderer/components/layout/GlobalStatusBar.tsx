/**
 * Global Status Bar
 * 
 * Persistent bottom status bar showing workspace info, git branch,
 * connection status, and quick indicators.
 * Follows the terminal-style design language of the application.
 */

import React, { memo, useEffect, useState } from 'react';
import { GitBranch, Circle, Wifi, WifiOff } from 'lucide-react';
import { cn } from '../../utils/cn';
import { createLogger } from '../../utils/logger';
import { useWorkspaceState } from '../../state/WorkspaceProvider';

const logger = createLogger('GlobalStatusBar');

// =============================================================================
// Types
// =============================================================================

interface GitInfo {
  branch: string;
  isDirty: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const GlobalStatusBar: React.FC = memo(() => {
  const { workspacePath } = useWorkspaceState();
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  // Fetch git branch info when workspace changes
  useEffect(() => {
    if (!workspacePath) {
      setGitInfo(null);
      return;
    }

    const fetchGitInfo = async () => {
      try {
        const branch = await window.vyotiq?.git?.currentBranch?.();
        // Fetch actual dirty state from git status
        let isDirty = false;
        try {
          const status = await window.vyotiq?.git?.status?.();
          if (status && typeof status === 'object' && !('error' in status)) {
            // GitRepoStatus has staged/unstaged/untracked as GitFileChange[]
            const s = status as { isClean?: boolean; staged?: { length: number }; unstaged?: { length: number }; untracked?: { length: number } };
            isDirty = s.isClean === false || (
              (s.staged?.length ?? 0) > 0 ||
              (s.unstaged?.length ?? 0) > 0 ||
              (s.untracked?.length ?? 0) > 0
            );
          }
        } catch (err) {
          logger.debug('Git status not available', { error: err instanceof Error ? err.message : String(err) });
        }
        if (branch && typeof branch === 'string') {
          setGitInfo({ branch, isDirty });
        } else if (branch && typeof branch === 'object' && !('error' in branch)) {
          setGitInfo({ branch: String(branch), isDirty });
        }
      } catch (err) {
        logger.debug('Git info not available', { error: err instanceof Error ? err.message : String(err) });
        setGitInfo(null);
      }
    };

    fetchGitInfo();

    // Poll for git changes periodically since git-specific events
    // may not be part of the renderer event system
    const pollInterval = setInterval(fetchGitInfo, 15000);

    // Also listen for any agent events that may indicate file changes
    const unsubscribe = window.vyotiq?.agent?.onEvent?.((event) => {
      if (
        event.type === 'file-changed' || 
        event.type === 'tool-result' ||
        event.type === 'run-status'
      ) {
        fetchGitInfo();
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsubscribe?.();
    };
  }, [workspacePath]);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsConnected(navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const workspaceName = workspacePath
    ? workspacePath.split(/[/\\]/).pop() ?? workspacePath
    : '';

  return (
    <div
      className={cn(
        'flex items-center justify-between px-2 py-0',
        'h-[22px] min-h-[22px] max-h-[22px]',
        'bg-[var(--color-surface-header)] border-t border-[var(--color-border-subtle)]/40',
        'text-[9px] font-mono text-[var(--color-text-dim)]',
        'select-none'
      )}
      role="status"
      aria-label="Status bar"
    >
      {/* Left section: workspace + git */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {workspaceName && (
          <span
            className="truncate max-w-[200px] text-[var(--color-text-muted)]"
            title={workspacePath}
          >
            {workspaceName}
          </span>
        )}

        {gitInfo && (
          <div className="flex items-center gap-1 text-[var(--color-text-dim)]">
            <GitBranch size={10} className="flex-shrink-0" />
            <span className="truncate max-w-[120px]">{gitInfo.branch}</span>
            {gitInfo.isDirty && (
              <Circle size={5} className="fill-[var(--color-warning)] text-[var(--color-warning)] flex-shrink-0" />
            )}
          </div>
        )}
      </div>

      {/* Right section: connection + indicators */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div
          className={cn(
            'flex items-center gap-1',
            isConnected ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-warning)]'
          )}
          title={isConnected ? 'Connected' : 'Offline'}
        >
          {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
        </div>
        <span className="text-[var(--color-text-dim)] opacity-50">vyotiq</span>
      </div>
    </div>
  );
});

GlobalStatusBar.displayName = 'GlobalStatusBar';
