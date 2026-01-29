/**
 * Branch Navigation Component
 * 
 * Shows conversation branches and allows switching between them.
 * Displays a compact branch indicator when viewing a non-main branch.
 */
import React, { memo, useState, useCallback } from 'react';
import { GitBranch, ChevronDown, Plus, Trash2, Check } from 'lucide-react';
import { cn } from '../../../utils/cn';
import type { ConversationBranch } from '../../../../shared/types';

interface BranchNavigationProps {
  branches: ConversationBranch[];
  activeBranchId: string | null;
  onSwitchBranch: (branchId: string | null) => void;
  onCreateBranch?: (name: string, forkPointMessageId: string) => void;
  onDeleteBranch?: (branchId: string) => void;
}

export const BranchNavigation: React.FC<BranchNavigationProps> = memo(({
  branches,
  activeBranchId,
  onSwitchBranch,
  onDeleteBranch,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Get the active branch info
  const activeBranch = activeBranchId 
    ? branches.find(b => b.id === activeBranchId) 
    : null;

  const handleSwitchBranch = useCallback((branchId: string | null) => {
    onSwitchBranch(branchId);
    setIsOpen(false);
  }, [onSwitchBranch]);

  // Don't show if there are no branches (only main)
  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="relative inline-block">
      {/* Branch indicator button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono',
          'transition-all duration-200',
          activeBranch
            ? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)] border border-[var(--color-accent-primary)]/20'
            : 'bg-[var(--color-surface-1)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]',
          'hover:bg-[var(--color-surface-2)]',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
        )}
      >
        <GitBranch size={10} />
        <span>{activeBranch?.name || 'main'}</span>
        <ChevronDown size={10} className={cn('transition-transform', isOpen && 'rotate-180')} />
        {branches.length > 0 && (
          <span className="px-1 py-0.5 bg-[var(--color-surface-2)] rounded text-[8px]">
            {branches.length + 1}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className={cn(
            'absolute top-full left-0 mt-1 z-50',
            'min-w-[200px] py-1',
            'bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]',
            'rounded shadow-lg'
          )}>
            {/* Main branch */}
            <button
              onClick={() => handleSwitchBranch(null)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono',
                'hover:bg-[var(--color-surface-2)] transition-colors',
                !activeBranchId && 'bg-[var(--color-accent-primary)]/5 text-[var(--color-accent-primary)]',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40'
              )}
            >
              <div className="flex items-center gap-2">
                <GitBranch size={10} />
                <span>main</span>
              </div>
              {!activeBranchId && <Check size={10} />}
            </button>

            {/* Separator */}
            {branches.length > 0 && (
              <div className="my-1 border-t border-[var(--color-border-subtle)]" />
            )}

            {/* Other branches */}
            {branches.map((branch) => (
              <div
                key={branch.id}
                className={cn(
                  'flex items-center justify-between px-3 py-1.5 text-[10px] font-mono',
                  'hover:bg-[var(--color-surface-2)] transition-colors group',
                  branch.id === activeBranchId && 'bg-[var(--color-accent-primary)]/5 text-[var(--color-accent-primary)]'
                )}
              >
                <button
                  onClick={() => handleSwitchBranch(branch.id)}
                  className="flex items-center gap-2 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                >
                  <GitBranch size={10} />
                  <span className="truncate">{branch.name}</span>
                </button>
                <div className="flex items-center gap-1">
                  {branch.id === activeBranchId && <Check size={10} />}
                  {onDeleteBranch && branch.id !== activeBranchId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBranch(branch.id);
                      }}
                      className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-[var(--color-error)] transition-all rounded-sm focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40"
                      title="Delete branch"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Footer info */}
            <div className="mt-1 pt-1 px-3 pb-1 border-t border-[var(--color-border-subtle)]">
              <p className="text-[8px] text-[var(--color-text-dim)] flex items-center gap-1">
                <Plus size={8} className="opacity-60" aria-hidden="true" />
                Click fork button on any message to create a branch
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

BranchNavigation.displayName = 'BranchNavigation';

export default BranchNavigation;
