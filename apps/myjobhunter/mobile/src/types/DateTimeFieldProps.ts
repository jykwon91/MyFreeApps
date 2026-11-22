export interface DateTimeFieldProps {
  label: string;
  /** Local wall-clock "YYYY-MM-DDTHH:mm", or "" when not set. */
  value: string;
  onChange: (value: string) => void;
  /** The latest moment the picker offers; unset when any time is fine. */
  maximumDate?: Date;
  /** A required field can't be cleared. */
  required?: boolean;
  error?: string;
  /** Quiet help under the field, replaced by the error when there is one. */
  hint?: string;
  /** Locks the buttons and closes the picker, for while the form is saving. */
  disabled?: boolean;
}
