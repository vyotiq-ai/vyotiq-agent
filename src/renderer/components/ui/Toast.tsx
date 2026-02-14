/**
 * Toast Notification System
 * 
 * Global toast notifications with terminal/CLI aesthetic.
 * Supports success, error, warning, and info types with auto-dismiss.
 * Includes toast history for reviewing past notifications.
 * 
 * Usage:
 *   import { useToast } from '../../components/ui/Toast';
 *   const { toast } = useToast();
 *   toast({ type: 'success', message: 'Settings saved' });
 */
import React, { createContext, useContext, useCallback, useState, useRef, useMemo, memo, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X, History, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../utils/cn';

// =============================================================================
// Types
// =============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  /** Optional title prefix */
  title?: string;
  /** Auto-dismiss duration in ms (default: 4000, 0 = no auto-dismiss) */
  duration?: number;
  /** Timestamp when the toast was created */
  createdAt?: number;
}

export type ToastOptions = Omit<ToastItem, 'id' | 'createdAt'>;

interface ToastContextType {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  /** Recent toast history (last 50) */
  history: ToastItem[];
  /** Clear all toast history */
  clearHistory: () => void;
}

// =============================================================================
// Context
// =============================================================================

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 5;
const MAX_HISTORY = 50;

const typeConfig: Record<ToastType, {
  icon: React.FC<{ size: number; className?: string }>;
  label: string;
  containerClass: string;
  iconClass: string;
}> = {
  success: {
    icon: CheckCircle,
    label: 'OK',
    containerClass: 'border-[var(--color-success)]/30 bg-[var(--color-success)]/8',
    iconClass: 'text-[var(--color-success)]',
  },
  error: {
    icon: AlertCircle,
    label: 'ERR',
    containerClass: 'border-[var(--color-error)]/30 bg-[var(--color-error)]/8',
    iconClass: 'text-[var(--color-error)]',
  },
  warning: {
    icon: AlertCircle,
    label: 'WARN',
    containerClass: 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/8',
    iconClass: 'text-[var(--color-warning)]',
  },
  info: {
    icon: Info,
    label: 'INFO',
    containerClass: 'border-[var(--color-info)]/30 bg-[var(--color-info)]/8',
    iconClass: 'text-[var(--color-info)]',
  },
};

// =============================================================================
// Single Toast Component
// =============================================================================

interface ToastEntryProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

const ToastEntry = memo<ToastEntryProps>(({ item, onDismiss }) => {
  const config = typeConfig[item.type];
  const Icon = config.icon;
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onDismiss(item.id), 150);
  }, [item.id, onDismiss]);

  // Auto-dismiss timer
  useEffect(() => {
    const duration = item.duration ?? DEFAULT_DURATION;
    if (duration <= 0) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [item.duration, handleDismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 px-3 py-2 border rounded-sm font-mono',
        'shadow-lg shadow-black/20 backdrop-blur-sm',
        'transition-all duration-150',
        isExiting
          ? 'opacity-0 translate-x-4 scale-95'
          : 'opacity-100 translate-x-0 scale-100 animate-in slide-in-from-right-2 fade-in duration-200',
        config.containerClass,
      )}
    >
      {/* Icon */}
      <Icon size={12} className={cn('flex-shrink-0 mt-0.5', config.iconClass)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {item.title && (
          <span className={cn('text-[10px] font-medium', config.iconClass)}>
            [{config.label}] {item.title}
          </span>
        )}
        <p className="text-[10px] text-[var(--color-text-primary)] leading-relaxed">
          {!item.title && (
            <span className={cn('font-medium mr-1', config.iconClass)}>[{config.label}]</span>
          )}
          {item.message}
        </p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/50"
        aria-label="Dismiss notification"
      >
        <X size={10} />
      </button>
    </div>
  );
});
ToastEntry.displayName = 'ToastEntry';

// =============================================================================
// Toast Container with History
// =============================================================================

const ToastHistoryPanel = memo<{
  history: ToastItem[];
  onClear: () => void;
  onClose: () => void;
}>(({ history, onClear, onClose }) => {
  if (history.length === 0) {
    return (
      <div className="bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] rounded-sm p-3 font-mono">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-[var(--color-text-secondary)] font-medium">Notification History</span>
          <button
            onClick={onClose}
            className="p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Close history"
          >
            <X size={10} />
          </button>
        </div>
        <p className="text-[9px] text-[var(--color-text-muted)]">No recent notifications</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-surface-editor)] border border-[var(--color-border-subtle)] rounded-sm font-mono max-h-72 flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border-subtle)]">
        <span className="text-[10px] text-[var(--color-text-secondary)] font-medium">
          Notification History ({history.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onClear}
            className="text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors px-1"
          >
            clear
          </button>
          <button
            onClick={onClose}
            className="p-0.5 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors"
            aria-label="Close history"
          >
            <X size={10} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto flex-1 divide-y divide-[var(--color-border-subtle)]/50">
        {history.map((item) => {
          const config = typeConfig[item.type];
          const Icon = config.icon;
          const timeStr = item.createdAt
            ? new Date(item.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : '';
          return (
            <div key={item.id} className="flex items-start gap-2 px-3 py-1.5">
              <Icon size={10} className={cn('flex-shrink-0 mt-0.5', config.iconClass)} />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-[var(--color-text-secondary)] leading-relaxed truncate">
                  <span className={cn('font-medium mr-1', config.iconClass)}>[{config.label}]</span>
                  {item.message}
                </p>
              </div>
              {timeStr && (
                <span className="text-[8px] text-[var(--color-text-muted)] flex-shrink-0 tabular-nums">{timeStr}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
ToastHistoryPanel.displayName = 'ToastHistoryPanel';

const ToastContainer = memo<{
  toasts: ToastItem[];
  history: ToastItem[];
  onDismiss: (id: string) => void;
  onClearHistory: () => void;
}>(({ toasts, history, onDismiss, onClearHistory }) => {
  const [showHistory, setShowHistory] = useState(false);

  // If no toasts and no history toggle, render nothing
  if (toasts.length === 0 && !showHistory && history.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[200] flex flex-col gap-1.5 w-80 pointer-events-auto"
      aria-label="Notifications"
    >
      {showHistory && (
        <ToastHistoryPanel
          history={history}
          onClear={() => {
            onClearHistory();
            setShowHistory(false);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
      {toasts.map((item) => (
        <ToastEntry key={item.id} item={item} onDismiss={onDismiss} />
      ))}
      {history.length > 0 && !showHistory && toasts.length === 0 && (
        <button
          onClick={() => setShowHistory(true)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 self-end',
            'text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            'font-mono transition-colors rounded-sm',
            'border border-[var(--color-border-subtle)]/50 bg-[var(--color-surface-editor)]/80',
            'hover:bg-[var(--color-surface-1)]',
          )}
          aria-label="Show notification history"
        >
          <History size={10} />
          {showHistory ? <ChevronDown size={8} /> : <ChevronUp size={8} />}
          history ({history.length})
        </button>
      )}
    </div>
  );
});
ToastContainer.displayName = 'ToastContainer';

// =============================================================================
// Provider
// =============================================================================

let toastCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [history, setHistory] = useState<ToastItem[]>([]);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const toast = useCallback((options: ToastOptions): string => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    const newToast: ToastItem = { ...options, id, createdAt: Date.now() };

    setToasts((prev) => {
      // Limit max visible toasts
      const updated = [...prev, newToast];
      return updated.length > MAX_TOASTS ? updated.slice(-MAX_TOASTS) : updated;
    });

    // Add to history (newest first)
    setHistory((prev) => {
      const updated = [newToast, ...prev];
      return updated.length > MAX_HISTORY ? updated.slice(0, MAX_HISTORY) : updated;
    });

    return id;
  }, []);

  const contextValue = useMemo<ToastContextType>(
    () => ({ toast, dismiss, dismissAll, history, clearHistory }),
    [toast, dismiss, dismissAll, history, clearHistory],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} history={history} onDismiss={dismiss} onClearHistory={clearHistory} />
    </ToastContext.Provider>
  );
};

// =============================================================================
// Hook
// =============================================================================

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
