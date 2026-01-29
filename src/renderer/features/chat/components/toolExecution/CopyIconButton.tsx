import React, { memo, useCallback } from 'react';
import { Copy } from 'lucide-react';

import { cn } from '../../../../utils/cn';

export interface CopyIconButtonProps {
  onCopy: () => void;
  copied: boolean;
  idleTitle: string;
  copiedTitle?: string;
  ariaLabel: string;
  iconSize?: number;
}

export const CopyIconButton: React.FC<CopyIconButtonProps> = memo(({
  onCopy,
  copied,
  idleTitle,
  copiedTitle = 'copied',
  ariaLabel,
  iconSize = 10,
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onCopy();
    },
    [onCopy],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'p-0.5 rounded transition-colors',
        'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
        'hover:bg-[var(--color-surface-2)]',
      )}
      title={copied ? copiedTitle : idleTitle}
      aria-label={ariaLabel}
    >
      <Copy
        size={iconSize}
        className={cn(copied && 'text-[var(--color-success)]')}
        aria-hidden="true"
      />
    </button>
  );
});

CopyIconButton.displayName = 'CopyIconButton';
