/**
 * ConfirmModal Component
 * 
 * A styled confirmation dialog to replace native window.confirm().
 * Uses terminal aesthetic consistent with the app's design.
 * 
 * @example
 * <ConfirmModal
 *   open={showConfirm}
 *   onConfirm={() => handleDelete()}
 *   onCancel={() => setShowConfirm(false)}
 *   title="Delete Session"
 *   message="Are you sure you want to delete this session?"
 *   confirmLabel="Delete"
 *   confirmVariant="destructive"
 * />
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, Info, HelpCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { cn } from '../../utils/cn';

export type ConfirmVariant = 'default' | 'destructive' | 'warning' | 'info';

export interface ConfirmModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called when user confirms the action */
  onConfirm: () => void;
  /** Called when user cancels or closes the modal */
  onCancel: () => void;
  /** Modal title */
  title: string;
  /** Message to display */
  message: string | React.ReactNode;
  /** Custom label for confirm button */
  confirmLabel?: string;
  /** Custom label for cancel button */
  cancelLabel?: string;
  /** Visual variant for the dialog */
  variant?: ConfirmVariant;
  /** Whether the confirm action is in progress */
  isLoading?: boolean;
  /** Optional description shown below the title */
  description?: string;
}

const variantConfig: Record<ConfirmVariant, {
  icon: React.ReactNode;
  iconClass: string;
  buttonClass: string;
}> = {
  default: {
    icon: <HelpCircle size={20} />,
    iconClass: 'text-[var(--color-accent-primary)]',
    buttonClass: '',
  },
  destructive: {
    icon: <AlertTriangle size={20} />,
    iconClass: 'text-[var(--color-error)]',
    buttonClass: 'bg-[var(--color-error)] hover:bg-[var(--color-error)]/90',
  },
  warning: {
    icon: <AlertTriangle size={20} />,
    iconClass: 'text-[var(--color-warning)]',
    buttonClass: 'bg-[var(--color-warning)] hover:bg-[var(--color-warning)]/90 text-black',
  },
  info: {
    icon: <Info size={20} />,
    iconClass: 'text-[var(--color-accent-primary)]',
    buttonClass: '',
  },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  description,
}: ConfirmModalProps) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const config = variantConfig[variant as ConfirmVariant];

  // Focus confirm button when modal opens
  useEffect(() => {
    if (open && confirmButtonRef.current) {
      // Small delay to ensure modal is rendered
      const timer = setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    if (!isLoading) {
      onConfirm();
    }
  }, [onConfirm, isLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      e.preventDefault();
      handleConfirm();
    }
  }, [handleConfirm, isLoading]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      className="max-w-md"
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
            className="text-[var(--color-text-secondary)]"
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              'min-w-[80px]',
              config.buttonClass
            )}
            onKeyDown={handleKeyDown}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn(
          'flex-shrink-0 p-2 rounded-sm bg-[var(--color-surface-2)]',
          config.iconClass
        )}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-[var(--color-text-primary)] font-mono">
            {typeof message === 'string' ? (
              <p>{message}</p>
            ) : (
              message
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

ConfirmModal.displayName = 'ConfirmModal';

// =============================================================================
// useConfirm Hook - For easy integration
// =============================================================================

export interface UseConfirmOptions {
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  description?: string;
}

export interface UseConfirmState {
  isOpen: boolean;
  options: UseConfirmOptions | null;
}

/**
 * Hook for using confirmation dialogs imperatively.
 * Returns a confirm function that returns a Promise<boolean>.
 * 
 * @example
 * const { confirm, ConfirmDialog } = useConfirm();
 * 
 * const handleDelete = async () => {
 *   const confirmed = await confirm({
 *     title: 'Delete Session',
 *     message: 'Are you sure?',
 *     variant: 'destructive'
 *   });
 *   if (confirmed) deleteSession();
 * };
 * 
 * return (
 *   <>
 *     <button onClick={handleDelete}>Delete</button>
 *     <ConfirmDialog />
 *   </>
 * );
 */
export function useConfirm() {
  const [state, setState] = React.useState<UseConfirmState>({
    isOpen: false,
    options: null,
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: UseConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ isOpen: true, options });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState({ isOpen: false, options: null });
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState({ isOpen: false, options: null });
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const ConfirmDialog = useCallback(() => {
    if (!state.options) return null;
    return (
      <ConfirmModal
        open={state.isOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        {...state.options}
      />
    );
  }, [state.isOpen, state.options, handleConfirm, handleCancel]);

  return { confirm, ConfirmDialog };
}
