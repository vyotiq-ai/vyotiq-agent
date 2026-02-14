/**
 * Claude Code Subscription Authentication
 * 
 * Imports OAuth tokens from existing Claude Code CLI installation.
 * Claude Code stores credentials in ~/.claude/.credentials.json
 * 
 * This approach works because:
 * 1. User authenticates via Claude Code CLI (which has valid OAuth client)
 * 2. We import those credentials to use with Anthropic API
 * 3. Tokens can be refreshed using the refresh token
 * 4. Refreshed tokens are synced back to Claude Code credentials file
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../logger';
import type { ClaudeSubscription, ClaudeSubscriptionTier } from '../../shared/types';

const logger = createLogger('ClaudeAuth');

// Claude Code credentials file location
const CLAUDE_CODE_DIR = join(homedir(), '.claude');
const CLAUDE_CODE_CREDENTIALS_PATH = join(CLAUDE_CODE_DIR, '.credentials.json');

// Anthropic API endpoints
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/api/auth/oauth_token';
const ANTHROPIC_USER_INFO_URL = 'https://api.anthropic.com/v1/me';

// Token refresh buffer (5 minutes before expiry)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Background refresh interval check (every 2 minutes)
const REFRESH_CHECK_INTERVAL_MS = 2 * 60 * 1000;

// Retry configuration
const MAX_REFRESH_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Background refresh timer
let refreshTimer: NodeJS.Timeout | null = null;

// File watcher for credentials changes
let credentialsWatcher: ReturnType<typeof import('node:fs').watch> | null = null;

// Callback for when subscription is updated
let onSubscriptionUpdate: ((subscription: ClaudeSubscription) => void) | null = null;

// Callback for status change events (for UI notifications)
let onStatusChange: ((event: ClaudeStatusEvent) => void) | null = null;

/** Status change event types */
export type ClaudeStatusEventType = 
  | 'auto-imported'
  | 'credentials-changed'
  | 'token-refreshed'
  | 'token-refresh-failed'
  | 'token-expiring-soon'
  | 'disconnected';

export interface ClaudeStatusEvent {
  type: ClaudeStatusEventType;
  message: string;
  tier?: ClaudeSubscriptionTier;
}

/**
 * Claude Code credentials file format
 */
interface ClaudeCodeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes?: string[];
  };
}

/**
 * Check if Claude Code CLI is installed (credentials directory exists)
 */
export async function isClaudeCodeInstalled(): Promise<boolean> {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(CLAUDE_CODE_DIR);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Claude Code CLI binary is available in PATH
 */
export async function isClaudeCodeCLIAvailable(): Promise<boolean> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);
  
  try {
    await execAsync('claude --version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Launch Claude Code CLI authentication flow
 * Opens the CLI which will trigger browser-based OAuth
 */
export async function launchClaudeAuthentication(): Promise<{ success: boolean; error?: string }> {
  const { spawn } = await import('node:child_process');
  
  // Prevent duplicate launches
  if (isAuthInProgress) {
    logger.info('Auth already in progress, skipping duplicate launch');
    return { success: true };
  }
  
  try {
    // Check if CLI is available
    const cliAvailable = await isClaudeCodeCLIAvailable();
    if (!cliAvailable) {
      return { 
        success: false, 
        error: 'Claude Code CLI not installed. Run: npm i -g @anthropic-ai/claude-code' 
      };
    }
    
    isAuthInProgress = true;
    logger.info('Launching Claude Code authentication');
    
    // Start watching for credentials file creation/changes BEFORE launching auth
    await startCredentialsFileWatcher();
    
    // Launch claude CLI in background - it will open browser for auth
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // On Windows, run claude in a hidden process
      const child = spawn('cmd', ['/c', 'claude'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } else {
      // On Unix, run in background
      const child = spawn('claude', [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
    
    return { success: true };
  } catch (err) {
    isAuthInProgress = false;
    logger.error('Failed to launch Claude authentication', { 
      error: err instanceof Error ? err.message : String(err) 
    });
    return { 
      success: false, 
      error: err instanceof Error ? err.message : 'Failed to launch authentication' 
    };
  }
}

// Watcher for credentials file during auth flow
let authCredentialsWatcher: ReturnType<typeof import('node:fs').watch> | null = null;
let authWatcherCallback: ((subscription: ClaudeSubscription) => void) | null = null;
let isAuthInProgress = false;

/**
 * Check if authentication is currently in progress
 */
export function isAuthenticating(): boolean {
  return isAuthInProgress;
}

/**
 * Set callback for when auth completes (credentials file appears)
 */
export function setAuthCompleteCallback(callback: ((subscription: ClaudeSubscription) => void) | null): void {
  authWatcherCallback = callback;
}

/**
 * Start watching for credentials file to appear during auth flow
 */
async function startCredentialsFileWatcher(): Promise<void> {
  stopCredentialsFileWatcher();
  
  const fs = await import('node:fs');
  const fsPromises = await import('node:fs/promises');
  
  // Ensure .claude directory exists
  try {
    await fsPromises.mkdir(CLAUDE_CODE_DIR, { recursive: true });
  } catch {
    // Directory might already exist
  }
  
  let debounceTimer: NodeJS.Timeout | null = null;
  
  // Watch the directory for file creation
  authCredentialsWatcher = fs.watch(CLAUDE_CODE_DIR, async (_eventType, filename) => {
    if (filename !== '.credentials.json') return;
    
    // Debounce rapid changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      logger.info('Credentials file detected during auth flow');
      try {
        const hasCredentials = await hasClaudeCodeCredentials();
        if (hasCredentials) {
          const subscription = await importClaudeCodeCredentials();
          stopCredentialsFileWatcher();
          
          if (authWatcherCallback) {
            authWatcherCallback(subscription);
          }
          if (onSubscriptionUpdate) {
            onSubscriptionUpdate(subscription);
          }
          emitStatusChange({
            type: 'auto-imported',
            message: `Claude ${subscription.tier} subscription connected`,
            tier: subscription.tier,
          });
        }
      } catch (err) {
        logger.warn('Failed to import credentials after auth', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, 1000);
  });
  
  logger.debug('Auth credentials watcher started');
}

/**
 * Stop watching for credentials file during auth
 */
export function stopCredentialsFileWatcher(): void {
  if (authCredentialsWatcher) {
    authCredentialsWatcher.close();
    authCredentialsWatcher = null;
    logger.debug('Auth credentials watcher stopped');
  }
  isAuthInProgress = false;
}

// Track if we've already logged the "no credentials" message to avoid spam
let hasLoggedNoCredentials = false;

/**
 * Check if Claude Code has valid credentials
 */
export async function hasClaudeCodeCredentials(): Promise<boolean> {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(CLAUDE_CODE_CREDENTIALS_PATH);
    const content = await fs.readFile(CLAUDE_CODE_CREDENTIALS_PATH, 'utf-8');
    const credentials: ClaudeCodeCredentials = JSON.parse(content);
    const hasTokens = !!(credentials.claudeAiOauth?.accessToken && credentials.claudeAiOauth?.refreshToken);
    // Only log when credentials are found (success case)
    if (hasTokens) {
      hasLoggedNoCredentials = false; // Reset for next time
      logger.debug('Credentials check', { 
        path: CLAUDE_CODE_CREDENTIALS_PATH,
        hasTokens,
      });
    }
    return hasTokens;
  } catch {
    // Only log once per "session" to avoid spamming logs during polling
    if (!hasLoggedNoCredentials) {
      hasLoggedNoCredentials = true;
      logger.debug('Credentials file not found or invalid', { 
        path: CLAUDE_CODE_CREDENTIALS_PATH,
      });
    }
    return false;
  }
}

/**
 * Import Claude Code credentials from the user's system
 * Requires Claude Code CLI to be installed and authenticated
 */
export async function importClaudeCodeCredentials(): Promise<ClaudeSubscription> {
  const fs = await import('node:fs/promises');
  
  try {
    await fs.access(CLAUDE_CODE_CREDENTIALS_PATH);
  } catch {
    throw new Error(
      'Claude Code not found. Please install and authenticate first:\n' +
      '1. npm install -g @anthropic-ai/claude-code\n' +
      '2. Run: claude\n' +
      '3. Complete browser authentication\n' +
      '4. Return here and try again'
    );
  }

  const credentialsRaw = await fs.readFile(CLAUDE_CODE_CREDENTIALS_PATH, 'utf-8');
  let credentials: ClaudeCodeCredentials;
  
  try {
    credentials = JSON.parse(credentialsRaw);
  } catch {
    throw new Error('Invalid Claude Code credentials file format');
  }

  const oauth = credentials.claudeAiOauth;
  if (!oauth?.accessToken || !oauth?.refreshToken) {
    throw new Error(
      'Claude Code not authenticated. Please run:\n' +
      '1. claude\n' +
      '2. Select "Claude.ai account"\n' +
      '3. Complete browser login'
    );
  }

  // Check if token needs refresh
  if (isTokenExpired({ ...oauth, tier: 'pro', connectedAt: Date.now() } as ClaudeSubscription)) {
    logger.info('Claude Code token expired, refreshing');
    return await refreshClaudeToken(oauth.refreshToken);
  }

  // Validate token
  const isValid = await validateToken(oauth.accessToken);
  if (!isValid) {
    logger.info('Claude Code token invalid, refreshing');
    return await refreshClaudeToken(oauth.refreshToken);
  }

  // Fetch actual user info (tier, email)
  const userInfo = await fetchUserInfo(oauth.accessToken);

  logger.info('Successfully imported Claude Code credentials', { tier: userInfo?.tier });
  
  return {
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    expiresAt: oauth.expiresAt,
    tier: userInfo?.tier || 'pro',
    email: userInfo?.email,
    connectedAt: Date.now(),
  };
}

/**
 * Validate token by making a test API call
 */
async function validateToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-version': '2023-06-01',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch user info to get actual subscription tier
 */
async function fetchUserInfo(accessToken: string): Promise<{ tier: ClaudeSubscriptionTier; email?: string } | null> {
  try {
    // Try to get user info from Anthropic API
    const response = await fetch(ANTHROPIC_USER_INFO_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-version': '2023-06-01',
      },
    });
    
    if (!response.ok) {
      // API might not support this endpoint yet, default to pro
      logger.debug('User info endpoint not available, defaulting to pro tier');
      return { tier: 'pro' };
    }
    
    const data = await response.json();
    
    // Map API response to tier (adjust based on actual API response format)
    const tierMap: Record<string, ClaudeSubscriptionTier> = {
      'free': 'free',
      'pro': 'pro',
      'max': 'max',
      'team': 'team',
      'enterprise': 'enterprise',
    };
    
    const tier = tierMap[data.plan?.toLowerCase()] || tierMap[data.subscription_type?.toLowerCase()] || 'pro';
    
    return {
      tier,
      email: data.email,
    };
  } catch (err) {
    logger.debug('Failed to fetch user info', { error: err instanceof Error ? err.message : String(err) });
    return { tier: 'pro' };
  }
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sync credentials back to Claude Code credentials file
 */
async function syncCredentialsToFile(subscription: ClaudeSubscription): Promise<void> {
  const fs = await import('node:fs/promises');
  
  try {
    let credentials: ClaudeCodeCredentials = {};
    
    // Read existing file if it exists
    try {
      const existing = await fs.readFile(CLAUDE_CODE_CREDENTIALS_PATH, 'utf-8');
      credentials = JSON.parse(existing);
    } catch {
      // File doesn't exist or is invalid, start fresh
    }
    
    // Update OAuth section
    credentials.claudeAiOauth = {
      accessToken: subscription.accessToken,
      refreshToken: subscription.refreshToken,
      expiresAt: subscription.expiresAt,
      scopes: ['user:inference', 'user:profile'],
    };
    
    // Ensure directory exists
    await fs.mkdir(CLAUDE_CODE_DIR, { recursive: true });
    
    // Write back
    await fs.writeFile(CLAUDE_CODE_CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), 'utf-8');
    logger.debug('Synced credentials back to Claude Code');
  } catch (err) {
    // Non-fatal - just log warning
    logger.warn('Failed to sync credentials to Claude Code file', { 
      error: err instanceof Error ? err.message : String(err) 
    });
  }
}

/**
 * Refresh an expired access token with retry logic
 */
export async function refreshClaudeToken(refreshToken: string, retryCount = 0): Promise<ClaudeSubscription> {
  try {
    const response = await fetch(ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Token refresh failed', { status: response.status, error: errorText });
      
      // Retry on network/server errors
      if (retryCount < MAX_REFRESH_RETRIES && response.status >= 500) {
        logger.info(`Retrying token refresh (${retryCount + 1}/${MAX_REFRESH_RETRIES})`);
        await sleep(RETRY_DELAY_MS * (retryCount + 1));
        return refreshClaudeToken(refreshToken, retryCount + 1);
      }
      
      throw new Error(
        'Token refresh failed. Please re-authenticate:\n' +
        '1. Run: claude\n' +
        '2. Complete authentication\n' +
        '3. Import again'
      );
    }

    const tokenData = await response.json();
    
    // Fetch user info for tier
    const userInfo = await fetchUserInfo(tokenData.access_token);
    
    const subscription: ClaudeSubscription = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken,
      expiresAt: Date.now() + ((tokenData.expires_in || 28800) * 1000),
      tier: userInfo?.tier || 'pro',
      email: userInfo?.email,
      connectedAt: Date.now(),
    };
    
    // Sync back to Claude Code file
    await syncCredentialsToFile(subscription);
    
    logger.info('Claude token refreshed and synced', { tier: subscription.tier });
    return subscription;
  } catch (err) {
    // Retry on network errors
    if (retryCount < MAX_REFRESH_RETRIES && err instanceof TypeError) {
      logger.info(`Retrying token refresh after network error (${retryCount + 1}/${MAX_REFRESH_RETRIES})`);
      await sleep(RETRY_DELAY_MS * (retryCount + 1));
      return refreshClaudeToken(refreshToken, retryCount + 1);
    }
    throw err;
  }
}

/**
 * Auto-refresh token if it's about to expire
 * Returns the subscription (refreshed if needed) or null if refresh failed
 */
export async function ensureValidToken(subscription: ClaudeSubscription): Promise<ClaudeSubscription | null> {
  if (!isTokenExpired(subscription, TOKEN_REFRESH_BUFFER_MS)) {
    return subscription;
  }
  
  logger.info('Token expiring soon, auto-refreshing');
  try {
    return await refreshClaudeToken(subscription.refreshToken);
  } catch (err) {
    logger.error('Auto-refresh failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Check if a subscription token is expired or about to expire
 */
export function isTokenExpired(subscription: ClaudeSubscription, bufferMs = 60000): boolean {
  return Date.now() >= (subscription.expiresAt - bufferMs);
}

/**
 * Get time until token expires in milliseconds
 */
export function getTimeUntilExpiry(subscription: ClaudeSubscription): number {
  return Math.max(0, subscription.expiresAt - Date.now());
}

/**
 * Format expiry time as human-readable string
 */
export function formatExpiryTime(subscription: ClaudeSubscription): string {
  const ms = getTimeUntilExpiry(subscription);
  
  if (ms <= 0) return 'expired';
  
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Get subscription status information
 */
export function getSubscriptionStatus(subscription: ClaudeSubscription | undefined): {
  connected: boolean;
  tier?: ClaudeSubscriptionTier;
  email?: string;
  expiresAt?: number;
  isExpired?: boolean;
  expiresIn?: string;
} {
  if (!subscription) {
    return { connected: false };
  }

  return {
    connected: true,
    tier: subscription.tier,
    email: subscription.email,
    expiresAt: subscription.expiresAt,
    isExpired: isTokenExpired(subscription),
    expiresIn: formatExpiryTime(subscription),
  };
}

/**
 * Clear saved subscription data
 */
export async function clearClaudeSubscription(): Promise<void> {
  stopBackgroundRefresh();
  stopCredentialsWatcher();
  emitStatusChange({ type: 'disconnected', message: 'Claude subscription disconnected' });
  logger.info('Claude subscription cleared');
}

/**
 * Set callback for subscription updates (used by auto-refresh)
 */
export function setSubscriptionUpdateCallback(callback: ((subscription: ClaudeSubscription) => void) | null): void {
  onSubscriptionUpdate = callback;
}

/**
 * Set callback for status change events (for UI notifications)
 */
export function setStatusChangeCallback(callback: ((event: ClaudeStatusEvent) => void) | null): void {
  onStatusChange = callback;
}

/**
 * Emit a status change event
 */
function emitStatusChange(event: ClaudeStatusEvent): void {
  if (onStatusChange) {
    onStatusChange(event);
  }
}

/**
 * Start watching credentials file for external changes
 */
export async function startCredentialsWatcher(): Promise<void> {
  stopCredentialsWatcher();
  
  const fs = await import('node:fs');
  
  try {
    // Check if file exists first
    if (!fs.existsSync(CLAUDE_CODE_CREDENTIALS_PATH)) {
      logger.debug('Credentials file does not exist, skipping watcher');
      return;
    }
    
    let debounceTimer: NodeJS.Timeout | null = null;
    
    credentialsWatcher = fs.watch(CLAUDE_CODE_CREDENTIALS_PATH, async (eventType) => {
      if (eventType !== 'change') return;
      
      // Debounce rapid changes
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        logger.info('Credentials file changed externally, re-importing');
        try {
          const subscription = await importClaudeCodeCredentials();
          if (onSubscriptionUpdate) {
            onSubscriptionUpdate(subscription);
          }
          emitStatusChange({ 
            type: 'credentials-changed', 
            message: 'Claude credentials updated from CLI',
            tier: subscription.tier,
          });
        } catch (err) {
          logger.warn('Failed to re-import credentials after file change', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, 500);
    });
    
    logger.debug('Credentials file watcher started');
  } catch (err) {
    logger.warn('Failed to start credentials watcher', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Stop watching credentials file
 */
export function stopCredentialsWatcher(): void {
  if (credentialsWatcher) {
    credentialsWatcher.close();
    credentialsWatcher = null;
    logger.debug('Credentials file watcher stopped');
  }
}

/**
 * Start background token refresh timer
 */
export function startBackgroundRefresh(subscription: ClaudeSubscription): void {
  stopBackgroundRefresh();
  
  // Also start credentials watcher
  startCredentialsWatcher();
  
  // Check for expiring soon on start
  const timeUntilExpiry = getTimeUntilExpiry(subscription);
  if (timeUntilExpiry > 0 && timeUntilExpiry <= 30 * 60 * 1000) {
    emitStatusChange({
      type: 'token-expiring-soon',
      message: `Token expires in ${formatExpiryTime(subscription)}`,
      tier: subscription.tier,
    });
  }
  
  refreshTimer = setInterval(async () => {
    if (!subscription.refreshToken) return;
    
    // Check if token needs refresh (within 5 min buffer)
    if (isTokenExpired(subscription, TOKEN_REFRESH_BUFFER_MS)) {
      logger.info('Background: Token expiring soon, auto-refreshing');
      try {
        const refreshed = await refreshClaudeToken(subscription.refreshToken);
        subscription = refreshed; // Update local reference
        if (onSubscriptionUpdate) {
          onSubscriptionUpdate(refreshed);
        }
        emitStatusChange({
          type: 'token-refreshed',
          message: 'Token refreshed automatically',
          tier: refreshed.tier,
        });
        logger.info('Background: Token refreshed successfully');
      } catch (err) {
        logger.error('Background: Token refresh failed', { 
          error: err instanceof Error ? err.message : String(err) 
        });
        emitStatusChange({
          type: 'token-refresh-failed',
          message: 'Token refresh failed. Please re-authenticate Claude Code.',
        });
      }
    }
  }, REFRESH_CHECK_INTERVAL_MS);
  if (refreshTimer && typeof refreshTimer === 'object' && 'unref' in refreshTimer) {
    (refreshTimer as NodeJS.Timeout).unref();
  }
  
  logger.debug('Background token refresh started');
}

/**
 * Stop background token refresh timer
 */
export function stopBackgroundRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.debug('Background token refresh stopped');
  }
}

/**
 * Auto-import Claude Code credentials if available
 * Returns subscription if found and valid, null otherwise
 */
export async function autoImportCredentials(): Promise<ClaudeSubscription | null> {
  try {
    logger.info('Auto-import: Starting credentials check', { 
      credentialsPath: CLAUDE_CODE_CREDENTIALS_PATH,
    });
    
    // Check if Claude Code is installed and has credentials
    const installed = await isClaudeCodeInstalled();
    if (!installed) {
      logger.info('Auto-import: Claude Code directory not found', { dir: CLAUDE_CODE_DIR });
      return null;
    }
    
    const hasCredentials = await hasClaudeCodeCredentials();
    if (!hasCredentials) {
      logger.info('Auto-import: No valid Claude Code credentials found');
      return null;
    }
    
    // Import credentials
    const subscription = await importClaudeCodeCredentials();
    logger.info('Auto-import: Claude Code credentials imported successfully', { tier: subscription.tier });
    
    // Start background refresh and file watcher
    startBackgroundRefresh(subscription);
    
    emitStatusChange({
      type: 'auto-imported',
      message: `Claude ${subscription.tier} subscription connected`,
      tier: subscription.tier,
    });
    
    return subscription;
  } catch (err) {
    logger.error('Auto-import: Failed to import credentials', { 
      error: err instanceof Error ? err.message : String(err) 
    });
    return null;
  }
}
