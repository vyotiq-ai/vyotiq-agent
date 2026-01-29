/**
 * Todo System Format Utilities
 * 
 * Shared formatting functions for todo/task display.
 * Used across todoWrite, createPlan, getActivePlan, listPlans, etc.
 */

/**
 * Status indicators for task display (clean text-based)
 */
export const STATUS_ICONS = {
  completed: '[x]',
  in_progress: '[~]',
  pending: '[ ]',
} as const;

/**
 * Priority indicators (P1=Critical, P5=Low)
 */
export const PRIORITY_ICONS = ['P1', 'P2', 'P3', 'P4', 'P5'] as const;

/**
 * Verification status indicators
 */
export const VERIFICATION_ICONS = {
  verified: '[PASS]',
  failed: '[FAIL]',
  pending: '[...]',
} as const;

/**
 * Generate a progress bar using unicode characters
 * @param percentage - Completion percentage (0-100)
 * @param width - Width of the progress bar in characters (default: 20)
 */
export function generateProgressBar(percentage: number, width = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const filledChar = '█';
  const emptyChar = '░';
  return `${filledChar.repeat(filled)}${emptyChar.repeat(empty)}`;
}

/**
 * Format a timestamp to a readable date string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format timestamp to a short date
 */
export function formatShortDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Calculate estimated complexity label
 */
export function getComplexityLabel(complexity?: number): string {
  if (!complexity) return '';
  const labels = ['', 'Simple', 'Easy', 'Medium', 'Complex', 'Very Complex'];
  return labels[complexity] || '';
}

/**
 * Calculate percentage safely (handles division by zero)
 * @param value - The numerator value
 * @param total - The denominator value
 * @returns Rounded percentage (0-100)
 */
export function calculatePercentage(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

/**
 * Get a status label based on percentage
 */
export function getProgressColor(percentage: number): string {
  return percentage === 100 ? 'DONE' : percentage >= 50 ? 'PROGRESS' : 'STARTED';
}
