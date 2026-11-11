export interface ChipListFieldProps {
  label: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  /** Typed but not yet added. The form holds it, so saving can add it as tapping Add would. */
  draft: string;
  onDraftChange: (draft: string) => void;
  placeholder?: string;
  hint?: string;
  /** Offered as one-tap additions, leaving out any already chosen. */
  suggestions?: readonly string[];
  required?: boolean;
  disabled?: boolean;
}
