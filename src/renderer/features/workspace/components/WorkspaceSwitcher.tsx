/**
 * WorkspaceSwitcher Component
 *
 * Dropdown to switch between recent workspaces and open new ones.
 * Integrates with the WorkspaceProvider for state management.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  X,
} from 'lucide-react';
import { useWorkspace } from '../../../state/WorkspaceProvider';
import { cn } from '../../../utils/cn';

export const WorkspaceSwitcher: React.FC = () => {
  const { workspacePath, workspaceName, recentPaths, selectWorkspaceFolder, setWorkspacePath } =
    useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSelect = useCallback(
    async (path: string) => {
      await setWorkspacePath(path);
      setIsOpen(false);
    },
    [setWorkspacePath],
  );

  const handleOpenNew = useCallback(async () => {
    await selectWorkspaceFolder();
    setIsOpen(false);
  }, [selectWorkspaceFolder]);

  // Derive short name from path
  const getShortName = (p: string) => p.split(/[/\\]/).pop() || p;

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] font-mono transition-colors max-w-[200px] no-drag',
          'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
          'hover:bg-[var(--color-surface-2)]',
          isOpen && 'bg-[var(--color-surface-2)] text-[var(--color-text-primary)]',
        )}
        type="button"
      >
        <span className="text-[var(--color-accent-primary)] shrink-0">λ</span>
        <span className="truncate">{workspaceName}</span>
        <span className={cn('text-[9px] text-[var(--color-text-dim)] shrink-0 transition-transform', isOpen && 'rotate-180')}>▾</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[260px] max-w-[360px] bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-sm shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 font-mono">
          {/* Current workspace */}
          {workspacePath && (
            <div className="px-3 py-2 border-b border-[var(--color-border-subtle)]">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-widest">
                  active
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] rounded-sm transition-colors"
                  title="Close"
                >
                  <X size={10} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-accent-primary)] shrink-0">λ</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-medium text-[var(--color-text-primary)] truncate">
                    {workspaceName}
                  </div>
                  <div className="text-[9px] text-[var(--color-text-dim)] truncate">
                    {workspacePath}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Recent workspaces */}
          {recentPaths.length > 0 && (
            <div className="py-1">
              <div className="px-3 py-1 text-[9px] text-[var(--color-text-dim)] uppercase tracking-widest">
                recent
              </div>
              {recentPaths
                .filter((p: string) => p !== workspacePath)
                .slice(0, 8)
                .map((path: string, idx: number) => (
                  <button
                    key={path}
                    onClick={() => handleSelect(path)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-3)] transition-colors group"
                  >
                    <span className="text-[9px] text-[var(--color-text-dim)] w-3 text-right shrink-0 tabular-nums">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-[var(--color-text-primary)] truncate group-hover:text-[var(--color-accent-primary)] transition-colors">
                        {getShortName(path)}
                      </div>
                      <div className="text-[9px] text-[var(--color-text-dim)] truncate">
                        {path}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          )}

          {/* Open folder action */}
          <div className="border-t border-[var(--color-border-subtle)] p-1">
            <button
              onClick={handleOpenNew}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-sm text-[10px] text-[var(--color-accent-primary)] hover:bg-[var(--color-surface-3)] transition-colors"
            >
              <span className="text-[var(--color-accent-primary)]">+</span>
              open folder
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
