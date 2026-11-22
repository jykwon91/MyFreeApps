export interface CheckboxBoxProps {
  isChecked: boolean;
  /** "outline" draws only a border and a tick; "filled" fills the box with the primary colour when checked. */
  variant: "outline" | "filled";
  size: number;
  isDisabled?: boolean;
}
