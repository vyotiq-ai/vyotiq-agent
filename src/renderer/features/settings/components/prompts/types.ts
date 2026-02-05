/**
 * Shared types for prompt settings components
 */
import type {
  PromptSettings,
  AgentPersona,
  ContextInjectionRule,
  AgentInstruction,
  ResponseFormatPreferences,
} from '../../../../../shared/types';

/** Base props for all prompt section components */
export interface PromptSectionBaseProps {
  settings: PromptSettings;
  onChange: <K extends keyof PromptSettings>(field: K, value: PromptSettings[K]) => void;
}

/** Props for persona section */
export interface PersonaSectionProps extends PromptSectionBaseProps {
  activePersona: AgentPersona | undefined;
}

/** Props for response format section */
export interface ResponseFormatSectionProps {
  responseFormat: ResponseFormatPreferences;
  onFormatChange: <K extends keyof ResponseFormatPreferences>(
    field: K,
    value: ResponseFormatPreferences[K]
  ) => void;
  onReset: () => void;
}

/** Instruction file status from workspace */
export interface InstructionFileStatus {
  path: string;
  type: string;
  enabled: boolean;
  priority: number;
  sectionsCount: number;
  hasFrontmatter: boolean;
}

/** Full instruction files status state */
export interface InstructionFilesState {
  found: boolean;
  fileCount: number;
  enabledCount: number;
  files: InstructionFileStatus[];
  byType: Record<string, number>;
  error: string | null;
  loading: boolean;
  expanded: boolean;
}

/** Props for editing forms */
export interface PersonaFormProps {
  persona?: AgentPersona;
  draft: Partial<AgentPersona>;
  onDraftChange: (draft: Partial<AgentPersona>) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}

export interface ContextRuleFormProps {
  rule: Partial<ContextInjectionRule>;
  onSave: () => void;
  onCancel: () => void;
  onChange: (rule: Partial<ContextInjectionRule>) => void;
  isNew: boolean;
}

export interface AgentInstructionFormProps {
  instruction: Partial<AgentInstruction>;
  onSave: (instruction: Partial<AgentInstruction>) => void;
  onCancel: () => void;
  isNew: boolean;
}
