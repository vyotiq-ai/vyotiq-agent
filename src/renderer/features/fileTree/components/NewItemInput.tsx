/**
 * NewItemInput Component
 * 
 * Inline input for creating new files or folders in the file tree.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { File, Folder } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface NewItemInputProps {
  type: 'file' | 'folder';
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export const NewItemInput: React.FC<NewItemInputProps> = ({
  type,
  depth,
  onSubmit,
  onCancel,
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  
  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  }, [value, onSubmit, onCancel]);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [handleSubmit, onCancel]);
  
  const handleBlur = useCallback(() => {
    // Small delay to allow click events to fire first
    setTimeout(() => {
      if (document.activeElement !== inputRef.current) {
        handleSubmit();
      }
    }, 100);
  }, [handleSubmit]);
  
  // Calculate indentation (16px per level + 4px base + 16px for chevron space)
  const indent = depth * 16 + 4 + 16;
  
  const Icon = type === 'folder' ? Folder : File;
  
  return (
    <div
      className={cn(
        'flex items-center h-[22px] bg-[var(--color-surface-2)]/50'
      )}
      style={{ paddingLeft: indent }}
    >
      {/* Icon */}
      <span className={cn(
        'w-4 h-4 flex items-center justify-center shrink-0 mr-1',
        type === 'folder' ? 'text-[var(--color-accent-secondary)]' : 'text-[var(--color-text-dim)]'
      )}>
        <Icon size={14} />
      </span>
      
      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={type === 'folder' ? 'folder name' : 'file name'}
        className={cn(
          'flex-1 min-w-0 px-1 py-0 text-[11px] font-mono',
          'bg-[var(--color-surface-1)] border border-[var(--color-accent-primary)]',
          'text-[var(--color-text-primary)] outline-none rounded-sm',
          'placeholder:text-[var(--color-text-placeholder)]'
        )}
      />
    </div>
  );
};
