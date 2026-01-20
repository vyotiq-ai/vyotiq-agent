/**
 * Breadcrumbs Component
 * 
 * VS Code-style file path and symbol breadcrumbs.
 * Shows navigation path above the editor.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { getFileIcon } from '../../fileTree/utils/fileIcons';
import type { DocumentSymbol } from './GoToSymbol';

interface BreadcrumbsProps {
  /** File path segments */
  filePath: string;
  /** Current symbol hierarchy (e.g., class > method) */
  symbols?: DocumentSymbol[];
  /** Called when a path segment is clicked */
  onPathClick?: (path: string) => void;
  /** Called when a symbol is clicked */
  onSymbolClick?: (symbol: DocumentSymbol) => void;
  /** Show quick picker for siblings */
  onShowFilePicker?: (basePath: string) => void;
  /** Show quick picker for symbols */
  onShowSymbolPicker?: () => void;
  className?: string;
}

/**
 * Get path segments from a file path
 */
function getPathSegments(filePath: string): Array<{ name: string; path: string; isFile: boolean }> {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  
  const segments: Array<{ name: string; path: string; isFile: boolean }> = [];
  let currentPath = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    segments.push({
      name: part,
      path: currentPath,
      isFile: i === parts.length - 1,
    });
  }
  
  return segments;
}

/**
 * Single breadcrumb item with dropdown capability
 */
const BreadcrumbItem: React.FC<{
  name: string;
  icon?: React.ElementType;
  isLast?: boolean;
  onClick?: () => void;
  onChevronClick?: () => void;
  dropdownItems?: Array<{ name: string; icon?: React.ElementType; onClick: () => void }>;
}> = ({ name, icon: Icon, isLast, onClick, onChevronClick, dropdownItems }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Handle click outside to close dropdown
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setShowDropdown(false);
    }
  }, []);
  
  // Register click outside listener when dropdown is open
  useEffect(() => {
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown, handleClickOutside]);
  
  return (
    <div className="flex items-center relative" ref={dropdownRef}>
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-1 px-1 py-0.5 rounded text-[11px]",
          "hover:bg-[var(--color-surface-2)] transition-colors",
          isLast 
            ? "text-[var(--color-text-primary)]" 
            : "text-[var(--color-text-muted)]"
        )}
      >
        {Icon && <Icon size={12} className="flex-shrink-0" />}
        <span className="truncate max-w-[150px]">{name}</span>
      </button>
      
      {!isLast && (
        <button
          onClick={() => {
            if (dropdownItems && dropdownItems.length > 0) {
              setShowDropdown(!showDropdown);
            } else if (onChevronClick) {
              onChevronClick();
            }
          }}
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          {showDropdown ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      )}
      
      {/* Dropdown menu */}
      {showDropdown && dropdownItems && dropdownItems.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[150px] bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded shadow-lg">
          {dropdownItems.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                item.onClick();
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              {item.icon && <item.icon size={12} />}
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  filePath,
  symbols = [],
  onPathClick,
  onSymbolClick,
  onShowFilePicker,
  onShowSymbolPicker,
  className,
}) => {
  const segments = getPathSegments(filePath);
  const lastSegment = segments[segments.length - 1];
  
  // Get file icon for the last segment (the file itself)
  const FileIcon = lastSegment && lastSegment.isFile ? getFileIcon(lastSegment.name) : File;
  
  // Only show last few path segments to save space
  const visibleSegments = segments.length > 3 
    ? [segments[0], { name: '...', path: '', isFile: false }, ...segments.slice(-2)]
    : segments;

  return (
    <div 
      className={cn(
        "flex items-center gap-0.5 px-2 py-1 min-h-[24px]",
        "bg-[var(--color-surface-base)] border-b border-[var(--color-border-subtle)]",
        "overflow-x-auto scrollbar-none",
        className
      )}
      title={lastSegment ? `${lastSegment.path} - Click to navigate` : undefined}
      aria-label={lastSegment ? `Breadcrumb: ${lastSegment.name}` : 'Breadcrumb navigation'}
    >
      {/* File type indicator */}
      {lastSegment && lastSegment.isFile && (
        <FileIcon size={14} className="text-[var(--color-text-muted)] shrink-0 mr-1" aria-hidden="true" />
      )}
      
      {/* Path breadcrumbs */}
      {visibleSegments.map((segment, index) => {
        if (segment.name === '...') {
          return (
            <div key="ellipsis" className="flex items-center">
              <span className="text-[11px] text-[var(--color-text-muted)] px-1">...</span>
              <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
            </div>
          );
        }
        
        const isLast = index === visibleSegments.length - 1 && symbols.length === 0;
        const Icon = segment.isFile ? getFileIcon(segment.name) : Folder;
        
        return (
          <BreadcrumbItem
            key={segment.path}
            name={segment.name}
            icon={Icon}
            isLast={isLast}
            onClick={() => {
              if (segment.isFile && onShowSymbolPicker) {
                onShowSymbolPicker();
              } else if (onPathClick) {
                onPathClick(segment.path);
              }
            }}
            onChevronClick={() => {
              if (onShowFilePicker && !segment.isFile) {
                onShowFilePicker(segment.path);
              }
            }}
          />
        );
      })}

      {/* Symbol breadcrumbs */}
      {symbols.map((symbol, index) => {
        const isLast = index === symbols.length - 1;
        
        return (
          <React.Fragment key={`${symbol.name}-${symbol.line}`}>
            {index === 0 && (
              <ChevronRight size={12} className="text-[var(--color-text-muted)]" />
            )}
            <BreadcrumbItem
              name={symbol.name}
              isLast={isLast}
              onClick={() => onSymbolClick?.(symbol)}
              onChevronClick={onShowSymbolPicker}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default Breadcrumbs;
