/**
 * Safety System Types
 * Minimal implementation to satisfy existing code dependencies
 */

export interface SafetyConfig {
  enabled: boolean;
  strictMode: boolean;
  allowedOperations: string[];
  blockedOperations: string[];
  requireConfirmation: string[];
}

export type SafetyOperation = 
  | 'file-write'
  | 'file-delete'
  | 'command-execute'
  | 'network-request'
  | 'system-access';

export interface SafetyIssue {
  type: 'warning' | 'error' | 'info';
  operation: SafetyOperation;
  message: string;
  suggestion?: string;
}

export interface SafetyCheckResult {
  allowed: boolean;
  issues: SafetyIssue[];
  requiresConfirmation: boolean;
}

export interface BackupInfo {
  id: string;
  path: string;
  timestamp: number;
  size: number;
}