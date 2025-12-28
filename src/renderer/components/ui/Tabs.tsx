/**
 * Terminal-styled Tabs Component
 * 
 * A tabbed navigation component with CLI aesthetics.
 */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { cn } from '../../utils/cn';

// =============================================================================
// Types
// =============================================================================

interface TabsContextValue {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

// =============================================================================
// Context
// =============================================================================

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

function useTabsContext() {
    const context = useContext(TabsContext);
    if (!context) {
        throw new Error('Tab components must be used within a Tabs component');
    }
    return context;
}

// =============================================================================
// Tabs Root
// =============================================================================

interface TabsProps {
    defaultValue: string;
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
    className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
    const [internalValue, setInternalValue] = useState(defaultValue);
    const activeTab = value ?? internalValue;

    const setActiveTab = useCallback((tab: string) => {
        if (!value) {
            setInternalValue(tab);
        }
        onValueChange?.(tab);
    }, [value, onValueChange]);

    const contextValue = useMemo(() => ({
        activeTab,
        setActiveTab,
    }), [activeTab, setActiveTab]);

    return (
        <TabsContext.Provider value={contextValue}>
            <div className={cn('font-mono', className)}>
                {children}
            </div>
        </TabsContext.Provider>
    );
}

// =============================================================================
// Tab List
// =============================================================================

interface TabListProps {
    children: React.ReactNode;
    className?: string;
    /** Visual variant */
    variant?: 'default' | 'underline' | 'pills';
}

export function TabList({ children, className, variant = 'default' }: TabListProps) {
    return (
        <div
            className={cn(
                'flex items-center gap-1',
                variant === 'default' && 'border-b border-[var(--color-border-subtle)]',
                variant === 'underline' && 'border-b border-[var(--color-border-subtle)]',
                variant === 'pills' && 'bg-[var(--color-surface-2)]/50 p-1',
                className
            )}
            role="tablist"
        >
            {children}
        </div>
    );
}

// =============================================================================
// Tab Trigger
// =============================================================================

interface TabTriggerProps {
    value: string;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
    /** Visual variant - should match parent TabList */
    variant?: 'default' | 'underline' | 'pills';
}

export function TabTrigger({ 
    value, 
    children, 
    className, 
    disabled = false,
    icon,
    variant = 'default',
}: TabTriggerProps) {
    const { activeTab, setActiveTab } = useTabsContext();
    const isActive = activeTab === value;

    return (
        <button
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${value}`}
            disabled={disabled}
            onClick={() => setActiveTab(value)}
            className={cn(
                'flex items-center gap-1.5 text-[10px] transition-all duration-150',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                // Default variant
                variant === 'default' && [
                    'px-3 py-2 border-b-2 -mb-[1px]',
                    isActive 
                        ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]' 
                        : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]',
                ],
                // Underline variant
                variant === 'underline' && [
                    'px-3 py-2 relative',
                    isActive && 'text-[var(--color-text-primary)]',
                    !isActive && 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
                ],
                // Pills variant
                variant === 'pills' && [
                    'px-2.5 py-1.5 rounded-sm',
                    isActive
                        ? 'bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-primary)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/50',
                ],
                className
            )}
        >
            {/* Active indicator for underline variant */}
            {variant === 'underline' && isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--color-accent-primary)]" />
            )}
            
            {/* Icon */}
            {icon && (
                <span className={cn(
                    'transition-colors',
                    isActive ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)]'
                )}>
                    {icon}
                </span>
            )}
            
            {/* CLI-style prefix for active tab */}
            {isActive && <span className="text-[var(--color-accent-secondary)]">&gt;</span>}
            
            {children}
        </button>
    );
}

// =============================================================================
// Tab Content
// =============================================================================

interface TabContentProps {
    value: string;
    children: React.ReactNode;
    className?: string;
    /** Keep content mounted even when inactive */
    forceMount?: boolean;
}

export function TabContent({ value, children, className, forceMount = false }: TabContentProps) {
    const { activeTab } = useTabsContext();
    const isActive = activeTab === value;

    if (!forceMount && !isActive) {
        return null;
    }

    return (
        <div
            id={`panel-${value}`}
            role="tabpanel"
            aria-labelledby={`tab-${value}`}
            hidden={!isActive}
            className={cn(
                'animate-in fade-in-0 slide-in-from-bottom-1 duration-200',
                !isActive && 'hidden',
                className
            )}
        >
            {children}
        </div>
    );
}

// =============================================================================
// Vertical Tabs
// =============================================================================

interface VerticalTabListProps {
    children: React.ReactNode;
    className?: string;
}

export function VerticalTabList({ children, className }: VerticalTabListProps) {
    return (
        <div
            className={cn(
                'flex flex-col gap-0.5 border-r border-[var(--color-border-subtle)] pr-2',
                className
            )}
            role="tablist"
            aria-orientation="vertical"
        >
            {children}
        </div>
    );
}

interface VerticalTabTriggerProps {
    value: string;
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
}

export function VerticalTabTrigger({ 
    value, 
    children, 
    className, 
    disabled = false,
    icon,
}: VerticalTabTriggerProps) {
    const { activeTab, setActiveTab } = useTabsContext();
    const isActive = activeTab === value;

    return (
        <button
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${value}`}
            disabled={disabled}
            onClick={() => setActiveTab(value)}
            className={cn(
                'flex items-center gap-2 text-[10px] px-2.5 py-1.5 text-left transition-all duration-150',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'border-l-2',
                isActive 
                    ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/5' 
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]/30',
                className
            )}
        >
            {icon && (
                <span className={cn(
                    'transition-colors',
                    isActive ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-dim)]'
                )}>
                    {icon}
                </span>
            )}
            {children}
        </button>
    );
}
