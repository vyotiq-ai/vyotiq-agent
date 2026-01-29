/**
 * Encoding Detection and Repair Utilities
 * 
 * Handles detection and repair of common encoding issues:
 * - UTF-8 mojibake (UTF-8 bytes misread as Windows-1252/CP1252)
 * - BOM detection and handling
 * - Common encoding pattern detection
 * 
 * This is particularly useful for fixing files with box-drawing characters
 * that appear as garbled text like "├──" instead of "├──"
 */

import { createLogger } from '../logger';

const logger = createLogger('encoding');

/**
 * Common UTF-8 mojibake patterns (UTF-8 bytes misread as Windows-1252)
 * Maps corrupted sequences back to their original UTF-8 characters
 */
const MOJIBAKE_PATTERNS: [RegExp, string][] = [
  // Box-drawing characters (commonly corrupted in .md files with ASCII art)
  [/├/g, '├'],    // U+251C BOX DRAWINGS LIGHT VERTICAL AND RIGHT
  [/│/g, '│'],    // U+2502 BOX DRAWINGS LIGHT VERTICAL
  [/└/g, '└'],    // U+2514 BOX DRAWINGS LIGHT DOWN AND RIGHT
  [/─/g, '─'],    // U+2500 BOX DRAWINGS LIGHT HORIZONTAL
  [/┌/g, '┌'],    // U+250C BOX DRAWINGS LIGHT DOWN AND RIGHT
  [/┐/g, '┐'],    // U+2510 BOX DRAWINGS LIGHT DOWN AND LEFT
  [/┘/g, '┘'],    // U+2518 BOX DRAWINGS LIGHT UP AND LEFT
  [/┤/g, '┤'],    // U+2524 BOX DRAWINGS LIGHT VERTICAL AND LEFT
  [/┬/g, '┬'],    // U+252C BOX DRAWINGS LIGHT DOWN AND HORIZONTAL
  [/┴/g, '┴'],    // U+2534 BOX DRAWINGS LIGHT UP AND HORIZONTAL
  [/┼/g, '┼'],    // U+253C BOX DRAWINGS LIGHT VERTICAL AND HORIZONTAL
  [/╔/g, '╔'],    // U+2554 BOX DRAWINGS DOUBLE DOWN AND RIGHT
  [/╗/g, '╗'],    // U+2557 BOX DRAWINGS DOUBLE DOWN AND LEFT
  [/╚/g, '╚'],    // U+255A BOX DRAWINGS DOUBLE UP AND RIGHT
  [/╝/g, '╝'],    // U+255D BOX DRAWINGS DOUBLE UP AND LEFT
  [/║/g, '║'],    // U+2551 BOX DRAWINGS DOUBLE VERTICAL
  [/═/g, '═'],    // U+2550 BOX DRAWINGS DOUBLE HORIZONTAL
  
  // Common punctuation and symbols
  [/â€"/g, '—'],    // U+2014 EM DASH
  [/â€"/g, '–'],    // U+2013 EN DASH
  [/â€™/g, '\u2019'],    // U+2019 RIGHT SINGLE QUOTATION MARK
  [/â€˜/g, '\u2018'],    // U+2018 LEFT SINGLE QUOTATION MARK
  [/â€œ/g, '\u201C'],    // U+201C LEFT DOUBLE QUOTATION MARK
  [/â€/g, '\u201D'],    // U+201D RIGHT DOUBLE QUOTATION MARK (partial match)
  [/â€¦/g, '…'],    // U+2026 HORIZONTAL ELLIPSIS
  [/â€¢/g, '•'],    // U+2022 BULLET
  [/Â©/g, '©'],    // U+00A9 COPYRIGHT SIGN
  [/Â®/g, '®'],    // U+00AE REGISTERED SIGN
  [/â„¢/g, '™'],    // U+2122 TRADE MARK SIGN
  [/Â°/g, '°'],    // U+00B0 DEGREE SIGN
  [/Â±/g, '±'],    // U+00B1 PLUS-MINUS SIGN
  [/Â²/g, '²'],    // U+00B2 SUPERSCRIPT TWO
  [/Â³/g, '³'],    // U+00B3 SUPERSCRIPT THREE
  [/Â´/g, '´'],    // U+00B4 ACUTE ACCENT
  [/Âµ/g, 'µ'],    // U+00B5 MICRO SIGN
  [/â‚¬/g, '€'],    // U+20AC EURO SIGN
  [/Â£/g, '£'],    // U+00A3 POUND SIGN
  [/Â¥/g, '¥'],    // U+00A5 YEN SIGN
  [/Â§/g, '§'],    // U+00A7 SECTION SIGN
  [/Â«/g, '«'],    // U+00AB LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
  [/Â»/g, '»'],    // U+00BB RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
  
  // Check marks and crosses
  [/âœ"/g, '✓'],    // U+2713 CHECK MARK
  [/âœ—/g, '✗'],    // U+2717 BALLOT X
  [/âœ˜/g, '✘'],    // U+2718 HEAVY BALLOT X
  [/âœ"/g, '✔'],    // U+2714 HEAVY CHECK MARK
  
  // Arrows
  [/â†'/g, '→'],    // U+2192 RIGHTWARDS ARROW
  [/â†/g, '←'],    // U+2190 LEFTWARDS ARROW
  [/â†"/g, '↓'],    // U+2193 DOWNWARDS ARROW
  [/â†'/g, '↑'],    // U+2191 UPWARDS ARROW
  [/â‡'/g, '⇒'],    // U+21D2 RIGHTWARDS DOUBLE ARROW
  
  // Common diacritical patterns (accented characters)
  [/Ã¡/g, 'á'],
  [/Ã©/g, 'é'],
  [/Ã­/g, 'í'],
  [/Ã³/g, 'ó'],
  [/Ãº/g, 'ú'],
  [/Ã±/g, 'ñ'],
  [/Ã¼/g, 'ü'],
  [/Ã¤/g, 'ä'],
  [/Ã¶/g, 'ö'],
  [/ÃŸ/g, 'ß'],
  
  // Remove stray UTF-8 continuation byte markers that might appear
  [/Â/g, ''],  // Commonly appears before other characters in mojibake
];

/**
 * Patterns that indicate potential mojibake in content
 */
const MOJIBAKE_DETECTION_PATTERNS = [
  /├/,  // Box drawing corruption
  /│/,
  /└/,
  /─/,
  /â€[™˜œ""–—¦¢]/,  // Smart quotes/dashes corruption
  /Ã[¡©­³ºñ¼¤¶Ÿ]/,   // Accented character corruption
  /Â[©®°±²³´µ§«»£¥]/,  // Symbol corruption
];

/**
 * Check if content appears to have mojibake (encoding corruption)
 */
export function hasMojibake(content: string): boolean {
  return MOJIBAKE_DETECTION_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Repair mojibake in content by replacing known corrupted sequences
 * with their correct UTF-8 equivalents
 * 
 * @param content - The potentially corrupted content
 * @returns The repaired content with mojibake fixed
 */
export function repairMojibake(content: string): string {
  if (!content) return content;
  
  let repaired = content;
  let changesCount = 0;
  
  for (const [pattern, replacement] of MOJIBAKE_PATTERNS) {
    const beforeLength = repaired.length;
    repaired = repaired.replace(pattern, replacement);
    if (repaired.length !== beforeLength) {
      changesCount++;
    }
  }
  
  if (changesCount > 0) {
    logger.debug('Repaired mojibake in content', { 
      patternsFixed: changesCount,
      originalLength: content.length,
      repairedLength: repaired.length,
    });
  }
  
  return repaired;
}

/**
 * Detect if content has a UTF-8 BOM (Byte Order Mark)
 */
export function hasUtf8Bom(content: string | Buffer): boolean {
  if (Buffer.isBuffer(content)) {
    return content.length >= 3 && 
           content[0] === 0xEF && 
           content[1] === 0xBB && 
           content[2] === 0xBF;
  }
  return content.charCodeAt(0) === 0xFEFF;
}

/**
 * Remove UTF-8 BOM from content if present
 */
export function removeUtf8Bom(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  return content;
}

/**
 * Detect probable encoding of a buffer based on byte patterns
 * 
 * @returns Detected encoding or 'utf-8' as default
 */
export function detectEncoding(buffer: Buffer): 'utf-8' | 'utf-16le' | 'utf-16be' | 'ascii' {
  // Check for BOMs
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8';
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'utf-16le';
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'utf-16be';
  }
  
  // Check for null bytes (common in UTF-16)
  let nullBytes = 0;
  for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
    if (buffer[i] === 0x00) nullBytes++;
  }
  
  if (nullBytes > 10) {
    // Lots of nulls - likely UTF-16
    // Check alternating pattern
    let evenNulls = 0;
    let oddNulls = 0;
    for (let i = 0; i < Math.min(buffer.length, 1000); i++) {
      if (buffer[i] === 0x00) {
        if (i % 2 === 0) evenNulls++;
        else oddNulls++;
      }
    }
    if (evenNulls > oddNulls * 2) return 'utf-16le';
    if (oddNulls > evenNulls * 2) return 'utf-16be';
  }
  
  // Check if valid ASCII (all bytes < 128)
  let isAscii = true;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] > 127) {
      isAscii = false;
      break;
    }
  }
  if (isAscii) return 'ascii';
  
  // Default to UTF-8
  return 'utf-8';
}

/**
 * Read and decode a buffer with automatic encoding detection and mojibake repair
 * 
 * @param buffer - The raw file buffer
 * @param options - Options for decoding
 * @returns Decoded and optionally repaired content
 */
export function decodeBuffer(
  buffer: Buffer, 
  options: {
    autoRepairMojibake?: boolean;
    encoding?: BufferEncoding;
  } = {}
): { content: string; encoding: string; wasRepaired: boolean } {
  const { autoRepairMojibake = true, encoding: forcedEncoding } = options;
  
  // Detect or use forced encoding
  const detectedEncoding = forcedEncoding || detectEncoding(buffer);
  
  // Decode the buffer
  let content = buffer.toString(detectedEncoding as BufferEncoding);
  
  // Remove BOM if present
  content = removeUtf8Bom(content);
  
  // Check for and repair mojibake
  let wasRepaired = false;
  if (autoRepairMojibake && hasMojibake(content)) {
    const repairedContent = repairMojibake(content);
    if (repairedContent !== content) {
      wasRepaired = true;
      content = repairedContent;
    }
  }
  
  return {
    content,
    encoding: detectedEncoding,
    wasRepaired,
  };
}
