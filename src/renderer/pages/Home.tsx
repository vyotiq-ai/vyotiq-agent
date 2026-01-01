/**
 * Home Page
 * 
 * Main workspace view with chat interface and code editor.
 */
import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { ChatArea, ChatInput } from '../features/chat';
import { useEditor } from '../state/EditorProvider';
import { useFileOperationDiff } from '../hooks';
import { cn } from '../utils/cn';
import { Loader2 } from 'lucide-react';
import { FeatureErrorBoundary } from '../components/layout/ErrorBoundary';

// Lazy load EditorView to defer Monaco bundle loading until editor is shown
// Monaco is ~1.5MB and should not block initial chat UI
// Wrapped in FeatureErrorBoundary to handle HMR context issues gracefully
const EditorView = lazy(() =>
  import('../features/editor').then(module => ({ default: module.EditorView }))
);

const EditorLoader: React.FC = () => (
  <div className="h-full flex items-center justify-center bg-[var(--color-surface-base)]">
    <div className="flex items-center gap-3 text-[var(--color-text-secondary)]">
      <Loader2 className="animate-spin" size={16} />
      <span className="text-xs font-medium">Loading editor...</span>
    </div>
  </div>
);

export const Home: React.FC = () => {
  const { tabs, isEditorVisible, isOperationDiffVisible, isDiffVisible } = useEditor();
  const [editorWidth, setEditorWidth] = useState(50); // percentage
  const [isResizing, setIsResizing] = useState(false);
  
  // Auto-open modified files in a new tab when the agent edits them
  useFileOperationDiff({ enabled: true, autoOpenEditor: true });
  
  // Show editor panel when there are open tabs OR when there's a diff visible
  const showEditor = isEditorVisible && (tabs.length > 0 || isOperationDiffVisible || isDiffVisible);
  
  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);
  
  useEffect(() => {
    if (!isResizing) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById('home-split-container');
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      const percentage = ((e.clientX - rect.left) / rect.width) * 100;
      const clampedPercentage = Math.max(20, Math.min(80, percentage));
      setEditorWidth(clampedPercentage);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);
  
  return (
    <div 
      id="home-split-container"
      className="flex h-full w-full min-h-0 min-w-0 overflow-hidden"
    >
      {/* Editor panel - left side when visible */}
      {showEditor && (
        <>
          <div 
            className="flex flex-col min-w-0 min-h-0 overflow-hidden border-r border-[var(--color-border-subtle)]"
            style={{ width: `${editorWidth}%` }}
          >
            <FeatureErrorBoundary featureName="Editor">
              <Suspense fallback={<EditorLoader />}>
                <EditorView />
              </Suspense>
            </FeatureErrorBoundary>
          </div>
          
          {/* Resize handle */}
          <div
            className={cn(
              'w-1 cursor-col-resize hover:bg-[var(--color-accent-primary)]/20 transition-colors flex-shrink-0',
              isResizing && 'bg-[var(--color-accent-primary)]/30'
            )}
            onMouseDown={handleResizeStart}
          />
        </>
      )}
      
      {/* Chat panel - takes full width or remaining width */}
      <div 
        className={cn(
          "flex flex-col min-w-0 min-h-0 overflow-hidden",
          showEditor ? 'flex-1' : 'flex-1 w-full'
        )}
        style={showEditor ? { width: `${100 - editorWidth}%` } : undefined}
      >
        <ChatArea />
        <div className="shrink-0 bg-[var(--color-surface-base)]">
          <ChatInput />
        </div>
      </div>
    </div>
  );
};
