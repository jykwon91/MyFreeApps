export interface ChipButtonProps {
  label: string;
  /** What a screen reader says, when the label alone isn't enough. */
  accessibilityLabel?: string;
  onPress: () => void;
  /** Makes it a switch, on or off, rather than a plain button. */
  isChecked?: boolean;
  disabled?: boolean;
}
