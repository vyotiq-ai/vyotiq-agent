/**
 * Access Level Utilities
 * 
 * Functions for checking tool permissions based on access level settings.
 */

import { Minimatch } from 'minimatch';
import type { AccessLevelSettings, ToolCategory } from '../../../shared/types';
import { ACCESS_LEVEL_DEFAULTS } from '../../../shared/types';

/**
 * Helper function to use minimatch for pattern matching
 */
function matchPath(path: string, pattern: string): boolean {
  const mm = new Minimatch(pattern, { dot: true, matchBase: true });
  return mm.match(path);
}

/**
 * Map tool name/category to access level category for permission checking
 */
export function getAccessLevelCategory(toolName: string, toolCategory?: string): ToolCategory {
  const name = toolName.toLowerCase();

  // Check for destructive operations first
  if (['delete', 'rm', 'remove', 'format'].some(d => name.includes(d))) {
    return 'destructive';
  }

  // Map tool categories
  if (toolCategory) {
    switch (toolCategory) {
      case 'file-read':
      case 'file-search':
        return 'read';
      case 'file-write':
        return 'write';
      case 'terminal':
        return 'terminal';
      case 'system':
        return 'system';
      default:
        break;
    }
  }

  // Fallback to name-based detection
  if (['read', 'list', 'ls', 'glob', 'grep', 'search', 'find'].some(r => name.includes(r))) {
    return 'read';
  }
  if (['write', 'create', 'edit', 'modify', 'append'].some(w => name.includes(w))) {
    return 'write';
  }
  if (['run', 'exec', 'shell', 'bash', 'terminal', 'command'].some(t => name.includes(t))) {
    return 'terminal';
  }
  if (['git', 'commit', 'push', 'pull', 'branch', 'merge'].some(g => name.includes(g))) {
    return 'git';
  }
  if (['install', 'uninstall', 'upgrade', 'system'].some(s => name.includes(s))) {
    return 'system';
  }

  return 'read';
}

/**
 * Check if a tool call is allowed based on access level settings
 */
export function checkAccessLevelPermission(
  accessSettings: AccessLevelSettings | undefined,
  toolName: string,
  toolCategory: string | undefined,
  filePath?: string
): { allowed: boolean; requiresConfirmation: boolean; reason?: string } {
  if (!accessSettings) {
    return { allowed: true, requiresConfirmation: false };
  }

  const category = getAccessLevelCategory(toolName, toolCategory);

  // Check tool-specific overrides first
  if (accessSettings.toolOverrides[toolName]) {
    const override = accessSettings.toolOverrides[toolName];
    return {
      allowed: override.allowed,
      requiresConfirmation: override.requiresConfirmation,
      reason: !override.allowed ? `Tool '${toolName}' is blocked by access level override` : undefined,
    };
  }

  // Check category permissions
  const categoryPermission = accessSettings.categoryPermissions[category]
    ?? ACCESS_LEVEL_DEFAULTS[accessSettings.level][category];

  if (!categoryPermission.allowed) {
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: `${category} operations are not allowed at '${accessSettings.level}' access level`,
    };
  }

  // Check path restrictions if a file path is provided
  if (filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');

    const isExplicitlyAllowed = accessSettings.allowedPaths.some(pattern =>
      matchPath(normalizedPath, pattern)
    );

    if (!isExplicitlyAllowed) {
      const isRestricted = accessSettings.restrictedPaths.some(pattern =>
        matchPath(normalizedPath, pattern)
      );

      if (isRestricted) {
        return {
          allowed: false,
          requiresConfirmation: true,
          reason: `Path '${filePath}' is restricted by access level settings`,
        };
      }
    }
  }

  return {
    allowed: true,
    requiresConfirmation: categoryPermission.requiresConfirmation,
  };
}
