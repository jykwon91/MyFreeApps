import type { SheetOption } from "@platform/mobile";

export interface ChoiceGroupProps<Value extends string> {
  label: string;
  options: readonly SheetOption<Value>[];
  /** Nothing chosen yet when "". */
  value: Value | "";
  onChange: (value: Value) => void;
  required?: boolean;
  error?: string;
  /** Ignores presses, for while the form is saving. */
  disabled?: boolean;
}
