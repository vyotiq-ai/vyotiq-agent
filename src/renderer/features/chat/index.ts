/**
 * Chat Feature Exports
 * 
 * Clean, minimalist exports for the chat interface
 */
export { ChatArea } from './ChatArea';
export { ChatInput } from './components/input';

// Legacy input sub-components (for flexible usage)
export {
  InputHeader,
  InputTextarea,
  InputActions,
  InputToolbar,
  InputStatusBar,
  InputDropZone,
} from './components/input';

// Components
export { MessageLine } from './components/MessageLine';
export { ToolExecution } from './components/ToolExecution';
export { EmptyState } from './components/EmptyState';
export { ToolConfirmationPanel } from './components/ToolConfirmationPanel';
export { RoutingBadge } from './components/RoutingBadge';
export { BranchNavigation } from './components/BranchNavigation';
export { ConversationSearchBar } from './components/ConversationSearchBar';
export { DynamicToolIndicator } from './components/DynamicToolIndicator';
export { GeneratedMedia } from './components/GeneratedMedia';
export { MessageEditDialog } from './components/MessageEditDialog';
export { RunGroupHeader } from './components/RunGroupHeader';
export { RunErrorBanner } from './components/RunErrorBanner';
export { SessionWelcome } from './components/SessionWelcome';
export { ThinkingPanel } from './components/ThinkingPanel';

// UI Components (reused from other features)
export { ModelSelector } from './components/ModelSelector';
export { SessionSelector } from './components/sessionSelector';
export { ChatAttachmentList } from './components/ChatAttachmentList';
