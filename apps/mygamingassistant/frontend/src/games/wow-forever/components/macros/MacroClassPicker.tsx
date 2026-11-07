import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { ALL_MACRO_CLASSES } from "@/games/wow-forever/data/macros/macroClassFilter";
import { macroClasses } from "@/games/wow-forever/lib/macros/macroCatalog";
import type { MacroClassFilter } from "@/games/wow-forever/types/macros/macroClassFilter";

const OPTIONS: readonly { id: MacroClassFilter; label: string }[] = [
  { id: ALL_MACRO_CLASSES, label: "All classes" },
  ...macroClasses().map((c) => ({ id: c.id, label: c.name })),
];

interface MacroClassPickerProps {
  value: MacroClassFilter;
  onChange: (value: MacroClassFilter) => void;
}

/** Show every class's macros, or just one class's. */
export default function MacroClassPicker({ value, onChange }: MacroClassPickerProps) {
  return <SegmentedToggle label="Class" options={OPTIONS} value={value} onChange={onChange} className="flex flex-wrap" />;
}
