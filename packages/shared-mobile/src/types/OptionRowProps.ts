export interface OptionRowProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  /** `checkbox` for a list where several can be chosen. Defaults to `radio`. */
  /** Announced as disabled and refuses presses, for while a save is under way. */
  disabled?: boolean;
  kind?: "radio" | "checkbox";
}
