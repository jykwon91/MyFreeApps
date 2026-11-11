import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { ALL_MACRO_CLASSES } from "@/games/wow-forever/data/macros/macroClassFilter";
import { classIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { macroClasses } from "@/games/wow-forever/lib/macros/macroCatalog";
import type { MacroClassFilter } from "@/games/wow-forever/types/macros/macroClassFilter";
import type { SegmentedOption } from "@/games/wow-forever/types/segmentedOption";

const OPTIONS: readonly SegmentedOption<MacroClassFilter>[] = [
  { id: ALL_MACRO_CLASSES, label: "All classes" },
  ...macroClasses().map((c) => ({ id: c.id, label: c.name, icon: classIcon(c.id) })),
];

interface MacroClassPickerProps {
  value: MacroClassFilter;
  onChange: (value: MacroClassFilter) => void;
}

/** Show every class's macros, or just one class's. */
export default function MacroClassPicker({ value, onChange }: MacroClassPickerProps) {
  return <SegmentedToggle label="Class" options={OPTIONS} value={value} onChange={onChange} className="flex flex-wrap" />;
}
