/**
 * Browser Security Status Tool
 * 
 * Get current browser security status, statistics, and recent events.
 * Useful for monitoring security and debugging blocked requests.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserSecurity, getBrowserManager } from '../../../browser';

interface SecurityStatusArgs extends Record<string, unknown> {
  /** Include recent security events */
  includeEvents?: boolean;
  /** Number of recent events to include */
  eventLimit?: number;
  /** Include current security configuration */
  includeConfig?: boolean;
}

async function executeSecurityStatus(
  args: SecurityStatusArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { includeEvents = true, eventLimit = 20, includeConfig = false } = args;
  
  context.logger.info('Getting browser security status', { includeEvents, eventLimit, includeConfig });

  try {
    const security = getBrowserSecurity();
    const browser = getBrowserManager();
    
    const stats = security.getStats();
    const browserState = browser.getState();
    
    let output = '# Browser Security Status\n\n';
    
    // Current browser state
    output += '## Current State\n';
    output += `- **URL:** ${browserState.url || 'No page loaded'}\n`;
    output += `- **Status:** ${browserState.isLoading ? 'Loading...' : 'Ready'}\n`;
    if (browserState.error) {
      output += `- **Error:** ${browserState.error}\n`;
    }
    output += '\n';
    
    // Security statistics
    output += '## Security Statistics\n';
    output += `- **Blocked URLs:** ${stats.blockedUrls}\n`;
    output += `- **Blocked Popups:** ${stats.blockedPopups}\n`;
    output += `- **Blocked Ads:** ${stats.blockedAds}\n`;
    output += `- **Blocked Trackers:** ${stats.blockedTrackers}\n`;
    output += `- **Blocked Downloads:** ${stats.blockedDownloads}\n`;
    output += `- **Warnings:** ${stats.warnings}\n`;
    output += '\n';
    
    // Security configuration
    if (includeConfig) {
      const config = security.getConfig();
      output += '## Security Configuration\n';
      output += `- **URL Filtering:** ${config.urlFilteringEnabled ? '[ON]' : '[OFF]'}\n`;
      output += `- **Popup Blocking:** ${config.popupBlockingEnabled ? '[ON]' : '[OFF]'}\n`;
      output += `- **Ad Blocking:** ${config.adBlockingEnabled ? '[ON]' : '[OFF]'}\n`;
      output += `- **Tracker Blocking:** ${config.trackerBlockingEnabled ? '[ON]' : '[OFF]'}\n`;
      output += `- **Download Protection:** ${config.downloadProtectionEnabled ? '[ON]' : '[OFF]'}\n`;
      
      if (config.allowList.length > 0) {
        output += `- **Allow List:** ${config.allowList.slice(0, 10).join(', ')}${config.allowList.length > 10 ? '...' : ''}\n`;
      }
      if (config.customBlockList.length > 0) {
        output += `- **Custom Block List:** ${config.customBlockList.slice(0, 10).join(', ')}${config.customBlockList.length > 10 ? '...' : ''}\n`;
      }
      output += '\n';
    }
    
    // Recent security events
    if (includeEvents) {
      const events = security.getEvents(eventLimit);
      
      if (events.length > 0) {
        output += '## Recent Security Events\n\n';
        
        for (const event of events.slice(-eventLimit)) {
          const time = new Date(event.timestamp).toLocaleTimeString();
          const icon = event.type === 'blocked' ? '[BLOCKED]' : event.type === 'warning' ? '[WARN]' : '[OK]';
          output += `${icon} **[${time}]** ${event.category}: ${event.reason}\n`;
          output += `   URL: ${event.url.slice(0, 100)}${event.url.length > 100 ? '...' : ''}\n\n`;
        }
      } else {
        output += '## Recent Security Events\n\nNo security events recorded.\n';
      }
    }
    
    return {
      toolName: 'browser_security_status',
      success: true,
      output,
      metadata: {
        stats,
        eventsCount: includeEvents ? security.getEvents(eventLimit).length : 0,
        currentUrl: browserState.url,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('Security status error', { error: errorMessage });
    
    return {
      toolName: 'browser_security_status',
      success: false,
      output: `Error getting security status: ${errorMessage}`,
    };
  }
}

export const browserSecurityStatusTool: ToolDefinition<SecurityStatusArgs> = {
  name: 'browser_security_status',
  description: `Get the current browser security status, statistics, and recent security events.

**Use cases:**
- Check how many threats have been blocked
- Review recent blocked URLs and their reasons
- Verify security settings are properly configured
- Debug why a specific URL might have been blocked

**Information provided:**
- Current browser state (URL, loading status, errors)
- Security statistics (blocked URLs, popups, ads, trackers, downloads)
- Recent security events with timestamps and details
- Security configuration (when includeConfig=true)`,

  requiresApproval: false,
  category: 'browser-read',
  riskLevel: 'safe',
  allowedCallers: ['direct', 'code_execution'],

  schema: {
    type: 'object',
    properties: {
      includeEvents: {
        type: 'boolean',
        description: 'Include recent security events in the output (default: true)',
      },
      eventLimit: {
        type: 'number',
        description: 'Maximum number of events to include (default: 20)',
      },
      includeConfig: {
        type: 'boolean',
        description: 'Include current security configuration (default: false)',
      },
    },
    required: [],
  },

  execute: executeSecurityStatus,
};
