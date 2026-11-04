import type { SheetOption } from "./SheetOption";

export interface OptionSheetProps<Value extends string> {
  isOpen: boolean;
  title: string;
  /** Says why the choice is being asked for. */
  description?: string;
  options: readonly SheetOption<Value>[];
  value: Value | null;
  onSelect: (value: Value) => void;
  onClose: () => void;
  /** Shown when there is nothing to choose from. */
  emptyText?: string;
}
