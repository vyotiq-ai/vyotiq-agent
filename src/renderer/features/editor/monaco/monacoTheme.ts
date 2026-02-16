/**
 * Monaco Editor Theme
 * 
 * Custom theme matching the Vyotiq app's dark/light design system.
 * Uses CSS variable values mapped to Monaco theme tokens.
 */

import * as monaco from 'monaco-editor';
import { createLogger } from '../../../utils/logger';

const logger = createLogger('MonacoTheme');

export const VYOTIQ_DARK_THEME = 'vyotiq-dark';
export const VYOTIQ_LIGHT_THEME = 'vyotiq-light';

/**
 * Register the Vyotiq dark theme with Monaco
 */
function registerDarkTheme(): void {
  monaco.editor.defineTheme(VYOTIQ_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // Comments
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'comment.block', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'comment.line', foreground: '6b7280', fontStyle: 'italic' },
      // Keywords
      { token: 'keyword', foreground: 'c084fc' },
      { token: 'keyword.control', foreground: 'c084fc' },
      { token: 'keyword.operator', foreground: 'c084fc' },
      // Strings
      { token: 'string', foreground: '34d399' },
      { token: 'string.escape', foreground: '6ee7b7' },
      { token: 'string.regexp', foreground: 'fb923c' },
      // Numbers
      { token: 'number', foreground: 'f59e0b' },
      { token: 'number.hex', foreground: 'f59e0b' },
      { token: 'number.float', foreground: 'f59e0b' },
      // Types & Classes
      { token: 'type', foreground: '38bdf8' },
      { token: 'type.identifier', foreground: '38bdf8' },
      { token: 'class', foreground: '38bdf8' },
      // Functions
      { token: 'function', foreground: '60a5fa' },
      { token: 'function.declaration', foreground: '60a5fa' },
      // Variables
      { token: 'variable', foreground: 'e2e8f0' },
      { token: 'variable.predefined', foreground: '38bdf8' },
      { token: 'variable.parameter', foreground: 'e2e8f0' },
      // Constants
      { token: 'constant', foreground: 'f59e0b' },
      // Operators
      { token: 'operator', foreground: '94a3b8' },
      { token: 'delimiter', foreground: '94a3b8' },
      { token: 'delimiter.bracket', foreground: '94a3b8' },
      // Tags (HTML/XML/JSX)
      { token: 'tag', foreground: 'f87171' },
      { token: 'tag.attribute.name', foreground: '38bdf8' },
      { token: 'tag.attribute.value', foreground: '34d399' },
      // Attribute
      { token: 'attribute.name', foreground: '38bdf8' },
      { token: 'attribute.value', foreground: '34d399' },
      // Meta
      { token: 'metatag', foreground: 'c084fc' },
      { token: 'annotation', foreground: 'c084fc' },
      // Markdown
      { token: 'markup.heading', foreground: '60a5fa', fontStyle: 'bold' },
      { token: 'markup.bold', fontStyle: 'bold' },
      { token: 'markup.italic', fontStyle: 'italic' },
      { token: 'markup.inline', foreground: '34d399' },
    ],
    colors: {
      // Editor
      'editor.background': '#0f0f0f',
      'editor.foreground': '#e2e8f0',
      'editor.lineHighlightBackground': '#1a1a2e40',
      'editor.selectionBackground': '#34d39930',
      'editor.selectionHighlightBackground': '#34d39915',
      'editor.wordHighlightBackground': '#34d39920',
      'editor.wordHighlightStrongBackground': '#34d39930',
      'editor.findMatchBackground': '#f59e0b40',
      'editor.findMatchHighlightBackground': '#f59e0b20',
      'editor.hoverHighlightBackground': '#34d39910',
      'editor.inactiveSelectionBackground': '#34d39915',
      // Cursor
      'editorCursor.foreground': '#34d399',
      // Line numbers
      'editorLineNumber.foreground': '#4a5568',
      'editorLineNumber.activeForeground': '#94a3b8',
      // Indent guides
      'editorIndentGuide.background': '#27272a40',
      'editorIndentGuide.activeBackground': '#52525b60',
      // Bracket matching
      'editorBracketMatch.background': '#34d39920',
      'editorBracketMatch.border': '#34d39960',
      // Bracket pair colorization
      'editorBracketHighlight.foreground1': '#38bdf8',
      'editorBracketHighlight.foreground2': '#c084fc',
      'editorBracketHighlight.foreground3': '#f59e0b',
      'editorBracketHighlight.foreground4': '#34d399',
      'editorBracketHighlight.foreground5': '#f87171',
      'editorBracketHighlight.foreground6': '#60a5fa',
      // Gutter
      'editorGutter.background': '#0f0f0f',
      'editorGutter.modifiedBackground': '#f59e0b',
      'editorGutter.addedBackground': '#34d399',
      'editorGutter.deletedBackground': '#f87171',
      // Minimap
      'minimap.background': '#0c0c0c',
      'minimapSlider.background': '#34d39920',
      'minimapSlider.hoverBackground': '#34d39930',
      'minimapSlider.activeBackground': '#34d39940',
      // Scrollbar
      'scrollbar.shadow': '#00000040',
      'scrollbarSlider.background': '#52525b40',
      'scrollbarSlider.hoverBackground': '#52525b60',
      'scrollbarSlider.activeBackground': '#52525b80',
      // Widget
      'editorWidget.background': '#18181b',
      'editorWidget.foreground': '#e2e8f0',
      'editorWidget.border': '#27272a',
      'editorSuggestWidget.background': '#18181b',
      'editorSuggestWidget.border': '#27272a',
      'editorSuggestWidget.foreground': '#e2e8f0',
      'editorSuggestWidget.selectedBackground': '#34d39920',
      'editorSuggestWidget.highlightForeground': '#34d399',
      // Overview ruler
      'editorOverviewRuler.border': '#27272a',
      'editorOverviewRuler.modifiedForeground': '#f59e0b80',
      'editorOverviewRuler.addedForeground': '#34d39980',
      'editorOverviewRuler.deletedForeground': '#f8717180',
      // Diff editor
      'diffEditor.insertedTextBackground': '#34d39915',
      'diffEditor.removedTextBackground': '#f8717115',
      'diffEditor.insertedLineBackground': '#34d39910',
      'diffEditor.removedLineBackground': '#f8717110',
      // Input
      'input.background': '#18181b',
      'input.foreground': '#e2e8f0',
      'input.border': '#27272a',
      'input.placeholderForeground': '#52525b',
      'inputOption.activeBorder': '#34d399',
      'inputOption.activeBackground': '#34d39920',
      // Dropdown
      'dropdown.background': '#18181b',
      'dropdown.foreground': '#e2e8f0',
      'dropdown.border': '#27272a',
      // List
      'list.activeSelectionBackground': '#34d39920',
      'list.activeSelectionForeground': '#e2e8f0',
      'list.hoverBackground': '#27272a80',
      'list.focusBackground': '#34d39915',
      // Peek view
      'peekView.border': '#34d39960',
      'peekViewEditor.background': '#0c0c0c',
      'peekViewResult.background': '#18181b',
      'peekViewTitle.background': '#18181b',
    },
  });
}

/**
 * Register the Vyotiq light theme with Monaco
 */
function registerLightTheme(): void {
  monaco.editor.defineTheme(VYOTIQ_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [
      // Comments
      { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
      // Keywords
      { token: 'keyword', foreground: '7c3aed' },
      // Strings
      { token: 'string', foreground: '059669' },
      // Numbers
      { token: 'number', foreground: 'd97706' },
      // Types
      { token: 'type', foreground: '0284c7' },
      // Functions
      { token: 'function', foreground: '2563eb' },
      // Tags
      { token: 'tag', foreground: 'dc2626' },
    ],
    colors: {
      'editor.background': '#fafafa',
      'editor.foreground': '#1e293b',
      'editor.lineHighlightBackground': '#f1f5f910',
      'editor.selectionBackground': '#05966930',
      'editorCursor.foreground': '#059669',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#64748b',
      'editorIndentGuide.background': '#e2e8f040',
      'editorBracketMatch.background': '#05966920',
      'editorBracketMatch.border': '#05966960',
      'editorGutter.background': '#fafafa',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#e2e8f0',
      'diffEditor.insertedTextBackground': '#05966915',
      'diffEditor.removedTextBackground': '#dc262615',
    },
  });
}

/**
 * Register all Vyotiq themes with Monaco
 */
export function registerMonacoThemes(): void {
  try {
    registerDarkTheme();
    registerLightTheme();
    logger.info('Monaco themes registered');
  } catch (err) {
    logger.error('Failed to register Monaco themes', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get the appropriate theme name based on current app theme
 */
export function getMonacoTheme(): string {
  const isDark = document.documentElement.classList.contains('dark');
  return isDark ? VYOTIQ_DARK_THEME : VYOTIQ_LIGHT_THEME;
}
