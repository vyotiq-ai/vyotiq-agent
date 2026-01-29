/**
 * ANSI Escape Code Utilities
 * 
 * Utilities for handling ANSI escape sequences in terminal output.
 * Used to strip or parse ANSI codes for display in non-terminal contexts.
 */

/**
 * Regular expression to match ANSI escape sequences
 * Covers:
 * - CSI (Control Sequence Introducer) sequences: ESC [ ... (most common)
 * - OSC (Operating System Command) sequences: ESC ] ... (title, hyperlinks)
 * - SGR (Select Graphic Rendition) sequences: colors, styles
 * - Cursor movement, screen clearing, etc.
 */
const ANSI_REGEX = new RegExp(
  [
    // CSI sequences (ESC [ ... letter)
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    // SGR sequences and other CSI
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  ].join('|'),
  'g'
);

/**
 * Alternative simpler regex for common ANSI codes
 */
// eslint-disable-next-line no-control-regex
const ANSI_SIMPLE_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * Extended regex to catch more escape sequences including:
 * - Standard ANSI CSI sequences
 * - OSC sequences (for terminal titles, hyperlinks)
 * - DCS sequences
 * - Private mode sequences
 */
// eslint-disable-next-line no-control-regex
const ANSI_EXTENDED_REGEX = /(?:\x1B[@-Z\\-_]|\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*(?:\x07|\x1B\\)|\x1B[PX^_][^\x1B]*\x1B\\|\x1B.)/g;

/**
 * Strip all ANSI escape sequences from a string
 * 
 * @param text - Text potentially containing ANSI escape codes
 * @returns Clean text with all ANSI codes removed
 * 
 * @example
 * stripAnsi('\x1B[31mRed text\x1B[0m') // 'Red text'
 * stripAnsi('\x1B[?25l\x1B[2J') // ''
 */
export function stripAnsi(text: string): string {
  if (!text || typeof text !== 'string') {
    return text ?? '';
  }
  
  // Apply both regex patterns to catch all escape sequences
  return text
    .replace(ANSI_EXTENDED_REGEX, '')
    .replace(ANSI_SIMPLE_REGEX, '')
    .replace(ANSI_REGEX, '');
}

/**
 * Check if a string contains ANSI escape sequences
 * 
 * @param text - Text to check
 * @returns true if the text contains ANSI codes
 */
export function hasAnsi(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return ANSI_EXTENDED_REGEX.test(text) || ANSI_SIMPLE_REGEX.test(text);
}

/**
 * Clean terminal output for display
 * Strips ANSI codes and normalizes line endings
 * 
 * @param output - Raw terminal output
 * @returns Cleaned output suitable for display
 */
export function cleanTerminalOutput(output: string): string {
  if (!output || typeof output !== 'string') {
    return output ?? '';
  }
  
  return stripAnsi(output)
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove null characters
    .replace(/\0/g, '')
    // Collapse multiple blank lines into one
    .replace(/\n{3,}/g, '\n\n')
    // Trim trailing whitespace from each line
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Extract visible text length (excluding ANSI codes)
 * 
 * @param text - Text potentially containing ANSI codes
 * @returns Length of visible text
 */
export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}
