import type { SheetOption } from "@platform/mobile";

export interface InquiryChoiceGroupProps<Value extends string> {
  label: string;
  choices: readonly SheetOption<Value>[];
  value: Value;
  onSelect: (value: Value) => void;
  disabled: boolean;
}
