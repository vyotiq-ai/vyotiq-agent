/**
 * useFileTreeKeyboard Hook
 * 
 * Handles keyboard shortcuts for the file tree.
 * Provides VS Code-like keyboard navigation and actions.
 */

import { useCallback, useEffect } from 'react';

interface UseFileTreeKeyboardOptions {
  containerRef: React.RefObject<HTMLElement>;
  isEnabled: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onNavigateInto: () => void;
  onNavigateOut: () => void;
  onSelect: () => void;
  onToggleSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onSearch: () => void;
  onEscape: () => void;
  onSelectAll: () => void;
  /** Navigate to first item */
  onHome?: () => void;
  /** Navigate to last item */
  onEnd?: () => void;
  /** Navigate up by a page (10 items) */
  onPageUp?: () => void;
  /** Navigate down by a page (10 items) */
  onPageDown?: () => void;
}

export function useFileTreeKeyboard(options: UseFileTreeKeyboardOptions) {
  const {
    containerRef,
    isEnabled,
    onNavigateUp,
    onNavigateDown,
    onNavigateInto,
    onNavigateOut,
    onSelect,
    onToggleSelect,
    onRename,
    onDelete,
    onCopy,
    onCut,
    onPaste,
    onSearch,
    onEscape,
    onSelectAll,
    onHome,
    onEnd,
    onPageUp,
    onPageDown,
  } = options;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isEnabled) return;
    
    // Check if the event target is within the container
    if (!containerRef.current?.contains(e.target as Node)) return;
    
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        onNavigateUp();
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        onNavigateDown();
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        onNavigateInto();
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        onNavigateOut();
        break;
        
      case 'Enter':
        e.preventDefault();
        onSelect();
        break;
        
      case ' ':
        e.preventDefault();
        onToggleSelect();
        break;
        
      case 'F2':
        e.preventDefault();
        onRename();
        break;
        
      case 'Delete':
      case 'Backspace':
        if (!modKey) {
          e.preventDefault();
          onDelete();
        }
        break;
        
      case 'c':
        if (modKey) {
          e.preventDefault();
          onCopy();
        }
        break;
        
      case 'x':
        if (modKey) {
          e.preventDefault();
          onCut();
        }
        break;
        
      case 'v':
        if (modKey) {
          e.preventDefault();
          onPaste();
        }
        break;
        
      case 'f':
        if (modKey) {
          e.preventDefault();
          onSearch();
        }
        break;
        
      case 'a':
        if (modKey) {
          e.preventDefault();
          onSelectAll();
        }
        break;
        
      case 'Escape':
        onEscape();
        break;

      case 'Home':
        e.preventDefault();
        onHome?.();
        break;

      case 'End':
        e.preventDefault();
        onEnd?.();
        break;

      case 'PageUp':
        e.preventDefault();
        onPageUp?.();
        break;

      case 'PageDown':
        e.preventDefault();
        onPageDown?.();
        break;
    }
  }, [
    isEnabled,
    containerRef,
    onNavigateUp,
    onNavigateDown,
    onNavigateInto,
    onNavigateOut,
    onSelect,
    onToggleSelect,
    onRename,
    onDelete,
    onCopy,
    onCut,
    onPaste,
    onSearch,
    onSelectAll,
    onEscape,
    onHome,
    onEnd,
    onPageUp,
    onPageDown,
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export default useFileTreeKeyboard;
