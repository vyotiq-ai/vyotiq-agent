import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useFocusTrap, useAnnouncer, useReducedMotion } from '../../utils/accessibility';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  className,
  footer,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const prefersReducedMotion = useReducedMotion();
  const { announce } = useAnnouncer();
  
  const ref = useClickOutside<HTMLDivElement>(() => {
    if (open) onClose();
  });
  
  // Focus trap for accessibility
  useFocusTrap(modalRef, open);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) {
      const prevOverflow = document.body.style.overflow;
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      // Announce modal to screen readers
      announce(`${title} dialog opened`, 'polite');
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [open, onClose, title, announce]);

  if (!open) return null;

  return (
    <div 
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-sm",
        !prefersReducedMotion && "animate-in fade-in duration-200"
      )}
    >
      <div
        ref={(node) => {
          // Combine refs
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          (modalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn(
          'w-full max-w-3xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] overflow-hidden flex flex-col max-h-full font-mono shadow-2xl shadow-black/50',
          !prefersReducedMotion && 'animate-in zoom-in-95 slide-in-from-bottom-2 duration-200',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-surface-header)] border-b border-[var(--color-border-subtle)] shrink-0">
          <div>
            <h2 id={titleId} className="text-[11px] text-[var(--color-text-primary)]">{title}</h2>
            {description && (
              <p id={descId} className="text-[9px] text-[var(--color-text-placeholder)]"># {description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded-sm text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors duration-150"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        
        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[var(--scrollbar-thumb)] scrollbar-track-transparent">
          {children}
        </div>

        {/* Footer with separator line animation */}
        {footer && (
          <div className="relative px-4 py-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-sidebar)] shrink-0 flex items-center justify-end gap-2">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--color-accent-primary)]/20 to-transparent" />
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
