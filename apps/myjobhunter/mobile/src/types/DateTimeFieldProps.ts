export interface DateTimeFieldProps {
  label: string;
  /** Local wall-clock "YYYY-MM-DDTHH:mm", or "" when not set. */
  value: string;
  onChange: (value: string) => void;
  /** A required field can't be cleared. */
  required?: boolean;
  error?: string;
  /** Locks the buttons and closes the picker, for while the form is saving. */
  disabled?: boolean;
}
