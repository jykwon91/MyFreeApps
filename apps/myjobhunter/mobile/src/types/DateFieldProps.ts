export interface DateFieldProps {
  label: string;
  /** A calendar date, "YYYY-MM-DD", or "" when not set. */
  value: string;
  onChange: (value: string) => void;
  /** The earliest day it offers, "YYYY-MM-DD", such as an end date's start. */
  minimumDate?: string;
  /** A required field can't be cleared. */
  required?: boolean;
  error?: string;
  /** Locks the buttons and closes the picker, for while the form is saving. */
  disabled?: boolean;
}
