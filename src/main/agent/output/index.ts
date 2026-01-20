/**
 * Output Processing Module
 * 
 * Provides utilities for processing and truncating tool outputs.
 */

export {
  OutputTruncator,
  getOutputTruncator,
  createOutputTruncator,
  truncateToolOutput,
  needsTruncation,
  type TruncatedOutput,
  type TruncationConfig,
  type TruncationStrategy,
} from './OutputTruncator';
