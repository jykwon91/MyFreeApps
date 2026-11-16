export interface FieldErrorProps {
  /** The field's spoken name, as it appears in the summary read for a save with several problems. */
  name: string;
  message: string | undefined;
  /** Text size from the theme; xs matches a FormField, sm is for fields beside it. */
  size?: "xs" | "sm";
}
