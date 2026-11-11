import type { SheetOption } from "@platform/mobile";

export interface ToggleChipsFieldProps {
  label: string;
  options: readonly SheetOption<string>[];
  /** The options switched on. */
  values: readonly string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}
