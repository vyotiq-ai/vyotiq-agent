/**
 * Chat Input Components
 * 
 * Modular components for the redesigned prompt input interface.
 * Features a clean, modern design with better UX patterns.
 * 
 * @module chat/input
 */

// Main component
// Note: previous versions referenced a separate "ChatInputRedesigned" module.
// The current codebase ships a single implementation in `ChatInput.tsx`.
export { ChatInput } from './ChatInput';

// Backwards-compatible aliases
export { ChatInput as ChatInputLegacy } from './ChatInput';
export { ChatInput as ChatInputRedesigned } from './ChatInput';

// Legacy sub-components (still used internally)
export { InputHeader } from './InputHeader';
export { InputTextarea } from './InputTextarea';
export { InputToolbar } from './InputToolbar';
export { InputActions } from './InputActions';
export { InputStatusBar } from './InputStatusBar';
export { InputDropZone } from './InputDropZone';

// New components for @ mentions and drafts
export { MentionAutocomplete } from './MentionAutocomplete';
export { DraftIndicator } from './DraftIndicator';

// Ghost text for autocomplete
export { GhostText } from './GhostText';

// Types
export type { InputHeaderProps } from './InputHeader';
export type { InputTextareaProps } from './InputTextarea';
export type { InputToolbarProps } from './InputToolbar';
export type { InputActionsProps } from './InputActions';
export type { InputStatusBarProps } from './InputStatusBar';
export type { MentionAutocompleteProps } from './MentionAutocomplete';
export type { DraftIndicatorProps } from './DraftIndicator';
export type { GhostTextProps } from './GhostText';
