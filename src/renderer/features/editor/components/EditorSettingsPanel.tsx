/**
 * Editor Settings Panel
 * 
 * VS Code-style editor settings panel with categorized settings.
 * Provides controls for editor appearance, behavior, formatting, and LSP settings.
 */

import React, { memo, useCallback, useState, useMemo } from 'react';
import {
  X, Settings, Type, WrapText, Map, Code2, Palette,
  Keyboard, Zap, Eye, Hash, Braces, Indent, ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useEditorStore } from '../store/editorStore';

// =============================================================================
// Types
// =============================================================================

interface EditorSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsCategory = 'editor' | 'formatting' | 'intellisense' | 'display';

interface ToggleSettingProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

interface SliderSettingProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

interface SelectSettingProps {
  label: string;
  description: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}

// =============================================================================
// Sub-Components
// =============================================================================

const ToggleSetting = memo<ToggleSettingProps>(({ label, description, value, onChange }) => (
  <div className="flex items-start justify-between gap-3 py-2">
    <div className="flex-1 min-w-0">
      <div className="text-[11px] font-mono text-[var(--color-text-primary)]">{label}</div>
      <div className="text-[9px] font-mono text-[var(--color-text-dim)] mt-0.5">{description}</div>
    </div>
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'relative w-8 h-[18px] rounded-full transition-colors duration-150 shrink-0 mt-0.5',
        value
          ? 'bg-[var(--color-accent-primary)]'
          : 'bg-[var(--color-surface-3)]',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-150',
          value ? 'translate-x-[16px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  </div>
));
ToggleSetting.displayName = 'ToggleSetting';

const SliderSetting = memo<SliderSettingProps>(({ label, description, value, min, max, step = 1, onChange }) => (
  <div className="py-2">
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] font-mono text-[var(--color-text-primary)]">{label}</div>
      <span className="text-[10px] font-mono text-[var(--color-accent-primary)]">{value}</span>
    </div>
    <div className="text-[9px] font-mono text-[var(--color-text-dim)] mt-0.5 mb-1.5">{description}</div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1 rounded-full appearance-none bg-[var(--color-surface-3)] accent-[var(--color-accent-primary)]"
    />
  </div>
));
SliderSetting.displayName = 'SliderSetting';

const SelectSetting = memo<SelectSettingProps>(({ label, description, value, options, onChange }) => (
  <div className="py-2">
    <div className="text-[11px] font-mono text-[var(--color-text-primary)]">{label}</div>
    <div className="text-[9px] font-mono text-[var(--color-text-dim)] mt-0.5 mb-1.5">{description}</div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full bg-[var(--color-surface-2)] text-[10px] font-mono',
        'px-2 py-1 rounded border border-[var(--color-border-subtle)]/30',
        'text-[var(--color-text-primary)]',
        'focus:outline-none focus:border-[var(--color-accent-primary)]/50',
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
));
SelectSetting.displayName = 'SelectSetting';

// =============================================================================
// Category Section
// =============================================================================

interface CategorySectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CategorySection = memo<CategorySectionProps>(({ title, icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--color-border-subtle)]/30">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-left',
          'text-[10px] font-mono font-medium text-[var(--color-text-secondary)]',
          'hover:bg-[var(--color-surface-2)] transition-colors duration-75',
        )}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="text-[var(--color-text-muted)]">{icon}</span>
        <span className="uppercase tracking-wider">{title}</span>
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
});
CategorySection.displayName = 'CategorySection';

// =============================================================================
// Editor Settings Panel
// =============================================================================

export const EditorSettingsPanel: React.FC<EditorSettingsPanelProps> = memo(({
  isOpen,
  onClose,
}) => {
  const { state, toggleWordWrap, toggleMinimap, setEditorFontSize } = useEditorStore();

  // Local extended settings state (stored in localStorage for persistence)
  const [tabSize, setTabSize] = useState(() => {
    try { return Number(localStorage.getItem('vyotiq-editor-tabSize')) || 2; } catch { return 2; }
  });
  const [insertSpaces, setInsertSpaces] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-insertSpaces') !== 'false'; } catch { return true; }
  });
  const [renderWhitespace, setRenderWhitespace] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-renderWhitespace') || 'selection'; } catch { return 'selection'; }
  });
  const [cursorStyle, setCursorStyle] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-cursorStyle') || 'line'; } catch { return 'line'; }
  });
  const [cursorBlinking, setCursorBlinking] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-cursorBlinking') || 'smooth'; } catch { return 'smooth'; }
  });
  const [bracketPairColorization, setBracketPairColorization] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-bracketColors') !== 'false'; } catch { return true; }
  });
  const [stickyScroll, setStickyScroll] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-stickyScroll') !== 'false'; } catch { return true; }
  });
  const [lineNumbers, setLineNumbers] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-lineNumbers') || 'on'; } catch { return 'on'; }
  });
  const [formatOnSave, setFormatOnSave] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-formatOnSave') === 'true'; } catch { return false; }
  });
  const [formatOnPaste, setFormatOnPaste] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-formatOnPaste') !== 'false'; } catch { return true; }
  });
  const [autoClosingBrackets, setAutoClosingBrackets] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-autoClosingBrackets') || 'always'; } catch { return 'always'; }
  });
  const [quickSuggestions, setQuickSuggestions] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-quickSuggestions') !== 'false'; } catch { return true; }
  });
  const [parameterHints, setParameterHints] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-parameterHints') !== 'false'; } catch { return true; }
  });
  const [suggestOnTriggerChars, setSuggestOnTriggerChars] = useState(() => {
    try { return localStorage.getItem('vyotiq-editor-suggestOnTrigger') !== 'false'; } catch { return true; }
  });

  // Persist extended settings
  const persistSetting = useCallback((key: string, value: string | number | boolean) => {
    try { localStorage.setItem(`vyotiq-editor-${key}`, String(value)); } catch { /* ignore */ }
  }, []);

  const handleTabSize = useCallback((v: number) => {
    setTabSize(v);
    persistSetting('tabSize', v);
    // Broadcast setting change
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { tabSize: v },
    }));
  }, [persistSetting]);

  const handleInsertSpaces = useCallback((v: boolean) => {
    setInsertSpaces(v);
    persistSetting('insertSpaces', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { insertSpaces: v },
    }));
  }, [persistSetting]);

  const handleRenderWhitespace = useCallback((v: string) => {
    setRenderWhitespace(v);
    persistSetting('renderWhitespace', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { renderWhitespace: v },
    }));
  }, [persistSetting]);

  const handleCursorStyle = useCallback((v: string) => {
    setCursorStyle(v);
    persistSetting('cursorStyle', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { cursorStyle: v },
    }));
  }, [persistSetting]);

  const handleCursorBlinking = useCallback((v: string) => {
    setCursorBlinking(v);
    persistSetting('cursorBlinking', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { cursorBlinking: v },
    }));
  }, [persistSetting]);

  const handleBracketColors = useCallback((v: boolean) => {
    setBracketPairColorization(v);
    persistSetting('bracketColors', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { bracketPairColorization: { enabled: v } },
    }));
  }, [persistSetting]);

  const handleStickyScroll = useCallback((v: boolean) => {
    setStickyScroll(v);
    persistSetting('stickyScroll', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { stickyScroll: { enabled: v } },
    }));
  }, [persistSetting]);

  const handleLineNumbers = useCallback((v: string) => {
    setLineNumbers(v);
    persistSetting('lineNumbers', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { lineNumbers: v },
    }));
  }, [persistSetting]);

  const handleFormatOnSave = useCallback((v: boolean) => {
    setFormatOnSave(v);
    persistSetting('formatOnSave', v);
  }, [persistSetting]);

  const handleFormatOnPaste = useCallback((v: boolean) => {
    setFormatOnPaste(v);
    persistSetting('formatOnPaste', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { formatOnPaste: v },
    }));
  }, [persistSetting]);

  const handleAutoClosingBrackets = useCallback((v: string) => {
    setAutoClosingBrackets(v);
    persistSetting('autoClosingBrackets', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { autoClosingBrackets: v },
    }));
  }, [persistSetting]);

  const handleQuickSuggestions = useCallback((v: boolean) => {
    setQuickSuggestions(v);
    persistSetting('quickSuggestions', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { quickSuggestions: v ? { other: true, comments: false, strings: true } : false },
    }));
  }, [persistSetting]);

  const handleParameterHints = useCallback((v: boolean) => {
    setParameterHints(v);
    persistSetting('parameterHints', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { parameterHints: { enabled: v } },
    }));
  }, [persistSetting]);

  const handleSuggestOnTrigger = useCallback((v: boolean) => {
    setSuggestOnTriggerChars(v);
    persistSetting('suggestOnTrigger', v);
    document.dispatchEvent(new CustomEvent('vyotiq:editor-settings-changed', {
      detail: { suggestOnTriggerCharacters: v },
    }));
  }, [persistSetting]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'relative z-10 w-[480px] max-h-[80vh] flex flex-col',
          'bg-[var(--color-surface-base)] border border-[var(--color-border-subtle)]/60',
          'rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)]',
          'animate-in fade-in-0 zoom-in-95 duration-150',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]/40 shrink-0">
          <div className="flex items-center gap-2 text-[12px] font-mono text-[var(--color-text-primary)]">
            <Settings size={14} />
            <span>Editor Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Editor section */}
          <CategorySection title="Editor" icon={<Code2 size={12} />}>
            <SliderSetting
              label="Font Size"
              description="Controls the editor font size in pixels."
              value={state.fontSize}
              min={8}
              max={32}
              onChange={setEditorFontSize}
            />
            <SliderSetting
              label="Tab Size"
              description="The number of spaces a tab is equal to."
              value={tabSize}
              min={1}
              max={8}
              onChange={handleTabSize}
            />
            <ToggleSetting
              label="Insert Spaces"
              description="Insert spaces when pressing Tab."
              value={insertSpaces}
              onChange={handleInsertSpaces}
            />
            <ToggleSetting
              label="Word Wrap"
              description="Controls how lines should wrap."
              value={state.wordWrap === 'on'}
              onChange={() => toggleWordWrap()}
            />
            <SelectSetting
              label="Cursor Style"
              description="Controls the cursor style."
              value={cursorStyle}
              options={[
                { label: 'Line', value: 'line' },
                { label: 'Block', value: 'block' },
                { label: 'Underline', value: 'underline' },
                { label: 'Line Thin', value: 'line-thin' },
                { label: 'Block Outline', value: 'block-outline' },
                { label: 'Underline Thin', value: 'underline-thin' },
              ]}
              onChange={handleCursorStyle}
            />
            <SelectSetting
              label="Cursor Animation"
              description="Controls the cursor animation style."
              value={cursorBlinking}
              options={[
                { label: 'Blink', value: 'blink' },
                { label: 'Smooth', value: 'smooth' },
                { label: 'Phase', value: 'phase' },
                { label: 'Expand', value: 'expand' },
                { label: 'Solid', value: 'solid' },
              ]}
              onChange={handleCursorBlinking}
            />
            <SelectSetting
              label="Line Numbers"
              description="Controls the display of line numbers."
              value={lineNumbers}
              options={[
                { label: 'On', value: 'on' },
                { label: 'Off', value: 'off' },
                { label: 'Relative', value: 'relative' },
                { label: 'Interval', value: 'interval' },
              ]}
              onChange={handleLineNumbers}
            />
          </CategorySection>

          {/* Display section */}
          <CategorySection title="Display" icon={<Eye size={12} />}>
            <ToggleSetting
              label="Minimap"
              description="Controls whether the minimap is shown."
              value={state.showMinimap}
              onChange={() => toggleMinimap()}
            />
            <ToggleSetting
              label="Bracket Pair Colorization"
              description="Controls whether bracket pair colorization is enabled."
              value={bracketPairColorization}
              onChange={handleBracketColors}
            />
            <ToggleSetting
              label="Sticky Scroll"
              description="Shows the current scope at the top of the editor."
              value={stickyScroll}
              onChange={handleStickyScroll}
            />
            <SelectSetting
              label="Render Whitespace"
              description="Controls how whitespace characters are rendered."
              value={renderWhitespace}
              options={[
                { label: 'None', value: 'none' },
                { label: 'Boundary', value: 'boundary' },
                { label: 'Selection', value: 'selection' },
                { label: 'Trailing', value: 'trailing' },
                { label: 'All', value: 'all' },
              ]}
              onChange={handleRenderWhitespace}
            />
          </CategorySection>

          {/* Formatting section */}
          <CategorySection title="Formatting" icon={<Indent size={12} />} defaultOpen={false}>
            <ToggleSetting
              label="Format on Save"
              description="Format the document when saving."
              value={formatOnSave}
              onChange={handleFormatOnSave}
            />
            <ToggleSetting
              label="Format on Paste"
              description="Format pasted content automatically."
              value={formatOnPaste}
              onChange={handleFormatOnPaste}
            />
            <SelectSetting
              label="Auto Closing Brackets"
              description="Controls whether the editor auto-closes brackets."
              value={autoClosingBrackets}
              options={[
                { label: 'Always', value: 'always' },
                { label: 'Before Whitespace', value: 'beforeWhitespace' },
                { label: 'Language Defined', value: 'languageDefined' },
                { label: 'Never', value: 'never' },
              ]}
              onChange={handleAutoClosingBrackets}
            />
          </CategorySection>

          {/* IntelliSense section */}
          <CategorySection title="IntelliSense" icon={<Zap size={12} />} defaultOpen={false}>
            <ToggleSetting
              label="Quick Suggestions"
              description="Controls whether suggestions are automatically shown while typing."
              value={quickSuggestions}
              onChange={handleQuickSuggestions}
            />
            <ToggleSetting
              label="Parameter Hints"
              description="Enables a pop-up showing parameter documentation."
              value={parameterHints}
              onChange={handleParameterHints}
            />
            <ToggleSetting
              label="Suggest on Trigger Characters"
              description="Show suggestions when trigger characters are typed."
              value={suggestOnTriggerChars}
              onChange={handleSuggestOnTrigger}
            />
          </CategorySection>
        </div>
      </div>
    </div>
  );
});

EditorSettingsPanel.displayName = 'EditorSettingsPanel';
