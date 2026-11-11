import { cn, Select } from "@platform/ui";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { findClass, WOW_CLASSES, type WowClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { classIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { ClassSelectAllOption } from "@/games/wow-forever/types/classes/classSelectAllOption";

/** The `allOption`'s value; no class has this id. */
const ALL_VALUE = "all";

interface ClassSelectBaseProps {
  onChange: (classId: WowClassId) => void;
  /** Which classes to offer; every class by default. */
  classes?: readonly WowClass[];
  id?: string;
  /** Extra classes for the select itself, e.g. its text size. */
  className?: string;
}

/** `value` can be null (the extra choice is picked) only when there is an `allOption`. */
type ClassSelectProps = ClassSelectBaseProps &
  ({ value: WowClassId; allOption?: never } | { value: WowClassId | null; allOption: ClassSelectAllOption });

/** A class drop-down with the picked class's in-game icon beside it (a native option can't show an image). */
export default function ClassSelect({ value, onChange, classes = WOW_CLASSES, allOption, id, className }: ClassSelectProps) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {value && <GameIcon icon={classIcon(value)} size={24} alt="" />}
      <Select
        id={id}
        value={value ?? ALL_VALUE}
        onChange={(e) => {
          const picked = findClass(e.target.value);
          if (picked) onChange(picked.id);
          else allOption?.onSelect();
        }}
        className={cn("min-h-[44px] w-full min-w-0 bg-card", className)}
      >
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        {allOption && <option value={ALL_VALUE}>{allOption.label}</option>}
      </Select>
    </span>
  );
}
