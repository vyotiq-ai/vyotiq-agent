/**
 * useSessionDropdown Hook
 * 
 * Manages all dropdown state and logic for the session selector.
 * Handles keyboard navigation, position calculation, filtering, and actions.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSessionList } from '../../../sessions/hooks/useSessionList';
import { useWorkspaceState } from '../../../../state/WorkspaceProvider';
import type {
  SessionDropdownState,
  SessionDropdownActions,
  DropdownPosition,
  SessionViewMode,
  SessionMeta,
} from './types';
import {
  groupSessionsByDate,
  getStatusLabel,
  truncateTitle,
  getDisplayTitle,
  filterSessionsByQuery,
} from './utils';

interface UseSessionDropdownOptions {
  disabled?: boolean;
  disabledReason?: string;
}

interface UseSessionDropdownReturn {
  // Refs
  buttonRef: React.RefObject<HTMLButtonElement>;
  dropdownRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<HTMLDivElement>;
  // State
  state: SessionDropdownState;
  // Actions
  actions: SessionDropdownActions;
  // Session data from hook
  sessions: SessionMeta[];
  activeSessionId: string | undefined;
  hasWorkspace: boolean;
}

export function useSessionDropdown(
  options: UseSessionDropdownOptions = {}
): UseSessionDropdownReturn {
  const { disabled = false, disabledReason } = options;

  // Get workspace path for session-workspace binding
  const { workspacePath } = useWorkspaceState();

  // Get session data
  const {
    sessions: allSessions,
    activeSessionId,
    handleStartSession,
    handleSelectSession,
    handleDeleteSession,
  } = useSessionList({ workspacePath, filterByWorkspace: !!workspacePath });

  // Refs
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Dropdown state
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<SessionViewMode>('workspace');
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition>({
    top: 0,
    left: 0,
    width: 280,
    placement: 'above',
  });

  const hasWorkspace = !!workspacePath;

  // Filter sessions by search query
  const sessions = useMemo(() => {
    if (!searchQuery.trim()) return allSessions;
    return filterSessionsByQuery(allSessions, searchQuery);
  }, [allSessions, searchQuery]);

  // Active session
  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId),
    [sessions, activeSessionId]
  );

  // Group sessions by date
  const sessionGroups = useMemo(
    () => groupSessionsByDate(sessions),
    [sessions]
  );

  const sessionCount = allSessions.length;
  const filteredCount = sessions.length;

  // Flat list for keyboard navigation
  const flatSessionList = useMemo(() => {
    return sessionGroups.flatMap(group => group.sessions);
  }, [sessionGroups]);

  // Display properties
  const activeStatusLabel = activeSession ? getStatusLabel(activeSession.status) : null;
  const displayTitle = getDisplayTitle(activeSession);
  const truncatedTitle = truncateTitle(displayTitle, 18);

  // Tooltip
  const tooltip = disabled
    ? disabledReason ?? 'Sessions unavailable'
    : !hasWorkspace
      ? 'Select a workspace first'
      : `${sessionCount} session${sessionCount !== 1 ? 's' : ''}`;

  // Focused session ID
  const focusedSessionId = focusedIndex >= 0 && focusedIndex < flatSessionList.length
    ? flatSessionList[focusedIndex].id
    : undefined;

  // Reset focus when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const selectedIndex = flatSessionList.findIndex(s => s.id === activeSessionId);
      setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      setSearchQuery(''); // Reset search on open
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, flatSessionList, activeSessionId]);

  // Click outside handler
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideButton = buttonRef.current?.contains(target);
      const isInsideDropdown = dropdownRef.current?.contains(target);

      if (!isInsideButton && !isInsideDropdown) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Calculate dropdown position
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportPadding = 8;
      const idealWidth = 280;
      const width = Math.max(220, Math.min(idealWidth, window.innerWidth - viewportPadding * 2));

      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - viewportPadding - width)
      );

      const availableAbove = rect.top - viewportPadding;
      const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
      const placement: 'above' | 'below' = availableAbove < 200 && availableBelow > availableAbove
        ? 'below'
        : 'above';

      setDropdownPosition({
        top: placement === 'above' ? rect.top - viewportPadding : rect.bottom + viewportPadding,
        left,
        width,
        placement,
      });
    }
  }, [isOpen]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => prev < flatSessionList.length - 1 ? prev + 1 : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => prev > 0 ? prev - 1 : flatSessionList.length - 1);
        break;
      case 'Enter':
      case ' ':
        // Don't trigger if typing in search
        if (e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < flatSessionList.length) {
          handleSelectSession(flatSessionList[focusedIndex].id);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(flatSessionList.length - 1);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  }, [isOpen, focusedIndex, flatSessionList, handleSelectSession]);

  // Toggle dropdown
  const handleToggle = useCallback(() => {
    if (!disabled) {
      setIsOpen(prev => !prev);
    }
  }, [disabled]);

  // Create new session
  const handleNewSession = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasWorkspace || isCreating) return;

    setIsCreating(true);
    try {
      await handleStartSession(e);
      setIsOpen(false);
    } finally {
      setIsCreating(false);
    }
  }, [handleStartSession, hasWorkspace, isCreating]);

  // Select session
  const handleSelect = useCallback((sessionId: string) => {
    handleSelectSession(sessionId);
    setIsOpen(false);
  }, [handleSelectSession]);

  // Delete session
  const handleDelete = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    handleDeleteSession(e, sessionId);
  }, [handleDeleteSession]);

  // Focus item
  const handleItemFocus = useCallback((index: number) => {
    setFocusedIndex(index);
  }, []);

  // Search change
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setFocusedIndex(0); // Reset focus to first item when searching
  }, []);

  // View mode change
  const handleViewModeChange = useCallback((mode: SessionViewMode) => {
    setViewMode(mode);
  }, []);

  // Get global index for session in group
  const getSessionGlobalIndex = useCallback((groupIndex: number, sessionIndex: number) => {
    let index = 0;
    for (let i = 0; i < groupIndex; i++) {
      index += sessionGroups[i].sessions.length;
    }
    return index + sessionIndex;
  }, [sessionGroups]);

  // Build state object
  const state: SessionDropdownState = {
    isOpen,
    isCreating,
    focusedIndex,
    dropdownPosition,
    searchQuery,
    viewMode,
    flatSessionList,
    sessionGroups,
    sessionCount,
    filteredCount,
    activeSession,
    displayTitle,
    truncatedTitle,
    activeStatusLabel,
    tooltip,
    focusedSessionId,
  };

  // Build actions object
  const actions: SessionDropdownActions = {
    handleToggle,
    handleNewSession,
    handleSelect,
    handleDelete,
    handleItemFocus,
    handleKeyDown,
    handleSearchChange,
    handleViewModeChange,
    getSessionGlobalIndex,
  };

  return {
    buttonRef,
    dropdownRef,
    listRef,
    state,
    actions,
    sessions,
    activeSessionId,
    hasWorkspace,
  };
}

export default useSessionDropdown;
