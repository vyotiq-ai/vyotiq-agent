/**
 * HeaderDivider
 *
 * Thin vertical rule used to separate logical button groups in the header.
 */
import React from 'react';

export const HeaderDivider: React.FC = () => (
  <div
    className="w-px h-3 bg-[var(--color-border-default)]/30 mx-1.5 shrink-0"
    aria-hidden="true"
  />
);
