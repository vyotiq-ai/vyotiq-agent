/**
 * Editor Feature
 * 
 * Full-featured code editor powered by Monaco Editor with tabs,
 * IntelliSense, syntax highlighting, diff view, and more.
 * Includes LSP integration for real code intelligence.
 */

// Components
export { EditorPanel, openFileInEditor } from './components/EditorPanel';
export { EditorStatusBar } from './components/EditorStatusBar';
export { EditorBreadcrumb } from './components/EditorBreadcrumb';
export { TabContextMenu } from './components/TabContextMenu';
export type { TabContextAction } from './components/TabContextMenu';
export { EditorContextMenu } from './components/EditorContextMenu';
export type { EditorContextAction } from './components/EditorContextMenu';
export { GoToLineDialog } from './components/GoToLineDialog';
export { SymbolOutlinePanel } from './components/SymbolOutlinePanel';
export { EditorSettingsPanel } from './components/EditorSettingsPanel';

// Store
export {
  useEditorStore,
  openFileImperative,
  saveActiveTab,
  saveAllTabs,
  toggleWordWrap,
  toggleMinimap,
  setEditorFontSize,
  increaseFontSize,
  decreaseFontSize,
  getDirtyTabCount,
  getActiveFilePath,
  type EditorTab,
  type EditorViewMode,
  type EditorState,
} from './store/editorStore';

// Monaco integration
export {
  MonacoEditor,
  MonacoDiffEditor,
  initializeMonaco,
  getMonacoLanguage,
  registerMonacoThemes,
  getMonacoTheme,
} from './monaco';
export type { MonacoEditorProps, MonacoDiffEditorProps } from './monaco';

// LSP integration
export {
  registerLSPProviders,
  registerAllLSPProviders,
  initializeLSP,
  disposeLSPBridge,
  notifyDocumentOpen,
  notifyDocumentChange,
  notifyDocumentClose,
  subscribeToDiagnostics,
  refreshDiagnostics,
} from './lsp';

// Hooks
export { useLSP } from './hooks/useLSP';
export type { LSPStatus, UseLSPReturn } from './hooks/useLSP';
export { useEditorSettings, loadEditorSettings } from './hooks/useEditorSettings';
export type { EditorExtendedSettings } from './hooks/useEditorSettings';
export { useEditorActions } from './hooks/useEditorActions';
export type { EditorActions } from './hooks/useEditorActions';
