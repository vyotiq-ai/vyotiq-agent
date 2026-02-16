/**
 * Monaco Module
 * 
 * Barrel export for Monaco Editor integration.
 */

export { initializeMonaco, getMonacoLanguage, monaco } from './monacoSetup';
export { registerMonacoThemes, getMonacoTheme, VYOTIQ_DARK_THEME, VYOTIQ_LIGHT_THEME } from './monacoTheme';
export { MonacoEditor, MonacoDiffEditor } from './MonacoWrapper';
export type { MonacoEditorProps, MonacoDiffEditorProps } from './MonacoWrapper';
