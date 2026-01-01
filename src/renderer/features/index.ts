/**
 * Features Module
 * 
 * Central export point for all feature modules.
 * Each feature is self-contained with its own components, hooks, and utilities.
 */

// Chat feature - AI conversation interface
export * from './chat';

// Sessions feature - Session management
export * from './sessions';

// Settings feature - Application settings
export * from './settings';

// Workspaces feature - Workspace management
export * from './workspaces';

// Browser feature - Embedded browser for agent
export * from './browser';

// Undo feature - Undo history management
export * from './undo';

// File Tree feature - VS Code-style file explorer
export * from './fileTree';

// Editor feature - Monaco code editor
export * from './editor';

// Orchestration feature - Removed (sub-agent coordination system no longer exists)

// Onboarding feature - First-run wizard
export * from './onboarding';