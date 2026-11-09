export interface OptionRowProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  /** `checkbox` for a list where several can be chosen. Defaults to `radio`. */
  kind?: "radio" | "checkbox";
}
