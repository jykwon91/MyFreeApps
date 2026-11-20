export interface FieldLabelProps {
  label: string;
  /** Draws the red asterisk. The label is hidden from screen readers, so the control must say "required" itself (requiredFieldLabel). */
  required?: boolean;
  /** Text size from the theme; xs matches a FormField, sm is for fields beside it. */
  size?: "xs" | "sm";
}
