export interface PickerFieldProps {
  label: string;
  /** What is chosen now, in words. */
  valueLabel: string;
  /** Opens the choices, e.g. an OptionSheet. */
  onPress: () => void;
  hint?: string;
  disabled?: boolean;
}
