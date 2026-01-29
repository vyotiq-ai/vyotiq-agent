/**
 * Capability Matcher
 *
 * Matches tools by their capabilities and I/O types
 * for finding tools that can work together.
 */
import type { ToolCapability } from '../../../shared/types';
import type { ToolDefinition } from '../types';
import { createLogger } from '../../logger';

const logger = createLogger('CapabilityMatcher');

// Log initialization for debugging
logger.debug('CapabilityMatcher initialized');

/**
 * Tool capability profile
 */
export interface ToolCapabilityProfile {
  toolName: string;
  inputTypes: string[];
  outputTypes: string[];
  capabilities: ToolCapability[];
  category: string;
}

/**
 * Match result
 */
export interface CapabilityMatch {
  toolName: string;
  matchType: 'input' | 'output' | 'capability' | 'chain';
  score: number;
  reason: string;
}

/**
 * Capability Matcher class
 */
export class CapabilityMatcher {
  private profiles = new Map<string, ToolCapabilityProfile>();

  /**
   * Register a tool's capability profile
   */
  registerTool(tool: ToolDefinition, capabilities: ToolCapability[] = []): void {
    const inputTypes = this.extractInputTypes(tool);
    const outputTypes = this.extractOutputTypes(tool);

    this.profiles.set(tool.name, {
      toolName: tool.name,
      inputTypes,
      outputTypes,
      capabilities,
      category: tool.category || 'general',
    });
  }

  /**
   * Extract input types from tool schema
   */
  private extractInputTypes(tool: ToolDefinition): string[] {
    const types: string[] = [];
    const schema = tool.schema as unknown as Record<string, unknown> | undefined;
    
    if (!schema || typeof schema !== 'object') {
      return types;
    }

    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return types;

    for (const [propName, propSchema] of Object.entries(properties)) {
      if (propSchema.type) {
        types.push(`${propName}:${propSchema.type}`);
      }
      // Infer common types from property names
      if (propName.toLowerCase().includes('path') || propName.toLowerCase().includes('file')) {
        types.push('file');
      }
      if (propName.toLowerCase().includes('url')) {
        types.push('url');
      }
      if (propName.toLowerCase().includes('content') || propName.toLowerCase().includes('text')) {
        types.push('text');
      }
      if (propName.toLowerCase().includes('json') || propName.toLowerCase().includes('data')) {
        types.push('json');
      }
    }

    return [...new Set(types)];
  }

  /**
   * Extract output types from tool (heuristic based on tool name/description)
   */
  private extractOutputTypes(tool: ToolDefinition): string[] {
    const types: string[] = [];
    const name = tool.name.toLowerCase();
    const desc = tool.description.toLowerCase();

    // Infer from common patterns
    if (name.includes('read') || name.includes('get') || name.includes('fetch')) {
      types.push('text', 'json');
    }
    if (name.includes('list') || name.includes('search') || name.includes('glob')) {
      types.push('array');
    }
    if (name.includes('write') || name.includes('create') || name.includes('edit')) {
      types.push('result');
    }
    if (desc.includes('json')) {
      types.push('json');
    }
    if (desc.includes('file')) {
      types.push('file');
    }

    return [...new Set(types)];
  }

  /**
   * Find tools that accept a given input type
   */
  matchByInput(inputType: string): CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];

    for (const profile of this.profiles.values()) {
      for (const type of profile.inputTypes) {
        if (type.includes(inputType) || inputType.includes(type.split(':')[1] || type)) {
          matches.push({
            toolName: profile.toolName,
            matchType: 'input',
            score: type === inputType ? 1.0 : 0.7,
            reason: `Accepts ${inputType} input`,
          });
          break;
        }
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Find tools that produce a given output type
   */
  matchByOutput(outputType: string): CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];

    for (const profile of this.profiles.values()) {
      for (const type of profile.outputTypes) {
        if (type.includes(outputType) || outputType.includes(type)) {
          matches.push({
            toolName: profile.toolName,
            matchType: 'output',
            score: type === outputType ? 1.0 : 0.7,
            reason: `Produces ${outputType} output`,
          });
          break;
        }
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Find tools with specific capabilities
   */
  matchByCapability(capability: ToolCapability): CapabilityMatch[] {
    const matches: CapabilityMatch[] = [];

    for (const profile of this.profiles.values()) {
      if (profile.capabilities.includes(capability)) {
        matches.push({
          toolName: profile.toolName,
          matchType: 'capability',
          score: 1.0,
          reason: `Has ${capability} capability`,
        });
      }
    }

    return matches;
  }

  /**
   * Find tools that can chain together (output -> input)
   */
  findChain(producerToolName: string, _inputType: string): CapabilityMatch[] {
    const producerProfile = this.profiles.get(producerToolName);
    if (!producerProfile) return [];

    const matches: CapabilityMatch[] = [];

    // Find tools that can accept producer's output types
    for (const outputType of producerProfile.outputTypes) {
      const inputMatches = this.matchByInput(outputType);
      for (const match of inputMatches) {
        if (match.toolName !== producerToolName) {
          matches.push({
            ...match,
            matchType: 'chain',
            reason: `Can receive ${outputType} from ${producerToolName}`,
          });
        }
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Find alternative tools (same category or capabilities)
   */
  findAlternatives(toolName: string): CapabilityMatch[] {
    const profile = this.profiles.get(toolName);
    if (!profile) return [];

    const matches: CapabilityMatch[] = [];

    for (const other of this.profiles.values()) {
      if (other.toolName === toolName) continue;

      let score = 0;
      const reasons: string[] = [];

      // Same category
      if (other.category === profile.category) {
        score += 0.5;
        reasons.push('same category');
      }

      // Overlapping capabilities
      const sharedCaps = profile.capabilities.filter(c => other.capabilities.includes(c));
      if (sharedCaps.length > 0) {
        score += 0.3 * (sharedCaps.length / profile.capabilities.length);
        reasons.push('similar capabilities');
      }

      // Overlapping input types
      const sharedInputs = profile.inputTypes.filter(t => 
        other.inputTypes.some(ot => ot.includes(t) || t.includes(ot))
      );
      if (sharedInputs.length > 0) {
        score += 0.2 * (sharedInputs.length / profile.inputTypes.length);
        reasons.push('similar inputs');
      }

      if (score > 0.3) {
        matches.push({
          toolName: other.toolName,
          matchType: 'capability',
          score,
          reason: reasons.join(', '),
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Get profile for a tool
   */
  getProfile(toolName: string): ToolCapabilityProfile | undefined {
    return this.profiles.get(toolName);
  }

  /**
   * Get all profiles
   */
  getAllProfiles(): ToolCapabilityProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Clear all profiles
   */
  clear(): void {
    this.profiles.clear();
  }
}

// Singleton instance
let matcherInstance: CapabilityMatcher | null = null;

/**
 * Get or create the capability matcher singleton
 */
export function getCapabilityMatcher(): CapabilityMatcher {
  if (!matcherInstance) {
    matcherInstance = new CapabilityMatcher();
  }
  return matcherInstance;
}
