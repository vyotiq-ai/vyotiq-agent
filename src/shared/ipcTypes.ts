/**
 * IPC Type Definitions
 * 
 * Defines request/response types for IPC channels.
 * Note: Event types are defined in shared/types.ts to avoid duplication.
 */

// =============================================================================
// Dynamic Tool Types
// =============================================================================

export interface DynamicToolInfoIPC {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'disabled' | 'expired';
  category?: string;
  usageCount: number;
  successRate: number;
  createdAt: number;
  createdBy?: string;
  lastUsedAt?: number;
}

export interface DynamicToolListFilter {
  status?: string;
  category?: string;
}

export interface DynamicToolListResponse {
  success: boolean;
  tools: DynamicToolInfoIPC[];
  error?: string;
}

export interface DynamicToolSpecResponse {
  success: boolean;
  spec?: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    executionType: string;
    requiredCapabilities: string[];
    riskLevel: string;
  };
  error?: string;
}


