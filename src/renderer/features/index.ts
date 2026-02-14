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

// Browser feature - Embedded browser for agent
export * from './browser';

// Undo feature - Undo history management
export * from './undo';

// File Tree feature - VS Code-style file explorer
export * from './fileTree';

// Debugging feature - Agent execution debugging
export * from './debugging';

// Onboarding feature - First-run wizard
export * from './onboarding';

// Editor feature - Built-in code editor with tabs
export * from './editor';

// Workspace feature - Workspace management & search
export * from './workspace';