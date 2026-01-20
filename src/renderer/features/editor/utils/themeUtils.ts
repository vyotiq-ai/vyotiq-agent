/**
 * Theme Utilities
 * 
 * Custom Monaco Editor theme definitions matching the app's design.
 */

import type * as monaco from 'monaco-editor';

/** Vyotiq Dark theme definition */
export const vyotiqDarkTheme: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Comments
    { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
    { token: 'comment.line', foreground: '5c6370', fontStyle: 'italic' },
    { token: 'comment.block', foreground: '5c6370', fontStyle: 'italic' },
    
    // Keywords
    { token: 'keyword', foreground: 'c678dd' },
    { token: 'keyword.control', foreground: 'c678dd' },
    { token: 'keyword.operator', foreground: '56b6c2' },
    { token: 'storage', foreground: 'c678dd' },
    { token: 'storage.type', foreground: 'c678dd' },
    
    // Strings
    { token: 'string', foreground: '98c379' },
    { token: 'string.escape', foreground: '56b6c2' },
    { token: 'string.regexp', foreground: '98c379' },
    
    // Numbers
    { token: 'number', foreground: 'd19a66' },
    { token: 'number.hex', foreground: 'd19a66' },
    { token: 'number.float', foreground: 'd19a66' },
    
    // Types
    { token: 'type', foreground: 'e5c07b' },
    { token: 'type.identifier', foreground: 'e5c07b' },
    { token: 'class', foreground: 'e5c07b' },
    { token: 'interface', foreground: 'e5c07b' },
    { token: 'enum', foreground: 'e5c07b' },
    
    // Functions
    { token: 'function', foreground: '61afef' },
    { token: 'function.declaration', foreground: '61afef' },
    { token: 'method', foreground: '61afef' },
    
    // Variables
    { token: 'variable', foreground: 'e06c75' },
    { token: 'variable.parameter', foreground: 'e06c75' },
    { token: 'variable.other', foreground: 'abb2bf' },
    { token: 'parameter', foreground: 'e06c75' },
    
    // Properties
    { token: 'property', foreground: '56b6c2' },
    { token: 'attribute', foreground: 'd19a66' },
    
    // Constants
    { token: 'constant', foreground: 'd19a66' },
    { token: 'constant.language', foreground: 'd19a66' },
    { token: 'constant.numeric', foreground: 'd19a66' },
    
    // Operators
    { token: 'operator', foreground: '56b6c2' },
    { token: 'delimiter', foreground: 'abb2bf' },
    { token: 'delimiter.bracket', foreground: 'abb2bf' },
    
    // Tags (HTML/XML)
    { token: 'tag', foreground: 'e06c75' },
    { token: 'tag.attribute.name', foreground: 'd19a66' },
    { token: 'tag.attribute.value', foreground: '98c379' },
    
    // Markdown
    { token: 'markup.heading', foreground: 'e06c75', fontStyle: 'bold' },
    { token: 'markup.bold', fontStyle: 'bold' },
    { token: 'markup.italic', fontStyle: 'italic' },
    { token: 'markup.inline.raw', foreground: '98c379' },
    { token: 'markup.list', foreground: 'e06c75' },
    { token: 'markup.quote', foreground: '5c6370', fontStyle: 'italic' },
    
    // JSON
    { token: 'string.key.json', foreground: 'e06c75' },
    { token: 'string.value.json', foreground: '98c379' },
    
    // Invalid
    { token: 'invalid', foreground: 'f44747' },
    { token: 'invalid.illegal', foreground: 'f44747' },
  ],
  colors: {
    // Editor
    'editor.background': '#0b0b0f',
    'editor.foreground': '#abb2bf',
    'editor.lineHighlightBackground': '#1a1a1d',
    'editor.lineHighlightBorder': '#1a1a1d',
    'editor.selectionBackground': '#3e4451',
    'editor.selectionHighlightBackground': '#3e445180',
    'editor.inactiveSelectionBackground': '#3e445150',
    'editor.wordHighlightBackground': '#3e445150',
    'editor.wordHighlightStrongBackground': '#3e445180',
    'editor.findMatchBackground': '#42557b',
    'editor.findMatchHighlightBackground': '#314365',
    'editor.findRangeHighlightBackground': '#3e445150',
    'editor.hoverHighlightBackground': '#3e445150',
    'editor.rangeHighlightBackground': '#3e445150',
    
    // Cursor
    'editorCursor.foreground': '#34d399',
    'editorCursor.background': '#0b0b0f',
    
    // Line numbers
    'editorLineNumber.foreground': '#3f3f46',
    'editorLineNumber.activeForeground': '#71717a',
    
    // Indent guides
    'editorIndentGuide.background': '#1f1f24',
    'editorIndentGuide.activeBackground': '#3f3f46',
    
    // Whitespace
    'editorWhitespace.foreground': '#3f3f46',
    
    // Brackets
    'editorBracketMatch.background': '#3e445180',
    'editorBracketMatch.border': '#34d399',
    'editorBracketHighlight.foreground1': '#d19a66',
    'editorBracketHighlight.foreground2': '#c678dd',
    'editorBracketHighlight.foreground3': '#56b6c2',
    'editorBracketHighlight.foreground4': '#98c379',
    'editorBracketHighlight.foreground5': '#e06c75',
    'editorBracketHighlight.foreground6': '#61afef',
    
    // Gutter
    'editorGutter.background': '#0b0b0f',
    'editorGutter.modifiedBackground': '#e5c07b',
    'editorGutter.addedBackground': '#98c379',
    'editorGutter.deletedBackground': '#e06c75',
    
    // Minimap
    'minimap.background': '#0a0a0c',
    'minimap.selectionHighlight': '#3e4451',
    'minimap.findMatchHighlight': '#42557b',
    
    // Scrollbar
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#3f3f4650',
    'scrollbarSlider.hoverBackground': '#52525b80',
    'scrollbarSlider.activeBackground': '#71717a80',
    
    // Widget
    'editorWidget.background': '#0f0f12',
    'editorWidget.border': '#1f1f24',
    'editorWidget.foreground': '#abb2bf',
    'editorSuggestWidget.background': '#0f0f12',
    'editorSuggestWidget.border': '#1f1f24',
    'editorSuggestWidget.foreground': '#abb2bf',
    'editorSuggestWidget.selectedBackground': '#1a1a1d',
    'editorSuggestWidget.highlightForeground': '#34d399',
    
    // Hover
    'editorHoverWidget.background': '#0f0f12',
    'editorHoverWidget.border': '#1f1f24',
    
    // Peek view
    'peekView.border': '#34d399',
    'peekViewEditor.background': '#0b0b0f',
    'peekViewEditorGutter.background': '#0a0a0c',
    'peekViewResult.background': '#0f0f12',
    'peekViewResult.lineForeground': '#abb2bf',
    'peekViewResult.selectionBackground': '#1a1a1d',
    'peekViewTitle.background': '#0f0f12',
    'peekViewTitleLabel.foreground': '#abb2bf',
    
    // Overview ruler
    'editorOverviewRuler.border': '#1f1f24',
    'editorOverviewRuler.findMatchForeground': '#42557b',
    'editorOverviewRuler.rangeHighlightForeground': '#3e4451',
    'editorOverviewRuler.selectionHighlightForeground': '#3e4451',
    'editorOverviewRuler.wordHighlightForeground': '#3e4451',
    'editorOverviewRuler.modifiedForeground': '#e5c07b',
    'editorOverviewRuler.addedForeground': '#98c379',
    'editorOverviewRuler.deletedForeground': '#e06c75',
    'editorOverviewRuler.errorForeground': '#f44747',
    'editorOverviewRuler.warningForeground': '#e5c07b',
    'editorOverviewRuler.infoForeground': '#61afef',
    
    // Error/Warning
    'editorError.foreground': '#f44747',
    'editorWarning.foreground': '#e5c07b',
    'editorInfo.foreground': '#61afef',
    'editorHint.foreground': '#98c379',
    
    // Sticky Scroll
    'editorStickyScroll.background': '#0a0a0c',
    'editorStickyScrollHover.background': '#0f0f12',
    'editorStickyScroll.border': '#1f1f24',
    'editorStickyScroll.shadow': '#00000050',
    
    // Inlay Hints
    'editorInlayHint.background': '#1a1a1d80',
    'editorInlayHint.foreground': '#71717a',
    'editorInlayHint.typeForeground': '#61afef90',
    'editorInlayHint.parameterForeground': '#d19a6690',
    
    // Linked Editing
    'editor.linkedEditingBackground': '#c678dd30',
    
    // Bracket Pair Colorization (additional)
    'editorBracketPairGuide.background1': '#d19a6650',
    'editorBracketPairGuide.background2': '#c678dd50',
    'editorBracketPairGuide.background3': '#56b6c250',
    'editorBracketPairGuide.background4': '#98c37950',
    'editorBracketPairGuide.background5': '#e06c7550',
    'editorBracketPairGuide.background6': '#61afef50',
    'editorBracketPairGuide.activeBackground1': '#d19a66',
    'editorBracketPairGuide.activeBackground2': '#c678dd',
    'editorBracketPairGuide.activeBackground3': '#56b6c2',
    'editorBracketPairGuide.activeBackground4': '#98c379',
    'editorBracketPairGuide.activeBackground5': '#e06c75',
    'editorBracketPairGuide.activeBackground6': '#61afef',
    
    // Code Lens
    'editorCodeLens.foreground': '#71717a',
    
    // Folding
    'editor.foldBackground': '#3e445120',
    'editorGutter.foldingControlForeground': '#71717a',
    
    // Ghost Text (AI Suggestions)
    'editorGhostText.background': '#00000000',
    'editorGhostText.foreground': '#71717a80',
    'editorGhostText.border': '#00000000',
    
    // Marker Navigation (F8)
    'editorMarkerNavigation.background': '#0f0f12',
    'editorMarkerNavigationError.background': '#f4474730',
    'editorMarkerNavigationWarning.background': '#e5c07b30',
    'editorMarkerNavigationInfo.background': '#61afef30',
    'editorMarkerNavigationError.headerBackground': '#f4474720',
    'editorMarkerNavigationWarning.headerBackground': '#e5c07b20',
    'editorMarkerNavigationInfo.headerBackground': '#61afef20',
    
    // Lightbulb (Quick Fix)
    'editorLightBulb.foreground': '#e5c07b',
    'editorLightBulbAutoFix.foreground': '#34d399',
    
    // Ruler
    'editorRuler.foreground': '#1f1f24',
    
    // Unicode Highlight
    'editorUnicodeHighlight.border': '#e5c07b',
    'editorUnicodeHighlight.background': '#e5c07b20',
    
    // Diff Editor colors - matched with unified diff view
    'diffEditor.insertedTextBackground': '#1a2e1a',
    'diffEditor.insertedLineBackground': '#1a2e1a',
    'diffEditor.removedTextBackground': '#2e1a1a',
    'diffEditor.removedLineBackground': '#2e1a1a',
    'diffEditor.border': '#1f1f24',
    'diffEditor.diagonalFill': '#1a1a1d50',
    'diffEditorGutter.insertedLineBackground': '#1f3a1f',
    'diffEditorGutter.removedLineBackground': '#3a1f1f',
    'diffEditorOverview.insertedForeground': '#98c379',
    'diffEditorOverview.removedForeground': '#e06c75',
  },
};

/**
 * Register custom themes with Monaco
 */
export function registerCustomThemes(monacoInstance: typeof monaco): void {
  monacoInstance.editor.defineTheme('vyotiq-dark', vyotiqDarkTheme);
}
