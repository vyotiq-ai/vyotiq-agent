import React from 'react';
import { cn } from '../../../utils/cn';

interface SidebarItemProps {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
  collapsed?: boolean;
  /** Optional tooltip text */
  title?: string;
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ 
  icon, 
  label, 
  active, 
  count, 
  onClick, 
  className, 
  collapsed,
  title,
}) => {
  return (
    <div 
      className={cn(
        "flex items-center px-1.5 py-1 text-[11px] font-mono cursor-pointer transition-colors group select-none",
        active 
          ? "text-[var(--color-accent-primary)]" 
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
        collapsed ? "justify-center" : "justify-between",
        className
      )}
      onClick={onClick}
      title={collapsed ? label : title}
    >
      <div className={cn("flex items-center gap-1.5 overflow-hidden min-w-0", collapsed && "justify-center w-full")}>
        {icon && (
          <span className={cn(
            "shrink-0 transition-colors",
            active ? "text-[var(--color-accent-primary)]" : "text-[var(--color-text-dim)]"
          )}>
            {icon}
          </span>
        )}
        {!collapsed && (
          <span className="truncate flex items-center gap-1 min-w-0">
            {active && <span className="text-[var(--color-accent-primary)] text-[9px] shrink-0">❯</span>}
            <span className="truncate">{label}</span>
          </span>
        )}
      </div>
      {!collapsed && count !== undefined && count > 0 && (
        <span className={cn(
          "text-[9px] font-mono shrink-0 ml-1",
          active 
            ? "text-[var(--color-accent-primary)]/70" 
            : "text-[var(--color-text-dim)]"
        )}>
          [{count}]
        </span>
      )}
    </div>
  );
};
