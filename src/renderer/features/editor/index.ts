/**
 * Editor Feature
 * 
 * Full-featured code editor powered by Monaco Editor with tabs,
 * IntelliSense, syntax highlighting, diff view, and more.
 */

// Components
export { EditorPanel, openFileInEditor } from './components/EditorPanel';
export { EditorStatusBar } from './components/EditorStatusBar';
export { EditorBreadcrumb } from './components/EditorBreadcrumb';
export { TabContextMenu } from './components/TabContextMenu';
export type { TabContextAction } from './components/TabContextMenu';

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
