import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { GlobalStatusBar } from './GlobalStatusBar';
import { MOBILE_BREAKPOINT, TABLET_BREAKPOINT } from '../../utils/constants';
import { cn } from '../../utils/cn';
import { useLocalStorage, useResizablePanel } from '../../hooks';
import { EditorPanel, openFileInEditor } from '../../features/editor/components/EditorPanel';
import { useEditorStore } from '../../features/editor/store/editorStore';
import { BottomPanel } from '../../features/terminal/components/BottomPanel';

interface MainLayoutProps {
  children: React.ReactNode;
  onOpenSettings: () => void;
}

// Sidebar width constraints
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 248;

export const MainLayout: React.FC<MainLayoutProps> = ({ children, onOpenSettings }) => {
  // Persisted layout preferences
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('vyotiq-sidebar-collapsed', false);

  // Sidebar resize via shared hook
  const {
    size: sidebarWidth,
    isResizing,
    resizeHandleProps: sidebarResizeProps,
  } = useResizablePanel({
    direction: 'horizontal',
    initialSize: DEFAULT_SIDEBAR_WIDTH,
    minSize: MIN_SIDEBAR_WIDTH,
    maxSize: MAX_SIDEBAR_WIDTH,
    persistKey: 'vyotiq-sidebar-width',
  });

  // Editor resize via shared hook (right-anchored, uses invertDelta)
  const {
    size: editorWidth,
    isResizing: isEditorResizing,
    resizeHandleProps: editorResizeProps,
  } = useResizablePanel({
    direction: 'horizontal',
    initialSize: 500,
    minSize: 300,
    maxSize: Math.round(typeof window !== 'undefined' ? window.innerWidth * 0.7 : 900),
    persistKey: 'vyotiq-editor-width',
    invertDelta: true,
  });

  const { state: editorState } = useEditorStore();
  const editorVisible = editorState.isVisible && editorState.tabs.length > 0;

  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [bottomPanelOpen, setBottomPanelOpen] = useLocalStorage('vyotiq-bottom-panel-open', false);

  const toggleBottomPanel = useCallback(() => {
    setBottomPanelOpen((prev: boolean) => !prev);
  }, [setBottomPanelOpen]);

  // Handle responsive behavior with debounced resize
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const width = window.innerWidth;
        const mobile = width < MOBILE_BREAKPOINT;
        const tablet = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT;

        setIsMobile(mobile);
        setIsTablet(tablet);

        // Auto-collapse sidebar on mobile
        if (mobile && !sidebarCollapsed) {
          setSidebarCollapsed(true);
        }
      }, 100);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [sidebarCollapsed, setSidebarCollapsed]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, [setSidebarCollapsed]);

  // Close sidebar when clicking overlay on mobile
  const handleOverlayClick = useCallback(() => {
    if (isMobile && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }
  }, [isMobile, sidebarCollapsed, setSidebarCollapsed]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl/Cmd + B for sidebar toggle
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        handleToggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleSidebar]);

  // Listen for global file-open events (dispatched from file tree, search results, etc.)
  useEffect(() => {
    const handleOpenFile = (e: Event) => {
      const detail = (e as CustomEvent<{ filePath: string }>).detail;
      if (detail?.filePath) {
        openFileInEditor(detail.filePath);
      }
    };
    const handleOpenFileDiff = (e: Event) => {
      const detail = (e as CustomEvent<{ filePath: string }>).detail;
      if (detail?.filePath) {
        // Import the store's imperative openFile to open in diff mode
        import('../../features/editor/store/editorStore').then(({ openFileImperative }) => {
          openFileImperative(detail.filePath, { preview: false, viewMode: 'diff' });
        });
      }
    };
    document.addEventListener('vyotiq:open-file', handleOpenFile);
    document.addEventListener('vyotiq:open-file-diff', handleOpenFileDiff);
    return () => {
      document.removeEventListener('vyotiq:open-file', handleOpenFile);
      document.removeEventListener('vyotiq:open-file-diff', handleOpenFileDiff);
    };
  }, []);

  // Memoized content renderer
  const chatContent = useMemo(() => (
    <main className="flex-1 min-w-0 min-h-0 overflow-hidden relative flex flex-col bg-[var(--color-surface-base)] h-full w-full transition-colors">
      <div className="flex-1 min-h-0 h-full overflow-hidden">
        {children}
      </div>
    </main>
  ), [children]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--color-surface-base)] text-[var(--color-text-primary)] font-sans transition-colors">
      <Header
        collapsed={sidebarCollapsed}
        onToggle={handleToggleSidebar}
        onOpenSettings={onOpenSettings}
        isMobile={isMobile}
        isTablet={isTablet}
      />
      <div className="flex flex-1 overflow-hidden relative z-0">
        {/* Mobile overlay */}
        {isMobile && !sidebarCollapsed && (
          <div
            className="fixed inset-0 bg-black/60 z-10 animate-in fade-in duration-200 backdrop-blur-sm"
            onClick={handleOverlayClick}
            aria-hidden="true"
          />
        )}

        {/* Sidebar with resizable support */}
        <div
          className={cn(
            'shrink-0 relative',
            isMobile && !sidebarCollapsed && 'fixed left-0 top-[32px] bottom-0 z-20',
            !sidebarCollapsed && !isMobile && 'transition-none',
            sidebarCollapsed && 'transition-all duration-300 ease-in-out'
          )}
          style={{
            width: sidebarCollapsed ? 0 : (isMobile ? 248 : sidebarWidth),
          }}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            width={sidebarWidth}
          />

          {/* Resize handle - enhanced with visual indicator */}
          {!sidebarCollapsed && !isMobile && (
            <div
              className={cn(
                'absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group',
                'hover:bg-[var(--color-accent-primary)]/20 transition-colors',
                isResizing && 'bg-[var(--color-accent-primary)]/30'
              )}
              {...sidebarResizeProps}
            >
              {/* Visual drag handle indicator */}
              <div
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 left-0 w-full h-12 flex flex-col justify-center items-center gap-0.5',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  isResizing && 'opacity-100'
                )}
              >
                <div className="w-0.5 h-1.5 rounded-full bg-[var(--color-accent-primary)]/60" />
                <div className="w-0.5 h-1.5 rounded-full bg-[var(--color-accent-primary)]/60" />
                <div className="w-0.5 h-1.5 rounded-full bg-[var(--color-accent-primary)]/60" />
              </div>
            </div>
          )}
        </div>

        {/* Main content area — split between chat, editor, and bottom panel */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
            {/* Chat content area */}
            {chatContent}

            {/* Editor panel with resize handle */}
            {editorVisible && (
              <>
                {/* Editor resize handle */}
                <div
                  className={cn(
                    'w-1.5 cursor-col-resize z-10 group shrink-0',
                    'hover:bg-[var(--color-accent-primary)]/20 transition-colors',
                    isEditorResizing && 'bg-[var(--color-accent-primary)]/30'
                  )}
                  {...editorResizeProps}
                >
                  <div
                    className={cn(
                      'relative top-1/2 -translate-y-1/2 w-full h-12 flex flex-col justify-center items-center gap-0.5',
                      'opacity-0 group-hover:opacity-100 transition-opacity',
                      isEditorResizing && 'opacity-100'
                    )}
                  >
                    <div className="w-0.5 h-1.5 rounded-full bg-[var(--color-accent-primary)]/60" />
                    <div className="w-0.5 h-1.5 rounded-full bg-[var(--color-accent-primary)]/60" />
                    <div className="w-0.5 h-1.5 rounded-full bg-[var(--color-accent-primary)]/60" />
                  </div>
                </div>

                {/* Editor panel */}
                <div className="shrink-0 min-h-0 overflow-hidden" style={{ width: editorWidth }}>
                  <EditorPanel />
                </div>
              </>
            )}
          </div>

          {/* Bottom panel (Terminal / Problems / Output / Debug Console) */}
          <BottomPanel isOpen={bottomPanelOpen} onToggle={toggleBottomPanel} />
        </div>
      </div>
      <GlobalStatusBar />
    </div>
  );
};
