export interface SwitchRowProps {
  label: string;
  /** A line under the label, such as why the switch can't be used. */
  note?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}
