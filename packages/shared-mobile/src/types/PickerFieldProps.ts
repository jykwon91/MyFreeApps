export interface PickerFieldProps {
  label: string;
  /** What is chosen now, in words. */
  valueLabel: string;
  /** Opens the choices, e.g. an OptionSheet. */
  onPress: () => void;
  hint?: string;
  /** Read as part of the field's name and outlines the field; show the same message with a FieldError beside it. */
  error?: string;
  disabled?: boolean;
}
