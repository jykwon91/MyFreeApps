import clsx from "clsx";
import { Link } from "react-router-dom";
import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { TALENTS_PATH } from "@/games/wow-forever/data/talents/talentConfig";

interface TalentClassPickerProps {
  /** The class on screen, or null on the picker page. */
  current: WowClassId | null;
}

/** The nine classes as links (a new class is a new page, so Back returns to the last one). */
export default function TalentClassPicker({ current }: TalentClassPickerProps) {
  return (
    <nav aria-label="Class" className="flex flex-wrap gap-2" data-testid="talent-class-picker">
      {WOW_CLASSES.map((c) => (
        <Link
          key={c.id}
          to={`${TALENTS_PATH}/${c.id}`}
          aria-current={c.id === current ? "page" : undefined}
          className={clsx(
            "inline-flex items-center rounded-md border px-3 text-sm min-h-[44px] transition-colors",
            c.id === current && "bg-primary text-primary-foreground",
            c.id !== current && "bg-card hover:bg-muted/40",
          )}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );
}
