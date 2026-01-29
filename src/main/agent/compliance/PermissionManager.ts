/**
 * Permission Manager
 *
 * Manages tool permissions and capability grants for dynamic tools.
 * Provides fine-grained access control with inheritance and delegation support.
 */
import { randomUUID } from 'node:crypto';
import type { ToolCapability, CapabilityGrant } from '../../../shared/types';
import { createLogger } from '../../logger';
import { getSecurityAuditLog, type SecurityActor } from '../security/SecurityAuditLog';

const logger = createLogger('PermissionManager');

// =============================================================================
// Types
// =============================================================================

/**
 * Permission scope
 */
export type PermissionScope = 'global' | 'session' | 'agent' | 'tool';

/**
 * Permission level
 */
export type PermissionLevel = 'none' | 'read' | 'write' | 'execute' | 'admin';

/**
 * Permission entry
 */
export interface Permission {
  id: string;
  capability: ToolCapability;
  level: PermissionLevel;
  scope: PermissionScope;
  grantedTo: string; // session ID, agent ID, or tool ID
  grantedBy: string; // who granted this permission
  constraints?: PermissionConstraints;
  expiresAt?: number;
  createdAt: number;
}

/**
 * Permission constraints
 */
export interface PermissionConstraints {
  /** Allowed paths (for filesystem capability) */
  allowedPaths?: string[];
  /** Blocked paths */
  blockedPaths?: string[];
  /** Allowed hosts (for network capability) */
  allowedHosts?: string[];
  /** Blocked hosts */
  blockedHosts?: string[];
  /** Allowed commands (for terminal capability) */
  allowedCommands?: string[];
  /** Blocked commands */
  blockedCommands?: string[];
  /** Rate limit (operations per minute) */
  rateLimit?: number;
  /** Maximum operations total */
  maxOperations?: number;
  /** Custom constraints */
  custom?: Record<string, unknown>;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  permission?: Permission;
  reason?: string;
  constraints?: PermissionConstraints;
}

/**
 * Permission request
 */
export interface PermissionRequest {
  id: string;
  capability: ToolCapability;
  level: PermissionLevel;
  requestedBy: SecurityActor;
  reason: string;
  constraints?: PermissionConstraints;
  status: 'pending' | 'approved' | 'denied';
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

/**
 * Permission manager configuration
 */
export interface PermissionManagerConfig {
  /** Default permission level for new sessions */
  defaultLevel: PermissionLevel;
  /** Auto-approve safe capabilities */
  autoApproveSafe: boolean;
  /** Require approval for dangerous capabilities */
  requireApprovalForDangerous: boolean;
  /** Permission expiry time in ms (0 = no expiry) */
  defaultExpiryMs: number;
  /** Allow permission delegation */
  allowDelegation: boolean;
  /** Maximum delegation depth */
  maxDelegationDepth: number;
}

/**
 * Default configuration
 */
export const DEFAULT_PERMISSION_CONFIG: PermissionManagerConfig = {
  defaultLevel: 'read',
  autoApproveSafe: true,
  requireApprovalForDangerous: true,
  defaultExpiryMs: 0,
  allowDelegation: true,
  maxDelegationDepth: 2,
};

/**
 * Safe capabilities that can be auto-approved
 */
const SAFE_CAPABILITIES: ToolCapability[] = ['none', 'file_read'];

/**
 * Dangerous capabilities requiring approval
 */
const DANGEROUS_CAPABILITIES: ToolCapability[] = ['terminal', 'network'];

// =============================================================================
// PermissionManager
// =============================================================================

export class PermissionManager {
  private config: PermissionManagerConfig;
  private permissions = new Map<string, Permission>();
  private pendingRequests = new Map<string, PermissionRequest>();
  private operationCounts = new Map<string, number>();

  constructor(config?: Partial<PermissionManagerConfig>) {
    this.config = { ...DEFAULT_PERMISSION_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PermissionManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Grant a permission
   */
  grant(
    capability: ToolCapability,
    level: PermissionLevel,
    grantedTo: string,
    grantedBy: string,
    scope: PermissionScope = 'session',
    constraints?: PermissionConstraints,
    expiresAt?: number
  ): Permission {
    const permission: Permission = {
      id: randomUUID(),
      capability,
      level,
      scope,
      grantedTo,
      grantedBy,
      constraints,
      expiresAt: expiresAt || (this.config.defaultExpiryMs > 0 
        ? Date.now() + this.config.defaultExpiryMs 
        : undefined),
      createdAt: Date.now(),
    };

    const key = this.getPermissionKey(capability, grantedTo, scope);
    this.permissions.set(key, permission);

    logger.info('Permission granted', {
      capability,
      level,
      grantedTo,
      scope,
    });

    return permission;
  }

  /**
   * Revoke a permission
   */
  revoke(capability: ToolCapability, grantedTo: string, scope: PermissionScope = 'session'): boolean {
    const key = this.getPermissionKey(capability, grantedTo, scope);
    const existed = this.permissions.delete(key);

    if (existed) {
      logger.info('Permission revoked', { capability, grantedTo, scope });
    }

    return existed;
  }

  /**
   * Check if an action is permitted
   */
  check(
    capability: ToolCapability,
    requiredLevel: PermissionLevel,
    actor: SecurityActor,
    context?: { path?: string; host?: string; command?: string }
  ): PermissionCheckResult {
    // Check for expired permissions and clean up
    this.cleanupExpired();

    // Find applicable permission (check from most specific to least)
    const scopes: PermissionScope[] = ['tool', 'agent', 'session', 'global'];
    const identifiers = [
      actor.runId,
      actor.agentId,
      actor.sessionId,
      'global',
    ].filter(Boolean) as string[];

    let permission: Permission | undefined;

    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i];
      const identifier = identifiers[i];
      if (!identifier) continue;

      const key = this.getPermissionKey(capability, identifier, scope);
      const found = this.permissions.get(key);
      
      if (found) {
        permission = found;
        break;
      }
    }

    // No permission found
    if (!permission) {
      // Check if capability is safe and auto-approve is enabled
      if (this.config.autoApproveSafe && SAFE_CAPABILITIES.includes(capability)) {
        return { allowed: true, reason: 'Safe capability auto-approved' };
      }

      // Log denial
      const auditLog = getSecurityAuditLog();
      auditLog.logCapabilityRequest(actor, capability, 'unknown', 'denied', 'No permission found');

      return {
        allowed: false,
        reason: `No permission found for capability: ${capability}`,
      };
    }

    // Check if permission level is sufficient
    if (!this.isLevelSufficient(permission.level, requiredLevel)) {
      return {
        allowed: false,
        permission,
        reason: `Insufficient permission level: have ${permission.level}, need ${requiredLevel}`,
      };
    }

    // Check constraints
    if (permission.constraints && context) {
      const constraintResult = this.checkConstraints(permission.constraints, context);
      if (!constraintResult.allowed) {
        return constraintResult;
      }
    }

    // Check rate limit
    if (permission.constraints?.rateLimit) {
      const countKey = `${permission.id}:${Math.floor(Date.now() / 60000)}`;
      const count = this.operationCounts.get(countKey) || 0;
      
      if (count >= permission.constraints.rateLimit) {
        return {
          allowed: false,
          permission,
          reason: 'Rate limit exceeded',
        };
      }

      this.operationCounts.set(countKey, count + 1);
    }

    // Check max operations
    if (permission.constraints?.maxOperations) {
      const totalKey = `${permission.id}:total`;
      const total = this.operationCounts.get(totalKey) || 0;
      
      if (total >= permission.constraints.maxOperations) {
        return {
          allowed: false,
          permission,
          reason: 'Maximum operations exceeded',
        };
      }

      this.operationCounts.set(totalKey, total + 1);
    }

    return {
      allowed: true,
      permission,
      constraints: permission.constraints,
    };
  }

  /**
   * Request a permission (for approval workflow)
   */
  requestPermission(
    capability: ToolCapability,
    level: PermissionLevel,
    actor: SecurityActor,
    reason: string,
    constraints?: PermissionConstraints
  ): PermissionRequest {
    const request: PermissionRequest = {
      id: randomUUID(),
      capability,
      level,
      requestedBy: actor,
      reason,
      constraints,
      status: 'pending',
      createdAt: Date.now(),
    };

    // Auto-approve safe capabilities
    if (this.config.autoApproveSafe && SAFE_CAPABILITIES.includes(capability)) {
      request.status = 'approved';
      request.resolvedAt = Date.now();
      request.resolvedBy = 'system';

      // Grant the permission
      this.grant(capability, level, actor.sessionId, 'system', 'session', constraints);
    }

    this.pendingRequests.set(request.id, request);

    logger.info('Permission requested', {
      requestId: request.id,
      capability,
      level,
      status: request.status,
    });

    return request;
  }

  /**
   * Approve a permission request
   */
  approveRequest(requestId: string, approvedBy: string): boolean {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'approved';
    request.resolvedAt = Date.now();
    request.resolvedBy = approvedBy;

    // Grant the permission
    this.grant(
      request.capability,
      request.level,
      request.requestedBy.sessionId,
      approvedBy,
      'session',
      request.constraints
    );

    logger.info('Permission request approved', { requestId, approvedBy });

    return true;
  }

  /**
   * Deny a permission request
   */
  denyRequest(requestId: string, deniedBy: string, reason?: string): boolean {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'denied';
    request.resolvedAt = Date.now();
    request.resolvedBy = deniedBy;

    // Log denial
    const auditLog = getSecurityAuditLog();
    auditLog.logCapabilityRequest(
      request.requestedBy,
      request.capability,
      'unknown',
      'denied',
      reason || 'Request denied'
    );

    logger.info('Permission request denied', { requestId, deniedBy, reason });

    return true;
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): PermissionRequest[] {
    return Array.from(this.pendingRequests.values()).filter(r => r.status === 'pending');
  }

  /**
   * Get permissions for an entity
   */
  getPermissions(entityId: string): Permission[] {
    const permissions: Permission[] = [];
    
    for (const permission of this.permissions.values()) {
      if (permission.grantedTo === entityId) {
        permissions.push(permission);
      }
    }

    return permissions;
  }

  /**
   * Convert capability grants to permissions
   */
  applyCapabilityGrants(grants: CapabilityGrant[], actor: SecurityActor): void {
    for (const grant of grants) {
      const constraints: PermissionConstraints = {};
      
      if (grant.scope) {
        if (grant.scope.paths) {
          constraints.allowedPaths = grant.scope.paths;
        }
        if (grant.scope.domains) {
          constraints.allowedHosts = grant.scope.domains;
        }
        if (grant.scope.commands) {
          constraints.allowedCommands = grant.scope.commands;
        }
      }

      this.grant(
        grant.capability,
        'execute',
        actor.sessionId,
        'system',
        'session',
        Object.keys(constraints).length > 0 ? constraints : undefined,
        grant.expiresAt
      );
    }
  }

  /**
   * Check if a capability requires approval
   */
  requiresApproval(capability: ToolCapability): boolean {
    if (this.config.requireApprovalForDangerous && DANGEROUS_CAPABILITIES.includes(capability)) {
      return true;
    }
    return false;
  }

  /**
   * Clear all permissions for a session
   */
  clearSession(sessionId: string): number {
    let count = 0;
    
    for (const [key, permission] of this.permissions) {
      if (permission.grantedTo === sessionId || permission.scope === 'session') {
        this.permissions.delete(key);
        count++;
      }
    }

    // Clear pending requests
    for (const [id, request] of this.pendingRequests) {
      if (request.requestedBy.sessionId === sessionId) {
        this.pendingRequests.delete(id);
      }
    }

    logger.info('Session permissions cleared', { sessionId, count });

    return count;
  }

  /**
   * Get permission statistics
   */
  getStats(): {
    totalPermissions: number;
    byCapability: Record<string, number>;
    byScope: Record<PermissionScope, number>;
    pendingRequests: number;
  } {
    const byCapability: Record<string, number> = {};
    const byScope: Record<PermissionScope, number> = {
      global: 0,
      session: 0,
      agent: 0,
      tool: 0,
    };

    for (const permission of this.permissions.values()) {
      byCapability[permission.capability] = (byCapability[permission.capability] || 0) + 1;
      byScope[permission.scope]++;
    }

    return {
      totalPermissions: this.permissions.size,
      byCapability,
      byScope,
      pendingRequests: this.getPendingRequests().length,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getPermissionKey(capability: ToolCapability, entityId: string, scope: PermissionScope): string {
    return `${scope}:${entityId}:${capability}`;
  }

  private isLevelSufficient(have: PermissionLevel, need: PermissionLevel): boolean {
    const levels: PermissionLevel[] = ['none', 'read', 'write', 'execute', 'admin'];
    return levels.indexOf(have) >= levels.indexOf(need);
  }

  private checkConstraints(
    constraints: PermissionConstraints,
    context: { path?: string; host?: string; command?: string }
  ): PermissionCheckResult {
    // Check path constraints
    if (context.path) {
      if (constraints.blockedPaths?.some(p => this.matchPath(context.path!, p))) {
        return { allowed: false, reason: `Path is blocked: ${context.path}` };
      }
      if (constraints.allowedPaths && !constraints.allowedPaths.some(p => this.matchPath(context.path!, p))) {
        return { allowed: false, reason: `Path is not in allowed list: ${context.path}` };
      }
    }

    // Check host constraints
    if (context.host) {
      if (constraints.blockedHosts?.some(h => this.matchHost(context.host!, h))) {
        return { allowed: false, reason: `Host is blocked: ${context.host}` };
      }
      if (constraints.allowedHosts && !constraints.allowedHosts.some(h => this.matchHost(context.host!, h))) {
        return { allowed: false, reason: `Host is not in allowed list: ${context.host}` };
      }
    }

    // Check command constraints
    if (context.command) {
      if (constraints.blockedCommands?.some(c => context.command!.includes(c))) {
        return { allowed: false, reason: `Command is blocked: ${context.command}` };
      }
      if (constraints.allowedCommands && !constraints.allowedCommands.some(c => context.command!.startsWith(c))) {
        return { allowed: false, reason: `Command is not in allowed list: ${context.command}` };
      }
    }

    return { allowed: true };
  }

  private matchPath(path: string, pattern: string): boolean {
    // Simple glob matching
    const regex = new RegExp(
      '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
    );
    return regex.test(path);
  }

  private matchHost(host: string, pattern: string): boolean {
    if (pattern.startsWith('*.')) {
      return host.endsWith(pattern.slice(1)) || host === pattern.slice(2);
    }
    return host === pattern;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    
    for (const [key, permission] of this.permissions) {
      if (permission.expiresAt && permission.expiresAt < now) {
        this.permissions.delete(key);
        logger.debug('Expired permission removed', { permissionId: permission.id });
      }
    }

    // Clean up old operation counts (older than 2 minutes)
    const cutoff = Math.floor(now / 60000) - 2;
    for (const key of this.operationCounts.keys()) {
      const parts = key.split(':');
      if (parts.length === 2 && parts[1] !== 'total') {
        const minute = parseInt(parts[1], 10);
        if (minute < cutoff) {
          this.operationCounts.delete(key);
        }
      }
    }
  }
}

// Singleton instance
let managerInstance: PermissionManager | null = null;

/**
 * Get or create the permission manager singleton
 */
export function getPermissionManager(): PermissionManager {
  if (!managerInstance) {
    managerInstance = new PermissionManager();
  }
  return managerInstance;
}
