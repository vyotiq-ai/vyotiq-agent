/**
 * Browser Check URL Tool
 * 
 * Check if a URL is safe before navigating to it.
 * Performs security analysis and returns risk assessment.
 */
import type { ToolDefinition, ToolExecutionContext } from '../../types';
import type { ToolExecutionResult } from '../../../../shared/types';
import { getBrowserSecurity } from '../../../browser';

interface CheckUrlArgs extends Record<string, unknown> {
  /** URL to check for safety */
  url: string;
  /** Include detailed risk analysis */
  detailed?: boolean;
}

async function executeCheckUrl(
  args: CheckUrlArgs,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { url, detailed = false } = args;
  
  context.logger.info('Checking URL safety', { url, detailed });

  if (!url) {
    return {
      toolName: 'browser_check_url',
      success: false,
      output: 'Error: URL is required',
    };
  }

  try {
    const security = getBrowserSecurity();
    
    // Normalize URL if needed
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && 
        !normalizedUrl.startsWith('https://') && 
        !normalizedUrl.startsWith('file://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    
    // Check URL safety
    const safetyCheck = security.checkUrlSafety(normalizedUrl);
    
    let output = `# URL Safety Check\n\n`;
    output += `**URL:** ${normalizedUrl}\n\n`;
    
    // Overall verdict
    if (safetyCheck.safe) {
      output += '## ✅ URL Appears Safe\n\n';
      if (safetyCheck.riskScore > 0) {
        output += `Risk Score: ${safetyCheck.riskScore}/100 (low risk)\n\n`;
      }
    } else {
      output += '## ⚠️ URL May Be Dangerous\n\n';
      output += `Risk Score: ${safetyCheck.riskScore}/100\n\n`;
    }
    
    // Warnings
    if (safetyCheck.warnings.length > 0) {
      output += '### Warnings\n';
      for (const warning of safetyCheck.warnings) {
        output += `- ⚠️ ${warning}\n`;
      }
      output += '\n';
    }
    
    // Detailed analysis
    if (detailed) {
      output += '### Security Details\n';
      
      try {
        const parsedUrl = new URL(normalizedUrl);
        
        // Protocol check
        const isSecure = parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'file:';
        output += `- **Protocol:** ${parsedUrl.protocol.replace(':', '')} ${isSecure ? '✓' : '(insecure)'}\n`;
        
        // Domain analysis
        output += `- **Domain:** ${parsedUrl.hostname}\n`;
        
        const domainParts = parsedUrl.hostname.split('.');
        if (domainParts.length > 4) {
          output += `  - ⚠️ Excessive subdomains detected\n`;
        }
        
        // Port check
        if (parsedUrl.port) {
          output += `- **Port:** ${parsedUrl.port}\n`;
        }
        
        // Path analysis
        if (parsedUrl.pathname && parsedUrl.pathname !== '/') {
          output += `- **Path:** ${parsedUrl.pathname.slice(0, 100)}${parsedUrl.pathname.length > 100 ? '...' : ''}\n`;
        }
        
        // Check for localhost
        const isLocalhost = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsedUrl.hostname);
        if (isLocalhost) {
          output += `- **Localhost:** Yes (typically safe for development)\n`;
        }
        
        // IP address check
        const isIPAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsedUrl.hostname);
        if (isIPAddress && !isLocalhost) {
          output += `  - ⚠️ IP address instead of domain name\n`;
        }
        
      } catch (parseError) {
        const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError);
        const truncatedMessage = parseErrorMessage.length > 120 ? `${parseErrorMessage.slice(0, 117)}...` : parseErrorMessage;
        context.logger.warn('Unable to parse URL for detailed analysis', { url: normalizedUrl, error: truncatedMessage });
        output += `- Unable to parse URL for detailed analysis (${truncatedMessage})\n`;
      }
      
      output += '\n### Recommendation\n';
      if (safetyCheck.safe) {
        if (safetyCheck.riskScore === 0) {
          output += 'This URL appears to be completely safe. You can proceed with navigation.\n';
        } else {
          output += 'This URL has some minor risk indicators but is likely safe. Proceed with normal caution.\n';
        }
      } else {
        output += '**Do not navigate to this URL.** It has been flagged as potentially dangerous.\n';
        output += 'If you believe this is a false positive, contact the system administrator.\n';
      }
    }
    
    return {
      toolName: 'browser_check_url',
      success: true,
      output,
      metadata: {
        url: normalizedUrl,
        safe: safetyCheck.safe,
        riskScore: safetyCheck.riskScore,
        warnings: safetyCheck.warnings,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error('URL check error', { url, error: errorMessage });
    
    return {
      toolName: 'browser_check_url',
      success: false,
      output: `Error checking URL: ${errorMessage}`,
    };
  }
}

export const browserCheckUrlTool: ToolDefinition<CheckUrlArgs> = {
  name: 'browser_check_url',
  description: `Check if a URL is safe before navigating to it.

**Use cases:**
- Verify a URL is safe before navigation
- Check why a URL might be blocked
- Analyze suspicious URLs for security risks
- Pre-validate URLs from user input or external sources

**Security checks performed:**
- Known phishing patterns (fake login pages, lookalike domains)
- Malware distribution patterns
- Dangerous domains database
- Suspicious URL characteristics (excessive subdomains, IP addresses, etc.)
- Protocol security (HTTPS vs HTTP)

**Risk scoring:**
- 0-30: Low risk, likely safe
- 31-60: Medium risk, proceed with caution
- 61-100: High risk, likely dangerous (will be blocked)`,

  requiresApproval: false,
  category: 'browser-read',
  riskLevel: 'safe',

  schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to check for safety',
      },
      detailed: {
        type: 'boolean',
        description: 'Include detailed risk analysis and recommendations (default: false)',
      },
    },
    required: ['url'],
  },

  execute: executeCheckUrl,
};
