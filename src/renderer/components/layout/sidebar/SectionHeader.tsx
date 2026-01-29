import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SectionHeaderProps {
  label: string;
  action?: React.ReactNode;
  collapsed?: boolean;
  isOpen?: boolean;
  onClick?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ 
  label, 
  action, 
  collapsed, 
  isOpen, 
  onClick 
}) => {
  if (collapsed) return <div className="h-4" />;
  
  return (
    <div 
      className="flex items-center justify-between px-1.5 py-1 text-[10px] font-mono text-[var(--color-text-dim)] cursor-pointer select-none hover:text-[var(--color-text-secondary)] transition-colors group rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent-primary)]/40 min-w-0 overflow-hidden"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-expanded={typeof isOpen === 'boolean' ? isOpen : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
        <span className="text-[var(--color-text-placeholder)] flex-shrink-0">
          {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
        <span className="uppercase tracking-wider truncate">{label}</span>
      </div>
      {action && (
        <span 
          className="text-[var(--color-text-placeholder)] hover:text-[var(--color-accent-primary)] transition-colors" 
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {action}
        </span>
      )}
    </div>
  );
};
