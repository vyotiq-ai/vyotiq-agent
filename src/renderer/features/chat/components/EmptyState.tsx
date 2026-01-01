/**
 * Empty State Component
 * 
 * Displays a placeholder when no session is active. Uses pure terminal/CLI styling.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { cn } from '../../../utils/cn';
import { useWorkspaceList } from '../../../hooks/useWorkspaceList';
import { useAgentStatus } from '../../../hooks/useAgentStatus';
import { getContextualHint, SESSION_HINTS } from '../utils/welcomeHints';

export const EmptyState: React.FC = () => {
  const [showCursor, setShowCursor] = useState(true);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const { activeWorkspace, workspaces } = useWorkspaceList();
  const { activeSessionId, status, isWorking } = useAgentStatus();
  const typewriterRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cursor blink effect
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(v => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  // Compute workspace status
  const workspaceStatus = useMemo(() => {
    if (activeWorkspace) {
      const name = activeWorkspace.label || activeWorkspace.path?.split(/[/\\]/).pop() || 'unnamed';
      return { text: name, color: 'text-[var(--color-success)]' };
    }
    if (workspaces.length > 0) {
      return { text: 'not selected', color: 'text-[var(--color-warning)]' };
    }
    return { text: 'none', color: 'text-[var(--color-text-muted)]' };
  }, [activeWorkspace, workspaces.length]);

  // Compute session status
  const sessionStatus = useMemo(() => {
    if (activeSessionId) {
      return { text: 'active', color: 'text-[var(--color-success)]' };
    }
    return { text: 'none', color: 'text-[var(--color-warning)]' };
  }, [activeSessionId]);

  // Compute overall status
  const overallStatus = useMemo(() => {
    if (isWorking) {
      return { text: 'working', color: 'text-[var(--color-accent-primary)]' };
    }
    if (status === 'awaiting-confirmation') {
      return { text: 'awaiting', color: 'text-[var(--color-warning)]' };
    }
    if (status === 'error') {
      return { text: 'error', color: 'text-[var(--color-error)]' };
    }
    if (activeWorkspace && activeSessionId) {
      return { text: 'ready', color: 'text-[var(--color-info)]' };
    }
    if (activeWorkspace) {
      return { text: 'ready', color: 'text-[var(--color-info)]' };
    }
    return { text: 'waiting', color: 'text-[var(--color-text-muted)]' };
  }, [isWorking, status, activeWorkspace, activeSessionId]);

  // Get contextual hint based on state
  const getHintForState = useCallback(() => {
    return getContextualHint(!!activeWorkspace, !!activeSessionId, hintIndex);
  }, [activeWorkspace, activeSessionId, hintIndex]);

  const currentHint = getHintForState();
  const totalHints = SESSION_HINTS.length;

  // Typewriter effect with delete and cycle
  useEffect(() => {
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
    }

    const tick = () => {
      if (isDeleting) {
        // Deleting characters
        if (displayedText.length > 0) {
          setDisplayedText(prev => prev.slice(0, -1));
          typewriterRef.current = setTimeout(tick, 25);
        } else {
          // Done deleting, move to next hint
          setIsDeleting(false);
          if (activeWorkspace && activeSessionId) {
            setHintIndex(prev => prev + 1);
          }
          typewriterRef.current = setTimeout(tick, 200);
        }
      } else {
        // Typing characters
        if (displayedText.length < currentHint.length) {
          setDisplayedText(currentHint.slice(0, displayedText.length + 1));
          typewriterRef.current = setTimeout(tick, 40 + Math.random() * 40);
        } else {
          // Done typing, wait then delete (only if cycling through hints)
          if (activeWorkspace && activeSessionId) {
            typewriterRef.current = setTimeout(() => {
              setIsDeleting(true);
              tick();
            }, 3000);
          }
        }
      }
    };

    typewriterRef.current = setTimeout(tick, 150);

    return () => {
      if (typewriterRef.current) {
        clearTimeout(typewriterRef.current);
      }
    };
  }, [displayedText, isDeleting, currentHint, activeWorkspace, activeSessionId]);

  // Reset when state changes
  useEffect(() => {
    setDisplayedText('');
    setIsDeleting(false);
  }, [activeWorkspace?.id, activeSessionId]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full bg-[var(--color-surface-base)] font-mono">
      <div className="text-left space-y-4 max-w-md px-4">
        {/* Lambda brand mark */}
        <div className="flex items-center mb-1">
          <span className="text-[var(--color-accent-primary)] text-2xl font-medium leading-none opacity-80">λ</span>
        </div>

        {/* Status display */}
        <div className="text-[11px] space-y-2 p-3 bg-[var(--color-surface-1)]/50 rounded-lg border border-[var(--color-border-subtle)]">
          <div className="text-[var(--color-text-placeholder)] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-text-muted)] w-16">workspace</span>
              <span className={workspaceStatus.color}>{workspaceStatus.text}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-text-muted)] w-16">session</span>
              <span className={sessionStatus.color}>{sessionStatus.text}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-text-muted)] w-16">status</span>
              <span className={overallStatus.color}>{overallStatus.text}</span>
            </div>
          </div>
        </div>

        {/* Command prompt with typewriter effect */}
        <div className="flex items-center gap-1.5 text-[12px] py-3">
          <span className="text-[var(--color-text-secondary)] min-h-[1.2em]">{displayedText}</span>
          <span className={cn(
            "w-[8px] h-[16px] bg-[var(--color-accent-primary)] rounded-[1px]",
            showCursor ? 'opacity-100' : 'opacity-30'
          )} />
          {/* Show hint progress when there are multiple hints */}
          {activeWorkspace && activeSessionId && totalHints > 1 && (
            <span className="ml-2 text-[8px] text-[var(--color-text-dim)]">
              {(hintIndex % totalHints) + 1}/{totalHints}
            </span>
          )}
        </div>
        
        {/* Keyboard shortcuts hint */}
        <div className="text-[9px] text-[var(--color-text-dim)] pt-2 border-t border-[var(--color-border-subtle)]">
          <span>press </span>
          <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded text-[var(--color-text-muted)]">?</kbd>
          <span> for keyboard shortcuts</span>
        </div>
      </div>
    </div>
  );
};
