/**
 * Go To Line Dialog
 * 
 * VS Code-style "Go to Line" dialog (Ctrl+G).
 * Allows quick navigation to a specific line number in the active editor.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../../utils/cn';

interface GoToLineDialogProps {
  isOpen: boolean;
  currentLine: number;
  totalLines: number;
  onGoTo: (line: number, column?: number) => void;
  onClose: () => void;
}

export const GoToLineDialog: React.FC<GoToLineDialogProps> = memo(({
  isOpen,
  currentLine,
  totalLines,
  onGoTo,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setValue('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    // Support "line:column" format
    const parts = trimmed.split(':');
    const line = parseInt(parts[0], 10);
    const column = parts[1] ? parseInt(parts[1], 10) : undefined;

    if (isNaN(line) || line < 1) return;

    const clampedLine = Math.min(line, totalLines);
    onGoTo(clampedLine, column);
    onClose();
  }, [value, totalLines, onGoTo, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Dialog */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          'relative z-10 w-[320px]',
          'bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]/60',
          'rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)]',
          'animate-in fade-in-0 slide-in-from-top-2 duration-150',
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-[10px] font-mono text-[var(--color-text-dim)] shrink-0">
            Go to Line
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`line[:column] (1-${totalLines})`}
            className={cn(
              'flex-1 bg-transparent text-[12px] font-mono',
              'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]',
              'focus:outline-none',
            )}
            autoComplete="off"
          />
        </div>
        <div className="px-3 pb-2 text-[9px] font-mono text-[var(--color-text-dim)]">
          Current line: {currentLine} of {totalLines}
        </div>
      </form>
    </div>
  );
});

GoToLineDialog.displayName = 'GoToLineDialog';
