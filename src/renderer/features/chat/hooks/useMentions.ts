/**
 * useMentions Hook
 * 
 * Provides @ mention detection, parsing, and autocomplete functionality.
 * Supports:
 * - @file <path> - Reference specific files from workspace with path autocomplete
 * 
 * Features:
 * - Fuzzy search for file paths
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Auto-insert file path on selection
 * 
 * @example
 * ```tsx
 * const { 
 *   activeMention, 
 *   suggestions, 
 *   handleMentionSelect,
 *   parseMentions 
 * } = useMentions({
 *   message: inputValue,
 *   cursorPosition: cursorPos,
 *   workspaceFiles: files,
 * });
 * ```
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('Mentions');

// =============================================================================
// Types
// =============================================================================

/** Types of mentions supported */
export type MentionType = 'file';

/** A mention item for autocomplete */
export interface MentionItem {
  /** Unique identifier */
  id: string;
  /** Type of mention */
  type: MentionType;
  /** Display label */
  label: string;
  /** Description or path */
  description?: string;
  /** Icon name for display */
  icon?: 'file' | 'folder' | 'code';
  /** The value to insert */
  value: string;
  /** File path if type is 'file' */
  filePath?: string;
}

/** A parsed mention from the message */
export interface ParsedMention {
  /** Type of mention */
  type: MentionType;
  /** The full match including @ symbol */
  fullMatch: string;
  /** The value after the mention type (e.g., filename) */
  value?: string;
  /** Start index in the message */
  startIndex: number;
  /** End index in the message */
  endIndex: number;
}

/** Active mention being typed */
export interface ActiveMention {
  /** The mention type if detected */
  type: MentionType | 'partial';
  /** The search query (text after @) */
  query: string;
  /** Start position of the @ in the message */
  startIndex: number;
  /** Whether suggestions should be shown */
  showSuggestions: boolean;
}

/** Workspace file with type */
export interface WorkspaceFileInfo {
  path: string;
  type: 'file' | 'directory';
}

/** Options for useMentions hook */
export interface UseMentionsOptions {
  /** Current message text */
  message: string;
  /** Current cursor position in the message */
  cursorPosition: number;
  /** List of workspace files with type information */
  workspaceFiles?: WorkspaceFileInfo[];
  /** Workspace root path for relative path display */
  workspacePath?: string;
  /** Maximum suggestions to show */
  maxSuggestions?: number;
  /** Enabled state */
  enabled?: boolean;
  /** Whether files are still loading */
  isLoading?: boolean;
}

/** Return type for useMentions hook */
export interface UseMentionsReturn {
  /** Currently active mention being typed (null if none) */
  activeMention: ActiveMention | null;
  /** Filtered suggestions based on current query */
  suggestions: MentionItem[];
  /** Currently selected suggestion index */
  selectedIndex: number;
  /** Set selected suggestion index */
  setSelectedIndex: (index: number) => void;
  /** Handle selecting a mention from suggestions */
  handleMentionSelect: (item: MentionItem) => { newMessage: string; newCursorPos: number };
  /** Parse all mentions from a message */
  parseMentions: (text: string) => ParsedMention[];
  /** Navigate suggestions up */
  navigateUp: () => void;
  /** Navigate suggestions down */
  navigateDown: () => void;
  /** Check if keyboard event should be handled by mentions */
  shouldHandleKeyboard: (e: React.KeyboardEvent) => boolean;
  /** Whether files are still loading */
  isLoading: boolean;
  /** Whether search returned no results */
  noResults: boolean;
  /** Current search query (for display) */
  searchQuery: string;
  /** Total available files count */
  totalFiles: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Regex to detect @ mention trigger */
const MENTION_TRIGGER_REGEX = /@(\w*)$/;

/** Regex to parse completed @file mentions with path */
const MENTION_PARSE_REGEX = /@file(?:\s+([^\s@]+))?/g;

// =============================================================================
// Utility Functions
// =============================================================================

/** File extension to icon type mapping */
const EXTENSION_ICONS: Record<string, 'file' | 'code' | 'folder'> = {
  // Code files
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code',
  py: 'code', rs: 'code', go: 'code', java: 'code',
  c: 'code', cpp: 'code', h: 'code', hpp: 'code',
  cs: 'code', rb: 'code', php: 'code', swift: 'code',
  kt: 'code', scala: 'code', vue: 'code', svelte: 'code',
  // Config/data
  json: 'code', yaml: 'code', yml: 'code', toml: 'code',
  xml: 'code', html: 'code', css: 'code', scss: 'code',
  // Default is 'file'
};

/**
 * Extract filename from path
 */
function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/**
 * Get file extension
 */
function getFileExtension(filePath: string): string {
  const fileName = getFileName(filePath);
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
}

/**
 * Get icon type for a file based on extension
 */
function getFileIcon(filePath: string, isDirectory: boolean): 'file' | 'folder' | 'code' {
  if (isDirectory) return 'folder';
  const ext = getFileExtension(filePath);
  return EXTENSION_ICONS[ext] ?? 'file';
}

/**
 * Convert absolute path to relative path for display
 */
function toRelativePath(fullPath: string, workspacePath?: string): string {
  if (!workspacePath) return fullPath;
  const normalizedFull = fullPath.replace(/\\/g, '/');
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/');
  if (normalizedFull.startsWith(normalizedWorkspace)) {
    const relative = normalizedFull.slice(normalizedWorkspace.length);
    return relative.startsWith('/') ? relative.slice(1) : relative;
  }
  return fullPath;
}

/**
 * Fuzzy match score for filtering - prioritizes exact matches and filename matches
 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  // Exact match
  if (t === q) return 1000;
  
  // Exact match at start of filename (highest priority for file search)
  const fileName = t.split(/[/\\]/).pop() ?? t;
  if (fileName.startsWith(q)) return 200;
  if (fileName === q) return 500;
  
  // Exact match at start of path
  if (t.startsWith(q)) return 100;
  
  // Contains match in filename
  if (fileName.includes(q)) return 75;
  
  // Contains match in path
  if (t.includes(q)) return 50;
  
  // Fuzzy character match
  let score = 0;
  let queryIdx = 0;
  let consecutiveBonus = 0;
  for (let i = 0; i < t.length && queryIdx < q.length; i++) {
    if (t[i] === q[queryIdx]) {
      score += 1 + consecutiveBonus;
      consecutiveBonus += 0.5; // Bonus for consecutive matches
      queryIdx++;
    } else {
      consecutiveBonus = 0;
    }
  }
  
  return queryIdx === q.length ? score : 0;
}

/**
 * Detect if cursor is in an active mention
 */
function detectActiveMention(
  message: string, 
  cursorPosition: number
): ActiveMention | null {
  // Get text before cursor
  const textBeforeCursor = message.slice(0, cursorPosition);
  
  // Check for @ trigger
  const match = textBeforeCursor.match(MENTION_TRIGGER_REGEX);
  if (!match) return null;
  
  const query = match[1] ?? '';
  const startIndex = cursorPosition - match[0].length;
  
  // Determine if it's a file mention or partial
  const lowerQuery = query.toLowerCase();
  const type: MentionType | 'partial' = 
    (lowerQuery === 'file' || lowerQuery.startsWith('file ')) ? 'file' : 'partial';
  
  return {
    type,
    query,
    startIndex,
    showSuggestions: true,
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for @ mention detection and autocomplete
 */
export function useMentions(options: UseMentionsOptions): UseMentionsReturn {
  const {
    message,
    cursorPosition,
    workspaceFiles = [],
    workspacePath,
    maxSuggestions = 10,
    enabled = true,
    isLoading: filesLoading = false,
  } = options;

  const [selectedIndex, setSelectedIndex] = useState(0);

  // Detect active mention at cursor
  const activeMention = useMemo(() => {
    if (!enabled) return null;
    return detectActiveMention(message, cursorPosition);
  }, [message, cursorPosition, enabled]);

  // Build file suggestions from workspace files (prioritize files over directories)
  const fileSuggestions = useMemo((): MentionItem[] => {
    // Separate files and directories, files first
    const files: MentionItem[] = [];
    const directories: MentionItem[] = [];
    
    workspaceFiles.forEach((file, idx) => {
      const isDirectory = file.type === 'directory';
      const fileName = getFileName(file.path);
      const relativePath = toRelativePath(file.path, workspacePath);
      
      const item: MentionItem = {
        id: `file-${idx}`,
        type: 'file' as MentionType,
        label: fileName,
        description: relativePath,
        icon: getFileIcon(file.path, isDirectory),
        value: relativePath,
        filePath: relativePath,
      };
      
      if (isDirectory) {
        directories.push(item);
      } else {
        files.push(item);
      }
    });
    
    // Return files first, then directories
    return [...files, ...directories];
  }, [workspaceFiles, workspacePath]);

  // Filter suggestions based on active mention query
  const { items: suggestions, noResults, searchQuery } = useMemo((): { items: MentionItem[]; noResults: boolean; searchQuery: string } => {
    if (!activeMention) return { items: [], noResults: false, searchQuery: '' };

    const query = activeMention.query.toLowerCase();
    let items: MentionItem[] = [];
    let isSearching = false;
    let effectiveQuery = '';

    // If just typed @ or typing 'file', show files directly
    if (query.length === 0 || query === 'f' || query === 'fi' || query === 'fil' || query === 'file') {
      // Show files directly - no prompt needed
      items = fileSuggestions.slice(0, maxSuggestions);
      effectiveQuery = '';
    } else if (query.startsWith('file ') || activeMention.type === 'file') {
      // File search mode - filter workspace files
      const fileQuery = query.replace(/^file\s*/, '');
      effectiveQuery = fileQuery;
      isSearching = fileQuery.length > 0;
      if (isSearching) {
        items = fileSuggestions
          .map(item => ({
            item,
            score: Math.max(
              fuzzyMatch(fileQuery, item.label),
              fuzzyMatch(fileQuery, item.description ?? ''),
              fuzzyMatch(fileQuery, item.filePath ?? '')
            ),
          }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ item }) => item);
      } else {
        // Just "@file " - show all files
        items = fileSuggestions.slice(0, maxSuggestions);
      }
    } else {
      // Search files by query (direct typing after @)
      effectiveQuery = query;
      isSearching = true;
      items = fileSuggestions
        .map(item => ({
          item,
          score: Math.max(
            fuzzyMatch(query, item.label),
            fuzzyMatch(query, item.description ?? ''),
            fuzzyMatch(query, item.filePath ?? '')
          ),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item);
    }

    const limitedItems = items.slice(0, maxSuggestions);
    return { 
      items: limitedItems, 
      noResults: isSearching && limitedItems.length === 0 && fileSuggestions.length > 0,
      searchQuery: effectiveQuery,
    };
  }, [activeMention, fileSuggestions, maxSuggestions]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions.length, activeMention?.query]);

  // Handle selecting a mention
  const handleMentionSelect = useCallback((item: MentionItem): { newMessage: string; newCursorPos: number } => {
    if (!activeMention) {
      return { newMessage: message, newCursorPos: cursorPosition };
    }

    const before = message.slice(0, activeMention.startIndex);
    const after = message.slice(cursorPosition);
    
    // Insert just the file path with a space after
    const insertValue = item.value + ' ';
    const newMessage = before + insertValue + after;
    const newCursorPos = activeMention.startIndex + insertValue.length;

    logger.debug('Mention selected', { item: item.label, newCursorPos });

    return { newMessage, newCursorPos };
  }, [activeMention, message, cursorPosition]);

  // Parse all @file mentions from message
  const parseMentions = useCallback((text: string): ParsedMention[] => {
    const mentions: ParsedMention[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    MENTION_PARSE_REGEX.lastIndex = 0;

    while ((match = MENTION_PARSE_REGEX.exec(text)) !== null) {
      const value = match[1]; // File path

      mentions.push({
        type: 'file',
        fullMatch: match[0],
        value,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return mentions;
  }, []);

  // Navigation handlers
  const navigateUp = useCallback(() => {
    setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
  }, [suggestions.length]);

  const navigateDown = useCallback(() => {
    setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
  }, [suggestions.length]);

  // Check if keyboard event should be handled
  const shouldHandleKeyboard = useCallback((e: React.KeyboardEvent): boolean => {
    if (!activeMention || suggestions.length === 0) return false;
    return ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key);
  }, [activeMention, suggestions.length]);

  return {
    activeMention,
    suggestions,
    selectedIndex,
    setSelectedIndex,
    handleMentionSelect,
    parseMentions,
    navigateUp,
    navigateDown,
    shouldHandleKeyboard,
    isLoading: filesLoading,
    noResults,
    searchQuery,
    totalFiles: fileSuggestions.length,
  };
}
