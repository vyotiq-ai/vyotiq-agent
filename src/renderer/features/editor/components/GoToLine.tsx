/**
 * GoToLine Component
 * 
 * VS Code-style "Go to Line" dialog (Ctrl+G).
 * Allows jumping to a specific line number in the editor.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '../../../utils/cn';

interface GoToLineProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToLine: (line: number, column?: number) => void;
  currentLine?: number;
  totalLines?: number;
}

export const GoToLine: React.FC<GoToLineProps> = ({
  isOpen,
  onClose,
  onGoToLine,
  currentLine = 1,
  totalLines = 1,
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse input - supports "line" or "line:column" format
    const trimmed = value.trim();
    if (!trimmed) {
      onClose();
      return;
    }

    let line: number;
    let column: number | undefined;

    if (trimmed.includes(':')) {
      const [lineStr, colStr] = trimmed.split(':');
      line = parseInt(lineStr, 10);
      column = parseInt(colStr, 10);
      if (isNaN(column)) column = 1;
    } else {
      line = parseInt(trimmed, 10);
    }

    if (isNaN(line) || line < 1) {
      return;
    }

    // Clamp to valid range
    line = Math.min(line, totalLines);
    
    onGoToLine(line, column);
    onClose();
  }, [value, totalLines, onGoToLine, onClose]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 w-[320px]">
      <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-b-lg shadow-2xl overflow-hidden">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[11px] text-[var(--color-text-muted)] font-mono whitespace-nowrap">
              Go to Line:
            </span>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`${currentLine} of ${totalLines}`}
              className={cn(
                "flex-1 bg-[var(--color-surface-input)] border border-[var(--color-border-subtle)]",
                "text-[var(--color-text-primary)] placeholder-[var(--color-text-placeholder)]",
                "px-2 py-1 rounded text-[11px] font-mono",
                "focus:outline-none focus:border-[var(--color-accent-primary)]"
              )}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="px-3 pb-2 text-[10px] text-[var(--color-text-muted)] font-mono">
            Type line number, or line:column (e.g., 42 or 42:10)
          </div>
        </form>
      </div>
    </div>
  );
};

export default GoToLine;
