/**
 * User Communication Types
 *
 * Types for user interaction: questions, decisions, feedback,
 * and progress tracking in the agent system.
 *
 * @module types/communication
 */

// =============================================================================
// Phase 4: User Communication Types
// =============================================================================

/**
 * Types of questions that can be asked
 */
export type QuestionType =
  | 'yes-no'            // Simple yes/no question
  | 'multiple-choice'   // Select from options
  | 'text'              // Free-form text input
  | 'file-selection'    // Choose file(s)
  | 'priority-ranking'  // Rank items by priority
  | 'confirmation';     // Confirm an action

/**
 * An option in a multiple choice question
 */
export interface QuestionOption {
  /** Option ID */
  id: string;
  /** Display label */
  label: string;
  /** Description */
  description?: string;
  /** Whether this is the recommended option */
  isRecommended?: boolean;
  /** Whether this option is disabled */
  isDisabled?: boolean;
}

/**
 * A question to ask the user
 */
export interface CommunicationQuestion {
  /** Question ID */
  id: string;
  /** Question type */
  type: QuestionType;
  /** Question text */
  text: string;
  /** Additional context */
  context?: string;
  /** Options for multiple-choice */
  options?: QuestionOption[];
  /** Default answer */
  defaultAnswer?: string;
  /** Placeholder for text input */
  placeholder?: string;
  /** Timeout in milliseconds (0 = no timeout) */
  timeoutMs: number;
  /** Whether question is required (vs skippable) */
  isRequired: boolean;
  /** Whether question is blocking execution */
  isBlocking: boolean;
  /** Priority of the question */
  priority: 'low' | 'normal' | 'high' | 'urgent';
  /** Requesting agent ID */
  requesterId?: string;
  /** Session ID */
  sessionId: string;
  /** Run ID */
  runId?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Validation pattern for text input */
  validationPattern?: string;
  /** Validation error message */
  validationMessage?: string;
}

/**
 * User's response to a question
 */
export interface QuestionResponse {
  /** Question ID */
  questionId: string;
  /** The answer */
  answer: string | string[] | boolean;
  /** Response timestamp */
  respondedAt: number;
  /** Whether question was skipped */
  skipped: boolean;
  /** Whether response timed out */
  timedOut: boolean;
}

/**
 * Progress level for updates
 */
export type ProgressLevel =
  | 'task'       // Overall task progress
  | 'subtask'    // Individual subtask
  | 'agent'      // Per-agent progress
  | 'operation'; // Current operation

// ProgressUpdate defined earlier at line ~3358

/**
 * A decision option with implications
 */
export interface DecisionOption {
  /** Option ID */
  id: string;
  /** Option label */
  label: string;
  /** Detailed description */
  description: string;
  /** Pros of this option */
  pros: string[];
  /** Cons of this option */
  cons: string[];
  /** Whether this is the recommended option */
  isRecommended: boolean;
  /** Risk level of this option */
  riskLevel: 'low' | 'medium' | 'high';
  /** Estimated impact description */
  impact: string;
}

/**
 * A decision request to the user
 */
export interface DecisionRequest {
  /** Decision ID */
  id: string;
  /** Decision title */
  title: string;
  /** Decision context/description */
  description: string;
  /** Available options */
  options: DecisionOption[];
  /** Why this decision is needed */
  reason: string;
  /** Urgency of the decision */
  urgency: 'low' | 'normal' | 'high' | 'blocking';
  /** Default option ID if user doesn't respond */
  defaultOptionId?: string;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Session ID */
  sessionId: string;
  /** Run ID */
  runId?: string;
  /** Requesting agent ID */
  requesterId?: string;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * User's decision response
 */
export interface DecisionResponse {
  /** Decision ID */
  decisionId: string;
  /** Selected option ID */
  selectedOptionId: string;
  /** Optional user comment */
  comment?: string;
  /** Response timestamp */
  respondedAt: number;
  /** Whether decision timed out (used default) */
  timedOut: boolean;
}

/**
 * Types of feedback
 */
export type FeedbackType =
  | 'rating'      // Satisfaction rating
  | 'issue'       // Report an issue
  | 'suggestion'  // Improvement suggestion
  | 'preference'; // Preference update

/**
 * User feedback on agent actions
 */
export interface UserFeedback {
  /** Feedback ID */
  id: string;
  /** Feedback type */
  type: FeedbackType;
  /** Related session ID */
  sessionId: string;
  /** Related run ID */
  runId?: string;
  /** Related message ID */
  messageId?: string;
  /** Rating (1-5) for rating type */
  rating?: number;
  /** Text feedback */
  text?: string;
  /** Specific issue description */
  issue?: string;
  /** Suggestion text */
  suggestion?: string;
  /** Preference key-value */
  preference?: { key: string; value: unknown };
  /** Timestamp */
  createdAt: number;
}
