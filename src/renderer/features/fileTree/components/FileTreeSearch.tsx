/**
 * FileTreeSearch Component
 * 
 * Search/filter input for the file tree.
 * Filters files and folders as you type.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface FileTreeSearchProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  placeholder?: string;
}

export const FileTreeSearch: React.FC<FileTreeSearchProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search files...',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (value) {
        onClear();
      } else {
        inputRef.current?.blur();
      }
    }
  }, [value, onClear]);
  
  // Focus on Ctrl+F when file tree is focused
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only if file tree area is focused
        const activeElement = document.activeElement;
        if (activeElement?.closest('[role="tree"]')) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);
  
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 mx-1 my-1',
        'bg-[var(--color-surface-1)] border rounded-sm transition-colors',
        isFocused 
          ? 'border-[var(--color-accent-primary)]' 
          : 'border-[var(--color-border-subtle)]'
      )}
    >
      <Search 
        size={12} 
        className={cn(
          'shrink-0 transition-colors',
          isFocused ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)]'
        )} 
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'flex-1 min-w-0 bg-transparent text-[10px] font-mono',
          'text-[var(--color-text-primary)] outline-none',
          'placeholder:text-[var(--color-text-placeholder)]'
        )}
      />
      {value && (
        <button
          onClick={onClear}
          className="p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] transition-colors rounded-sm"
          title="Clear search"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
};
