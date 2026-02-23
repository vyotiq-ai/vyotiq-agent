/**
 * Mention Pattern Constants
 * 
 * Single source of truth for all @file mention regex patterns used
 * across detection, highlighting, parsing, and atomic deletion.
 * 
 * Mention format: `@file <path>` where path is a non-whitespace,
 * non-@ sequence of characters (e.g. `@file src/utils/cn.ts`).
 */

/**
 * Tests whether a string contains at least one `@file <path>` mention.
 * Non-global — safe for repeated `.test()` calls without resetting lastIndex.
 */
export const HAS_MENTION_REGEX = /@file\s+[^\s@]+/;

/**
 * Global regex that matches every `@file <path>` mention in a string.
 * 
 * **Always reset `.lastIndex = 0` before each use** (global regexes are stateful).
 */
export const MENTION_MATCH_REGEX = /@file\s+[^\s@]+/g;

/**
 * Global regex that matches and captures the path inside each mention.
 * - `match[0]` — full mention text (e.g. `@file src/foo.ts`)
 * - `match[1]` — just the file path (e.g. `src/foo.ts`)
 */
export const MENTION_CAPTURE_REGEX = /@file\s+([^\s@]+)/g;
