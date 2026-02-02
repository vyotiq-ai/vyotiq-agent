/**
 * usePagination Hook
 * 
 * A hook for managing paginated data with support for page-based and cursor-based pagination.
 */
import { useState, useCallback, useMemo } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface PaginationState {
  /** Current page number (1-indexed) */
  currentPage: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items (if known) */
  totalItems: number | null;
  /** Total number of pages (if total items is known) */
  totalPages: number | null;
}

export interface UsePaginationOptions {
  /** Initial page number (default: 1) */
  initialPage?: number;
  /** Number of items per page (default: 10) */
  pageSize?: number;
  /** Total number of items (optional, enables total pages calculation) */
  totalItems?: number;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
}

export interface UsePaginationResult<T> {
  /** Current pagination state */
  state: PaginationState;
  /** Current page of items */
  currentItems: T[];
  /** Go to a specific page */
  goToPage: (page: number) => void;
  /** Go to the next page */
  nextPage: () => void;
  /** Go to the previous page */
  prevPage: () => void;
  /** Go to the first page */
  firstPage: () => void;
  /** Go to the last page */
  lastPage: () => void;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPrevPage: boolean;
  /** Set the page size */
  setPageSize: (size: number) => void;
  /** Set the total items count */
  setTotalItems: (total: number | null) => void;
  /** Reset to initial state */
  reset: () => void;
  /** Get page info for display (e.g., "1 of 5") */
  pageInfo: string;
  /** Get range info (e.g., "1-10 of 50") */
  rangeInfo: string;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
): UsePaginationResult<T> {
  const {
    initialPage = 1,
    pageSize: initialPageSize = 10,
    totalItems: initialTotalItems,
    onPageChange,
  } = options;

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [totalItems, setTotalItems] = useState<number | null>(initialTotalItems ?? null);

  // Calculate total pages
  const totalPages = useMemo(() => {
    if (totalItems !== null) {
      return Math.max(1, Math.ceil(totalItems / pageSize));
    }
    // If total items not provided, use items array length
    return Math.max(1, Math.ceil(items.length / pageSize));
  }, [totalItems, items.length, pageSize]);

  // Get current page items
  const currentItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [items, currentPage, pageSize]);

  // Navigation helpers
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  const goToPage = useCallback((page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    if (validPage !== currentPage) {
      setCurrentPage(validPage);
      onPageChange?.(validPage);
    }
  }, [currentPage, totalPages, onPageChange]);

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      goToPage(currentPage + 1);
    }
  }, [hasNextPage, currentPage, goToPage]);

  const prevPage = useCallback(() => {
    if (hasPrevPage) {
      goToPage(currentPage - 1);
    }
  }, [hasPrevPage, currentPage, goToPage]);

  const firstPage = useCallback(() => {
    goToPage(1);
  }, [goToPage]);

  const lastPage = useCallback(() => {
    goToPage(totalPages);
  }, [goToPage, totalPages]);

  const handleSetPageSize = useCallback((size: number) => {
    const validSize = Math.max(1, size);
    setPageSize(validSize);
    // Reset to first page when page size changes
    setCurrentPage(1);
    onPageChange?.(1);
  }, [onPageChange]);

  const handleSetTotalItems = useCallback((total: number | null) => {
    setTotalItems(total);
    // Adjust current page if it's now out of bounds
    if (total !== null) {
      const newTotalPages = Math.max(1, Math.ceil(total / pageSize));
      if (currentPage > newTotalPages) {
        setCurrentPage(newTotalPages);
        onPageChange?.(newTotalPages);
      }
    }
  }, [currentPage, pageSize, onPageChange]);

  const reset = useCallback(() => {
    setCurrentPage(initialPage);
    setPageSize(initialPageSize);
    setTotalItems(initialTotalItems ?? null);
    onPageChange?.(initialPage);
  }, [initialPage, initialPageSize, initialTotalItems, onPageChange]);

  // Display helpers
  const pageInfo = useMemo(() => {
    return `${currentPage} of ${totalPages}`;
  }, [currentPage, totalPages]);

  const rangeInfo = useMemo(() => {
    const total = totalItems ?? items.length;
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);
    return `${start}-${end} of ${total}`;
  }, [currentPage, pageSize, totalItems, items.length]);

  const state: PaginationState = {
    currentPage,
    pageSize,
    totalItems: totalItems ?? items.length,
    totalPages,
  };

  return {
    state,
    currentItems,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    hasNextPage,
    hasPrevPage,
    setPageSize: handleSetPageSize,
    setTotalItems: handleSetTotalItems,
    reset,
    pageInfo,
    rangeInfo,
  };
}

// =============================================================================
// Pagination Controls Component Helper
// =============================================================================

export interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  showFirstLast?: boolean;
  maxVisiblePages?: number;
}

/**
 * Get array of page numbers to display
 */
export function getVisiblePages(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | 'ellipsis')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const halfVisible = Math.floor(maxVisible / 2);

  // Always show first page
  pages.push(1);

  // Calculate range around current page
  let start = Math.max(2, currentPage - halfVisible);
  let end = Math.min(totalPages - 1, currentPage + halfVisible);

  // Adjust if we're near the start
  if (currentPage <= halfVisible + 1) {
    end = Math.min(totalPages - 1, maxVisible - 1);
  }

  // Adjust if we're near the end
  if (currentPage >= totalPages - halfVisible) {
    start = Math.max(2, totalPages - maxVisible + 2);
  }

  // Add ellipsis after first page if needed
  if (start > 2) {
    pages.push('ellipsis');
  }

  // Add middle pages
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  // Add ellipsis before last page if needed
  if (end < totalPages - 1) {
    pages.push('ellipsis');
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

export default usePagination;
